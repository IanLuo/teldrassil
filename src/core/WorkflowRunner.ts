import type { Manifest, SequenceStep, AgentConfig } from './ManifestParser';
import type { MicroKernel } from './MicroKernel';
import type { IModelDriver, Message } from './IModelDriver';
import type { IStateManager } from './IStateManager';
import type { ITraceLog } from './ITraceLog';
import { Supervisor, SupervisorDecision, type SupervisorInput } from './Supervisor';
import { recordRouteDecision } from './RouteDecision';
import { SystemExit } from './SystemExit';

export interface StepResult {
  step: string;
  agent: string;
  output: string;
  decision: string;
  retries: number;
}

export interface WorkflowResult {
  steps: StepResult[];
  finalDecision: string;
}

export interface WorkflowRunnerOptions {
  /** Criteria applied to every step during Supervisor.evaluate() */
  stepCriteria?: Array<{
    description: string;
    check: (output: string) => boolean;
  }>;
  /** Force isBlocked=true in SupervisorInput (for testing / human-attach integration) */
  isBlocked?: boolean;
}

export class WorkflowRunner {
  private manifest: Manifest;
  private kernel: MicroKernel;
  private options: WorkflowRunnerOptions;

  constructor(manifest: Manifest, kernel: MicroKernel, options?: WorkflowRunnerOptions) {
    this.manifest = manifest;
    this.kernel = kernel;
    this.options = options ?? {};
  }

  async run(): Promise<WorkflowResult> {
    const results: StepResult[] = [];
    const sequence = this.manifest.sequence ?? [];
    let decision: SupervisorDecision | null = null;

    for (let i = 0; i < sequence.length; i++) {
      const step = sequence[i];
      const agent = this.resolveAgent(step.agent);
      const driver = this.getDriver();

      if (!driver.generate) {
        throw new Error(
          `Driver '${agent.use_driver}' does not support generate()`
        );
      }

      const isLastStep = i === sequence.length - 1;
      let stepRetries = 0;
      const maxStepRetries = step.max_retries ?? 3;
      let output = '';

      while (true) {
        this.getStateManager().append({
          node_id: step.step,
          status: 'in_progress',
          worker_id: step.agent,
          artifact_ref: null,
        });

        const messages = this.buildMessages(step, agent);
        const result = await driver.generate({
          model: agent.model,
          messages,
          tools: agent.tools as unknown[],
        });

        output = result.content;

        const supervisorInput: SupervisorInput = {
          output,
          retryCount: stepRetries,
          maxRetries: maxStepRetries,
          criteria: this.options.stepCriteria ?? [],
          isBlocked: this.options.isBlocked ?? false,
          isComplete: isLastStep,
        };

        decision = Supervisor.evaluate(supervisorInput);

        await recordRouteDecision(this.getTraceLog(), {
          from: step.step,
          to: getNextStepName(step, decision, i, sequence),
          decision,
          reason: getDecisionReason(decision, stepRetries),
          timestamp: new Date().toISOString(),
        });

        if (decision === SupervisorDecision.PROCEED || decision === SupervisorDecision.COMPLETE) {
          this.getStateManager().append({
            node_id: step.step,
            status: 'completed',
            worker_id: step.agent,
            artifact_ref: null,
          });
          break;
        }

        if (decision === SupervisorDecision.REWORK) {
          stepRetries++;
          this.getStateManager().append({
            node_id: step.step,
            status: 'rework',
            worker_id: step.agent,
            artifact_ref: null,
          });
          continue;
        }

        if (decision === SupervisorDecision.ESCALATE) {
          this.getStateManager().append({
            node_id: step.step,
            status: 'failed',
            worker_id: step.agent,
            artifact_ref: null,
          });
          throw new SystemExit(
            `Step '${step.step}' exceeded max retries (${maxStepRetries})`
          );
        }

        if (decision === SupervisorDecision.BLOCK) {
          this.kernel.getEventBus().publish('human:required', {
            step: step.step,
            agent: step.agent,
            output,
          });
          this.getStateManager().append({
            node_id: step.step,
            status: 'failed',
            worker_id: step.agent,
            artifact_ref: null,
          });
          throw new SystemExit(
            `Step '${step.step}' blocked — human intervention required`
          );
        }
      }

      results.push({
        step: step.step,
        agent: step.agent,
        output,
        decision: decision!,
        retries: stepRetries,
      });

      this.getStateManager().snapshot();

      if (decision === SupervisorDecision.COMPLETE) {
        break;
      }
    }

    const finalDecision = decision === SupervisorDecision.COMPLETE
      ? SupervisorDecision.COMPLETE
      : SupervisorDecision.PROCEED;

    this.kernel.getEventBus().publish('workflow:completed', {
      steps: results,
      finalDecision,
    });

    return { steps: results, finalDecision };
  }

  private resolveAgent(agentId: string): AgentConfig {
    const agent = this.manifest.agents.find((a) => a.id === agentId);
    if (!agent) {
      throw new Error(
        `Agent '${agentId}' not found in manifest. Manifest has ${this.manifest.agents.length} agent(s): [${this.manifest.agents.map((a) => a.id).join(', ')}]`
      );
    }
    return agent;
  }

  private buildMessages(step: SequenceStep, agent: AgentConfig): Message[] {
    return [
      {
        role: 'system',
        content: `You are agent "${agent.id}" executing step "${step.step}" in workflow "${this.manifest.project_id}".`,
      },
      {
        role: 'user',
        content: `Execute step: ${step.step}`,
      },
    ];
  }

  private getDriver(): IModelDriver {
    const plugin = this.kernel.getRegistry().getPlugin('Driver');
    if (!plugin) {
      throw new Error('Driver plugin not found in kernel registry');
    }
    return plugin as unknown as IModelDriver;
  }

  private getTraceLog(): ITraceLog {
    const plugin = this.kernel.getRegistry().getPlugin('Trace');
    if (!plugin) {
      throw new Error('Trace plugin not found in kernel registry');
    }
    return plugin as unknown as ITraceLog;
  }

  private getStateManager(): IStateManager {
    const plugin = this.kernel.getRegistry().getPlugin('State');
    if (!plugin) {
      throw new Error('State plugin not found in kernel registry');
    }
    return plugin as unknown as IStateManager;
  }
}

function getNextStepName(
  _step: SequenceStep,
  decision: SupervisorDecision,
  index: number,
  sequence: SequenceStep[],
): string | null {
  switch (decision) {
    case SupervisorDecision.PROCEED:
      return index + 1 < sequence.length ? sequence[index + 1].step : null;
    case SupervisorDecision.REWORK:
      return sequence[index].step;
    case SupervisorDecision.COMPLETE:
    case SupervisorDecision.ESCALATE:
    case SupervisorDecision.BLOCK:
      return null;
  }
}

function getDecisionReason(decision: SupervisorDecision, retryCount: number): string {
  switch (decision) {
    case SupervisorDecision.PROCEED:
      return 'All criteria passed';
    case SupervisorDecision.REWORK:
      return `Quality check failed (retry ${retryCount + 1})`;
    case SupervisorDecision.ESCALATE:
      return `Max retries exceeded (${retryCount} attempts)`;
    case SupervisorDecision.BLOCK:
      return 'Human intervention required';
    case SupervisorDecision.COMPLETE:
      return 'Workflow completed';
  }
}

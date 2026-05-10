import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupervisorDecision } from '../../src/core/Supervisor';
import type { Manifest } from '../../src/core/ManifestParser';
import type { IModelDriver, Message, GenerateOptions, GenerateResult, VendorPayload, DriverCapabilities } from '../../src/core/IModelDriver';
import type { IStateManager, StateEntry } from '../../src/core/IStateManager';
import type { ITraceLog, TraceURI, TraceEnvelope } from '../../src/core/ITraceLog';
import type { HumanInputRequest, HumanInputResult } from '../../src/core/HumanProtocol';
import { MicroKernel } from '../../src/core/MicroKernel';
import { SystemExit } from '../../src/core/SystemExit';

// ---- Test helpers ----

function createTestDriver(
  generateFn: (options: GenerateOptions) => Promise<GenerateResult>,
): IModelDriver {
  return {
    name: 'test_driver',
    version: '1.0.0-test',
    initialize: vi.fn(),
    ping: async () => true,
    shutdown: vi.fn(),
    generate: generateFn,
    translate: async (_messages: Message[]): Promise<VendorPayload> => {
      return { model: 'test', messages: [] };
    },
    countTokens: async (_messages: Message[]): Promise<number> => 0,
    getCapabilities: (): DriverCapabilities => ({
      maxContextTokens: 100000,
      supportsStreaming: false,
      supportsTools: true,
    }),
  };
}

function createTestManifest(overrides: Partial<Manifest> = {}): Manifest {
  return {
    project_id: 'test-workflow-v1',
    workflow: 'supervised',
    plugins: {
      model_drivers: [{ id: 'test_driver', type: 'drivers.models.unified' }],
    },
    agents: [
      { id: 'agent_a', use_driver: 'test_driver', model: 'test:model-a', status: 'auto' },
      { id: 'agent_b', use_driver: 'test_driver', model: 'test:model-b', status: 'auto' },
    ],
    sequence: [
      { step: 'step_1', agent: 'agent_a', max_retries: 3 },
      { step: 'step_2', agent: 'agent_b', max_retries: 2 },
    ],
    ...overrides,
  };
}

function createInMemoryStateManager(): IStateManager & { _entries: StateEntry[] } {
  const entries: StateEntry[] = [];
  return {
    name: 'State',
    version: '1.0.0-mock',
    initialize: vi.fn(),
    ping: async () => true,
    shutdown: vi.fn(),
    append(entry: StateEntry): void {
      entries.push(entry);
    },
    getCurrentNode(): string {
      return entries.length > 0 ? entries[entries.length - 1].node_id : 'idle';
    },
    getHistory(): StateEntry[] {
      return [...entries];
    },
    snapshot(): void {},
    _entries: entries,
  };
}

function createInMemoryTraceLog(): ITraceLog {
  return {
    name: 'Trace',
    version: '1.0.0-mock',
    initialize: vi.fn(),
    ping: async () => true,
    shutdown: vi.fn(),
    appendTrace(_envelope: TraceEnvelope): TraceURI {
      return `trace://v1/0` as TraceURI;
    },
    getTrace(_uri: TraceURI): unknown | null {
      return null;
    },
  };
}

function createMicroKernel(): MicroKernel {
  return new MicroKernel();
}

// lazy import — WorkflowRunner doesn't exist yet (TDD red phase)
let WorkflowRunner: typeof import('../../src/core/WorkflowRunner').WorkflowRunner;

beforeEach(async () => {
  const mod = await import('../../src/core/WorkflowRunner');
  WorkflowRunner = mod.WorkflowRunner;
});

// ---- Tests ----

describe('WorkflowRunner', () => {
  // 1. Happy path — 2-step sequence
  it('should execute a 2-step sequence and return WorkflowResult with both StepResults', async () => {
    const manifest = createTestManifest();
    const kernel = createMicroKernel();

    const driver = createTestDriver(async () => ({ content: 'step output' }));
    const stateManager = createInMemoryStateManager();
    const traceLog = createInMemoryTraceLog();

    kernel.getRegistry().register(driver);
    kernel.getRegistry().register(stateManager);
    kernel.getRegistry().register(traceLog);

    const runner = new WorkflowRunner(manifest, kernel);
    const result = await runner.run();

    expect(result.steps).toHaveLength(2);
    // step 1: not last, criteria empty → PROCEED
    expect(result.steps[0].step).toBe('step_1');
    expect(result.steps[0].agent).toBe('agent_a');
    expect(result.steps[0].decision).toBe(SupervisorDecision.PROCEED);
    expect(result.steps[0].retries).toBe(0);
    expect(result.steps[0].output).toBe('step output');
    expect(result.steps[0].outputRef).toBeNull();
    expect(result.steps[0].traceRef).toBeNull();
    // step 2: last, criteria empty → COMPLETE
    expect(result.steps[1].step).toBe('step_2');
    expect(result.steps[1].agent).toBe('agent_b');
    expect(result.steps[1].decision).toBe(SupervisorDecision.COMPLETE);
    expect(result.steps[1].retries).toBe(0);
    expect(result.steps[1].output).toBe('step output');

    expect(result.finalDecision).toBe(SupervisorDecision.COMPLETE);
  });

  // 2. Single step
  it('should run a single step and complete', async () => {
    const manifest = createTestManifest({
      sequence: [{ step: 'only_step', agent: 'agent_a', max_retries: 1 }],
    });
    const kernel = createMicroKernel();

    const driver = createTestDriver(async () => ({ content: 'done' }));
    kernel.getRegistry().register(driver);
    kernel.getRegistry().register(createInMemoryStateManager());
    kernel.getRegistry().register(createInMemoryTraceLog());

    const runner = new WorkflowRunner(manifest, kernel);
    const result = await runner.run();

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].decision).toBe(SupervisorDecision.COMPLETE);
    expect(result.finalDecision).toBe(SupervisorDecision.COMPLETE);
  });

  // 3. REWORK then succeeds
  it('should retry on REWORK and succeed on next attempt', async () => {
    const manifest = createTestManifest({
      sequence: [{ step: 'flaky_step', agent: 'agent_a', max_retries: 3 }],
      agents: [{ id: 'agent_a', use_driver: 'test_driver', model: 'test:model-a', status: 'auto' }],
    });
    const kernel = createMicroKernel();

    let callCount = 0;
    const driver = createTestDriver(async () => {
      callCount++;
      if (callCount === 1) return { content: 'bad' };
      return { content: 'good output here' };
    });
    kernel.getRegistry().register(driver);
    kernel.getRegistry().register(createInMemoryStateManager());
    kernel.getRegistry().register(createInMemoryTraceLog());

    // Inject criteria that requires output length >= 10
    const stepCriteria = [
      { description: 'output must be at least 10 chars', check: (out: string) => out.length >= 10 },
    ];

    const runner = new WorkflowRunner(manifest, kernel, { stepCriteria });
    const result = await runner.run();

    expect(callCount).toBe(2);
    expect(result.steps[0].decision).toBe(SupervisorDecision.COMPLETE);
    expect(result.steps[0].retries).toBe(1);
  });

  // 4. ESCALATE — step fails more than max_retries → records ESCALATE decision, does not throw
  it('should record ESCALATE decision when step exceeds max retries (no throw)', async () => {
    const manifest = createTestManifest({
      sequence: [{ step: 'failing_step', agent: 'agent_a', max_retries: 2 }],
      agents: [{ id: 'agent_a', use_driver: 'test_driver', model: 'test:model-a', status: 'auto' }],
    });
    const kernel = createMicroKernel();

    const driver = createTestDriver(async () => ({ content: 'short' }));
    const stateManager = createInMemoryStateManager();
    kernel.getRegistry().register(driver);
    kernel.getRegistry().register(stateManager);
    kernel.getRegistry().register(createInMemoryTraceLog());

    const stepCriteria = [
      { description: 'output must be at least 10 chars', check: (out: string) => out.length >= 10 },
    ];

    const runner = new WorkflowRunner(manifest, kernel, { stepCriteria });
    const result = await runner.run();

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].decision).toBe(SupervisorDecision.ESCALATE);
    expect(result.steps[0].step).toBe('failing_step');
    expect(result.steps[0].retries).toBe(2);

    const history = stateManager.getHistory();
    expect(history.some((e) => e.status === 'failed')).toBe(true);
  });

  // 5. Multiple steps with different agents
  it('should use different agents and models per step', async () => {
    const manifest = createTestManifest({
      agents: [
        { id: 'agent_x', use_driver: 'test_driver', model: 'test:model-x', status: 'auto' },
        { id: 'agent_y', use_driver: 'test_driver', model: 'test:model-y', status: 'auto' },
      ],
      sequence: [
        { step: 'first', agent: 'agent_x', max_retries: 1 },
        { step: 'second', agent: 'agent_y', max_retries: 1 },
      ],
    });
    const kernel = createMicroKernel();

    const modelsCalled: string[] = [];
    const driver = createTestDriver(async (opts) => {
      modelsCalled.push(opts.model);
      return { content: `Generated by ${opts.model}` };
    });
    kernel.getRegistry().register(driver);
    kernel.getRegistry().register(createInMemoryStateManager());
    kernel.getRegistry().register(createInMemoryTraceLog());

    const runner = new WorkflowRunner(manifest, kernel);
    const result = await runner.run();

    expect(modelsCalled).toEqual(['test:model-x', 'test:model-y']);
    expect(result.steps[0].agent).toBe('agent_x');
    expect(result.steps[0].output).toBe('Generated by test:model-x');
    expect(result.steps[1].agent).toBe('agent_y');
    expect(result.steps[1].output).toBe('Generated by test:model-y');
  });

  // 6. Empty sequence
  it('should return empty WorkflowResult for an empty sequence', async () => {
    const manifest = createTestManifest({ sequence: [] });
    const kernel = createMicroKernel();

    kernel.getRegistry().register(createInMemoryStateManager());
    kernel.getRegistry().register(createInMemoryTraceLog());

    const runner = new WorkflowRunner(manifest, kernel);
    const result = await runner.run();

    expect(result.steps).toHaveLength(0);
    expect(result.finalDecision).toBe(SupervisorDecision.PROCEED);
  });

  // 7. Agent not found
  it('should throw when step references an unknown agent', async () => {
    const manifest = createTestManifest({
      sequence: [{ step: 'orphan_step', agent: 'nonexistent_agent', max_retries: 1 }],
    });
    const kernel = createMicroKernel();

    kernel.getRegistry().register(createInMemoryStateManager());
    kernel.getRegistry().register(createInMemoryTraceLog());

    const runner = new WorkflowRunner(manifest, kernel);
    await expect(runner.run()).rejects.toThrow(
      /Agent 'nonexistent_agent' not found/
    );
  });

  // 8. Driver without generate()
  it('should throw descriptive error when driver lacks generate()', async () => {
    const manifest = createTestManifest({
      sequence: [{ step: 'step_1', agent: 'agent_a', max_retries: 1 }],
      agents: [{ id: 'agent_a', use_driver: 'test_driver', model: 'test:model-a', status: 'auto' }],
    });
    const kernel = createMicroKernel();

    const driverNoGen: IModelDriver = {
      name: 'test_driver',
      version: '1.0.0',
      initialize: vi.fn(),
      ping: async () => true,
      shutdown: vi.fn(),
      translate: async (): Promise<VendorPayload> => ({ model: 'test', messages: [] }),
      countTokens: async (): Promise<number> => 0,
      getCapabilities: (): DriverCapabilities => ({
        maxContextTokens: 100000,
        supportsStreaming: false,
        supportsTools: false,
      }),
    };

    kernel.getRegistry().register(driverNoGen);
    kernel.getRegistry().register(createInMemoryStateManager());
    kernel.getRegistry().register(createInMemoryTraceLog());

    const runner = new WorkflowRunner(manifest, kernel);
    await expect(runner.run()).rejects.toThrow(/does not support generate/);
  });

  // 9. State updates
  it('should record in_progress → rework → in_progress → completed in StateManager', async () => {
    const manifest = createTestManifest({
      sequence: [{ step: 'state_test', agent: 'agent_a', max_retries: 2 }],
      agents: [{ id: 'agent_a', use_driver: 'test_driver', model: 'test:model-a', status: 'auto' }],
    });
    const kernel = createMicroKernel();

    const stateManager = createInMemoryStateManager();

    let callCount = 0;
    const driver = createTestDriver(async () => {
      callCount++;
      if (callCount === 1) return { content: 'bad' };
      return { content: 'good-enough-output' };
    });
    kernel.getRegistry().register(driver);
    kernel.getRegistry().register(stateManager);
    kernel.getRegistry().register(createInMemoryTraceLog());

    const stepCriteria = [
      { description: 'output must be at least 10 chars', check: (out: string) => out.length >= 10 },
    ];

    const runner = new WorkflowRunner(manifest, kernel, { stepCriteria });
    await runner.run();

    const history = stateManager.getHistory();
    expect(history.length).toBe(4); // in_progress, rework, in_progress, completed

    expect(history[0]).toMatchObject({ node_id: 'state_test', status: 'in_progress' });
    expect(history[1]).toMatchObject({ node_id: 'state_test', status: 'rework' });
    expect(history[2]).toMatchObject({ node_id: 'state_test', status: 'in_progress' });
    expect(history[3]).toMatchObject({ node_id: 'state_test', status: 'completed' });
  });

  it('should record failed status on ESCALATE (no throw, result returned)', async () => {
    const manifest = createTestManifest({
      sequence: [{ step: 'fail_step', agent: 'agent_a', max_retries: 1 }],
      agents: [{ id: 'agent_a', use_driver: 'test_driver', model: 'test:model-a', status: 'auto' }],
    });
    const kernel = createMicroKernel();

    const stateManager = createInMemoryStateManager();
    const driver = createTestDriver(async () => ({ content: 'short' }));
    kernel.getRegistry().register(driver);
    kernel.getRegistry().register(stateManager);
    kernel.getRegistry().register(createInMemoryTraceLog());

    const stepCriteria = [
      { description: 'output must be at least 10 chars', check: (out: string) => out.length >= 10 },
    ];

    const runner = new WorkflowRunner(manifest, kernel, { stepCriteria });
    const result = await runner.run();

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].decision).toBe(SupervisorDecision.ESCALATE);
    expect(result.steps[0].retries).toBe(1);

    const history = stateManager.getHistory();
    // With max_retries=1 (>= semantics):
    // attempt0 fails → 0>=1 false → REWORK, stepRetries=1
    // attempt1 fails → 1>=1 true → ESCALATE → records failed
    expect(history.some((e) => e.status === 'failed')).toBe(true);
    expect(history.some((e) => e.status === 'in_progress')).toBe(true);
    expect(history.some((e) => e.status === 'rework')).toBe(true);
  });

  // 10. Trace Log
  it('should write RouteDecision payloads to Trace Log', async () => {
    const manifest = createTestManifest({
      sequence: [{ step: 'traced_step', agent: 'agent_a', max_retries: 1 }],
      agents: [{ id: 'agent_a', use_driver: 'test_driver', model: 'test:model-a', status: 'auto' }],
    });
    const kernel = createMicroKernel();

    const driver = createTestDriver(async () => ({ content: 'traced output' }));
    const traceLog = createInMemoryTraceLog();
    const appendTraceSpy = vi.spyOn(traceLog, 'appendTrace');

    kernel.getRegistry().register(driver);
    kernel.getRegistry().register(createInMemoryStateManager());
    kernel.getRegistry().register(traceLog);

    const runner = new WorkflowRunner(manifest, kernel);
    await runner.run();

    expect(appendTraceSpy).toHaveBeenCalledTimes(1);
    const envelope = appendTraceSpy.mock.calls[0][0] as TraceEnvelope;
    expect(envelope.type).toBe('route_decision');
    const payload = envelope.payload as Record<string, unknown>;
    expect(payload.from).toBe('traced_step');
    expect(payload.decision).toBe(SupervisorDecision.COMPLETE);
  });

  it('should record RouteDecision on REWORK as well', async () => {
    const manifest = createTestManifest({
      sequence: [{ step: 'rework_trace', agent: 'agent_a', max_retries: 2 }],
      agents: [{ id: 'agent_a', use_driver: 'test_driver', model: 'test:model-a', status: 'auto' }],
    });
    const kernel = createMicroKernel();

    let callCount = 0;
    const driver = createTestDriver(async () => {
      callCount++;
      if (callCount === 1) return { content: 'bad' };
      return { content: 'good enough output' };
    });
    const traceLog = createInMemoryTraceLog();
    const appendTraceSpy = vi.spyOn(traceLog, 'appendTrace');

    kernel.getRegistry().register(driver);
    kernel.getRegistry().register(createInMemoryStateManager());
    kernel.getRegistry().register(traceLog);

    const stepCriteria = [
      { description: 'output must be at least 10 chars', check: (out: string) => out.length >= 10 },
    ];

    const runner = new WorkflowRunner(manifest, kernel, { stepCriteria });
    await runner.run();

    expect(appendTraceSpy).toHaveBeenCalledTimes(2); // one REWORK, one COMPLETE
    const firstEnvelope = appendTraceSpy.mock.calls[0][0] as TraceEnvelope;
    expect((firstEnvelope.payload as Record<string, unknown>).decision).toBe(SupervisorDecision.REWORK);
    const secondEnvelope = appendTraceSpy.mock.calls[1][0] as TraceEnvelope;
    expect((secondEnvelope.payload as Record<string, unknown>).decision).toBe(SupervisorDecision.COMPLETE);
  });

  // 11. Event publishing
  it('should publish workflow:completed event on successful completion', async () => {
    const manifest = createTestManifest({
      sequence: [{ step: 'event_step', agent: 'agent_a', max_retries: 1 }],
      agents: [{ id: 'agent_a', use_driver: 'test_driver', model: 'test:model-a', status: 'auto' }],
    });
    const kernel = createMicroKernel();

    const driver = createTestDriver(async () => ({ content: 'event output' }));
    kernel.getRegistry().register(driver);
    kernel.getRegistry().register(createInMemoryStateManager());
    kernel.getRegistry().register(createInMemoryTraceLog());

    const eventBus = kernel.getEventBus();
    const publishSpy = vi.spyOn(eventBus, 'publish');

    const runner = new WorkflowRunner(manifest, kernel);
    await runner.run();

    const completedCalls = publishSpy.mock.calls.filter(
      (call) => call[0] === 'workflow:completed',
    );
    expect(completedCalls.length).toBe(1);
    expect(completedCalls[0][1]).toHaveProperty('steps');
  });

  // 12. BLOCK → pause/resume via Human Protocol
  it('should pause on BLOCK and resume on human:response (proceed)', async () => {
    const manifest = createTestManifest({
      sequence: [{ step: 'blocked_step', agent: 'agent_a', max_retries: 1 }],
      agents: [{ id: 'agent_a', use_driver: 'test_driver', model: 'test:model-a', status: 'auto' }],
    });
    const kernel = createMicroKernel();

    const driver = createTestDriver(async () => ({ content: 'blocked output' }));
    kernel.getRegistry().register(driver);
    kernel.getRegistry().register(createInMemoryStateManager());
    kernel.getRegistry().register(createInMemoryTraceLog());

    // Subscribe to human:required and respond with proceed
    kernel.getEventBus().subscribe('human:required', (payload: unknown) => {
      const request = payload as HumanInputRequest;
      setTimeout(() => {
        kernel.getEventBus().publish('human:response', {
          requestId: request.requestId,
          action: 'proceed',
        } as HumanInputResult);
      }, 0);
    });

    const runner = new WorkflowRunner(manifest, kernel, { isBlocked: true, stepCriteria: [] });
    const result = await runner.run();

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].decision).toBe(SupervisorDecision.COMPLETE);
    expect(result.steps[0].output).toBe('blocked output');
  });

  it('should abort on BLOCK when human responds with abort', async () => {
    const manifest = createTestManifest({
      sequence: [{ step: 'abort_step', agent: 'agent_a', max_retries: 1 }],
      agents: [{ id: 'agent_a', use_driver: 'test_driver', model: 'test:model-a', status: 'auto' }],
    });
    const kernel = createMicroKernel();

    const driver = createTestDriver(async () => ({ content: 'abort me' }));
    kernel.getRegistry().register(driver);
    kernel.getRegistry().register(createInMemoryStateManager());
    kernel.getRegistry().register(createInMemoryTraceLog());

    kernel.getEventBus().subscribe('human:required', (payload: unknown) => {
      const request = payload as HumanInputRequest;
      setTimeout(() => {
        kernel.getEventBus().publish('human:response', {
          requestId: request.requestId,
          action: 'abort',
        } as HumanInputResult);
      }, 0);
    });

    const runner = new WorkflowRunner(manifest, kernel, { isBlocked: true, stepCriteria: [] });
    await expect(runner.run()).rejects.toThrow(SystemExit);
    await expect(runner.run()).rejects.toThrow(/aborted by human operator/);
  });

  it('should retry on BLOCK when human responds with rework', async () => {
    const manifest = createTestManifest({
      sequence: [{ step: 'rework_step', agent: 'agent_a', max_retries: 3 }],
      agents: [{ id: 'agent_a', use_driver: 'test_driver', model: 'test:model-a', status: 'auto' }],
    });
    const kernel = createMicroKernel();

    let callCount = 0;
    const driver = createTestDriver(async () => {
      callCount++;
      if (callCount === 1) return { content: 'block me' };
      return { content: 'fixed after human review' };
    });
    kernel.getRegistry().register(driver);
    kernel.getRegistry().register(createInMemoryStateManager());
    kernel.getRegistry().register(createInMemoryTraceLog());

    let blockCount = 0;
    kernel.getEventBus().subscribe('human:required', (payload: unknown) => {
      blockCount++;
      const request = payload as HumanInputResult;
      if (blockCount === 1) {
        // First block: human says rework
        setTimeout(() => {
          kernel.getEventBus().publish('human:response', {
            requestId: request.requestId,
            action: 'rework',
          } as HumanInputResult);
        }, 0);
      } else {
        // Second block: human says proceed
        setTimeout(() => {
          kernel.getEventBus().publish('human:response', {
            requestId: request.requestId,
            action: 'proceed',
          } as HumanInputResult);
        }, 0);
      }
    });

    const runner = new WorkflowRunner(manifest, kernel, { isBlocked: true, stepCriteria: [] });
    const result = await runner.run();

    expect(callCount).toBeGreaterThanOrEqual(2);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].retries).toBeGreaterThanOrEqual(1);
  });

  it('should publish HumanInputRequest with correct fields on BLOCK', async () => {
    const manifest = createTestManifest({
      sequence: [{ step: 'blocked_step', agent: 'agent_a', max_retries: 1 }],
      agents: [{ id: 'agent_a', use_driver: 'test_driver', model: 'test:model-a', status: 'auto' }],
    });
    const kernel = createMicroKernel();

    const driver = createTestDriver(async () => ({ content: 'blocked output' }));
    kernel.getRegistry().register(driver);
    kernel.getRegistry().register(createInMemoryStateManager());
    kernel.getRegistry().register(createInMemoryTraceLog());

    const receivedRequests: HumanInputRequest[] = [];
    kernel.getEventBus().subscribe('human:required', (payload: unknown) => {
      const request = payload as HumanInputRequest;
      receivedRequests.push(request);
      // Respond so the runner doesn't hang
      setTimeout(() => {
        kernel.getEventBus().publish('human:response', {
          requestId: request.requestId,
          action: 'proceed',
        } as HumanInputResult);
      }, 0);
    });

    const runner = new WorkflowRunner(manifest, kernel, { isBlocked: true, stepCriteria: [] });
    await runner.run();

    expect(receivedRequests.length).toBe(1);
    const req = receivedRequests[0];
    expect(req.requestId).toMatch(/^req-/);
    expect(req.step).toBe('blocked_step');
    expect(req.agent).toBe('agent_a');
    expect(req.output).toBe('blocked output');
    expect(req.prompt).toContain('blocked_step');
    expect(req.prompt).toContain('agent_a');
  });

  it('should wait for matching requestId only', async () => {
    const manifest = createTestManifest({
      sequence: [{ step: 'match_step', agent: 'agent_a', max_retries: 1 }],
      agents: [{ id: 'agent_a', use_driver: 'test_driver', model: 'test:model-a', status: 'auto' }],
    });
    const kernel = createMicroKernel();

    const driver = createTestDriver(async () => ({ content: 'match me' }));
    kernel.getRegistry().register(driver);
    kernel.getRegistry().register(createInMemoryStateManager());
    kernel.getRegistry().register(createInMemoryTraceLog());

    const mismatchedIds: string[] = [];

    kernel.getEventBus().subscribe('human:required', (payload: unknown) => {
      const request = payload as HumanInputRequest;
      // First, publish a response with a WRONG requestId — should be ignored
      kernel.getEventBus().publish('human:response', {
        requestId: 'wrong-id',
        action: 'proceed',
      } as HumanInputResult);
      mismatchedIds.push('wrong-id');

      // Then publish the correct response
      setTimeout(() => {
        kernel.getEventBus().publish('human:response', {
          requestId: request.requestId,
          action: 'proceed',
        } as HumanInputResult);
      }, 0);
    });

    const runner = new WorkflowRunner(manifest, kernel, { isBlocked: true, stepCriteria: [] });
    const result = await runner.run();

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].decision).toBe(SupervisorDecision.COMPLETE);
    // The wrong-id response was sent but the runner ignored it and waited for the right one
  });

  // 13. Evaluator returning PROCEED (structured format)
  // ---- Hook tests ----

  it('should use custom buildMessages hook to override default messages', async () => {
    const manifest = createTestManifest({
      sequence: [{ step: 'custom_msgs', agent: 'agent_a', max_retries: 1 }],
      agents: [{ id: 'agent_a', use_driver: 'test_driver', model: 'test:model-a', status: 'auto' }],
    });
    const kernel = createMicroKernel();

    let capturedMessages: Message[] = [];
    const driver = createTestDriver(async (opts) => {
      capturedMessages = opts.messages;
      return { content: 'output' };
    });
    kernel.getRegistry().register(driver);
    kernel.getRegistry().register(createInMemoryStateManager());
    kernel.getRegistry().register(createInMemoryTraceLog());

    const customBuildMessages = vi.fn((step, agent, _context) => [
      { role: 'system', content: `CUSTOM: agent=${agent.id}, step=${step.step}` },
      { role: 'user', content: 'Custom prompt' },
    ]);

    const runner = new WorkflowRunner(manifest, kernel, {
      hooks: { buildMessages: customBuildMessages },
    });
    await runner.run();

    expect(customBuildMessages).toHaveBeenCalledTimes(1);
    const callArgs = customBuildMessages.mock.calls[0];
    expect(callArgs[0]).toMatchObject({ step: 'custom_msgs' });
    expect(callArgs[1]).toMatchObject({ id: 'agent_a' });
    expect(callArgs[2]).toBeUndefined();
    expect(capturedMessages).toHaveLength(2);
    expect(capturedMessages[0].content).toContain('CUSTOM');
    expect(capturedMessages[1].content).toBe('Custom prompt');
  });

  it('should call afterStep hook with step and result after each step', async () => {
    const manifest = createTestManifest({
      sequence: [
        { step: 'step_a', agent: 'agent_a', max_retries: 1 },
        { step: 'step_b', agent: 'agent_b', max_retries: 1 },
      ],
    });
    const kernel = createMicroKernel();

    let callCount = 0;
    const driver = createTestDriver(async () => {
      callCount++;
      return { content: `output ${callCount}` };
    });
    kernel.getRegistry().register(driver);
    kernel.getRegistry().register(createInMemoryStateManager());
    kernel.getRegistry().register(createInMemoryTraceLog());

    const afterStep = vi.fn();
    const runner = new WorkflowRunner(manifest, kernel, {
      hooks: { afterStep },
    });
    await runner.run();

    expect(afterStep).toHaveBeenCalledTimes(2);
    expect(afterStep).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ step: 'step_a' }),
      expect.objectContaining({ step: 'step_a', agent: 'agent_a', output: 'output 1' }),
    );
    expect(afterStep).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ step: 'step_b' }),
      expect.objectContaining({ step: 'step_b', agent: 'agent_b', output: 'output 2' }),
    );
  });

  it('should call afterStep with retry count after rework', async () => {
    const manifest = createTestManifest({
      sequence: [{ step: 'rework_step', agent: 'agent_a', max_retries: 3 }],
      agents: [{ id: 'agent_a', use_driver: 'test_driver', model: 'test:model-a', status: 'auto' }],
    });
    const kernel = createMicroKernel();

    let callCount = 0;
    const driver = createTestDriver(async () => {
      callCount++;
      if (callCount === 1) return { content: 'bad' };
      return { content: 'good enough output' };
    });
    kernel.getRegistry().register(driver);
    kernel.getRegistry().register(createInMemoryStateManager());
    kernel.getRegistry().register(createInMemoryTraceLog());

    const stepCriteria = [
      { description: 'output must be at least 10 chars', check: (out: string) => out.length >= 10 },
    ];

    const afterStep = vi.fn();
    const runner = new WorkflowRunner(manifest, kernel, {
      stepCriteria,
      hooks: { afterStep },
    });
    await runner.run();

    // afterStep called once — only when step succeeds (COMPLETE)
    expect(afterStep).toHaveBeenCalledTimes(1);
    expect(afterStep).toHaveBeenCalledWith(
      expect.objectContaining({ step: 'rework_step' }),
      expect.objectContaining({ retries: 1, decision: SupervisorDecision.COMPLETE }),
    );
  });

  it('should use evaluateOutput hook to replace evaluator agent', async () => {
    const manifest = createTestManifest({
      agents: [
        { id: 'agent_a', use_driver: 'test_driver', model: 'test:model-a', status: 'auto' },
        { id: 'evaluator_agent', use_driver: 'test_driver', model: 'test:evaluator', status: 'auto' },
      ],
      sequence: [
        { step: 'hook_eval', agent: 'agent_a', evaluator: 'evaluator_agent', max_retries: 2 },
      ],
    });
    const kernel = createMicroKernel();

    let evaluatorCalled = false;
    const driver = createTestDriver(async (opts) => {
      if (opts.model === 'test:evaluator') {
        evaluatorCalled = true;
        return { content: 'decision: PROCEED' };
      }
      return { content: 'agent output' };
    });
    kernel.getRegistry().register(driver);
    kernel.getRegistry().register(createInMemoryStateManager());
    kernel.getRegistry().register(createInMemoryTraceLog());

    let evalHookCalls = 0;
    const evaluateOutput = vi.fn((_step, _output) => {
      evalHookCalls++;
      if (evalHookCalls === 1) return SupervisorDecision.REWORK;
      return SupervisorDecision.PROCEED;
    });

    const runner = new WorkflowRunner(manifest, kernel, {
      hooks: { evaluateOutput },
    });
    const result = await runner.run();

    // Evaluator agent should NOT be called — hook replaced it
    expect(evaluatorCalled).toBe(false);
    expect(evaluateOutput).toHaveBeenCalledTimes(2);
    expect(evaluateOutput).toHaveBeenCalledWith(
      expect.objectContaining({ step: 'hook_eval' }),
      'agent output',
    );

    // Hook returned REWORK then PROCEED, step has max_retries=2 → one retry
    expect(result.steps[0].retries).toBe(1);
  });

  it('should fall through to evaluator when evaluateOutput returns null', async () => {
    const manifest = createTestManifest({
      agents: [
        { id: 'agent_a', use_driver: 'test_driver', model: 'test:model-a', status: 'auto' },
        { id: 'evaluator_agent', use_driver: 'test_driver', model: 'test:evaluator', status: 'auto' },
      ],
      sequence: [
        { step: 'fallback_eval', agent: 'agent_a', evaluator: 'evaluator_agent', max_retries: 1 },
      ],
    });
    const kernel = createMicroKernel();

    let evaluatorCalled = false;
    const driver = createTestDriver(async (opts) => {
      if (opts.model === 'test:evaluator') {
        evaluatorCalled = true;
        return { content: 'decision: PROCEED' };
      }
      return { content: 'agent output' };
    });
    kernel.getRegistry().register(driver);
    kernel.getRegistry().register(createInMemoryStateManager());
    kernel.getRegistry().register(createInMemoryTraceLog());

    const evaluateOutput = vi.fn((_step, _output) => null);

    const runner = new WorkflowRunner(manifest, kernel, {
      hooks: { evaluateOutput },
    });
    await runner.run();

    // Evaluator agent SHOULD be called — hook returned null
    expect(evaluatorCalled).toBe(true);
    expect(evaluateOutput).toHaveBeenCalledTimes(1);
  });

  it('should call onDecision hook on each routing decision', async () => {
    const manifest = createTestManifest({
      sequence: [{ step: 'dec_step', agent: 'agent_a', max_retries: 3 }],
      agents: [{ id: 'agent_a', use_driver: 'test_driver', model: 'test:model-a', status: 'auto' }],
    });
    const kernel = createMicroKernel();

    let callCount = 0;
    const driver = createTestDriver(async () => {
      callCount++;
      if (callCount === 1) return { content: 'short' };
      return { content: 'good enough output here' };
    });
    kernel.getRegistry().register(driver);
    kernel.getRegistry().register(createInMemoryStateManager());
    kernel.getRegistry().register(createInMemoryTraceLog());

    const stepCriteria = [
      { description: 'output must be at least 10 chars', check: (out: string) => out.length >= 10 },
    ];

    const onDecision = vi.fn();
    const runner = new WorkflowRunner(manifest, kernel, {
      stepCriteria,
      hooks: { onDecision },
    });
    await runner.run();

    // Called twice: once for REWORK, once for COMPLETE
    expect(onDecision).toHaveBeenCalledTimes(2);
    expect(onDecision).toHaveBeenNthCalledWith(
      1,
      SupervisorDecision.REWORK,
      expect.objectContaining({ step: 'dec_step' }),
    );
    expect(onDecision).toHaveBeenNthCalledWith(
      2,
      SupervisorDecision.COMPLETE,
      expect.objectContaining({ step: 'dec_step' }),
    );
  });

  it('should work with no hooks provided (default behavior unchanged)', async () => {
    const manifest = createTestManifest({
      sequence: [{ step: 'no_hook_step', agent: 'agent_a', max_retries: 1 }],
      agents: [{ id: 'agent_a', use_driver: 'test_driver', model: 'test:model-a', status: 'auto' }],
    });
    const kernel = createMicroKernel();

    const driver = createTestDriver(async () => ({ content: 'output' }));
    kernel.getRegistry().register(driver);
    kernel.getRegistry().register(createInMemoryStateManager());
    kernel.getRegistry().register(createInMemoryTraceLog());

    // No hooks passed at all
    const runner = new WorkflowRunner(manifest, kernel);
    const result = await runner.run();

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].decision).toBe(SupervisorDecision.COMPLETE);
  });

  it('should invoke evaluator and proceed when evaluator returns structured PROCEED', async () => {
    const manifest = createTestManifest({
      agents: [
        { id: 'agent_a', use_driver: 'test_driver', model: 'test:model-a', status: 'auto' },
        { id: 'evaluator_agent', use_driver: 'test_driver', model: 'test:evaluator', status: 'auto' }
      ],
      sequence: [
        { step: 'step_with_eval', agent: 'agent_a', evaluator: 'evaluator_agent', max_retries: 1 }
      ]
    });
    const kernel = createMicroKernel();

    let evalCallCount = 0;
    const driver = createTestDriver(async (opts) => {
      if (opts.model === 'test:evaluator') {
        evalCallCount++;
        return { content: 'Looks good. decision: PROCEED' };
      }
      return { content: 'agent output' };
    });
    const traceLog = createInMemoryTraceLog();
    const appendTraceSpy = vi.spyOn(traceLog, 'appendTrace');

    kernel.getRegistry().register(driver);
    kernel.getRegistry().register(createInMemoryStateManager());
    kernel.getRegistry().register(traceLog);

    const runner = new WorkflowRunner(manifest, kernel);
    const result = await runner.run();

    expect(evalCallCount).toBe(1);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].decision).toBe(SupervisorDecision.COMPLETE);

    // Verify TraceLog logged EvaluatorDecision as gate_finding envelope
    const evalTraces = appendTraceSpy.mock.calls.filter(call => {
      const env = call[0] as TraceEnvelope;
      return env.type === 'gate_finding';
    });
    expect(evalTraces).toHaveLength(1);
    const evalEnvelope = evalTraces[0][0] as TraceEnvelope;
    expect(evalEnvelope.type).toBe('gate_finding');
    expect(evalEnvelope.nodeId).toBe('step_with_eval');
    expect(evalEnvelope.payload).toMatchObject({
      evaluator: 'evaluator_agent',
      decision: 'PROCEED'
    });
  });

  // 14. Evaluator returning REWORK
  it('should escalate immediately when max_retries is 0 and output fails criteria (no retry)', async () => {
    const manifest = createTestManifest({
      sequence: [{ step: 'no_retry_step', agent: 'agent_a', max_retries: 0 }],
      agents: [{ id: 'agent_a', use_driver: 'test_driver', model: 'test:model-a', status: 'auto' }],
    });
    const kernel = createMicroKernel();

    let callCount = 0;
    const driver = createTestDriver(async () => {
      callCount++;
      return { content: 'short' };
    });
    const stateManager = createInMemoryStateManager();
    kernel.getRegistry().register(driver);
    kernel.getRegistry().register(stateManager);
    kernel.getRegistry().register(createInMemoryTraceLog());

    const stepCriteria = [
      { description: 'output must be at least 10 chars', check: (out: string) => out.length >= 10 },
    ];

    const runner = new WorkflowRunner(manifest, kernel, { stepCriteria });
    const result = await runner.run();

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].decision).toBe(SupervisorDecision.ESCALATE);
    expect(result.steps[0].retries).toBe(0);

    // Only 1 call to generate — no retry
    expect(callCount).toBe(1);

    // State should show in_progress then failed (no rework entry)
    const history = stateManager.getHistory();
    expect(history.some((e) => e.status === 'failed')).toBe(true);
    expect(history.some((e) => e.status === 'rework')).toBe(false);
  });

  it('should escalate exactly at 2nd failure when max_retries is 1 (first try + 1 retry)', async () => {
    const manifest = createTestManifest({
      sequence: [{ step: 'one_retry_step', agent: 'agent_a', max_retries: 1 }],
      agents: [{ id: 'agent_a', use_driver: 'test_driver', model: 'test:model-a', status: 'auto' }],
    });
    const kernel = createMicroKernel();

    let callCount = 0;
    const driver = createTestDriver(async () => {
      callCount++;
      return { content: 'short' };
    });
    const stateManager = createInMemoryStateManager();
    kernel.getRegistry().register(driver);
    kernel.getRegistry().register(stateManager);
    kernel.getRegistry().register(createInMemoryTraceLog());

    const stepCriteria = [
      { description: 'output must be at least 10 chars', check: (out: string) => out.length >= 10 },
    ];

    const runner = new WorkflowRunner(manifest, kernel, { stepCriteria });
    const result = await runner.run();

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].decision).toBe(SupervisorDecision.ESCALATE);
    expect(result.steps[0].retries).toBe(1);

    // First try + 1 retry = 2 calls to generate
    expect(callCount).toBe(2);
  });

  it('should escalate exactly at 4th failure when max_retries is 3 (first try + 3 retries)', async () => {
    const manifest = createTestManifest({
      sequence: [{ step: 'three_retry_step', agent: 'agent_a', max_retries: 3 }],
      agents: [{ id: 'agent_a', use_driver: 'test_driver', model: 'test:model-a', status: 'auto' }],
    });
    const kernel = createMicroKernel();

    let callCount = 0;
    const driver = createTestDriver(async () => {
      callCount++;
      return { content: 'short' };
    });
    const stateManager = createInMemoryStateManager();
    kernel.getRegistry().register(driver);
    kernel.getRegistry().register(stateManager);
    kernel.getRegistry().register(createInMemoryTraceLog());

    const stepCriteria = [
      { description: 'output must be at least 10 chars', check: (out: string) => out.length >= 10 },
    ];

    const runner = new WorkflowRunner(manifest, kernel, { stepCriteria });
    const result = await runner.run();

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].decision).toBe(SupervisorDecision.ESCALATE);
    expect(result.steps[0].retries).toBe(3);

    // First try + 3 retries = 4 calls to generate
    expect(callCount).toBe(4);
  });

  it('should continue to next step after ESCALATE on a prior step', async () => {
    const manifest = createTestManifest({
      sequence: [
        { step: 'step_escalated', agent: 'agent_a', max_retries: 1 },
        { step: 'step_next', agent: 'agent_b', max_retries: 1 },
      ],
      agents: [
        { id: 'agent_a', use_driver: 'test_driver', model: 'test:model-a', status: 'auto' },
        { id: 'agent_b', use_driver: 'test_driver', model: 'test:model-b', status: 'auto' },
      ],
    });
    const kernel = createMicroKernel();

    let callCount = 0;
    const driver = createTestDriver(async (opts) => {
      callCount++;
      if (opts.model === 'test:model-a') return { content: 'short' };
      return { content: 'second step output ok!' };
    });
    const stateManager = createInMemoryStateManager();
    kernel.getRegistry().register(driver);
    kernel.getRegistry().register(stateManager);
    kernel.getRegistry().register(createInMemoryTraceLog());

    const stepCriteria = [
      { description: 'output must be at least 10 chars', check: (out: string) => out.length >= 10 },
    ];

    const runner = new WorkflowRunner(manifest, kernel, { stepCriteria });
    const result = await runner.run();

    // Both steps should be in results
    expect(result.steps).toHaveLength(2);

    // First step escalated
    expect(result.steps[0].step).toBe('step_escalated');
    expect(result.steps[0].agent).toBe('agent_a');
    expect(result.steps[0].decision).toBe(SupervisorDecision.ESCALATE);

    // Second step still executed and completed
    expect(result.steps[1].step).toBe('step_next');
    expect(result.steps[1].agent).toBe('agent_b');
    expect(result.steps[1].decision).toBe(SupervisorDecision.COMPLETE);
    expect(result.steps[1].output).toBe('second step output ok!');

    // State should include failed for step_escalated, completed for step_next
    const history = stateManager.getHistory();
    expect(history.some((e) => e.node_id === 'step_escalated' && e.status === 'failed')).toBe(true);
    expect(history.some((e) => e.node_id === 'step_next' && e.status === 'completed')).toBe(true);
  });

  it('should invoke evaluator and rework when evaluator returns structured REWORK', async () => {
    const manifest = createTestManifest({
      agents: [
        { id: 'agent_a', use_driver: 'test_driver', model: 'test:model-a', status: 'auto' },
        { id: 'evaluator_agent', use_driver: 'test_driver', model: 'test:evaluator', status: 'auto' }
      ],
      sequence: [
        { step: 'step_with_eval', agent: 'agent_a', evaluator: 'evaluator_agent', max_retries: 3 }
      ]
    });
    const kernel = createMicroKernel();

    let agentCallCount = 0;
    let evalCallCount = 0;
    const driver = createTestDriver(async (opts) => {
      if (opts.model === 'test:evaluator') {
        evalCallCount++;
        if (evalCallCount === 1) return { content: 'Needs work. decision: REWORK' };
        return { content: 'decision: PROCEED' };
      }
      agentCallCount++;
      return { content: `agent output ${agentCallCount}` };
    });
    kernel.getRegistry().register(driver);
    kernel.getRegistry().register(createInMemoryStateManager());
    kernel.getRegistry().register(createInMemoryTraceLog());

    const runner = new WorkflowRunner(manifest, kernel);
    const result = await runner.run();

    expect(agentCallCount).toBe(2);
    expect(evalCallCount).toBe(2);
    expect(result.steps[0].decision).toBe(SupervisorDecision.COMPLETE);
    expect(result.steps[0].retries).toBe(1);
  });

  // 15. Evaluator: malformed output defaults to REWORK
  it('should default to REWORK on malformed evaluator output', async () => {
    const manifest = createTestManifest({
      agents: [
        { id: 'agent_a', use_driver: 'test_driver', model: 'test:model-a', status: 'auto' },
        { id: 'evaluator_agent', use_driver: 'test_driver', model: 'test:evaluator', status: 'auto' }
      ],
      sequence: [
        { step: 'step_with_eval', agent: 'agent_a', evaluator: 'evaluator_agent', max_retries: 3 }
      ]
    });
    const kernel = createMicroKernel();

    let evalCallCount = 0;
    const driver = createTestDriver(async (opts) => {
      if (opts.model === 'test:evaluator') {
        evalCallCount++;
        if (evalCallCount === 1) return { content: 'gibberish without any decision keyword' };
        if (evalCallCount === 2) return { content: 'still no valid decision here' };
        return { content: 'decision: PROCEED' };
      }
      return { content: 'agent output that passes' };
    });
    const traceLog = createInMemoryTraceLog();
    const appendTraceSpy = vi.spyOn(traceLog, 'appendTrace');

    kernel.getRegistry().register(driver);
    kernel.getRegistry().register(createInMemoryStateManager());
    kernel.getRegistry().register(traceLog);

    const runner = new WorkflowRunner(manifest, kernel);
    const result = await runner.run();

    expect(evalCallCount).toBeGreaterThanOrEqual(2);

    // Check that malformed outputs were logged as REWORK decisions in gate_finding envelopes
    const evalTraces = appendTraceSpy.mock.calls.filter(call => {
      const env = call[0] as TraceEnvelope;
      return env.type === 'gate_finding';
    });
    expect(evalTraces.length).toBeGreaterThanOrEqual(2);
    const firstEvalEnv = evalTraces[0][0] as TraceEnvelope;
    expect(firstEvalEnv.payload).toMatchObject({ decision: 'REWORK' });
  });

  // 16. Evaluator: BLOCK triggers human intervention path
  it('should trigger BLOCK path when evaluator returns decision: BLOCK', async () => {
    const manifest = createTestManifest({
      agents: [
        { id: 'agent_a', use_driver: 'test_driver', model: 'test:model-a', status: 'auto' },
        { id: 'evaluator_agent', use_driver: 'test_driver', model: 'test:evaluator', status: 'auto' }
      ],
      sequence: [
        { step: 'block_step', agent: 'agent_a', evaluator: 'evaluator_agent', max_retries: 1 }
      ]
    });
    const kernel = createMicroKernel();

    let evalCallCount = 0;
    const driver = createTestDriver(async (opts) => {
      if (opts.model === 'test:evaluator') {
        evalCallCount++;
        return { content: 'Requires human review. decision: BLOCK' };
      }
      return { content: 'agent output needing review' };
    });
    const traceLog = createInMemoryTraceLog();
    const appendTraceSpy = vi.spyOn(traceLog, 'appendTrace');

    kernel.getRegistry().register(driver);
    kernel.getRegistry().register(createInMemoryStateManager());
    kernel.getRegistry().register(traceLog);

    // Subscribe to human:required and respond with proceed
    kernel.getEventBus().subscribe('human:required', (payload: unknown) => {
      const request = payload as HumanInputRequest;
      setTimeout(() => {
        kernel.getEventBus().publish('human:response', {
          requestId: request.requestId,
          action: 'proceed',
        } as HumanInputResult);
      }, 0);
    });

    const runner = new WorkflowRunner(manifest, kernel);
    const result = await runner.run();

    expect(evalCallCount).toBe(1);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].decision).toBe(SupervisorDecision.COMPLETE);

    // Verify EvaluatorDecision was logged with BLOCK in gate_finding envelope
    const evalTraces = appendTraceSpy.mock.calls.filter(call => {
      const env = call[0] as TraceEnvelope;
      return env.type === 'gate_finding';
    });
    expect(evalTraces).toHaveLength(1);
    const evalEnvelope = evalTraces[0][0] as TraceEnvelope;
    expect(evalEnvelope.type).toBe('gate_finding');
    expect(evalEnvelope.nodeId).toBe('block_step');
    expect(evalEnvelope.payload).toMatchObject({
      evaluator: 'evaluator_agent',
      decision: 'BLOCK'
    });
  });

  // 17. Evaluator: various casing and whitespace in structured decision
  it('should parse structured evaluator decisions with various casing and whitespace', async () => {
    const manifest = createTestManifest({
      agents: [
        { id: 'agent_a', use_driver: 'test_driver', model: 'test:model-a', status: 'auto' },
        { id: 'evaluator_agent', use_driver: 'test_driver', model: 'test:evaluator', status: 'auto' }
      ],
      sequence: [
        { step: 'step_1', agent: 'agent_a', evaluator: 'evaluator_agent', max_retries: 1 },
        { step: 'step_2', agent: 'agent_a', evaluator: 'evaluator_agent', max_retries: 2 },
        { step: 'step_3', agent: 'agent_a', evaluator: 'evaluator_agent', max_retries: 1 },
        { step: 'step_4', agent: 'agent_a', evaluator: 'evaluator_agent', max_retries: 1 },
      ]
    });
    const kernel = createMicroKernel();

    const evalResponses = [
      'DECISION: PROCEED',          // uppercase keyword
      'decision:rework',            // no space after colon → triggers rework
      'decision: PROCEED',          // fallback after rework (retry)
      'Decision  :  PROCEED',       // extra whitespace
      '  decision = proceed  ',     // equals sign variant
    ];
    let evalIndex = 0;
    const driver = createTestDriver(async (opts) => {
      if (opts.model === 'test:evaluator') {
        return { content: evalResponses[evalIndex++] ?? 'decision: PROCEED' };
      }
      return { content: 'agent output' };
    });
    const traceLog = createInMemoryTraceLog();
    const appendTraceSpy = vi.spyOn(traceLog, 'appendTrace');

    kernel.getRegistry().register(driver);
    kernel.getRegistry().register(createInMemoryStateManager());
    kernel.getRegistry().register(traceLog);

    const runner = new WorkflowRunner(manifest, kernel);
    const result = await runner.run();

    // All 4 steps should complete (step_2 needed 1 rework, max_retries=1)
    expect(result.steps).toHaveLength(4);
    expect(result.steps[1].retries).toBe(1); // step_2 had rework

    const evalTraces = appendTraceSpy.mock.calls.filter(call => {
      const env = call[0] as TraceEnvelope;
      return env.type === 'gate_finding';
    });
    // 5 eval calls: step_1, step_2 (first), step_2 (retry), step_3, step_4
    expect(evalTraces).toHaveLength(5);
    expect((evalTraces[0][0] as TraceEnvelope).payload).toMatchObject({ decision: 'PROCEED' }); // DECISION: PROCEED
    expect((evalTraces[1][0] as TraceEnvelope).payload).toMatchObject({ decision: 'REWORK' });  // decision:rework
    expect((evalTraces[2][0] as TraceEnvelope).payload).toMatchObject({ decision: 'PROCEED' }); // retry: decision: PROCEED
    expect((evalTraces[3][0] as TraceEnvelope).payload).toMatchObject({ decision: 'PROCEED' }); // Decision  :  PROCEED
    expect((evalTraces[4][0] as TraceEnvelope).payload).toMatchObject({ decision: 'PROCEED' }); // decision = proceed
  });

  // 18. Evaluator: structured format takes precedence over sentence content
  it('should use structured decision even when REWORK/PROCEED appears in prose', async () => {
    const manifest = createTestManifest({
      agents: [
        { id: 'agent_a', use_driver: 'test_driver', model: 'test:model-a', status: 'auto' },
        { id: 'evaluator_agent', use_driver: 'test_driver', model: 'test:evaluator', status: 'auto' }
      ],
      sequence: [
        { step: 'step_1', agent: 'agent_a', evaluator: 'evaluator_agent', max_retries: 1 },
      ]
    });
    const kernel = createMicroKernel();

    const driver = createTestDriver(async (opts) => {
      if (opts.model === 'test:evaluator') {
        // "this does NOT need rework" — old substring code would say REWORK
        // Structured format says PROCEED — new parser picks PROCEED
        return { content: 'This output does NOT need REWORK. It passes all checks. decision: PROCEED' };
      }
      return { content: 'agent output' };
    });
    const traceLog = createInMemoryTraceLog();
    const appendTraceSpy = vi.spyOn(traceLog, 'appendTrace');

    kernel.getRegistry().register(driver);
    kernel.getRegistry().register(createInMemoryStateManager());
    kernel.getRegistry().register(traceLog);

    const runner = new WorkflowRunner(manifest, kernel);
    const result = await runner.run();

    // Step should complete (not rework) even though "REWORK" appears in prose
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].decision).toBe(SupervisorDecision.COMPLETE);

    const evalTraces = appendTraceSpy.mock.calls.filter(call => {
      const env = call[0] as TraceEnvelope;
      return env.type === 'gate_finding';
    });
    expect(evalTraces).toHaveLength(1);
    // The prose contains "REWORK" but the structured decision says PROCEED
    expect((evalTraces[0][0] as TraceEnvelope).payload).toMatchObject({ decision: 'PROCEED' });
  });

  // 19. Evaluator: BLOCK override applies similar to REWORK override
  it('should override Supervisor PROCEED with BLOCK when evaluator returns BLOCK', async () => {
    const manifest = createTestManifest({
      agents: [
        { id: 'agent_a', use_driver: 'test_driver', model: 'test:model-a', status: 'auto' },
        { id: 'evaluator_agent', use_driver: 'test_driver', model: 'test:evaluator', status: 'auto' }
      ],
      sequence: [
        { step: 'block_step', agent: 'agent_a', evaluator: 'evaluator_agent', max_retries: 1 }
      ]
    });
    const kernel = createMicroKernel();

    const driver = createTestDriver(async (opts) => {
      if (opts.model === 'test:evaluator') {
        return { content: 'decision: BLOCK' };
      }
      return { content: 'agent output' };
    });

    kernel.getRegistry().register(driver);
    kernel.getRegistry().register(createInMemoryStateManager());
    kernel.getRegistry().register(createInMemoryTraceLog());

    let blockRequested = false;
    kernel.getEventBus().subscribe('human:required', (payload: unknown) => {
      blockRequested = true;
      const request = payload as HumanInputRequest;
      setTimeout(() => {
        kernel.getEventBus().publish('human:response', {
          requestId: request.requestId,
          action: 'proceed',
        } as HumanInputResult);
      }, 0);
    });

    const runner = new WorkflowRunner(manifest, kernel);
    await runner.run();

    expect(blockRequested).toBe(true);
  });

  // ---- 20. Driver identification (kind/capabilities) ----

  it('should throw when manifest driver ID references a non-driver plugin (kind mismatch)', async () => {
    const manifest = createTestManifest({
      sequence: [{ step: 'step_1', agent: 'agent_a', max_retries: 1 }],
    });
    const kernel = createMicroKernel();

    // Register a State plugin as "test_driver" (name collision with manifest driver id)
    const statePlugin = {
      name: 'test_driver',
      kind: 'state' as const,
      version: '1.0.0',
      initialize: vi.fn(),
      ping: async () => true,
      shutdown: vi.fn(),
    };
    kernel.getRegistry().register(statePlugin);
    kernel.getRegistry().register(createInMemoryStateManager());
    kernel.getRegistry().register(createInMemoryTraceLog());

    const runner = new WorkflowRunner(manifest, kernel);
    await expect(runner.run()).rejects.toThrow(/not a driver/i);
  });

  it('should accept driver plugin with kind="driver" and capabilities', async () => {
    const manifest = createTestManifest({
      sequence: [{ step: 'step_1', agent: 'agent_a', max_retries: 1 }],
    });
    const kernel = createMicroKernel();

    const driver = createTestDriver(async () => ({ content: 'output' }));
    // Simulate driver with kind/capabilities
    const enhancedDriver = {
      ...driver,
      kind: 'driver' as const,
      capabilities: ['generate', 'translate'],
    };
    kernel.getRegistry().register(enhancedDriver);
    kernel.getRegistry().register(createInMemoryStateManager());
    kernel.getRegistry().register(createInMemoryTraceLog());

    const runner = new WorkflowRunner(manifest, kernel);
    const result = await runner.run();

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].decision).toBe(SupervisorDecision.COMPLETE);
  });

  it('should accept backward-compat driver without kind field (fallback heuristic)', async () => {
    const manifest = createTestManifest({
      sequence: [{ step: 'step_1', agent: 'agent_a', max_retries: 1 }],
    });
    const kernel = createMicroKernel();

    // Driver without kind field (backward compat)
    const driver = createTestDriver(async () => ({ content: 'backward compat output' }));
    kernel.getRegistry().register(driver);
    kernel.getRegistry().register(createInMemoryStateManager());
    kernel.getRegistry().register(createInMemoryTraceLog());

    const runner = new WorkflowRunner(manifest, kernel);
    const result = await runner.run();

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].decision).toBe(SupervisorDecision.COMPLETE);
  });

  it('should throw when manifest driver ID has no matching plugin in registry', async () => {
    const manifest = createTestManifest({
      sequence: [{ step: 'step_1', agent: 'agent_a', max_retries: 1 }],
      agents: [{ id: 'agent_a', use_driver: 'nonexistent_driver', model: 'test:model-a', status: 'auto' }],
    });
    const kernel = createMicroKernel();

    // Register State and Trace but NOT nonexistent_driver
    kernel.getRegistry().register(createInMemoryStateManager());
    kernel.getRegistry().register(createInMemoryTraceLog());

    const runner = new WorkflowRunner(manifest, kernel);
    await expect(runner.run()).rejects.toThrow(/not found|not registered/i);
  });
});

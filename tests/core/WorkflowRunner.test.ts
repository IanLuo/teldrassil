import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupervisorDecision } from '../../src/core/Supervisor';
import type { Manifest } from '../../src/core/ManifestParser';
import type { IModelDriver, Message, GenerateOptions, GenerateResult, VendorPayload, DriverCapabilities } from '../../src/core/IModelDriver';
import type { IStateManager, StateEntry } from '../../src/core/IStateManager';
import type { ITraceLog, TraceURI } from '../../src/core/ITraceLog';
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
    appendTrace(_payload: unknown): TraceURI {
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

  // 4. ESCALATE — step fails more than max_retries
  it('should throw SystemExit when step exceeds max retries', async () => {
    const manifest = createTestManifest({
      sequence: [{ step: 'failing_step', agent: 'agent_a', max_retries: 2 }],
      agents: [{ id: 'agent_a', use_driver: 'test_driver', model: 'test:model-a', status: 'auto' }],
    });
    const kernel = createMicroKernel();

    const driver = createTestDriver(async () => ({ content: 'short' }));
    kernel.getRegistry().register(driver);
    kernel.getRegistry().register(createInMemoryStateManager());
    kernel.getRegistry().register(createInMemoryTraceLog());

    const stepCriteria = [
      { description: 'output must be at least 10 chars', check: (out: string) => out.length >= 10 },
    ];

    const runner = new WorkflowRunner(manifest, kernel, { stepCriteria });
    await expect(runner.run()).rejects.toThrow(SystemExit);
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

  it('should record failed status before throwing SystemExit on ESCALATE', async () => {
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
    await expect(runner.run()).rejects.toThrow(SystemExit);

    const history = stateManager.getHistory();
    // With max_retries=1: attempt0 fails → rework, stepRetries=1 → 
    // attempt1 retryCount=1 (> maxRetries=1 not true), fails → rework, stepRetries=2
    // attempt2 retryCount=2 (> maxRetries=1) → ESCALATE → records failed → throws
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
    const payload = appendTraceSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.type).toBe('RouteDecision');
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
    const firstPayload = appendTraceSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(firstPayload.decision).toBe(SupervisorDecision.REWORK);
    const secondPayload = appendTraceSpy.mock.calls[1][0] as Record<string, unknown>;
    expect(secondPayload.decision).toBe(SupervisorDecision.COMPLETE);
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
});

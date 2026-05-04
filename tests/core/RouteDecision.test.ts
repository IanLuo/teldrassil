import { describe, it, expect, vi } from 'vitest';
import { SupervisorDecision } from '../../src/core/Supervisor';
import { recordRouteDecision, type RouteDecision } from '../../src/core/RouteDecision';
import type { ITraceLog, TraceURI } from '../../src/core/ITraceLog';

function createMockTraceLog(uri: TraceURI = 'trace://v1/00001' as TraceURI): ITraceLog {
  return {
    name: 'mock-trace-log',
    version: '1.0.0',
    initialize: vi.fn(),
    appendTrace: vi.fn().mockReturnValue(uri),
    getTrace: vi.fn().mockReturnValue(null),
  };
}

describe('RouteDecision', () => {
  describe('RouteDecision struct', () => {
    it('should create a RouteDecision object with all required fields', () => {
      const decision: RouteDecision = {
        from: 'senior_coder',
        to: 'draft_plan',
        decision: SupervisorDecision.PROCEED,
        reason: 'All quality criteria passed',
        timestamp: new Date().toISOString(),
      };

      expect(decision.from).toBe('senior_coder');
      expect(decision.to).toBe('draft_plan');
      expect(decision.decision).toBe(SupervisorDecision.PROCEED);
      expect(decision.reason).toBe('All quality criteria passed');
      expect(decision.timestamp).toBeDefined();
      expect(new Date(decision.timestamp).toISOString()).toBe(decision.timestamp);
    });

    it('should support optional metadata field', () => {
      const decision: RouteDecision = {
        from: 'senior_coder',
        to: null,
        decision: SupervisorDecision.REWORK,
        reason: 'Criteria failed',
        timestamp: new Date().toISOString(),
        metadata: {
          failedCriteria: ['length check', 'code block check'],
          retryCount: 2,
        },
      };

      expect(decision.to).toBeNull();
      expect(decision.metadata).toEqual({
        failedCriteria: ['length check', 'code block check'],
        retryCount: 2,
      });
    });

    it('should support BLOCK and COMPLETE decisions in the struct', () => {
      const blockDecision: RouteDecision = {
        from: 'senior_coder',
        to: null,
        decision: SupervisorDecision.BLOCK,
        reason: 'Human intervention required',
        timestamp: new Date().toISOString(),
      };

      const completeDecision: RouteDecision = {
        from: 'normalizer',
        to: null,
        decision: SupervisorDecision.COMPLETE,
        reason: 'Workflow finished',
        timestamp: new Date().toISOString(),
      };

      expect(blockDecision.decision).toBe(SupervisorDecision.BLOCK);
      expect(completeDecision.decision).toBe(SupervisorDecision.COMPLETE);
    });
  });

  describe('recordRouteDecision', () => {
    it('should call appendTrace on the trace log with correct payload shape', async () => {
      const traceLog = createMockTraceLog();
      const decision: RouteDecision = {
        from: 'senior_coder',
        to: 'planner',
        decision: SupervisorDecision.PROCEED,
        reason: 'test',
        timestamp: new Date().toISOString(),
      };

      const uri = await recordRouteDecision(traceLog, decision);

      expect(traceLog.appendTrace).toHaveBeenCalledTimes(1);
      const payload = (traceLog.appendTrace as ReturnType<typeof vi.fn>).mock.calls[0][0];

      expect(payload.type).toBe('RouteDecision');
      expect(payload.from).toBe('senior_coder');
      expect(payload.to).toBe('planner');
      expect(payload.decision).toBe(SupervisorDecision.PROCEED);
      expect(payload.reason).toBe('test');
      expect(payload.timestamp).toBe(decision.timestamp);
    });

    it('should include metadata in the trace log payload when provided', async () => {
      const traceLog = createMockTraceLog();
      const decision: RouteDecision = {
        from: 'worker',
        to: null,
        decision: SupervisorDecision.REWORK,
        reason: 'quality gate failed',
        timestamp: new Date().toISOString(),
        metadata: { failedCheck: 'length' },
      };

      await recordRouteDecision(traceLog, decision);

      const payload = (traceLog.appendTrace as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.metadata).toEqual({ failedCheck: 'length' });
    });

    it('should return the URI from appendTrace', async () => {
      const expectedUri = 'trace://v1/abc123' as TraceURI;
      const traceLog = createMockTraceLog(expectedUri);
      const decision: RouteDecision = {
        from: 'test',
        to: 'test',
        decision: SupervisorDecision.PROCEED,
        reason: 'test',
        timestamp: new Date().toISOString(),
      };

      const uri = await recordRouteDecision(traceLog, decision);
      expect(uri).toBe(expectedUri);
    });

    it('should serialize BLOCK decision with metadata to trace log', async () => {
      const traceLog = createMockTraceLog();
      const decision: RouteDecision = {
        from: 'senior_coder',
        to: null,
        decision: SupervisorDecision.BLOCK,
        reason: 'Human attach required: ambiguous requirements',
        timestamp: new Date().toISOString(),
        metadata: {
          criteria: ['requirement_clarity'],
          retryCount: 3,
          maxRetries: 3,
        },
      };

      const uri = await recordRouteDecision(traceLog, decision);

      const payload = (traceLog.appendTrace as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(payload.type).toBe('RouteDecision');
      expect(payload.decision).toBe(SupervisorDecision.BLOCK);
      expect(payload.reason).toBe('Human attach required: ambiguous requirements');
      expect(payload.metadata).toEqual({
        criteria: ['requirement_clarity'],
        retryCount: 3,
        maxRetries: 3,
      });
    });
  });
});

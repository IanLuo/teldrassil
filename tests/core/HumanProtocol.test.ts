import { describe, it, expect } from 'vitest';
import type { HumanInputRequest, HumanInputResult } from '../../src/core/HumanProtocol';

describe('HumanProtocol types (type contract)', () => {
  it('HumanInputRequest should have all required fields', () => {
    const req: HumanInputRequest = {
      requestId: 'req-001',
      step: 'blocked_step',
      agent: 'agent_a',
      prompt: 'Please review this output',
      output: 'some blocked output',
    };
    expect(req.requestId).toBe('req-001');
    expect(req.step).toBe('blocked_step');
    expect(req.agent).toBe('agent_a');
    expect(req.prompt).toBe('Please review this output');
    expect(req.output).toBe('some blocked output');
  });

  it('HumanInputRequest should support optional contextRefs and choices', () => {
    const req: HumanInputRequest = {
      requestId: 'req-002',
      step: 'review_step',
      agent: 'agent_b',
      prompt: 'Review the generated code',
      output: 'some code',
      contextRefs: ['trace-123', 'mem-456'],
      choices: ['Accept', 'Reject', 'Modify'],
    };
    expect(req.contextRefs).toEqual(['trace-123', 'mem-456']);
    expect(req.choices).toEqual(['Accept', 'Reject', 'Modify']);
  });

  it('HumanInputResult should have required requestId and action', () => {
    const result: HumanInputResult = {
      requestId: 'req-001',
      action: 'proceed',
    };
    expect(result.requestId).toBe('req-001');
    expect(result.action).toBe('proceed');
  });

  it('HumanInputResult should support optional feedback and resumeAt', () => {
    const result: HumanInputResult = {
      requestId: 'req-003',
      action: 'rework',
      feedback: 'Please fix the formatting',
      resumeAt: 'step_5',
    };
    expect(result.action).toBe('rework');
    expect(result.feedback).toBe('Please fix the formatting');
    expect(result.resumeAt).toBe('step_5');
  });

  it('HumanInputResult action should be one of proceed, rework, abort', () => {
    const validActions = ['proceed', 'rework', 'abort'] as const;
    for (const action of validActions) {
      const result: HumanInputResult = { requestId: 'req-x', action };
      expect(result.action).toBe(action);
    }
  });

  it('requestId should uniquely identify a request', () => {
    const req1: HumanInputRequest = {
      requestId: 'req-a',
      step: 'step_1',
      agent: 'agent_a',
      prompt: 'prompt 1',
      output: 'output 1',
    };
    const req2: HumanInputRequest = {
      requestId: 'req-b',
      step: 'step_2',
      agent: 'agent_b',
      prompt: 'prompt 2',
      output: 'output 2',
    };
    expect(req1.requestId).not.toBe(req2.requestId);
    // Verify requestId is used to match results
    const resultForA: HumanInputResult = { requestId: 'req-a', action: 'proceed' };
    expect(resultForA.requestId).toBe(req1.requestId);
    expect(resultForA.requestId).not.toBe(req2.requestId);
  });
});

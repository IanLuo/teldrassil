import { describe, it, expect, vi } from 'vitest';
import { HostFunctionDriver, type HostFunction } from '../../src/core/HostFunctionDriver';
import type { Message, GenerateOptions } from '../../src/core/IModelDriver';

describe('HostFunctionDriver', () => {
  describe('plugin identity', () => {
    it('should be named Driver for BootstrapSequence', () => {
      const driver = new HostFunctionDriver({});
      expect(driver.name).toBe('Driver');
    });

    it('should have a working ping that returns true', async () => {
      const driver = new HostFunctionDriver({});
      const result = await driver.ping!();
      expect(result).toBe(true);
    });

    it('should have no-op initialize and shutdown', () => {
      const driver = new HostFunctionDriver({});
      expect(() => driver.initialize()).not.toThrow();
      expect(() => driver.shutdown!()).not.toThrow();
    });
  });

  describe('generate', () => {
    it('should call the registered function with the action_id from model field', async () => {
      const mockFn = vi.fn().mockResolvedValue('processed');
      const driver = new HostFunctionDriver({ requirementNormalizer: mockFn });

      const options: GenerateOptions = {
        model: 'requirementNormalizer',
        messages: [{ role: 'user', content: 'Normalize this requirement' }],
      };

      const result = await driver.generate!(options);

      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockFn).toHaveBeenCalledWith({
        messages: options.messages,
        schema: undefined,
      });
      expect(result.content).toBe('processed');
    });

    it('should pass messages and schema to the host function', async () => {
      const mockFn = vi.fn().mockResolvedValue('result');
      const driver = new HostFunctionDriver({ myAction: mockFn });

      const schema = { type: 'object', properties: { name: { type: 'string' } } };
      const messages: Message[] = [
        { role: 'system', content: 'You are a classifier.' },
        { role: 'user', content: 'Classify this text.' },
      ];

      await driver.generate!({
        model: 'myAction',
        messages,
        schema,
      });

      expect(mockFn).toHaveBeenCalledWith({
        messages,
        schema,
      });
    });

    it('should return the function result as content', async () => {
      const driver = new HostFunctionDriver({
        echo: async (input) => `Echo: ${input.messages[0].content}`,
      });

      const result = await driver.generate!({
        model: 'echo',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.content).toBe('Echo: Hello');
      expect(result.toolCalls).toBeUndefined();
      expect(result.usage).toBeUndefined();
    });

    it('should throw when action_id is not registered', async () => {
      const driver = new HostFunctionDriver({ knownAction: async () => 'ok' });

      await expect(
        driver.generate!({
          model: 'unknownAction',
          messages: [{ role: 'user', content: 'Hi' }],
        })
      ).rejects.toThrow('Host function "unknownAction" not registered');
    });

    it('should handle sync host functions', async () => {
      const driver = new HostFunctionDriver({
        syncFn: (input) => `Sync: ${input.messages.length} messages`,
      });

      const result = await driver.generate!({
        model: 'syncFn',
        messages: [
          { role: 'user', content: 'msg1' },
          { role: 'user', content: 'msg2' },
        ],
      });

      expect(result.content).toBe('Sync: 2 messages');
    });

    it('should handle async host functions', async () => {
      const driver = new HostFunctionDriver({
        asyncFn: async (input) => {
          return `Async: ${input.messages[0].content}`;
        },
      });

      const result = await driver.generate!({
        model: 'asyncFn',
        messages: [{ role: 'user', content: 'async test' }],
      });

      expect(result.content).toBe('Async: async test');
    });

    it('should work with multiple registered functions independently', async () => {
      const driver = new HostFunctionDriver({
        fnA: async () => 'resultA',
        fnB: async () => 'resultB',
        fnC: async () => 'resultC',
      });

      const resultA = await driver.generate!({
        model: 'fnA',
        messages: [{ role: 'user', content: 'A' }],
      });
      const resultB = await driver.generate!({
        model: 'fnB',
        messages: [{ role: 'user', content: 'B' }],
      });
      const resultC = await driver.generate!({
        model: 'fnC',
        messages: [{ role: 'user', content: 'C' }],
      });

      expect(resultA.content).toBe('resultA');
      expect(resultB.content).toBe('resultB');
      expect(resultC.content).toBe('resultC');
    });
  });

  describe('translate', () => {
    it('should translate unified messages to host vendor payload', async () => {
      const driver = new HostFunctionDriver({});
      const messages: Message[] = [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello!' },
        { role: 'assistant', content: 'Hi there!' },
      ];

      const payload = await driver.translate(messages);

      expect(payload.model).toBe('host');
      expect(payload.messages).toHaveLength(3);
      expect(payload.messages[0]).toEqual({ role: 'system', content: 'You are helpful.' });
      expect(payload.messages[1]).toEqual({ role: 'user', content: 'Hello!' });
      expect(payload.messages[2]).toEqual({ role: 'assistant', content: 'Hi there!' });
    });

    it('should include tool_call_id for tool role messages', async () => {
      const driver = new HostFunctionDriver({});
      const messages: Message[] = [
        { role: 'tool', content: 'result', tool_call_id: 'call_123' },
      ];

      const payload = await driver.translate(messages);
      expect(payload.messages[0]).toEqual({
        role: 'tool',
        content: 'result',
        tool_call_id: 'call_123',
      });
    });
  });

  describe('countTokens', () => {
    it('should return a positive estimate', async () => {
      const driver = new HostFunctionDriver({});
      const tokens = await driver.countTokens([
        { role: 'user', content: 'Hello world!' },
      ]);
      expect(tokens).toBeGreaterThan(0);
    });

    it('should increase with longer content', async () => {
      const driver = new HostFunctionDriver({});
      const short = await driver.countTokens([{ role: 'user', content: 'hi' }]);
      const long = await driver.countTokens([
        { role: 'user', content: 'This is a much longer message that should result in more tokens counted.' },
      ]);
      expect(long).toBeGreaterThan(short);
    });

    it('should return at least 1 for empty messages', async () => {
      const driver = new HostFunctionDriver({});
      const tokens = await driver.countTokens([]);
      expect(tokens).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getCapabilities', () => {
    it('should report local deterministic capabilities', () => {
      const driver = new HostFunctionDriver({});
      const caps = driver.getCapabilities();

      expect(caps.maxContextTokens).toBe(Infinity);
      expect(caps.supportsStreaming).toBe(false);
      expect(caps.supportsTools).toBe(false);
    });
  });
});

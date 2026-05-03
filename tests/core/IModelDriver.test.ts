import { describe, it, expect } from 'vitest';
import type { IModelDriver, Message, VendorPayload } from '../../src/core/IModelDriver';

describe('IModelDriver', () => {
  describe('message translation', () => {
    it('should translate unified messages to vendor-specific format', async () => {
      const messages: Message[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello' },
      ];

      const driver: IModelDriver = {
        name: 'MockAnthropic',
        initialize: () => {},
        translate: async (msgs: Message[]): Promise<VendorPayload> => ({
          model: 'claude-3-5-sonnet',
          messages: msgs.map((m) => ({ role: m.role, content: m.content })),
          max_tokens: 1024,
        }),
        countTokens: async () => 15,
        getCapabilities: () => ({ maxContextTokens: 200000, supportsStreaming: true, supportsTools: true }),
      };

      const result = await driver.translate(messages);
      expect(result.model).toBe('claude-3-5-sonnet');
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].role).toBe('system');
    });

    it('should accept messages with all valid roles', async () => {
      const messages: Message[] = [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'User message' },
        { role: 'assistant', content: 'Assistant response' },
        { role: 'tool', content: 'Tool output', tool_call_id: 'call_1' },
      ];

      const driver: IModelDriver = {
        name: 'MockDriver',
        initialize: () => {},
        translate: async () => ({ model: 'mock', messages: [] }),
        countTokens: async () => 0,
        getCapabilities: () => ({ maxContextTokens: 100000, supportsStreaming: false, supportsTools: false }),
      };

      await expect(driver.translate(messages)).resolves.toBeDefined();
    });
  });

  describe('token counting', () => {
    it('should return a positive token count', async () => {
      const driver: IModelDriver = {
        name: 'MockDriver',
        initialize: () => {},
        translate: async () => ({ model: 'mock', messages: [] }),
        countTokens: async () => 42,
        getCapabilities: () => ({ maxContextTokens: 100000, supportsStreaming: true, supportsTools: true }),
      };

      const tokens = await driver.countTokens([{ role: 'user', content: 'Hello world' }]);
      expect(tokens).toBeGreaterThan(0);
    });
  });

  describe('capabilities', () => {
    it('should report driver capabilities', () => {
      const driver: IModelDriver = {
        name: 'OpenAIDriver',
        initialize: () => {},
        translate: async () => ({ model: 'gpt-4', messages: [] }),
        countTokens: async () => 0,
        getCapabilities: () => ({
          maxContextTokens: 128000,
          supportsStreaming: true,
          supportsTools: true,
          supportsVision: true,
        }),
      };

      const caps = driver.getCapabilities();
      expect(caps.maxContextTokens).toBe(128000);
      expect(caps.supportsStreaming).toBe(true);
      expect(caps.supportsVision).toBe(true);
    });
  });

  describe('full contract', () => {
    it('mock must satisfy all IModelDriver methods', () => {
      const driver: IModelDriver = {
        name: 'MockDriver',
        version: '1.0.0',
        initialize: () => {},
        ping: async () => true,
        shutdown: () => {},
        translate: async () => ({ model: 'mock', messages: [] }),
        countTokens: async () => 0,
        getCapabilities: () => ({ maxContextTokens: 100000, supportsStreaming: true, supportsTools: false }),
      };

      expect(driver.name).toBe('MockDriver');
      expect(typeof driver.translate).toBe('function');
      expect(typeof driver.countTokens).toBe('function');
      expect(typeof driver.getCapabilities).toBe('function');
    });
  });
});

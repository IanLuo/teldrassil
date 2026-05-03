import { describe, it, expect } from 'vitest';
import { AnthropicDriver } from '../../src/core/AnthropicDriver';
import type { Message } from '../../src/core/IModelDriver';

describe('AnthropicDriver', () => {
  const driver = new AnthropicDriver('claude-sonnet-4-20250514');

  describe('plugin identity', () => {
    it('should be named Driver for BootstrapSequence', () => {
      expect(driver.name).toBe('Driver');
    });

    it('should have a working ping that returns true', async () => {
      expect(await driver.ping!()).toBe(true);
    });
  });

  describe('translate', () => {
    it('should translate unified messages to Anthropic format', async () => {
      const messages: Message[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello, Claude!' },
      ];

      const result = await driver.translate(messages);

      expect(result.model).toBe('claude-sonnet-4-20250514');
      expect(result.system).toBe('You are a helpful assistant.');
      expect(result.messages).toHaveLength(1);
      expect((result.messages[0] as any).role).toBe('user');
      expect((result.messages[0] as any).content).toBe('Hello, Claude!');
    });

    it('should merge system message into system parameter', async () => {
      const messages: Message[] = [
        { role: 'system', content: 'Be concise.' },
        { role: 'user', content: 'Explain TypeScript.' },
      ];

      const result = await driver.translate(messages);

      expect(result.system).toBe('Be concise.');
      expect(result.messages).toHaveLength(1);
      expect((result.messages[0] as any).role).toBe('user');
    });

    it('should pass through user messages', async () => {
      const messages: Message[] = [
        { role: 'user', content: 'What is Teldrassil?' },
      ];

      const result = await driver.translate(messages);
      expect((result.messages[0] as any).content).toBe('What is Teldrassil?');
    });

    it('should set max_tokens default', async () => {
      const result = await driver.translate([{ role: 'user', content: 'hi' }]);
      expect(result.max_tokens).toBe(4096);
    });

    it('should include tool role messages', async () => {
      const messages: Message[] = [
        { role: 'user', content: 'Read a file.' },
        { role: 'assistant', content: '' },
        { role: 'tool', content: 'file contents', tool_call_id: 'call_1' },
      ];

      const result = await driver.translate(messages);
      expect(result.messages).toHaveLength(3);
    });
  });

  describe('countTokens', () => {
    it('should return a positive estimate', async () => {
      const messages: Message[] = [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello world!' },
      ];

      const tokens = await driver.countTokens(messages);
      expect(tokens).toBeGreaterThan(0);
    });

    it('should increase with longer content', async () => {
      const short = await driver.countTokens([{ role: 'user', content: 'hi' }]);
      const long = await driver.countTokens([{ role: 'user', content: 'This is a much longer message that should result in more tokens being counted.' }]);

      expect(long).toBeGreaterThan(short);
    });
  });

  describe('getCapabilities', () => {
    it('should report Anthropic capabilities', () => {
      const caps = driver.getCapabilities();
      expect(caps.maxContextTokens).toBe(200000);
      expect(caps.supportsStreaming).toBe(true);
      expect(caps.supportsTools).toBe(true);
      expect(caps.supportsVision).toBe(true);
    });
  });
});

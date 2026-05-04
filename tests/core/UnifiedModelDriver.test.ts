import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnifiedModelDriver } from '../../src/core/UnifiedModelDriver';
import type { IVault } from '../../src/core/IVault';
import type { Message, GenerateOptions } from '../../src/core/IModelDriver';

const mockGenerateText = vi.fn();

vi.mock('ai', () => ({
  generateText: mockGenerateText,
}));

function createMockVault(secrets: Record<string, string> = {}): IVault {
  const map = new Map(Object.entries(secrets));
  return {
    name: 'Vault',
    version: '0.1.0',
    initialize: () => {},
    ping: async () => true,
    shutdown: () => {},
    generateDEK: async () => 'mock-dek' as any,
    getSecret: async (toolId: string) => map.get(toolId) ?? null,
    injectCredential: async () => {},
  };
}

describe('UnifiedModelDriver', () => {
  let vault: IVault;
  let driver: UnifiedModelDriver;

  beforeEach(() => {
    vi.clearAllMocks();
    vault = createMockVault({ api_anthropic: 'sk-ant-mock', api_openai: 'sk-openai-mock' });
    driver = new UnifiedModelDriver(vault, {
      anthropic: 'api_anthropic',
      openai: 'api_openai',
      google: 'api_google',
    });
  });

  describe('plugin identity', () => {
    it('should be named Driver for BootstrapSequence', () => {
      expect(driver.name).toBe('Driver');
    });

    it('should have a working ping that returns true', async () => {
      const result = await driver.ping!();
      expect(result).toBe(true);
    });

    it('should have no-op initialize and shutdown', () => {
      expect(() => driver.initialize()).not.toThrow();
      expect(() => driver.shutdown!()).not.toThrow();
    });
  });

  describe('model string parsing', () => {
    it('should parse "anthropic:claude-3-5-sonnet" into provider and modelId', () => {
      const parsed = (driver as any).parseModelString('anthropic:claude-3-5-sonnet');
      expect(parsed.provider).toBe('anthropic');
      expect(parsed.modelId).toBe('claude-3-5-sonnet');
    });

    it('should parse "openai:gpt-4o" correctly', () => {
      const parsed = (driver as any).parseModelString('openai:gpt-4o');
      expect(parsed.provider).toBe('openai');
      expect(parsed.modelId).toBe('gpt-4o');
    });

    it('should throw on invalid model string format', () => {
      expect(() => (driver as any).parseModelString('invalid-string')).toThrow(
        /Invalid model string/
      );
    });

    it('should throw on empty model string', () => {
      expect(() => (driver as any).parseModelString('')).toThrow(/Invalid model string/);
    });
  });

  describe('credential lookup', () => {
    it('should resolve API key from vault for a known provider', async () => {
      const key = await driver['vault'].getSecret('api_anthropic');
      expect(key).toBe('sk-ant-mock');
    });

    it('should throw when no API key is configured for the provider', async () => {
      const options: GenerateOptions = {
        model: 'google:gemini-pro',
        messages: [{ role: 'user', content: 'Hi' }],
      };

      mockGenerateText.mockResolvedValue({
        text: 'Hello!',
        usage: { inputTokens: 1, outputTokens: 1 },
      });

      await expect(driver.generate!(options)).rejects.toThrow(
        /No API key configured/
      );
    });

    it('should throw on unknown provider', async () => {
      const options: GenerateOptions = {
        model: 'unknown:model-foo',
        messages: [{ role: 'user', content: 'Hi' }],
      };

      await expect(driver.generate!(options)).rejects.toThrow(
        /Unknown provider/
      );
    });
  });

  describe('generate', () => {
    it('should call generateText with correct parameters for anthropic', async () => {
      const options: GenerateOptions = {
        model: 'anthropic:claude-sonnet-4-20250514',
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Hello!' },
        ],
        maxTokens: 1024,
        temperature: 0.7,
      };

      mockGenerateText.mockResolvedValue({
        text: 'Hi there!',
        usage: { inputTokens: 10, outputTokens: 3 },
      });

      const result = await driver.generate!(options);

      expect(mockGenerateText).toHaveBeenCalledTimes(1);
      const callArgs = mockGenerateText.mock.calls[0][0];
      expect(callArgs.messages).toHaveLength(2);
      expect(callArgs.messages[0]).toEqual({ role: 'system', content: 'You are helpful.' });
      expect(callArgs.messages[1]).toEqual({ role: 'user', content: 'Hello!' });
      expect(callArgs.maxTokens).toBe(1024);
      expect(callArgs.temperature).toBe(0.7);

      expect(result.content).toBe('Hi there!');
      expect(result.usage?.inputTokens).toBe(10);
      expect(result.usage?.outputTokens).toBe(3);
    });

    it('should call generateText for openai provider', async () => {
      const options: GenerateOptions = {
        model: 'openai:gpt-4o',
        messages: [{ role: 'user', content: 'Hello!' }],
      };

      mockGenerateText.mockResolvedValue({
        text: 'Hello from OpenAI!',
        usage: { inputTokens: 5, outputTokens: 5 },
      });

      const result = await driver.generate!(options);

      expect(mockGenerateText).toHaveBeenCalledTimes(1);
      const callArgs = mockGenerateText.mock.calls[0][0];
      expect(callArgs.model).toBeDefined();
      expect(result.content).toBe('Hello from OpenAI!');
    });

    it('should return default usage when not provided by SDK', async () => {
      mockGenerateText.mockResolvedValue({ text: 'ok' });

      const result = await driver.generate!({
        model: 'anthropic:claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
    });
  });

  describe('translate', () => {
    it('should translate unified messages to generic payload', async () => {
      const messages: Message[] = [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello!' },
      ];

      const payload = await driver.translate(messages);
      expect(payload.model).toBe('unified');
      expect(payload.messages).toHaveLength(2);
      expect(payload.messages[0]).toEqual({ role: 'system', content: 'You are helpful.' });
      expect(payload.messages[1]).toEqual({ role: 'user', content: 'Hello!' });
    });
  });

  describe('countTokens', () => {
    it('should return a positive estimate', async () => {
      const tokens = await driver.countTokens([
        { role: 'user', content: 'Hello world!' },
      ]);
      expect(tokens).toBeGreaterThan(0);
    });

    it('should increase with longer content', async () => {
      const short = await driver.countTokens([{ role: 'user', content: 'hi' }]);
      const long = await driver.countTokens([
        { role: 'user', content: 'This is a much longer message that should result in more tokens counted.' },
      ]);
      expect(long).toBeGreaterThan(short);
    });
  });

  describe('getCapabilities', () => {
    it('should report high context window and tool support', () => {
      const caps = driver.getCapabilities();
      expect(caps.maxContextTokens).toBeGreaterThan(0);
      expect(caps.supportsStreaming).toBe(true);
      expect(caps.supportsTools).toBe(true);
    });
  });
});

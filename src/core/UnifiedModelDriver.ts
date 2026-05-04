import type { IModelDriver, Message, VendorPayload, DriverCapabilities, GenerateOptions, GenerateResult } from './IModelDriver';
import type { IVault } from './IVault';

interface ParsedModel {
  provider: string;
  modelId: string;
}

export class UnifiedModelDriver implements IModelDriver {
  readonly name = 'Driver';
  readonly version = '0.1.0';

  private vault: IVault;
  private secretKeyMap: Record<string, string>;

  constructor(vault: IVault, secretKeyMap: Record<string, string>) {
    this.vault = vault;
    this.secretKeyMap = secretKeyMap;
  }

  initialize = (): void => {};
  ping = async (): Promise<boolean> => true;
  shutdown = (): void => {};

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const { provider, modelId } = this.parseModelString(options.model);

    const secretKey = this.secretKeyMap[provider];
    if (!secretKey) {
      throw new Error(`Unknown provider '${provider}'. Known providers: ${Object.keys(this.secretKeyMap).join(', ')}`);
    }

    const apiKey = await this.vault.getSecret(secretKey);
    if (!apiKey) {
      throw new Error(`No API key configured for provider '${provider}' (vault secret: '${secretKey}')`);
    }

    const languageModel = await this.createLanguageModel(provider, modelId, apiKey);

    const { generateText } = await import('ai');

    const result = await generateText({
      model: languageModel,
      messages: options.messages as any,
      ...(options.maxTokens !== undefined ? { maxTokens: options.maxTokens } : {}),
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    });

    return {
      content: result.text,
      ...(result.usage ? {
        usage: {
          inputTokens: result.usage.inputTokens ?? 0,
          outputTokens: result.usage.outputTokens ?? 0,
        },
      } : { usage: { inputTokens: 0, outputTokens: 0 } }),
    };
  }

  async translate(messages: Message[]): Promise<VendorPayload> {
    return {
      model: 'unified',
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
      })),
    };
  }

  async countTokens(messages: Message[]): Promise<number> {
    let totalChars = 0;
    for (const msg of messages) {
      totalChars += msg.content.length;
    }
    return Math.max(1, Math.ceil(totalChars / 4));
  }

  getCapabilities(): DriverCapabilities {
    return {
      maxContextTokens: 200000,
      supportsStreaming: true,
      supportsTools: true,
    };
  }

  private parseModelString(model: string): ParsedModel {
    if (!model || !model.includes(':')) {
      throw new Error(`Invalid model string '${model}'. Expected format: 'provider:model-id' (e.g., 'anthropic:claude-3-5-sonnet')`);
    }

    const colonIndex = model.indexOf(':');
    const provider = model.substring(0, colonIndex);
    const modelId = model.substring(colonIndex + 1);

    if (!provider || !modelId) {
      throw new Error(`Invalid model string '${model}'. Expected format: 'provider:model-id' (e.g., 'anthropic:claude-3-5-sonnet')`);
    }

    return { provider, modelId };
  }

  private async createLanguageModel(provider: string, modelId: string, apiKey: string): Promise<any> {
    switch (provider) {
      case 'anthropic': {
        const { createAnthropic } = await import('@ai-sdk/anthropic');
        return createAnthropic({ apiKey }).chat(modelId);
      }
      case 'openai': {
        const { createOpenAI } = await import('@ai-sdk/openai');
        return createOpenAI({ apiKey }).chat(modelId);
      }
      case 'google': {
        const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
        return createGoogleGenerativeAI({ apiKey })(modelId);
      }
      default:
        throw new Error(`Unknown provider '${provider}'. Supported providers: anthropic, openai, google`);
    }
  }
}

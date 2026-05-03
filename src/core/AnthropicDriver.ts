import type { IModelDriver, Message, VendorPayload, DriverCapabilities } from './IModelDriver';

/**
 * AnthropicDriver — Translates Teldrassil unified messages to Anthropic Messages API format.
 *
 * Maps the unified Message[] to Anthropic's schema:
 * - system role → system parameter (not in messages array)
 * - user, assistant, tool → messages array with role mapping
 * - tool_call_id preserved for tool messages
 *
 * @see docs/design.md §6.1 — Provider-Instance Pattern
 * @see docs/detailed-components.md §5 — Model Driver
 */
export class AnthropicDriver implements IModelDriver {
  readonly name = 'Driver';
  readonly version = '0.1.0';
  private model: string;

  constructor(model = 'claude-sonnet-4-20250514') {
    this.model = model;
  }

  initialize = (): void => {};
  ping = async (): Promise<boolean> => true;
  shutdown = (): void => {};

  async translate(messages: Message[]): Promise<VendorPayload> {
    const systemMessage = messages.find((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');

    const payload: VendorPayload = {
      model: this.model,
      messages: conversationMessages.map((m) => ({
        role: m.role === 'tool' ? 'user' : m.role,
        content: this.buildContent(m),
      })),
      max_tokens: 4096,
    };

    if (systemMessage) {
      payload.system = systemMessage.content;
    }

    return payload;
  }

  async countTokens(messages: Message[]): Promise<number> {
    // Simple heuristic: ~4 characters per token for English text
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
      supportsVision: true,
    };
  }

  private buildContent(m: Message): string | unknown[] {
    if (m.role === 'tool' && m.tool_call_id) {
      return [
        {
          type: 'tool_result',
          tool_use_id: m.tool_call_id,
          content: m.content,
        },
      ];
    }
    return m.content;
  }
}

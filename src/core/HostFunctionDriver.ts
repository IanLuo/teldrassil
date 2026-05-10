import type { IModelDriver, Message, VendorPayload, DriverCapabilities, GenerateOptions, GenerateResult } from './IModelDriver';

/**
 * A host function receives unified messages and optional schema,
 * and returns a deterministic string result.
 */
export type HostFunction = (input: { messages: Message[]; schema?: unknown }) => Promise<string> | string;

/**
 * HostFunctionDriver — Deterministic local code execution.
 *
 * Runs registered host functions instead of making LLM network calls.
 * In the manifest, agents reference it via `use_driver: "host_executor"`
 * with an `action_id` field that maps to a registered local function.
 * The `action_id` is passed through the `model` field in GenerateOptions.
 *
 * @see docs/design.md §6.1 — Provider-Instance Pattern
 * @see docs/detailed-components.md §6.2 — Implementations
 */
export class HostFunctionDriver implements IModelDriver {
  readonly name: string;
  readonly version = '0.1.0';
  readonly kind = 'driver' as const;
  readonly capabilities = ['generate'];

  private functions: Record<string, HostFunction>;

  constructor(id: string, functions: Record<string, HostFunction>) {
    this.name = id;
    this.functions = functions;
  }

  initialize = (): void => {};
  ping = async (): Promise<boolean> => true;
  shutdown = (): void => {};

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const fn = this.functions[options.model];
    if (!fn) {
      throw new Error(`Host function "${options.model}" not registered`);
    }

    const result = await fn({
      messages: options.messages,
      schema: options.schema,
    });

    const response: GenerateResult = {
      content: result,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    };

    if (options.schema) {
      try {
        response.object = JSON.parse(result);
      } catch {
        // Host function returned non-JSON string despite schema
      }
    }

    return response;
  }

  async translate(messages: Message[]): Promise<VendorPayload> {
    return {
      model: 'host',
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
      maxContextTokens: Infinity,
      supportsStreaming: false,
      supportsTools: false,
    };
  }
}

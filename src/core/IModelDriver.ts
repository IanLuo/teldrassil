/**
 * Model Driver — The "Translator."
 *
 * Bridges the framework's unified message format to vendor-specific LLM APIs.
 * Handles schema translation, token counting, retries, and formatting.
 *
 * @see docs/design.md §6.1 — Provider-Instance Pattern
 * @see docs/detailed-components.md §5 — Model Driver
 */

/**
 * Supported message roles in the unified format.
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * A single message in the unified LLM message format.
 * Drivers translate this into provider-specific schemas.
 */
export interface Message {
  role: MessageRole;
  content: string;
  /** Tool call ID — required only for 'tool' role messages */
  tool_call_id?: string;
}

/**
 * A vendor-specific payload produced by translate().
 * The exact shape depends on the provider (Anthropic, OpenAI, etc.).
 */
export interface VendorPayload {
  model: string;
  messages: unknown[];
  max_tokens?: number;
  temperature?: number;
  tools?: unknown[];
  [key: string]: unknown;
}

/**
 * Capabilities reported by a driver.
 * Used by the Orchestrator to select appropriate drivers for tasks.
 */
export interface DriverCapabilities {
  /** Maximum context window size in tokens */
  maxContextTokens: number;
  /** Whether the provider supports streaming responses */
  supportsStreaming: boolean;
  /** Whether the provider supports function/tool calling */
  supportsTools: boolean;
  /** Whether the provider supports image inputs */
  supportsVision?: boolean;
}

/**
 * Options for the generate() method.
 */
export interface GenerateOptions {
  /** Model string in "provider:model-id" format (e.g., "anthropic:claude-3-5-sonnet") */
  model: string;
  /** Unified message list */
  messages: Message[];
  /** Optional tool definitions */
  tools?: unknown[];
  /** Optional structured output schema */
  schema?: unknown;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Sampling temperature */
  temperature?: number;
}

/**
 * Result returned by generate().
 */
export interface GenerateResult {
  /** The generated text content */
  content: string;
  /** Structured object output (present when schema is provided) */
  object?: unknown;
  /** Tool calls invoked by the model (if any) */
  toolCalls?: unknown[];
  /** Token usage statistics */
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

/**
 * IModelDriver — The kernel's "Communication" plugin.
 *
 * Translates unified framework messages into provider-specific API payloads.
 * Implements the Provider-Instance Pattern: drivers are registered as capabilities
 * (plugins.model_drivers), and agents reference them via use_driver + model.
 *
 * Example:
 * - Driver: "anthropic_v1" → translates to Anthropic Messages API
 * - Driver: "openai_v1" → translates to OpenAI Chat Completions API
 *
 * @see docs/design.md §6.2 — Kernel Compatibility Check
 */
export interface IModelDriver {
  /** Plugin identity — registered as "Driver" in the PluginRegistry */
  readonly name: string;
  readonly version?: string;

  /** Lifecycle: called when the plugin is registered */
  initialize: () => void;

  /** Health check for BootstrapSequence validation */
  ping?: () => Promise<boolean>;

  /** Lifecycle: called on kernel shutdown */
  shutdown?: () => void;

  /**
   * Translate unified messages into a provider-specific API payload.
   *
   * Converts the framework's Message[] into the vendor's expected format,
   * including tool definitions, model selection, and parameters.
   *
   * @param messages — unified message list (system, user, assistant, tool)
   * @returns Vendor-specific payload ready for API submission
   */
  translate(messages: Message[]): Promise<VendorPayload>;

  /**
   * Generate a response from the model.
   *
   * Wraps @ai-sdk/core to send messages through the configured provider
   * and return the generated text with optional tool calls and usage stats.
   *
   * @param options — generation parameters including model, messages, tools, etc.
   * @returns Generated content with optional tool calls and usage
   */
  generate?(options: GenerateOptions): Promise<GenerateResult>;

  /**
   * Estimate token usage for a set of messages.
   *
   * Used by the Orchestrator for context window management and cost estimation.
   */
  countTokens(messages: Message[]): Promise<number>;

  /**
   * Report the driver's capabilities.
   *
   * Used by the ManifestParser at startup to validate agent-to-driver mappings
   * and by the Orchestrator to select appropriate drivers for tasks.
   */
  getCapabilities(): DriverCapabilities;
}

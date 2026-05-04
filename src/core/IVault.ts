/**
 * Identity Vault — The "Passport Office."
 *
 * Manages credentials, generates session Data Encryption Keys (DEKs),
 * and performs JIT credential injection. Tokens are never exposed
 * to the LLM context or agent memory space.
 *
 * @see docs/design.md §5 — Security & Credential Management
 * @see docs/detailed-components.md §4 — Identity Vault
 */

/**
 * A Data Encryption Key — opaque string used by the Memory Engine
 * for AES-256-GCM stream encryption of persisted artifacts.
 *
 * Destroying the session DEK instantly crypto-shreds all project memory.
 */
export type DEK = string & { readonly __brand?: 'DEK' };

/**
 * IVault — The kernel's "Security" plugin.
 *
 * Initialized from a Master Key (`.env` or Cloud KMS).
 * Generates session DEKs and injects tool credentials at the transport layer.
 *
 * Security guarantees:
 * - JIT injection: credentials are attached to requests, never returned to agents
 * - Session DEKs are encrypted with the Master Key (envelope encryption)
 * - Optional Recovery Key for key escrow (double encryption)
 * - MFA escalation triggers REAUTH_REQUIRED → Human-Attach mode
 */
export interface IVault {
  /** Plugin identity — registered as "Vault" in the PluginRegistry */
  readonly name: string;
  readonly version?: string;

  /** Lifecycle: called when the plugin is registered */
  initialize: () => void;

  /** Health check for BootstrapSequence validation */
  ping?: () => Promise<boolean>;

  /** Lifecycle: called on kernel shutdown */
  shutdown?: () => void;

  /**
   * Generate a session-scoped Data Encryption Key (DEK).
   *
   * The DEK is used by the Memory Engine for AES-256-GCM payload encryption.
   * Each session gets a unique DEK; destroying it crypto-shreds all memory.
   *
   * The DEK is encrypted with the Master Key before any external storage.
   */
  generateDEK(): Promise<DEK>;

  /**
   * Retrieve a secret for a given tool or domain.
   *
   * Maps Tool_ID (e.g., "slack", "github") to its credential.
   * Returns null if no secret is configured for the tool.
   *
   * @param toolId — unique identifier for the tool or domain
   */
  getSecret(toolId: string): Promise<string | null>;
}

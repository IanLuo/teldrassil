/**
 * MemoryEngine — The "Warehouse" for raw data.
 *
 * Stores payloads (text, JSON, binaries, vectors) and returns
 * HMAC-signed URIs. Implements session-scoped envelope encryption
 * and zero-lookup authentication via signed pointers.
 *
 * @see docs/design.md §2.3-2.4 — Pointer-Payload Decoupling, Memory Security
 * @see docs/detailed-components.md §3 — Memory Engine
 */

/**
 * A Memory Engine URI with an embedded HMAC signature.
 * Format: mem://v1/<key>?sig=<hmac>
 *
 * Agents can only access data via valid signed pointers —
 * guessing or forging URIs is rejected by validateSignature().
 */
export type MemoryURI = string & { readonly __brand?: 'MemoryURI' };

/**
 * Tiered storage classification for artifacts.
 */
export type StorageTier = 'short-term' | 'mid-term' | 'long-term';

/**
 * Metadata associated with each persisted artifact.
 */
export interface MemoryEntryMetadata {
  /** The DAG node that created this artifact */
  node_id: string;
  /** The session that owns this artifact */
  session_id: string;
  /** Storage tier classification */
  tier: StorageTier;
  /** MIME type for retrieval */
  content_type?: string;
}

/**
 * IMemoryEngine — The kernel's "Storage" plugin.
 *
 * Stores raw payload data and returns HMAC-signed URIs.
 * Validates signatures on retrieval to enforce zero-lookup auth.
 *
 * Security guarantees:
 * - All URIs include an HMAC signature (?sig=...)
 * - get() rejects URIs with missing or invalid signatures
 * - Storage is sandboxed to /.teldrassil/memory/<session_id>/
 * - Payloads are AES-256-GCM encrypted using the session DEK from the Vault
 */
export interface IMemoryEngine {
  /** Plugin identity — registered as "Memory" in the PluginRegistry */
  readonly name: string;
  readonly version?: string;

  /** Lifecycle: called when the plugin is registered */
  initialize: () => void;

  /** Health check for BootstrapSequence validation */
  ping?: () => Promise<boolean>;

  /** Lifecycle: called on kernel shutdown */
  shutdown?: () => void;

  /**
   * Persist a payload and return a unique, HMAC-signed URI.
   *
   * @param key — logical key for the artifact
   * @param payload — raw data (string, JSON, Buffer, etc.)
   * @param metadata — optional cross-linkage metadata (node_id, session_id, tier)
   * @returns A signed MemoryURI (e.g., mem://v1/data?sig=abc123)
   */
  put(key: string, payload: unknown, metadata?: MemoryEntryMetadata): MemoryURI;

  /**
   * Retrieve a payload by its signed URI.
   *
   * Validates the HMAC signature before retrieval.
   * Returns null if the artifact does not exist.
   *
   * @throws Unauthorized — if the URI signature is missing or invalid
   */
  get(uri: MemoryURI): unknown;

  /**
   * Validate the HMAC signature on a URI.
   *
   * @returns true if the signature is valid, false otherwise
   */
  validateSignature(uri: MemoryURI): boolean;
}

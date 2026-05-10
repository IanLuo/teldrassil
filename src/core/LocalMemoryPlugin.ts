import crypto from 'crypto';
import type { IMemoryEngine, MemoryURI, MemoryEntryMetadata } from './IMemoryEngine';

class StoredEntry {
  encrypted: Buffer;
  iv: Buffer;
  authTag: Buffer;
  isBinary: boolean;

  constructor(encrypted: Buffer, iv: Buffer, authTag: Buffer, isBinary = false) {
    this.encrypted = encrypted;
    this.iv = iv;
    this.authTag = authTag;
    this.isBinary = isBinary;
  }
}

/**
 * LocalMemoryPlugin — In-memory storage with AES-256-GCM encryption and HMAC-signed URIs.
 *
 * Uses a DEK (Data Encryption Key) for encrypting payloads.
 * Every stored artifact gets an HMAC-signed URI that prevents unauthorized access.
 * In production, storage is sandboxed to /.teldrassil/memory/<session_id>/.
 *
 * @see docs/design.md §2.4 — Memory Security
 * @see docs/detailed-components.md §3 — Memory Engine
 */
export class LocalMemoryPlugin implements IMemoryEngine {
  readonly name = 'Memory';
  readonly version = '0.1.0';
  readonly kind = 'memory' as const;

  private dek: Buffer;
  private store = new Map<string, StoredEntry>();
  private keyMap = new Map<string, string>();

  constructor(dekBase64: string) {
    this.dek = crypto.createHash('sha256').update(dekBase64).digest();
  }

  initialize = (): void => {};
  ping = async (): Promise<boolean> => true;
  shutdown = (): void => { this.store.clear(); this.keyMap.clear(); };

  put(key: string, payload: unknown, _metadata?: MemoryEntryMetadata): MemoryURI {
    const isBinary = Buffer.isBuffer(payload);
    const raw = isBinary ? (payload as Buffer) : Buffer.from(JSON.stringify(payload));
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.dek, iv);
    const encrypted = Buffer.concat([cipher.update(raw), cipher.final()]);
    const authTag = cipher.getAuthTag();

    this.store.set(key, new StoredEntry(encrypted, iv, authTag, isBinary));

    const safeKey = this.safeId(key);
    this.keyMap.set(safeKey, key);

    const sig = this.computeSignature(safeKey);
    return `mem://v1/${safeKey}?sig=${sig}` as MemoryURI;
  }

  get(uri: MemoryURI): unknown {
    if (!this.validateSignature(uri)) return null;

    const safeKey = this.extractKey(uri);
    const rawKey = this.keyMap.get(safeKey);
    if (!rawKey) return null;

    const entry = this.store.get(rawKey);
    if (!entry) return null;

    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.dek, entry.iv);
      decipher.setAuthTag(entry.authTag);
      const decrypted = Buffer.concat([decipher.update(entry.encrypted), decipher.final()]);
      return entry.isBinary ? decrypted : JSON.parse(decrypted.toString());
    } catch {
      return null;
    }
  }

  validateSignature(uri: MemoryURI): boolean {
    try {
      if (!uri.includes('?sig=')) return false;
      const key = this.extractKey(uri);
      const providedSig = uri.split('?sig=')[1];
      const expectedSig = this.computeSignature(key);
      return providedSig === expectedSig;
    } catch {
      return false;
    }
  }

  private safeId(key: string): string {
    return crypto.createHash('sha256').update(key).digest('base64url').slice(0, 16);
  }

  private computeSignature(key: string): string {
    return crypto.createHmac('sha256', this.dek).update(key).digest('hex').slice(0, 32);
  }

  private extractKey(uri: MemoryURI): string {
    const base = uri.split('?sig=')[0];
    return base.replace('mem://v1/', '');
  }
}

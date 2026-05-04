import crypto from 'crypto';
import type { IVault, DEK } from './IVault';

/**
 * EnvVaultPlugin — Environment-based Identity Vault.
 *
 * Derives a Master Key from a `.env` string using PBKDF2 (100,000 iterations, SHA-256).
 * Generates session DEKs using crypto.randomBytes (32 bytes for AES-256).
 * Stores tool secrets in an optional secrets map.
 *
 * @see docs/detailed-components.md §4 — Identity Vault
 */
export class EnvVaultPlugin implements IVault {
  readonly name = 'Vault';
  readonly version = '0.1.0';

  private masterKey: Buffer;
  private secrets: Map<string, string>;

  constructor(masterKeySource: string, secrets?: Record<string, string>) {
    // Derive Master Key using PBKDF2
    const salt = crypto.createHash('sha256').update('teldrassil-vault-salt').digest();
    this.masterKey = crypto.pbkdf2Sync(
      masterKeySource,
      salt,
      100000,
      32,
      'sha256'
    );

    this.secrets = new Map(Object.entries(secrets || {}));
  }

  initialize = (): void => {};
  ping = async (): Promise<boolean> => true;
  shutdown = (): void => {
    this.secrets.clear();
  };

  async generateDEK(): Promise<DEK> {
    // Generate 32 random bytes (AES-256)
    const raw = crypto.randomBytes(32);

    // Encrypt DEK with master key using AES-256-GCM
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.masterKey, iv);
    const encrypted = Buffer.concat([cipher.update(raw), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Return as base64: IV + Encrypted + AuthTag
    const combined = Buffer.concat([iv, encrypted, authTag]);
    return combined.toString('base64') as DEK;
  }

  async getSecret(toolId: string): Promise<string | null> {
    return this.secrets.get(toolId) ?? null;
  }
}

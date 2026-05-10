import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { IMemoryEngine, MemoryURI, MemoryEntryMetadata } from './IMemoryEngine';

interface StoredEntry {
  encrypted: string;
  iv: string;
  authTag: string;
  isBinary: boolean;
  metadata?: MemoryEntryMetadata;
}

export class LocalFileMemoryPlugin implements IMemoryEngine {
  readonly name = 'Memory';
  readonly version = '0.2.0';
  readonly kind = 'memory' as const;

  private dek: Buffer;
  private memoryDir: string;
  private sessionId: string;

  constructor(memoryDir: string, dekBase64: string, sessionId: string) {
    this.dek = crypto.createHash('sha256').update(dekBase64).digest();
    this.memoryDir = memoryDir;
    this.sessionId = sessionId;
  }

  initialize = (): void => {};
  ping = async (): Promise<boolean> => true;

  shutdown = (): void => {};

  put(key: string, payload: unknown, metadata?: MemoryEntryMetadata): MemoryURI {
    const isBinary = Buffer.isBuffer(payload);
    const raw = isBinary ? (payload as Buffer) : Buffer.from(JSON.stringify(payload));
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.dek, iv);
    const encrypted = Buffer.concat([cipher.update(raw), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const entry: StoredEntry = {
      encrypted: encrypted.toString('base64'),
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      isBinary,
      metadata,
    };

    const opaqueKey = this.safeId(key);
    const sessionDir = path.join(this.memoryDir, this.sessionId);
    this.ensureDir(sessionDir);

    const filePath = path.join(sessionDir, `${opaqueKey}.json`);
    fs.writeFileSync(filePath, JSON.stringify(entry), 'utf8');

    const sig = this.computeSignature(opaqueKey);
    return `mem://v1/${opaqueKey}?sig=${sig}` as MemoryURI;
  }

  get(uri: MemoryURI): unknown {
    if (!this.validateSignature(uri)) return null;

    const opaqueKey = this.extractKey(uri);
    const filePath = path.join(this.memoryDir, this.sessionId, `${opaqueKey}.json`);

    if (!fs.existsSync(filePath)) return null;

    const entry = this.loadEntryFile(filePath);
    if (!entry) return null;

    try {
      const iv = Buffer.from(entry.iv, 'hex');
      const authTag = Buffer.from(entry.authTag, 'hex');
      const encrypted = Buffer.from(entry.encrypted, 'base64');

      const decipher = crypto.createDecipheriv('aes-256-gcm', this.dek, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
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

  private loadEntryFile(filePath: string): StoredEntry | null {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw) as StoredEntry;
    } catch {
      return null;
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

  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

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

    const safeKey = this.hashKey(key);
    const sessionDir = path.join(this.memoryDir, this.sessionId);
    this.ensureDir(sessionDir);

    const filePath = path.join(sessionDir, `${safeKey}.json`);
    fs.writeFileSync(filePath, JSON.stringify(entry), 'utf8');

    const sig = this.computeSignature(key);
    return `mem://v1/${key}?sig=${sig}` as MemoryURI;
  }

  get(uri: MemoryURI): unknown {
    if (!this.validateSignature(uri)) return null;

    const key = this.extractKey(uri);
    const entry = this.loadEntry(key);
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

  private loadEntry(key: string): StoredEntry | null {
    const safeKey = this.hashKey(key);
    const filePath = path.join(this.memoryDir, this.sessionId, `${safeKey}.json`);

    if (!fs.existsSync(filePath)) return null;

    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw) as StoredEntry;
    } catch {
      return null;
    }
  }

  private hashKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
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

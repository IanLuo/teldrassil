import fs from 'fs';
import path from 'path';
import type { ITraceLog, TraceURI } from './ITraceLog';

interface PersistedTrace {
  entries: Array<{ id: number; payload: unknown }>;
  nextId: number;
}

/**
 * LocalJsonTracePlugin — Disk-persistent Trace Log.
 *
 * Stores traces as an append-only JSON array at `/.teldrassil/trace/trace.json`.
 * Each entry gets a sequential URI (`trace://v1/<id>`) for retrieval.
 *
 * @see docs/design.md §2.3 — Tripartite Data Model
 * @see docs/detailed-components.md §4 — Trace Log
 */
export class LocalJsonTracePlugin implements ITraceLog {
  readonly name = 'Trace';
  readonly version = '0.1.0';

  private traceDir: string;
  private traceFile: string;
  private data: PersistedTrace;

  constructor(traceDir: string) {
    this.traceDir = traceDir;
    this.traceFile = path.join(traceDir, 'trace.json');
    this.data = this.load();
  }

  initialize = (): void => {};
  ping = async (): Promise<boolean> => true;
  shutdown = (): void => {
    this.save();
    this.data = { entries: [], nextId: 0 };
  };

  appendTrace(payload: unknown): TraceURI {
    const id = this.data.nextId++;
    this.data.entries.push({ id, payload });
    this.save();
    return `trace://v1/${id}` as TraceURI;
  }

  getTrace(uri: TraceURI): unknown | null {
    const id = this.parseTraceId(uri);
    if (id === null) return null;
    const entry = this.data.entries.find((e) => e.id === id);
    return entry ? entry.payload : null;
  }

  private parseTraceId(uri: string): number | null {
    const match = uri.match(/^trace:\/\/v1\/(\d+)$/);
    if (!match) return null;
    return parseInt(match[1], 10);
  }

  private load(): PersistedTrace {
    if (!fs.existsSync(this.traceDir)) {
      fs.mkdirSync(this.traceDir, { recursive: true });
    }

    if (fs.existsSync(this.traceFile)) {
      try {
        const raw = fs.readFileSync(this.traceFile, 'utf8');
        if (!raw.trim()) {
          return { entries: [], nextId: 0 };
        }
        return JSON.parse(raw) as PersistedTrace;
      } catch {
        // Corrupted trace — start fresh
      }
    }

    return { entries: [], nextId: 0 };
  }

  private save(): void {
    if (!fs.existsSync(this.traceDir)) {
      fs.mkdirSync(this.traceDir, { recursive: true });
    }
    fs.writeFileSync(this.traceFile, JSON.stringify(this.data, null, 2), 'utf8');
  }
}

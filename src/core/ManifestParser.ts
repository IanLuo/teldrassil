import { SystemExit } from './SystemExit';

export interface ModelDriverConfig {
  id: string;
  type: string;
}

export interface AgentConfig {
  id: string;
  use_driver: string;
  model: string;
  status?: string;
  tools?: string[];
}

export interface SequenceStep {
  step: string;
  agent: string;
  evaluator?: string;
  on_failure?: string;
  max_retries?: number;
}

export interface Manifest {
  project_id: string;
  workflow: string;
  plugins: {
    state_manager?: string;
    vault?: string;
    memory?: string;
    model_drivers: ModelDriverConfig[];
    [key: string]: unknown;
  };
  agents: AgentConfig[];
  sequence?: SequenceStep[];
}

export class ManifestParser {
  /**
   * Parse a YAML string into a Manifest object.
   * Throws SystemExit if the YAML is malformed.
   */
  static parse(yaml: string): Manifest {
    try {
      const raw = ManifestParser.parseYaml(yaml);
      return {
        project_id: raw.project_id || '',
        workflow: raw.workflow || 'supervised',
        plugins: {
          ...raw.plugins,
          model_drivers: Array.isArray(raw.plugins?.model_drivers)
            ? raw.plugins.model_drivers
            : [],
        },
        agents: Array.isArray(raw.agents) ? raw.agents : [],
        sequence: Array.isArray(raw.sequence) ? raw.sequence : [],
      };
    } catch (e) {
      if (e instanceof SystemExit) throw e;
      throw new SystemExit(`Failed to parse manifest: ${(e as Error).message}`);
    }
  }

  /**
   * Validate that every agent's use_driver references a registered driver.
   * Throws SystemExit if validation fails.
   */
  static validate(manifest: Manifest): void {
    const driverIds = new Set(
      manifest.plugins.model_drivers.map((d) => d.id)
    );

    for (const agent of manifest.agents) {
      if (!driverIds.has(agent.use_driver)) {
        throw new SystemExit(
          `Missing driver for agent '${agent.id}': driver '${agent.use_driver}' is not registered in plugins.model_drivers. Bootstrap aborted.`
        );
      }
    }
  }

  /**
   * Minimal YAML parser for manifest files.
   * Supports: nested objects, arrays (dash notation), strings, booleans, numbers, and comments.
   */
  private static parseYaml(yaml: string): Record<string, unknown> {
    const lines = yaml.split('\n');
    const root: Record<string, unknown> = {};
    const stack: Array<{ container: unknown; indent: number; isArray: boolean; key?: string }> = [
      { container: root, indent: -1, isArray: false },
    ];

    for (const rawLine of lines) {
      const trimmed = rawLine.trimEnd();
      if (trimmed.trim() === '' || trimmed.trim().startsWith('#')) continue;

      const indent = rawLine.length - rawLine.trimStart().length;

      // Pop stack to matching indent
      while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
        stack.pop();
      }

      const current = stack[stack.length - 1];
      const content = trimmed.trim();

      // Array item
      if (content.startsWith('- ')) {
        const itemStr = content.slice(2).trim();
        const arr = current.container as unknown[];

        // Nested object as array item
        if (itemStr === '' || !itemStr.includes(':')) {
          const val = itemStr === '' ? {} : ManifestParser.parseScalar(itemStr);
          arr.push(val);
          if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
            stack.push({ container: val, indent, isArray: false });
          }
        } else {
          // Key-value in array item (e.g., "- id: foo")
          const obj: Record<string, unknown> = {};
          arr.push(obj);
          stack.push({ container: obj, indent, isArray: false });
          // Process the key-value on this line by re-processing
          const colonIdx = itemStr.indexOf(':');
          if (colonIdx !== -1) {
            const key = itemStr.slice(0, colonIdx).trim();
            const val = itemStr.slice(colonIdx + 1).trim();
            obj[key] = ManifestParser.parseScalar(val);
          }
        }
        continue;
      }

      // Key-value
      const colonIdx = content.indexOf(':');
      if (colonIdx === -1) continue;

      const key = content.slice(0, colonIdx).trim();
      const valueStr = content.slice(colonIdx + 1).trim();

      const container = current.container as Record<string, unknown>;

      if (valueStr === '' || valueStr === '{}' || valueStr === '[]') {
        const isArray = valueStr === '[]';
        // Look ahead: if next line is an array item, ensure array
        const nextLineIndented = this.peekNextArrayLine(lines, rawLine);
        const hasArrayItems = isArray || (nextLineIndented >= 0 && lines[nextLineIndented].trim().startsWith('- '));

        if (hasArrayItems) {
          container[key] = isArray ? [] : [];
          stack.push({ container: container[key] as unknown[], indent, isArray: true, key });
        } else {
          container[key] = isArray ? [] : {};
          stack.push({ container: container[key] as Record<string, unknown>, indent, isArray: false, key });
        }
      } else if (valueStr.startsWith('{') || valueStr === '}') {
        throw new SystemExit('Failed to parse manifest: invalid YAML syntax');
      } else {
        container[key] = ManifestParser.parseScalar(valueStr);
      }
    }

    return root;
  }

  private static peekNextArrayLine(lines: string[], currentLine: string): number {
    const currentIndex = lines.indexOf(currentLine);
    if (currentIndex < 0) return -1;
    const currentIndent = currentLine.length - currentLine.trimStart().length;
    for (let i = currentIndex + 1; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed === '' || trimmed.startsWith('#')) continue;
      const lineIndent = lines[i].length - lines[i].trimStart().length;
      if (lineIndent > currentIndent) {
        return trimmed.startsWith('- ') ? i : -1;
      }
      return -1;
    }
    return -1;
  }

  private static parseScalar(val: string): unknown {
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      return val.slice(1, -1);
    }
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (val === 'null' || val === '~') return null;
    if (/^-?\d+(\.\d+)?$/.test(val)) return parseFloat(val);
    return val;
  }
}

import { EventBus } from './EventBus';

export type PluginKind = 'driver' | 'state' | 'memory' | 'vault' | 'trace' | 'extension';

export function inferPluginKind(plugin: Plugin): PluginKind {
  if (plugin.kind) return plugin.kind;

  if (typeof (plugin as any).generate === 'function') return 'driver';
  if (plugin.name.toLowerCase().includes('vault')) return 'vault';
  if (plugin.name.toLowerCase().includes('state')) return 'state';
  if (plugin.name.toLowerCase().includes('memory')) return 'memory';
  if (plugin.name.toLowerCase().includes('trace')) return 'trace';
  if (plugin.name.toLowerCase().includes('driver')) return 'driver';

  return 'extension';
}

export interface Plugin {
  name: string;
  version?: string;
  kind?: PluginKind;
  capabilities?: string[];
  initialize: (eventBus: EventBus) => void;
  shutdown?: () => void;
  ping?: () => Promise<boolean>;
}

export class PluginRegistry {
  private plugins: Map<string, Plugin>;
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.plugins = new Map();
    this.eventBus = eventBus;
  }

  public register(plugin: Plugin): void {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin with name '${plugin.name}' is already registered.`);
    }

    this.plugins.set(plugin.name, plugin);
    plugin.initialize(this.eventBus);
  }

  public getPlugin(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  public unregister(name: string): void {
    const plugin = this.plugins.get(name);
    if (plugin) {
      if (plugin.shutdown) {
        plugin.shutdown();
      }
      this.plugins.delete(name);
    }
  }

  public getAllPlugins(): Map<string, Plugin> {
    return new Map(this.plugins);
  }
}
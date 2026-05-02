import { PluginRegistry } from './PluginRegistry';
import { SystemExit } from './SystemExit';

const VITAL_PLUGINS = ['State', 'Memory', 'Vault', 'Driver'] as const;

export class BootstrapSequence {
  private registry: PluginRegistry;

  constructor(registry: PluginRegistry) {
    this.registry = registry;
  }

  public async execute(): Promise<void> {
    for (const pluginName of VITAL_PLUGINS) {
      const plugin = this.registry.getPlugin(pluginName);
      if (!plugin) {
        throw new SystemExit(`Vital plugin missing: ${pluginName}`);
      }

      if (typeof plugin.ping !== 'function') {
        throw new SystemExit(`Vital plugin ${pluginName} does not implement ping`);
      }

      const isHealthy = await plugin.ping();
      if (!isHealthy) {
        throw new SystemExit(`Vital plugin ${pluginName} failed health ping`);
      }
    }
  }
}

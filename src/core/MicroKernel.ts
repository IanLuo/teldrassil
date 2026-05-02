import { EventBus } from './EventBus';
import { PluginRegistry, Plugin } from './PluginRegistry';
import { BootstrapSequence, VITAL_PLUGINS } from './BootstrapSequence';
import { SystemExit } from './SystemExit';

export class MicroKernel {
  private eventBus: EventBus;
  private registry: PluginRegistry;
  private bootstrap: BootstrapSequence;

  constructor() {
    this.eventBus = new EventBus();
    this.registry = new PluginRegistry(this.eventBus);
    this.bootstrap = new BootstrapSequence(this.registry);
  }

  public register(plugin: Plugin): void {
    this.registry.register(plugin);
  }

  public detach(name: string): void {
    if ((VITAL_PLUGINS as readonly string[]).includes(name)) {
      throw new SystemExit(
        `Cannot detach vital plugin '${name}'. Vital plugins form the Immutable Core and cannot be removed. Use swap() to replace a vital plugin implementation.`
      );
    }

    this.registry.unregister(name);
  }

  public swap(slotName: string, newPlugin: Plugin): void {
    if (!(VITAL_PLUGINS as readonly string[]).includes(slotName)) {
      throw new SystemExit(
        `Slot '${slotName}' is not a vital plugin slot. swap() is only valid for vital plugin slots (${VITAL_PLUGINS.join(', ')}). Use detach() and register() for extension plugins.`
      );
    }

    this.registry.unregister(slotName);

    const normalizedPlugin: Plugin = {
      ...newPlugin,
      name: slotName,
    };

    this.registry.register(normalizedPlugin);
  }

  public async init(): Promise<void> {
    await this.bootstrap.execute();
    this.eventBus.publish('kernel:bootstrapped');
  }

  public async shutdown(): Promise<void> {
    this.eventBus.publish('kernel:shutting-down');

    const allPlugins = this.registry.getAllPlugins();
    for (const plugin of allPlugins.values()) {
      if (plugin.shutdown) {
        plugin.shutdown();
      }
    }

    this.eventBus.publish('kernel:shutdown');
  }

  public getEventBus(): EventBus {
    return this.eventBus;
  }

  public getRegistry(): PluginRegistry {
    return this.registry;
  }
}

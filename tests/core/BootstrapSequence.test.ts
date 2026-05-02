import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PluginRegistry, Plugin } from '@/core/PluginRegistry';
import { EventBus } from '@/core/EventBus';
import { BootstrapSequence } from '@/core/BootstrapSequence';
import { SystemExit } from '@/core/SystemExit';

function createVitalPlugin(name: string, pingResult: boolean = true): Plugin {
  return {
    name,
    version: '1.0.0',
    initialize: vi.fn(),
    ping: vi.fn().mockResolvedValue(pingResult),
  };
}

describe('BootstrapSequence', () => {
  let eventBus: EventBus;
  let registry: PluginRegistry;

  beforeEach(() => {
    eventBus = new EventBus();
    registry = new PluginRegistry(eventBus);
  });

  it('should succeed when all four vital plugins are registered and healthy', async () => {
    registry.register(createVitalPlugin('State'));
    registry.register(createVitalPlugin('Memory'));
    registry.register(createVitalPlugin('Vault'));
    registry.register(createVitalPlugin('Driver'));

    const bootstrap = new BootstrapSequence(registry);
    await expect(bootstrap.execute()).resolves.toBeUndefined();
  });

  it('should throw SystemExit when a vital plugin is missing', async () => {
    registry.register(createVitalPlugin('State'));
    registry.register(createVitalPlugin('Memory'));
    registry.register(createVitalPlugin('Vault'));
    // Driver is missing

    const bootstrap = new BootstrapSequence(registry);
    await expect(bootstrap.execute()).rejects.toThrow(SystemExit);
    await expect(bootstrap.execute()).rejects.toThrow(/Driver/i);
  });

  it('should throw SystemExit when multiple vital plugins are missing', async () => {
    registry.register(createVitalPlugin('State'));
    // Memory, Vault, Driver are missing

    const bootstrap = new BootstrapSequence(registry);
    await expect(bootstrap.execute()).rejects.toThrow(SystemExit);
    await expect(bootstrap.execute()).rejects.toThrow(/Memory/i);
  });

  it('should ping all four vital plugins during bootstrap', async () => {
    const statePlugin = createVitalPlugin('State');
    const memoryPlugin = createVitalPlugin('Memory');
    const vaultPlugin = createVitalPlugin('Vault');
    const driverPlugin = createVitalPlugin('Driver');

    registry.register(statePlugin);
    registry.register(memoryPlugin);
    registry.register(vaultPlugin);
    registry.register(driverPlugin);

    const bootstrap = new BootstrapSequence(registry);
    await bootstrap.execute();

    expect(statePlugin.ping).toHaveBeenCalledTimes(1);
    expect(memoryPlugin.ping).toHaveBeenCalledTimes(1);
    expect(vaultPlugin.ping).toHaveBeenCalledTimes(1);
    expect(driverPlugin.ping).toHaveBeenCalledTimes(1);
  });

  it('should throw SystemExit when a vital plugin fails its health ping', async () => {
    registry.register(createVitalPlugin('State', true));
    registry.register(createVitalPlugin('Memory', true));
    registry.register(createVitalPlugin('Vault', false)); // fails ping
    registry.register(createVitalPlugin('Driver', true));

    const bootstrap = new BootstrapSequence(registry);
    await expect(bootstrap.execute()).rejects.toThrow(SystemExit);
    await expect(bootstrap.execute()).rejects.toThrow(/Vault/i);
  });

  it('should throw SystemExit when a vital plugin does not implement ping', async () => {
    registry.register(createVitalPlugin('State'));
    registry.register(createVitalPlugin('Memory'));
    registry.register(createVitalPlugin('Vault'));
    registry.register({
      name: 'Driver',
      version: '1.0.0',
      initialize: vi.fn(),
      // ping is undefined
    });

    const bootstrap = new BootstrapSequence(registry);
    await expect(bootstrap.execute()).rejects.toThrow(SystemExit);
    await expect(bootstrap.execute()).rejects.toThrow(/Driver/i);
  });

  it('should throw SystemExit when all vital plugins are absent', async () => {
    const bootstrap = new BootstrapSequence(registry);
    await expect(bootstrap.execute()).rejects.toThrow(SystemExit);
  });
});

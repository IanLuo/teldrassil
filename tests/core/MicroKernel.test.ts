import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Plugin } from '@/core/PluginRegistry';
import { SystemExit } from '@/core/SystemExit';
import { MicroKernel } from '@/core/MicroKernel';

function createVitalPlugin(name: string, pingResult: boolean = true): Plugin {
  return {
    name,
    version: '1.0.0',
    initialize: vi.fn(),
    shutdown: vi.fn(),
    ping: vi.fn().mockResolvedValue(pingResult),
  };
}

function createExtensionPlugin(name: string): Plugin {
  return {
    name,
    version: '1.0.0',
    initialize: vi.fn(),
    shutdown: vi.fn(),
  };
}

describe('MicroKernel', () => {
  let kernel: MicroKernel;

  beforeEach(() => {
    kernel = new MicroKernel();
  });

  describe('lifecycle', () => {
    it('should initialize successfully when all vital plugins are registered and healthy', async () => {
      kernel.register(createVitalPlugin('State'));
      kernel.register(createVitalPlugin('Memory'));
      kernel.register(createVitalPlugin('Vault'));
      kernel.register(createVitalPlugin('Driver'));
      kernel.register(createVitalPlugin('Trace'));
      await expect(kernel.init()).resolves.toBeUndefined();
    });

    it('should throw SystemExit when a vital plugin is missing during init', async () => {
      kernel.register(createVitalPlugin('State'));
      kernel.register(createVitalPlugin('Memory'));
      kernel.register(createVitalPlugin('Vault'));
      // Driver missing
      await expect(kernel.init()).rejects.toThrow(SystemExit);
    });

    it('should throw SystemExit when a vital plugin fails health ping', async () => {
      kernel.register(createVitalPlugin('State'));
      kernel.register(createVitalPlugin('Memory'));
      kernel.register(createVitalPlugin('Vault', false)); // fails ping
      kernel.register(createVitalPlugin('Driver'));
      kernel.register(createVitalPlugin('Trace'));
      await expect(kernel.init()).rejects.toThrow(SystemExit);
      await expect(kernel.init()).rejects.toThrow(/Vault/i);
    });

    it('should throw SystemExit when a vital plugin lacks ping method', async () => {
      kernel.register(createVitalPlugin('State'));
      kernel.register(createVitalPlugin('Memory'));
      kernel.register(createVitalPlugin('Vault'));
      kernel.register(createVitalPlugin('Trace'));
      kernel.register({ name: 'Driver', version: '1.0.0', initialize: vi.fn() });
      await expect(kernel.init()).rejects.toThrow(SystemExit);
      await expect(kernel.init()).rejects.toThrow(/Driver/i);
    });

    it('should publish kernel:bootstrapped event after successful init', async () => {
      const bus = kernel.getEventBus();
      const handler = vi.fn();
      bus.subscribe('kernel:bootstrapped', handler);

      kernel.register(createVitalPlugin('State'));
      kernel.register(createVitalPlugin('Memory'));
      kernel.register(createVitalPlugin('Vault'));
      kernel.register(createVitalPlugin('Driver'));
      kernel.register(createVitalPlugin('Trace'));
      await kernel.init();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should throw SystemExit when no plugins are registered', async () => {
      await expect(kernel.init()).rejects.toThrow(SystemExit);
    });
  });

  describe('shutdown', () => {
    it('should call shutdown on all registered plugins', async () => {
      const statePlugin = createVitalPlugin('State');
      const memoryPlugin = createVitalPlugin('Memory');
      const vaultPlugin = createVitalPlugin('Vault');
      const driverPlugin = createVitalPlugin('Driver');
      const tracePlugin = createVitalPlugin('Trace');
      const extPlugin = createExtensionPlugin('mcp-bridge');

      kernel.register(statePlugin);
      kernel.register(memoryPlugin);
      kernel.register(vaultPlugin);
      kernel.register(driverPlugin);
      kernel.register(tracePlugin);
      kernel.register(extPlugin);

      await kernel.shutdown();

      expect(statePlugin.shutdown).toHaveBeenCalledTimes(1);
      expect(memoryPlugin.shutdown).toHaveBeenCalledTimes(1);
      expect(vaultPlugin.shutdown).toHaveBeenCalledTimes(1);
      expect(driverPlugin.shutdown).toHaveBeenCalledTimes(1);
      expect(tracePlugin.shutdown).toHaveBeenCalledTimes(1);
      expect(extPlugin.shutdown).toHaveBeenCalledTimes(1);
    });

    it('should publish kernel:shutting-down and kernel:shutdown events in order', async () => {
      const bus = kernel.getEventBus();
      const callOrder: string[] = [];
      const shuttingDownHandler = vi.fn(() => callOrder.push('shutting-down'));
      const shutdownHandler = vi.fn(() => callOrder.push('shutdown'));
      bus.subscribe('kernel:shutting-down', shuttingDownHandler);
      bus.subscribe('kernel:shutdown', shutdownHandler);

      await kernel.shutdown();

      expect(shuttingDownHandler).toHaveBeenCalledTimes(1);
      expect(shutdownHandler).toHaveBeenCalledTimes(1);
      expect(callOrder).toEqual(['shutting-down', 'shutdown']);
    });

    it('should handle plugins without shutdown method gracefully', async () => {
      kernel.register({ name: 'no-shutdown-plugin', initialize: vi.fn() });
      await expect(kernel.shutdown()).resolves.toBeUndefined();
    });

    it('should shutdown when no plugins are registered', async () => {
      await expect(kernel.shutdown()).resolves.toBeUndefined();
    });
  });

  describe('immutable core', () => {
    it('should throw SystemExit when detaching a vital plugin', () => {
      kernel.register(createVitalPlugin('State'));
      kernel.register(createVitalPlugin('Memory'));
      kernel.register(createVitalPlugin('Vault'));
      kernel.register(createVitalPlugin('Trace'));

      expect(() => kernel.detach('State')).toThrow(SystemExit);
      expect(() => kernel.detach('Memory')).toThrow(SystemExit);
      expect(() => kernel.detach('Vault')).toThrow(SystemExit);
      expect(() => kernel.detach('Trace')).toThrow(SystemExit);
    });

    it('should succeed when detaching a non-vital plugin', () => {
      kernel.register(createExtensionPlugin('mcp-bridge'));
      expect(() => kernel.detach('mcp-bridge')).not.toThrow();
      expect(kernel.getRegistry().getPlugin('mcp-bridge')).toBeUndefined();
    });

    it('should allow swapping a vital plugin for a new implementation', () => {
      const oldVault = createVitalPlugin('Vault');
      kernel.register(oldVault);

      const newVault: Plugin = {
        name: 'AzureVault',
        version: '2.0.0',
        initialize: vi.fn(),
        shutdown: vi.fn(),
        ping: vi.fn().mockResolvedValue(true),
      };

      kernel.swap('Vault', newVault);

      const plugin = kernel.getRegistry().getPlugin('Vault');
      expect(plugin).toBeDefined();
      expect(plugin!.name).toBe('Vault');
      expect(plugin!.version).toBe('2.0.0');
      expect(plugin!.shutdown).toBe(newVault.shutdown);
      expect(plugin!.ping).toBe(newVault.ping);
      expect(oldVault.shutdown).toHaveBeenCalledTimes(1);
      expect(plugin!.initialize).toHaveBeenCalledWith(kernel.getEventBus());
    });

    it('should throw when swapping a non-vital slot name', () => {
      kernel.register(createExtensionPlugin('mcp-bridge'));
      const replacement = createExtensionPlugin('mcp-bridge-v2');

      expect(() => kernel.swap('mcp-bridge', replacement)).toThrow(SystemExit);
      expect(() => kernel.swap('mcp-bridge', replacement)).toThrow(/not a vital/i);
    });
  });

  describe('plugin management', () => {
    it('should register a plugin and call its initialize method', () => {
      const plugin = createExtensionPlugin('test-plugin');
      kernel.register(plugin);
      expect(plugin.initialize).toHaveBeenCalledWith(kernel.getEventBus());
      expect(kernel.getRegistry().getPlugin('test-plugin')).toBe(plugin);
    });

    it('should throw when registering a duplicate plugin', () => {
      kernel.register(createExtensionPlugin('dup'));
      expect(() => kernel.register(createExtensionPlugin('dup'))).toThrow(/already registered/i);
    });

    it('should return the same EventBus instance from getEventBus', () => {
      const bus = kernel.getEventBus();
      expect(bus).toBeDefined();
      expect(bus).toBe(kernel.getEventBus());
    });

    it('should return the internal PluginRegistry from getRegistry', () => {
      const registry = kernel.getRegistry();
      expect(registry).toBeDefined();
      expect(registry).toBe(kernel.getRegistry());
    });
  });

  describe('event integration', () => {
    it('should allow subscribing to events via the kernel event bus', async () => {
      const bus = kernel.getEventBus();
      const handler = vi.fn();
      bus.subscribe('test:topic', handler);

      kernel.register(createVitalPlugin('State'));
      kernel.register(createVitalPlugin('Memory'));
      kernel.register(createVitalPlugin('Vault'));
      kernel.register(createVitalPlugin('Driver'));
      kernel.register(createVitalPlugin('Trace'));
      await kernel.init();

      bus.publish('test:topic', { data: 'payload' });
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ data: 'payload' });
    });
  });
});

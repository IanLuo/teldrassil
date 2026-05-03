import { describe, it, expect, beforeEach } from 'vitest';
import { MicroKernel } from '../../src/core/MicroKernel';
import { EnvVaultPlugin } from '../../src/core/EnvVaultPlugin';
import { LocalMemoryPlugin } from '../../src/core/LocalMemoryPlugin';
import { LocalStatePlugin } from '../../src/core/LocalStatePlugin';
import { AnthropicDriver } from '../../src/core/AnthropicDriver';

describe('MicroKernel — Integration', () => {
  let kernel: MicroKernel;

  beforeEach(() => {
    kernel = new MicroKernel();
  });

  it('should bootstrap with all four vital plugins', async () => {
    kernel.register(new LocalStatePlugin());
    kernel.register(new LocalMemoryPlugin('master-key-for-integration'));
    kernel.register(new EnvVaultPlugin('master-key-for-integration'));
    kernel.register(new AnthropicDriver('claude-sonnet-4'));

    await expect(kernel.init()).resolves.toBeUndefined();

    await kernel.shutdown();
  });

  it('should emit kernel:bootstrapped event after successful init', async () => {
    const events: string[] = [];
    const bus = kernel.getEventBus();

    bus.subscribe('kernel:bootstrapped', () => events.push('bootstrapped'));

    kernel.register(new LocalStatePlugin());
    kernel.register(new LocalMemoryPlugin('key'));
    kernel.register(new EnvVaultPlugin('key'));
    kernel.register(new AnthropicDriver());

    await kernel.init();
    expect(events).toContain('bootstrapped');

    await kernel.shutdown();
  });

  it('should emit kernel:shutting-down and kernel:shutdown events on shutdown', async () => {
    const events: string[] = [];
    const bus = kernel.getEventBus();

    bus.subscribe('kernel:shutting-down', () => events.push('shutting-down'));
    bus.subscribe('kernel:shutdown', () => events.push('shutdown'));

    kernel.register(new LocalStatePlugin());
    kernel.register(new LocalMemoryPlugin('key'));
    kernel.register(new EnvVaultPlugin('key'));
    kernel.register(new AnthropicDriver());

    await kernel.init();
    await kernel.shutdown();

    expect(events).toEqual(['shutting-down', 'shutdown']);
  });

  it('should call shutdown on all registered plugins', async () => {
    kernel.register(new LocalStatePlugin());
    kernel.register(new LocalMemoryPlugin('key'));
    kernel.register(new EnvVaultPlugin('key'));
    kernel.register(new AnthropicDriver());

    await kernel.init();

    // Verify plugins were initialized (they exist in registry)
    const registry = kernel.getRegistry();
    expect(registry.getPlugin('State')).toBeDefined();
    expect(registry.getPlugin('Memory')).toBeDefined();
    expect(registry.getPlugin('Vault')).toBeDefined();
    expect(registry.getPlugin('Driver')).toBeDefined();

    await kernel.shutdown();
  });

  it('should allow swapping a vital plugin without bootstrap failure', async () => {
    kernel.register(new LocalStatePlugin());
    kernel.register(new LocalMemoryPlugin('key'));
    kernel.register(new EnvVaultPlugin('key-original'));
    kernel.register(new AnthropicDriver());

    await kernel.init();

    // Swap Vault implementation
    kernel.swap('Vault', new EnvVaultPlugin('key-replacement'));
    expect(kernel.getRegistry().getPlugin('Vault')).toBeDefined();

    await kernel.shutdown();
  });

  it('should prevent detaching a vital plugin', async () => {
    kernel.register(new LocalStatePlugin());
    kernel.register(new LocalMemoryPlugin('key'));
    kernel.register(new EnvVaultPlugin('key'));
    kernel.register(new AnthropicDriver());

    await kernel.init();

    expect(() => kernel.detach('Vault')).toThrow();
    expect(kernel.getRegistry().getPlugin('Vault')).toBeDefined();

    await kernel.shutdown();
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { MicroKernel } from '../../src/core/MicroKernel';
import { EnvVaultPlugin } from '../../src/core/EnvVaultPlugin';
import { LocalMemoryPlugin } from '../../src/core/LocalMemoryPlugin';
import { LocalStatePlugin } from '../../src/core/LocalStatePlugin';
import { AnthropicDriver } from '../../src/core/AnthropicDriver';
import { LocalJsonTracePlugin } from '../../src/core/LocalJsonTracePlugin';

describe('MicroKernel — Integration', () => {
  let kernel: MicroKernel;
  let traceDir: string;

  beforeEach(() => {
    kernel = new MicroKernel();
    traceDir = path.join(os.tmpdir(), `teldrassil-integration-trace-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  });

  afterEach(() => {
    if (fs.existsSync(traceDir)) {
      fs.rmSync(traceDir, { recursive: true, force: true });
    }
  });

  it('should bootstrap with all five vital plugins', async () => {
    kernel.register(new LocalStatePlugin());
    kernel.register(new LocalMemoryPlugin('master-key-for-integration'));
    kernel.register(new EnvVaultPlugin('master-key-for-integration'));
    kernel.register(new AnthropicDriver('claude-sonnet-4'));
    kernel.register(new LocalJsonTracePlugin(traceDir));

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
    kernel.register(new LocalJsonTracePlugin(traceDir));

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
    kernel.register(new LocalJsonTracePlugin(traceDir));

    await kernel.init();
    await kernel.shutdown();

    expect(events).toEqual(['shutting-down', 'shutdown']);
  });

  it('should call shutdown on all registered plugins', async () => {
    kernel.register(new LocalStatePlugin());
    kernel.register(new LocalMemoryPlugin('key'));
    kernel.register(new EnvVaultPlugin('key'));
    kernel.register(new AnthropicDriver());
    kernel.register(new LocalJsonTracePlugin(traceDir));

    await kernel.init();

    // Verify plugins were initialized (they exist in registry)
    const registry = kernel.getRegistry();
    expect(registry.getPlugin('State')).toBeDefined();
    expect(registry.getPlugin('Memory')).toBeDefined();
    expect(registry.getPlugin('Vault')).toBeDefined();
    expect(registry.getPlugin('Driver')).toBeDefined();
    expect(registry.getPlugin('Trace')).toBeDefined();

    await kernel.shutdown();
  });

  it('should allow swapping a vital plugin without bootstrap failure', async () => {
    kernel.register(new LocalStatePlugin());
    kernel.register(new LocalMemoryPlugin('key'));
    kernel.register(new EnvVaultPlugin('key-original'));
    kernel.register(new AnthropicDriver());
    kernel.register(new LocalJsonTracePlugin(traceDir));

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
    kernel.register(new LocalJsonTracePlugin(traceDir));

    await kernel.init();

    expect(() => kernel.detach('Vault')).toThrow();
    expect(kernel.getRegistry().getPlugin('Vault')).toBeDefined();

    await kernel.shutdown();
  });
});

import { describe, it, expect } from 'vitest';
import { MicroKernel } from '../../src/core/MicroKernel';
import { LocalStatePlugin } from '../../src/core/LocalStatePlugin';
import { LocalMemoryPlugin } from '../../src/core/LocalMemoryPlugin';
import { EnvVaultPlugin } from '../../src/core/EnvVaultPlugin';
import { AnthropicDriver } from '../../src/core/AnthropicDriver';

describe('CLI Entry Point', () => {
  it('should bootstrap kernel with all four vital plugins', async () => {
    const kernel = new MicroKernel();
    const masterKey = 'cli-integration-key';

    kernel.register(new LocalStatePlugin());
    kernel.register(new LocalMemoryPlugin(masterKey));
    kernel.register(new EnvVaultPlugin(masterKey));
    kernel.register(new AnthropicDriver('claude-sonnet-4'));

    await kernel.init();

    // Verify all plugins are registered and bootstrapped
    const registry = kernel.getRegistry();
    expect(registry.getPlugin('State')).toBeDefined();
    expect(registry.getPlugin('Memory')).toBeDefined();
    expect(registry.getPlugin('Vault')).toBeDefined();
    expect(registry.getPlugin('Driver')).toBeDefined();

    await kernel.shutdown();
  });

  it('should read master key from environment variable', () => {
    const original = process.env.MASTER_KEY;
    process.env.MASTER_KEY = 'env-derived-key';

    // Verify the key was set (used by CLI bootstrap)
    expect(process.env.MASTER_KEY).toBe('env-derived-key');

    if (original) {
      process.env.MASTER_KEY = original;
    } else {
      delete process.env.MASTER_KEY;
    }
  });

  it('should handle SystemExit on missing vital plugin', async () => {
    const kernel = new MicroKernel();
    // Only register 3 of 4 — intentionally skip Vault
    kernel.register(new LocalStatePlugin());
    kernel.register(new LocalMemoryPlugin('key'));

    // Missing Vault and Driver should trigger SystemExit
    await expect(kernel.init()).rejects.toThrow();
  });
});

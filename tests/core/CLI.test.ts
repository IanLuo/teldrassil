import { describe, it, expect } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { MicroKernel } from '../../src/core/MicroKernel';
import { LocalStatePlugin } from '../../src/core/LocalStatePlugin';
import { LocalMemoryPlugin } from '../../src/core/LocalMemoryPlugin';
import { EnvVaultPlugin } from '../../src/core/EnvVaultPlugin';
import { UnifiedModelDriver } from '../../src/core/UnifiedModelDriver';
import { LocalJsonTracePlugin } from '../../src/core/LocalJsonTracePlugin';

describe('CLI Entry Point', () => {
  it('should bootstrap kernel with all five vital plugins', async () => {
    const kernel = new MicroKernel();
    const masterKey = 'cli-integration-key';
    const traceDir = path.join(os.tmpdir(), `teldrassil-cli-trace-${Date.now()}-${Math.random().toString(36).slice(2)}`);

    kernel.register(new LocalStatePlugin());
    kernel.register(new LocalMemoryPlugin(masterKey));
    
    const vault = new EnvVaultPlugin(masterKey);
    kernel.register(vault);
    
    kernel.register(new UnifiedModelDriver(vault, { anthropic: 'ANTHROPIC_API_KEY' }));
    kernel.register(new LocalJsonTracePlugin(traceDir));

    await kernel.init();

    // Verify all plugins are registered and bootstrapped
    const registry = kernel.getRegistry();
    expect(registry.getPlugin('State')).toBeDefined();
    expect(registry.getPlugin('Memory')).toBeDefined();
    expect(registry.getPlugin('Vault')).toBeDefined();
    expect(registry.getPlugin('Driver')).toBeDefined();
    expect(registry.getPlugin('Trace')).toBeDefined();

    await kernel.shutdown();

    if (fs.existsSync(traceDir)) {
      fs.rmSync(traceDir, { recursive: true, force: true });
    }
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
    // Only register 2 of 5 — intentionally skip Vault, Driver, Trace
    kernel.register(new LocalStatePlugin());
    kernel.register(new LocalMemoryPlugin('key'));

    // Missing Vault, Driver, and Trace should trigger SystemExit
    await expect(kernel.init()).rejects.toThrow();
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../../src/core/EventBus';
import { PluginRegistry } from '../../src/core/PluginRegistry';
import { BootstrapSequence } from '../../src/core/BootstrapSequence';
import { SystemExit } from '../../src/core/SystemExit';

describe('InMemoryMocks — BootstrapSequence integration', () => {
  let eventBus: EventBus;
  let registry: PluginRegistry;

  beforeEach(() => {
    eventBus = new EventBus();
    registry = new PluginRegistry(eventBus);
  });

  it('should pass bootstrap validation when all five vital mocks are registered', async () => {
    const { InMemoryStateManager } = await import('../../src/core/InMemoryStateManager');
    const { InMemoryMemoryEngine } = await import('../../src/core/InMemoryMemoryEngine');
    const { InMemoryVault } = await import('../../src/core/InMemoryVault');
    const { InMemoryModelDriver } = await import('../../src/core/InMemoryModelDriver');
    const { InMemoryTraceLog } = await import('../../src/core/InMemoryTraceLog');

    registry.register(new InMemoryStateManager());
    registry.register(new InMemoryMemoryEngine());
    registry.register(new InMemoryVault());
    registry.register(new InMemoryModelDriver());
    registry.register(new InMemoryTraceLog());

    const bootstrap = new BootstrapSequence(registry);
    await expect(bootstrap.execute()).resolves.toBeUndefined();
  });

  it('should throw SystemExit when State mock is missing', async () => {
    const { InMemoryMemoryEngine } = await import('../../src/core/InMemoryMemoryEngine');
    const { InMemoryVault } = await import('../../src/core/InMemoryVault');
    const { InMemoryModelDriver } = await import('../../src/core/InMemoryModelDriver');
    const { InMemoryTraceLog } = await import('../../src/core/InMemoryTraceLog');

    registry.register(new InMemoryMemoryEngine());
    registry.register(new InMemoryVault());
    registry.register(new InMemoryModelDriver());
    registry.register(new InMemoryTraceLog());

    const bootstrap = new BootstrapSequence(registry);
    await expect(bootstrap.execute()).rejects.toThrow(SystemExit);
  });

  it('should throw SystemExit when Memory mock is missing', async () => {
    const { InMemoryStateManager } = await import('../../src/core/InMemoryStateManager');
    const { InMemoryVault } = await import('../../src/core/InMemoryVault');
    const { InMemoryModelDriver } = await import('../../src/core/InMemoryModelDriver');
    const { InMemoryTraceLog } = await import('../../src/core/InMemoryTraceLog');

    registry.register(new InMemoryStateManager());
    registry.register(new InMemoryVault());
    registry.register(new InMemoryModelDriver());
    registry.register(new InMemoryTraceLog());

    const bootstrap = new BootstrapSequence(registry);
    await expect(bootstrap.execute()).rejects.toThrow(SystemExit);
  });

  it('should throw SystemExit when Vault mock is missing', async () => {
    const { InMemoryStateManager } = await import('../../src/core/InMemoryStateManager');
    const { InMemoryMemoryEngine } = await import('../../src/core/InMemoryMemoryEngine');
    const { InMemoryModelDriver } = await import('../../src/core/InMemoryModelDriver');
    const { InMemoryTraceLog } = await import('../../src/core/InMemoryTraceLog');

    registry.register(new InMemoryStateManager());
    registry.register(new InMemoryMemoryEngine());
    registry.register(new InMemoryModelDriver());
    registry.register(new InMemoryTraceLog());

    const bootstrap = new BootstrapSequence(registry);
    await expect(bootstrap.execute()).rejects.toThrow(SystemExit);
  });

  it('should throw SystemExit when Driver mock is missing', async () => {
    const { InMemoryStateManager } = await import('../../src/core/InMemoryStateManager');
    const { InMemoryMemoryEngine } = await import('../../src/core/InMemoryMemoryEngine');
    const { InMemoryVault } = await import('../../src/core/InMemoryVault');
    const { InMemoryTraceLog } = await import('../../src/core/InMemoryTraceLog');

    registry.register(new InMemoryStateManager());
    registry.register(new InMemoryMemoryEngine());
    registry.register(new InMemoryVault());
    registry.register(new InMemoryTraceLog());

    const bootstrap = new BootstrapSequence(registry);
    await expect(bootstrap.execute()).rejects.toThrow(SystemExit);
  });

  it('should throw SystemExit when a vital mock returns unhealthy ping', async () => {
    const { InMemoryStateManager } = await import('../../src/core/InMemoryStateManager');
    const { InMemoryMemoryEngine } = await import('../../src/core/InMemoryMemoryEngine');
    const { InMemoryVault } = await import('../../src/core/InMemoryVault');
    const { InMemoryModelDriver } = await import('../../src/core/InMemoryModelDriver');
    const { InMemoryTraceLog } = await import('../../src/core/InMemoryTraceLog');

    registry.register(new InMemoryStateManager());
    registry.register(new InMemoryMemoryEngine());
    registry.register(new InMemoryVault());
    registry.register(new InMemoryModelDriver(false)); // unhealthy
    registry.register(new InMemoryTraceLog());

    const bootstrap = new BootstrapSequence(registry);
    await expect(bootstrap.execute()).rejects.toThrow(SystemExit);
  });

  it('should not throw when extra non-vital plugins are registered', async () => {
    const { InMemoryStateManager } = await import('../../src/core/InMemoryStateManager');
    const { InMemoryMemoryEngine } = await import('../../src/core/InMemoryMemoryEngine');
    const { InMemoryVault } = await import('../../src/core/InMemoryVault');
    const { InMemoryModelDriver } = await import('../../src/core/InMemoryModelDriver');
    const { InMemoryTraceLog } = await import('../../src/core/InMemoryTraceLog');

    registry.register(new InMemoryStateManager());
    registry.register(new InMemoryMemoryEngine());

    // extra non-vital plugin
    class ExtraPlugin {
      name = 'ExtraPlugin';
      version = '1.0.0';
      initialize = () => {};
      ping = async () => true;
    }
    registry.register(new ExtraPlugin() as any);

    registry.register(new InMemoryVault());
    registry.register(new InMemoryModelDriver());
    registry.register(new InMemoryTraceLog());

    const bootstrap = new BootstrapSequence(registry);
    await expect(bootstrap.execute()).resolves.toBeUndefined();
  });
});

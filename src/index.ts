import { MicroKernel } from './core/MicroKernel';
import { EnvVaultPlugin } from './core/EnvVaultPlugin';
import { LocalMemoryPlugin } from './core/LocalMemoryPlugin';
import { LocalStatePlugin } from './core/LocalStatePlugin';
import { AnthropicDriver } from './core/AnthropicDriver';

/**
 * Teldrassil CLI Entry Point
 *
 * Bootstraps the MicroKernel with all four vital plugins
 * (State, Memory, Vault, Driver) and reports status.
 *
 * Usage: npx tsx src/index.ts
 *   MASTER_KEY=your-key npx tsx src/index.ts
 */
async function main(): Promise<void> {
  const masterKey = process.env.MASTER_KEY || 'teldrassil-default-key';

  const kernel = new MicroKernel();

  // Register vital plugins in dependency order
  kernel.register(new LocalStatePlugin());
  kernel.register(new LocalMemoryPlugin(masterKey));
  kernel.register(new EnvVaultPlugin(masterKey));
  kernel.register(new AnthropicDriver());

  await kernel.init();

  console.log('🌳 Teldrassil kernel bootstrapped successfully');
  const plugins = kernel.getRegistry().getAllPlugins();
  console.log(`   Plugins loaded: ${Array.from(plugins.keys()).join(', ')}`);

  // Graceful shutdown on SIGINT
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await kernel.shutdown();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(`Failed to bootstrap kernel: ${err.message}`);
  process.exit(1);
});

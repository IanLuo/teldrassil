import { MicroKernel } from './core/MicroKernel';
import { EnvVaultPlugin } from './core/EnvVaultPlugin';
import { LocalMemoryPlugin } from './core/LocalMemoryPlugin';
import { LocalStatePlugin } from './core/LocalStatePlugin';
import { LocalJsonTracePlugin } from './core/LocalJsonTracePlugin';
import { UnifiedModelDriver } from './core/UnifiedModelDriver';
import path from 'path';

/**
 * Teldrassil CLI Entry Point
 *
 * Bootstraps the MicroKernel with all five vital plugins
 * (State, Memory, Vault, Driver, Trace) and reports status.
 *
 * Usage: npx tsx src/index.ts
 *   MASTER_KEY=your-key npx tsx src/index.ts
 */
async function main(): Promise<void> {
  const masterKey = process.env.MASTER_KEY || 'teldrassil-default-key';
  const traceDir = path.join(process.cwd(), '.teldrassil', 'trace');

  const kernel = new MicroKernel();

  // Register vital plugins in dependency order
  kernel.register(new LocalStatePlugin());
  kernel.register(new LocalMemoryPlugin(masterKey));
  
  const vault = new EnvVaultPlugin(masterKey);
  kernel.register(vault);
  
  kernel.register(new UnifiedModelDriver('Driver', vault, {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    google: 'GOOGLE_API_KEY'
  }));
  
  kernel.register(new LocalJsonTracePlugin(traceDir));

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

import type { IVault, DEK } from './IVault';

/**
 * In-memory mock of the Identity Vault for kernel bootstrap tests.
 * Registered as 'Vault' in the PluginRegistry.
 */
export class InMemoryVault implements IVault {
  readonly name = 'Vault';
  readonly version = '0.1.0-mock';

  private secrets = new Map<string, string>();
  private dekCounter = 0;

  initialize = (): void => {};
  ping = async (): Promise<boolean> => true;
  shutdown = (): void => { this.secrets.clear(); };

  async generateDEK(): Promise<DEK> {
    return `dek_mock_${++this.dekCounter}` as DEK;
  }

  async getSecret(toolId: string): Promise<string | null> {
    return this.secrets.get(toolId) ?? null;
  }
}

import { describe, it, expect } from 'vitest';
import type { IVault, DEK } from '../../src/core/IVault';

describe('IVault', () => {
  describe('DEK generation', () => {
    it('should generate a non-empty DEK on generateDEK()', async () => {
      const vault: IVault = {
        name: 'MockVault',
        initialize: () => {},
        generateDEK: async () => 'dek_session_abc123' as DEK,
        getSecret: async () => 'token_xyz'
      };

      const dek = await vault.generateDEK();
      expect(dek).toBeTruthy();
      expect(typeof dek).toBe('string');
    });

    it('should generate unique DEKs for each call', async () => {
      const generated: string[] = [];
      const vault: IVault = {
        name: 'MockVault',
        initialize: () => {},
        generateDEK: async () => {
          const dek = `dek_${generated.length}` as DEK;
          generated.push(dek);
          return dek;
        },
        getSecret: async () => 'token'
      };

      const dek1 = await vault.generateDEK();
      const dek2 = await vault.generateDEK();

      expect(dek1).not.toBe(dek2);
    });
  });

  describe('secret retrieval', () => {
    it('should return a secret for a given tool ID', async () => {
      const secrets: Record<string, string> = { slack: 'slack-api-token' };
      const vault: IVault = {
        name: 'MockVault',
        initialize: () => {},
        generateDEK: async () => 'dek' as DEK,
        getSecret: async (toolId: string) => secrets[toolId] || null
      };

      const secret = await vault.getSecret('slack');
      expect(secret).toBe('slack-api-token');
    });

    it('should return null for unknown tool IDs', async () => {
      const vault: IVault = {
        name: 'MockVault',
        initialize: () => {},
        generateDEK: async () => 'dek' as DEK,
        getSecret: async () => null
      };

      const secret = await vault.getSecret('unknown_tool');
      expect(secret).toBeNull();
    });
  });

  describe('full contract', () => {
    it('mock must satisfy all IVault methods', () => {
      const vault: IVault = {
        name: 'MockVault',
        version: '2.0.0',
        initialize: () => {},
        ping: async () => true,
        shutdown: () => {},
        generateDEK: async () => 'dek' as DEK,
        getSecret: async () => 'secret'
      };

      expect(vault.name).toBe('MockVault');
      expect(typeof vault.generateDEK).toBe('function');
      expect(typeof vault.getSecret).toBe('function');
    });
  });
});

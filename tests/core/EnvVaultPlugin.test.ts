import { describe, it, expect } from 'vitest';
import { EnvVaultPlugin } from '../../src/core/EnvVaultPlugin';

describe('EnvVaultPlugin', () => {
  function createPlugin(masterKey = 'test-secret-key', secrets?: Record<string, string>) {
    return new EnvVaultPlugin(masterKey, secrets);
  }

  describe('plugin identity', () => {
    it('should be named Vault for BootstrapSequence', () => {
      const plugin = createPlugin();
      expect(plugin.name).toBe('Vault');
    });

    it('should have a working ping that returns true', async () => {
      const plugin = createPlugin();
      expect(await plugin.ping!()).toBe(true);
    });
  });

  describe('generateDEK', () => {
    it('should return a non-empty DEK string', async () => {
      const plugin = createPlugin();
      const dek = await plugin.generateDEK();
      expect(dek).toBeTruthy();
      expect(typeof dek).toBe('string');
      expect(dek.length).toBeGreaterThan(0);
    });

    it('should generate unique DEKs on each call', async () => {
      const plugin = createPlugin();
      const dek1 = await plugin.generateDEK();
      const dek2 = await plugin.generateDEK();
      expect(dek1).not.toBe(dek2);
    });

    it('should generate different DEKs when called with different master keys', async () => {
      const plugin1 = createPlugin('master-key-alpha');
      const plugin2 = createPlugin('master-key-beta');
      const dek1 = await plugin1.generateDEK();
      const dek2 = await plugin2.generateDEK();
      expect(dek1).not.toBe(dek2);
    });
  });

  describe('getSecret', () => {
    it('should return null for unknown tool IDs', async () => {
      const plugin = createPlugin();
      const secret = await plugin.getSecret('unknown_tool');
      expect(secret).toBeNull();
    });

    it('should return configured secret for known tool IDs', async () => {
      const plugin = createPlugin('master-key', {
        slack: 'xoxb-slack-token',
        github: 'ghp_github_token',
      });
      expect(await plugin.getSecret('slack')).toBe('xoxb-slack-token');
      expect(await plugin.getSecret('github')).toBe('ghp_github_token');
    });
  });

  describe('injectCredential', () => {
    it('should complete without throwing', async () => {
      const plugin = createPlugin();
      await expect(plugin.injectCredential('Bearer', 'token123')).resolves.toBeUndefined();
    });
  });

  describe('initialize and shutdown', () => {
    it('should initialize without error', () => {
      const plugin = createPlugin();
      expect(() => plugin.initialize()).not.toThrow();
    });

    it('should shutdown without error', () => {
      const plugin = createPlugin();
      plugin.initialize();
      expect(() => plugin.shutdown!()).not.toThrow();
    });
  });
});

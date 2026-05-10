import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PluginRegistry, Plugin, PluginKind, inferPluginKind } from '@/core/PluginRegistry';
import { EventBus } from '@/core/EventBus';

describe('PluginRegistry', () => {
  let eventBus: EventBus;
  let registry: PluginRegistry;

  beforeEach(() => {
    eventBus = new EventBus();
    registry = new PluginRegistry(eventBus);
  });

  it('should register a plugin and call its initialize method', () => {
    const mockInitialize = vi.fn();
    const testPlugin: Plugin = {
      name: 'test-plugin',
      version: '1.0.0',
      initialize: mockInitialize
    };

    registry.register(testPlugin);

    expect(mockInitialize).toHaveBeenCalledTimes(1);
    expect(mockInitialize).toHaveBeenCalledWith(eventBus);
  });

  it('should not allow registering multiple plugins with the same name', () => {
    const pluginA: Plugin = { name: 'dup-plugin', initialize: vi.fn() };
    const pluginB: Plugin = { name: 'dup-plugin', initialize: vi.fn() };

    registry.register(pluginA);
    
    expect(() => registry.register(pluginB)).toThrow(/already registered/i);
  });

  it('should return a registered plugin by name', () => {
    const testPlugin: Plugin = { name: 'test-plugin', initialize: vi.fn() };
    registry.register(testPlugin);

    const retrieved = registry.getPlugin('test-plugin');
    expect(retrieved).toBe(testPlugin);
  });
});

describe('inferPluginKind', () => {
  const basePlugin: Plugin = {
    name: 'test',
    initialize: vi.fn(),
  };

  it('should return explicit kind when set', () => {
    const plugin: Plugin = { ...basePlugin, name: 'MyDriver', kind: 'driver' };
    expect(inferPluginKind(plugin)).toBe('driver');
  });

  it('should infer driver from generate() method', () => {
    const plugin: Plugin = { ...basePlugin, name: 'Anything', generate: vi.fn() } as any;
    expect(inferPluginKind(plugin)).toBe('driver');
  });

  it('should infer vault from name containing "Vault"', () => {
    expect(inferPluginKind({ ...basePlugin, name: 'EnvVault' })).toBe('vault');
    expect(inferPluginKind({ ...basePlugin, name: 'MyVaultPlugin' })).toBe('vault');
  });

  it('should infer state from name containing "State"', () => {
    expect(inferPluginKind({ ...basePlugin, name: 'State' })).toBe('state');
    expect(inferPluginKind({ ...basePlugin, name: 'LocalState' })).toBe('state');
  });

  it('should infer memory from name containing "Memory"', () => {
    expect(inferPluginKind({ ...basePlugin, name: 'Memory' })).toBe('memory');
    expect(inferPluginKind({ ...basePlugin, name: 'LocalMemory' })).toBe('memory');
  });

  it('should infer trace from name containing "Trace"', () => {
    expect(inferPluginKind({ ...basePlugin, name: 'Trace' })).toBe('trace');
    expect(inferPluginKind({ ...basePlugin, name: 'LocalTrace' })).toBe('trace');
  });

  it('should infer driver from name containing "Driver"', () => {
    expect(inferPluginKind({ ...basePlugin, name: 'Driver' })).toBe('driver');
    expect(inferPluginKind({ ...basePlugin, name: 'SomeDriver' })).toBe('driver');
  });

  it('should return extension for unrecognized plugins', () => {
    expect(inferPluginKind({ ...basePlugin, name: 'UnknownPlugin' })).toBe('extension');
  });
});
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PluginRegistry, Plugin } from '@/core/PluginRegistry';
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
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBus } from '@/core/EventBus';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  it('should allow subscribing to and publishing events', () => {
    const mockHandler = vi.fn();
    eventBus.subscribe('test:event', mockHandler);

    const payload = { data: 'test data' };
    eventBus.publish('test:event', payload);

    expect(mockHandler).toHaveBeenCalledTimes(1);
    expect(mockHandler).toHaveBeenCalledWith(payload);
  });

  it('should handle multiple subscribers for the same event', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    
    eventBus.subscribe('test:event', handler1);
    eventBus.subscribe('test:event', handler2);
    
    eventBus.publish('test:event', { id: 1 });
    
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it('should allow unsubscribing from events', () => {
    const handler = vi.fn();
    const unsubscribe = eventBus.subscribe('test:event', handler);
    
    unsubscribe();
    eventBus.publish('test:event', { id: 1 });
    
    expect(handler).not.toHaveBeenCalled();
  });
});
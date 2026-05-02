export type EventHandler = (payload: any) => void;
export type UnsubscribeFunction = () => void;

export class EventBus {
  private handlers: Map<string, Set<EventHandler>>;

  constructor() {
    this.handlers = new Map();
  }

  public subscribe(topic: string, handler: EventHandler): UnsubscribeFunction {
    if (!this.handlers.has(topic)) {
      this.handlers.set(topic, new Set());
    }
    
    this.handlers.get(topic)!.add(handler);

    return () => {
      const topicHandlers = this.handlers.get(topic);
      if (topicHandlers) {
        topicHandlers.delete(handler);
        if (topicHandlers.size === 0) {
          this.handlers.delete(topic);
        }
      }
    };
  }

  public publish(topic: string, payload?: any): void {
    const topicHandlers = this.handlers.get(topic);
    if (topicHandlers) {
      topicHandlers.forEach(handler => {
        try {
          handler(payload);
        } catch (error) {
          console.error(`Error executing handler for topic ${topic}:`, error);
        }
      });
    }
  }
}
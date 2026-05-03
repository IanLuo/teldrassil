import type { IModelDriver, Message, VendorPayload, DriverCapabilities } from './IModelDriver';

/**
 * In-memory mock of the Model Driver for kernel bootstrap tests.
 * Registered as 'Driver' in the PluginRegistry.
 *
 * @param healthy — if false, ping() returns false to simulate a failed health check
 */
export class InMemoryModelDriver implements IModelDriver {
  readonly name = 'Driver';
  readonly version = '0.1.0-mock';

  private healthy: boolean;

  constructor(healthy = true) {
    this.healthy = healthy;
  }

  initialize = (): void => {};
  ping = async (): Promise<boolean> => this.healthy;
  shutdown = (): void => {};

  async translate(messages: Message[]): Promise<VendorPayload> {
    return {
      model: 'mock-model',
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    };
  }

  async countTokens(_messages: Message[]): Promise<number> {
    return 0;
  }

  getCapabilities(): DriverCapabilities {
    return {
      maxContextTokens: 100000,
      supportsStreaming: false,
      supportsTools: false,
    };
  }
}

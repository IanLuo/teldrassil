export class SystemExit extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SystemExit';
  }
}

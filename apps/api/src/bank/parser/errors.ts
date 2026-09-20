export class BankFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BankFormatError';
  }
}

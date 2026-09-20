/// Raised when accounting rules cannot produce a correct entry. There is no
/// "mostly balanced" path and no caller that swallows this and continues.
export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleError';
  }
}

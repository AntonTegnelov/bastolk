/// Raised when a SIE file does not match the format. A SIE file is input from
/// outside the system, so this is a validated boundary failure with a message
/// naming the offending line, not an internal invariant break.
export class SieFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SieFormatError';
  }
}

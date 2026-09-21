import { BankFormatError } from './errors.js';

// Swedish exports write a decimal comma and may group thousands with a space
// or a non-breaking space.
const GROUPING = /[\s ]/g;
const BANK_AMOUNT = /^(-?)(\d+)(?:,(\d{1,2}))?$/;

/// "-1 036,81" becomes -103681 ore. Parsed by string for the same reason the
/// SIE parser is: a float here eventually produces an entry that fails to
/// balance by one ore.
export function parseBankAmountToOre(raw: string): number {
  const cleaned = raw.replace(GROUPING, '').trim();
  const match = BANK_AMOUNT.exec(cleaned);

  if (!match) {
    throw new BankFormatError(`Not a bank amount: "${raw}"`);
  }

  const [, sign, whole, fraction = ''] = match;
  const ore = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));

  return sign === '-' ? -ore : ore;
}

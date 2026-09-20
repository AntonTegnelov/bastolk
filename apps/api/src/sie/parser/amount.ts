import { SieFormatError } from './errors.js';

const SIE_AMOUNT = /^(-?)(\d+)(?:[.,](\d{1,2}))?$/;

/// SIE writes amounts as decimals, "-1250.00". They are parsed by string into
/// integer ore. parseFloat would be shorter and would eventually produce an
/// entry that fails to balance by one ore, which teaches people to ignore the
/// balance check.
export function parseAmountToOre(raw: string): number {
  const match = SIE_AMOUNT.exec(raw.trim());
  if (!match) {
    throw new SieFormatError(`Not a SIE amount: "${raw}"`);
  }

  const [, sign, whole, fraction = ''] = match;
  const ore = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));

  return sign === '-' ? -ore : ore;
}

/// The inverse, for writing SIE4 on export.
export function formatOreAsAmount(ore: number): string {
  const sign = ore < 0 ? '-' : '';
  const absolute = Math.abs(ore);

  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
}

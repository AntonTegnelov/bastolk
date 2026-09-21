import { AccountRole } from '@prisma/client';
import { RuleError } from './errors.js';

/// Standard BAS ranges. The chart of accounts is per company, but these ranges
/// are national, so they seed the classification at import and the same
/// constants drive entry building in the other direction.
const BANK_RANGE = { from: 1900, to: 1999 } as const;
const VAT_RANGE = { from: 2610, to: 2659 } as const;

export const BAS = {
  /// Business bank account. The bank side of every transaction lands here.
  bankAccount: '1930',
  /// Debiterad ingaende moms: VAT paid to a Swedish supplier.
  inputVat: '2641',
  /// Utgaende moms omvand skattskyldighet: the output half of reverse charge.
  reverseChargeOutputVat: '2614',
  /// Beraknad ingaende moms pa forvarv fran utlandet: the input half.
  reverseChargeInputVat: '2645',
} as const;

/// Utgaende moms, by rate, for money coming in.
const OUTPUT_VAT_BY_RATE: Record<number, string> = {
  25: '2610',
  12: '2620',
  6: '2630',
};

export function outputVatAccount(ratePercent: number): string {
  const account = OUTPUT_VAT_BY_RATE[ratePercent];
  if (!account) {
    throw new RuleError(
      `No output VAT account for a rate of ${ratePercent} percent`,
    );
  }
  return account;
}

export function classifyAccount(accountNumber: string): AccountRole {
  const number = Number(accountNumber);

  if (!Number.isInteger(number)) {
    return AccountRole.OTHER;
  }
  if (number >= BANK_RANGE.from && number <= BANK_RANGE.to) {
    return AccountRole.BANK;
  }
  if (number >= VAT_RANGE.from && number <= VAT_RANGE.to) {
    return AccountRole.VAT;
  }

  return AccountRole.OTHER;
}

export function isBankAccount(accountNumber: string): boolean {
  return classifyAccount(accountNumber) === AccountRole.BANK;
}

export function isVatAccount(accountNumber: string): boolean {
  return classifyAccount(accountNumber) === AccountRole.VAT;
}

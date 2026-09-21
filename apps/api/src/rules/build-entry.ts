import { VatTreatment } from '@prisma/client';
import { BAS, outputVatAccount } from './bas.js';
import { RuleError } from './errors.js';
import {
  isReverseCharge,
  vatIncludedInGross,
  vatOnNet,
  vatRatePercent,
} from './vat.js';

export interface JournalLineDraft {
  readonly accountNumber: string;
  readonly amountOre: number;
}

export interface EntryInput {
  /// The expense or revenue account the model chose.
  readonly counterAccountNumber: string;
  readonly vatTreatment: VatTreatment;
  /// Signed as the bank statement shows it: negative is money leaving.
  readonly amountOre: number;
  readonly bankAccountNumber?: string;
}

function assertBalanced(lines: readonly JournalLineDraft[]): void {
  const total = lines.reduce((sum, line) => sum + line.amountOre, 0);

  if (total !== 0) {
    throw new RuleError(
      `Entry does not balance: ${total} ore over ${lines.length} lines`,
    );
  }
}

/// Turns a judgement (an account and a VAT treatment) into balanced journal
/// lines. The model never does this arithmetic: splitting VAT and adding the
/// paired reverse-charge lines has exactly one right answer.
///
/// Either this returns balanced lines or it throws. There is no partially
/// correct entry, because a caller that continued with one would put a wrong
/// entry in front of a person who is expecting the tool to have done the sums.
export function buildJournalLines(input: EntryInput): JournalLineDraft[] {
  if (input.amountOre === 0) {
    throw new RuleError('A transaction of zero has no entry');
  }

  const bankAccount = input.bankAccountNumber ?? BAS.bankAccount;
  const moneyOut = input.amountOre < 0;
  // What the bank line takes, the other lines must give back.
  const counterTotal = -input.amountOre;
  const gross = Math.abs(counterTotal);

  const lines: JournalLineDraft[] = [
    { accountNumber: bankAccount, amountOre: input.amountOre },
  ];

  if (isReverseCharge(input.vatTreatment)) {
    if (!moneyOut) {
      throw new RuleError(
        'Reverse charge applies to a purchase, not to money coming in',
      );
    }

    // The supplier charges no VAT. Both halves are booked here and cancel, so
    // the amount paid is the full cost.
    const vat = vatOnNet(gross, input.vatTreatment);
    lines.push(
      { accountNumber: input.counterAccountNumber, amountOre: counterTotal },
      { accountNumber: BAS.reverseChargeOutputVat, amountOre: -vat },
      { accountNumber: BAS.reverseChargeInputVat, amountOre: vat },
    );

    assertBalanced(lines);
    return lines;
  }

  const rate = vatRatePercent(input.vatTreatment);
  if (rate === 0) {
    lines.push({
      accountNumber: input.counterAccountNumber,
      amountOre: counterTotal,
    });

    assertBalanced(lines);
    return lines;
  }

  // The net is what remains after VAT, and the VAT is the remainder rather
  // than a second rounded division, so the two always add back to the gross.
  const vat = vatIncludedInGross(gross, input.vatTreatment);
  const net = gross - vat;
  const sign = counterTotal < 0 ? -1 : 1;

  lines.push(
    { accountNumber: input.counterAccountNumber, amountOre: sign * net },
    {
      accountNumber: moneyOut ? BAS.inputVat : outputVatAccount(rate),
      amountOre: sign * vat,
    },
  );

  assertBalanced(lines);
  return lines;
}

import { VatTreatment } from '@prisma/client';
import type { ParsedVerification } from '../sie/parser/types.js';
import { isBankAccount, isVatAccount } from './bas.js';
import { BAS } from './bas.js';

export interface ExtractedLabel {
  /// The single non-bank, non-VAT account: what the transaction was booked as.
  readonly accountNumber: string;
  readonly vatTreatment: VatTreatment;
  readonly text: string;
  /// Signed as the bank saw it.
  readonly amountOre: number;
  readonly date: string;
}

const DOMESTIC_BY_RATE: Record<number, VatTreatment> = {
  25: VatTreatment.DOMESTIC_25,
  12: VatTreatment.DOMESTIC_12,
  6: VatTreatment.DOMESTIC_6,
};

function nearestDomesticTreatment(
  netOre: number,
  vatOre: number,
): VatTreatment {
  if (vatOre === 0 || netOre === 0) {
    return VatTreatment.NONE;
  }

  const ratePercent = Math.round((Math.abs(vatOre) * 100) / Math.abs(netOre));
  return DOMESTIC_BY_RATE[ratePercent] ?? VatTreatment.NONE;
}

/// Derives one label from one verification, or nothing when the verification
/// is not the shape a bank transaction produces.
///
/// A verification is several lines and one label. A typical purchase has a
/// bank line, a VAT line and an expense line. Anything with more than one
/// non-bank, non-VAT line is a salary run, a year-end entry or similar: it is
/// not what a bank transaction looks like, and including it would teach the
/// model noise and poison the metrics.
///
/// The two reverse-charge treatments book identical VAT accounts, so they
/// cannot be told apart from the verification alone. Extraction reports the EU
/// one; the distinction survives only in corrections, where a person picks it.
export function extractLabel(
  verification: ParsedVerification,
): ExtractedLabel | null {
  const bankLines = verification.transactions.filter((line) =>
    isBankAccount(line.accountNumber),
  );
  const vatLines = verification.transactions.filter((line) =>
    isVatAccount(line.accountNumber),
  );
  const subjectLines = verification.transactions.filter(
    (line) =>
      !isBankAccount(line.accountNumber) && !isVatAccount(line.accountNumber),
  );

  if (bankLines.length !== 1 || subjectLines.length !== 1) {
    return null;
  }

  const [bankLine] = bankLines;
  const [subjectLine] = subjectLines;

  const usesReverseCharge = vatLines.some(
    (line) =>
      line.accountNumber === BAS.reverseChargeOutputVat ||
      line.accountNumber === BAS.reverseChargeInputVat,
  );

  const vatTotal = vatLines.reduce((sum, line) => sum + line.amountOre, 0);
  const vatTreatment = usesReverseCharge
    ? VatTreatment.REVERSE_CHARGE_EU
    : nearestDomesticTreatment(subjectLine.amountOre, vatTotal);

  return {
    accountNumber: subjectLine.accountNumber,
    vatTreatment,
    text: subjectLine.text?.trim() || verification.text,
    amountOre: bankLine.amountOre,
    date: verification.date,
  };
}

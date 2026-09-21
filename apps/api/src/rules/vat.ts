import { VatTreatment } from '@prisma/client';

/// Rates as integer percentages, so every calculation stays in integers.
const RATES: Record<VatTreatment, number> = {
  [VatTreatment.DOMESTIC_25]: 25,
  [VatTreatment.DOMESTIC_12]: 12,
  [VatTreatment.DOMESTIC_6]: 6,
  [VatTreatment.REVERSE_CHARGE_EU]: 25,
  [VatTreatment.REVERSE_CHARGE_NON_EU]: 25,
  [VatTreatment.NONE]: 0,
};

export function vatRatePercent(treatment: VatTreatment): number {
  return RATES[treatment];
}

export function isReverseCharge(treatment: VatTreatment): boolean {
  return (
    treatment === VatTreatment.REVERSE_CHARGE_EU ||
    treatment === VatTreatment.REVERSE_CHARGE_NON_EU
  );
}

/// The VAT included in a gross amount, as integer ore. The caller derives the
/// net as gross minus this, so the two always add back to the gross exactly
/// and the entry cannot fail to balance because of a rounded division.
export function vatIncludedInGross(
  grossOre: number,
  treatment: VatTreatment,
): number {
  const rate = vatRatePercent(treatment);
  if (rate === 0) {
    return 0;
  }

  const netOre = Math.round((grossOre * 100) / (100 + rate));
  return grossOre - netOre;
}

/// VAT calculated on top of a net amount, used for reverse charge where the
/// supplier charges no VAT and both halves are booked here.
export function vatOnNet(netOre: number, treatment: VatTreatment): number {
  return Math.round((netOre * vatRatePercent(treatment)) / 100);
}

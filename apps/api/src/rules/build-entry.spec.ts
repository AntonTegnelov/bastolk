import { VatTreatment } from '@prisma/client';
import { buildJournalLines } from './build-entry.js';
import { RuleError } from './errors.js';

const SOFTWARE = '5420';
const BANK_FEES = '6570';

function totalOf(lines: readonly { amountOre: number }[]): number {
  return lines.reduce((sum, line) => sum + line.amountOre, 0);
}

function amountFor(
  lines: readonly { accountNumber: string; amountOre: number }[],
  account: string,
) {
  return lines.find((line) => line.accountNumber === account)?.amountOre;
}

describe('buildJournalLines', () => {
  it('splits domestic VAT out of the paid amount', () => {
    const lines = buildJournalLines({
      counterAccountNumber: SOFTWARE,
      vatTreatment: VatTreatment.DOMESTIC_25,
      amountOre: -125000,
    });

    expect(amountFor(lines, '1930')).toBe(-125000);
    expect(amountFor(lines, SOFTWARE)).toBe(100000);
    expect(amountFor(lines, '2641')).toBe(25000);
  });

  it('books both halves of a reverse charge, so the paid amount is the full cost', () => {
    const lines = buildJournalLines({
      counterAccountNumber: SOFTWARE,
      vatTreatment: VatTreatment.REVERSE_CHARGE_EU,
      amountOre: -103681,
    });

    expect(amountFor(lines, '1930')).toBe(-103681);
    expect(amountFor(lines, SOFTWARE)).toBe(103681);
    expect(amountFor(lines, '2614')).toBe(-25920);
    expect(amountFor(lines, '2645')).toBe(25920);
  });

  it('writes two lines when there is no VAT', () => {
    const lines = buildJournalLines({
      counterAccountNumber: BANK_FEES,
      vatTreatment: VatTreatment.NONE,
      amountOre: -16200,
    });

    expect(lines).toHaveLength(2);
    expect(amountFor(lines, BANK_FEES)).toBe(16200);
  });

  it('books money coming in against output VAT rather than input VAT', () => {
    const lines = buildJournalLines({
      counterAccountNumber: '3011',
      vatTreatment: VatTreatment.DOMESTIC_25,
      amountOre: 125000,
    });

    expect(amountFor(lines, '1930')).toBe(125000);
    expect(amountFor(lines, '3011')).toBe(-100000);
    expect(amountFor(lines, '2610')).toBe(-25000);
  });

  // The contract, not one example: whatever the amount and the treatment, the
  // lines sum to zero. A rounded division without an explicit remainder line
  // would fail here on the amounts that do not divide evenly.
  it('balances to the ore for every amount and treatment', () => {
    const treatments = [
      VatTreatment.DOMESTIC_25,
      VatTreatment.DOMESTIC_12,
      VatTreatment.DOMESTIC_6,
      VatTreatment.REVERSE_CHARGE_EU,
      VatTreatment.NONE,
    ];

    for (const vatTreatment of treatments) {
      for (let amountOre = 1; amountOre <= 2000; amountOre += 1) {
        const lines = buildJournalLines({
          counterAccountNumber: SOFTWARE,
          vatTreatment,
          amountOre: -amountOre,
        });

        expect(totalOf(lines)).toBe(0);
      }
    }
  });

  it('refuses a reverse charge on money coming in', () => {
    expect(() =>
      buildJournalLines({
        counterAccountNumber: SOFTWARE,
        vatTreatment: VatTreatment.REVERSE_CHARGE_EU,
        amountOre: 103681,
      }),
    ).toThrow(RuleError);
  });

  it('refuses a transaction of zero', () => {
    expect(() =>
      buildJournalLines({
        counterAccountNumber: SOFTWARE,
        vatTreatment: VatTreatment.NONE,
        amountOre: 0,
      }),
    ).toThrow(RuleError);
  });
});

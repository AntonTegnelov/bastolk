import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VatTreatment } from '@prisma/client';
import { decodeSie } from '../sie/parser/decode.js';
import { parseSie } from '../sie/parser/parse-sie.js';
import type { ParsedVerification } from '../sie/parser/types.js';
import { buildJournalLines } from './build-entry.js';
import { extractLabel } from './extract-label.js';

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../test/fixtures/synthetic-company.se',
);

const verifications = parseSie(decodeSie(readFileSync(fixture))).verifications;

function byNumber(number: string): ParsedVerification {
  const found = verifications.find((v) => v.number === number);
  if (!found) {
    throw new Error(`Fixture has no verification ${number}`);
  }
  return found;
}

describe('extractLabel', () => {
  it('reads a bank fee as the expense account with no VAT', () => {
    const label = extractLabel(byNumber('1'));

    expect(label?.accountNumber).toBe('6570');
    expect(label?.vatTreatment).toBe(VatTreatment.NONE);
    expect(label?.amountOre).toBe(-16200);
  });

  it('infers the domestic rate from the VAT booked against the net', () => {
    const label = extractLabel(byNumber('2'));

    expect(label?.accountNumber).toBe('5420');
    expect(label?.vatTreatment).toBe(VatTreatment.DOMESTIC_25);
  });

  it('recognises reverse charge from the paired VAT accounts', () => {
    const label = extractLabel(byNumber('3'));

    expect(label?.accountNumber).toBe('5420');
    expect(label?.vatTreatment).toBe(VatTreatment.REVERSE_CHARGE_EU);
    expect(label?.text).toBe('EU SOFTWARE');
  });

  // Getting this wrong quietly poisons both the training set and the metrics,
  // so it is pinned as a contract: more than one non-bank, non-VAT line is
  // never a label, whatever else the verification looks like.
  it('refuses a verification with more than one non-bank, non-VAT line', () => {
    expect(extractLabel(byNumber('4'))).toBeNull();
  });

  it('refuses a verification with no bank line', () => {
    const noBank: ParsedVerification = {
      series: 'A',
      number: '99',
      date: '2026-03-01',
      text: 'Omföring',
      transactions: [
        { accountNumber: '5420', amountOre: 10000, text: null },
        { accountNumber: '5410', amountOre: -10000, text: null },
      ],
    };

    expect(extractLabel(noBank)).toBeNull();
  });
});

describe('extraction and entry building agree', () => {
  // Label extraction reads history in one direction and the rules module
  // writes entries in the other. If they disagreed, an entry built from a
  // prediction would not look like the entries the company already has.
  it('rebuilds each extractable verification into the same shape', () => {
    const labelled = verifications
      .map((verification) => ({
        verification,
        label: extractLabel(verification),
      }))
      .filter((pair) => pair.label !== null);

    expect(labelled).toHaveLength(3);

    for (const { verification, label } of labelled) {
      const rebuilt = buildJournalLines({
        counterAccountNumber: label!.accountNumber,
        vatTreatment: label!.vatTreatment,
        amountOre: label!.amountOre,
      });

      expect(rebuilt.reduce((sum, line) => sum + line.amountOre, 0)).toBe(0);
      expect(rebuilt).toHaveLength(verification.transactions.length);

      for (const original of verification.transactions) {
        const match = rebuilt.find(
          (line) => line.accountNumber === original.accountNumber,
        );
        expect(match?.amountOre).toBe(original.amountOre);
      }
    }
  });
});

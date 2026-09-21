import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeSie } from './decode.js';
import { SieFormatError } from './errors.js';
import { parseSie } from './parse-sie.js';

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../test/fixtures/synthetic-company.se',
);

function parseFixture() {
  return parseSie(decodeSie(readFileSync(fixture)));
}

describe('parseSie', () => {
  it('decodes CP437, so Swedish account names survive the import', () => {
    const parsed = parseFixture();

    expect(parsed.companyName).toBe('Exempelbolaget AB');
    expect(parsed.accounts.find((a) => a.number === '1930')?.name).toBe(
      'Företagskonto',
    );
    expect(parsed.accounts.find((a) => a.number === '7010')?.name).toBe(
      'Löner till tjänstemän',
    );
  });

  it('reads the chart of accounts and the organisation number', () => {
    const parsed = parseFixture();

    expect(parsed.orgNumber).toBe('556677-8899');
    expect(parsed.accounts).toHaveLength(10);
  });

  it('reads every verification with its lines as integer ore', () => {
    const parsed = parseFixture();

    expect(parsed.verifications).toHaveLength(4);
    const reverseCharge = parsed.verifications.find((v) => v.number === '3');
    expect(reverseCharge?.date).toBe('2026-02-02');
    expect(reverseCharge?.transactions).toHaveLength(4);
    expect(
      reverseCharge?.transactions.find((t) => t.accountNumber === '5420')
        ?.amountOre,
    ).toBe(103681);
    expect(
      reverseCharge?.transactions.find((t) => t.accountNumber === '2614')
        ?.amountOre,
    ).toBe(-25920);
  });

  it('keeps every verification balanced to the ore', () => {
    const parsed = parseFixture();

    for (const verification of parsed.verifications) {
      const total = verification.transactions.reduce(
        (sum, line) => sum + line.amountOre,
        0,
      );
      expect(total).toBe(0);
    }
  });

  it('refuses a verification whose lines do not sum to zero', () => {
    const unbalanced = [
      '#VER "A" "9" 20260101 "Trasig"',
      '{',
      '   #TRANS 5420 {} 100.00',
      '   #TRANS 1930 {} -99.99',
      '}',
    ].join('\n');

    expect(() => parseSie(unbalanced)).toThrow(SieFormatError);
  });

  it('refuses a transaction outside a verification block', () => {
    expect(() => parseSie('#TRANS 5420 {} 100.00')).toThrow(SieFormatError);
  });

  it('refuses a verification that is never closed', () => {
    const unclosed = [
      '#VER "A" "9" 20260101 "Trasig"',
      '{',
      '   #TRANS 5420 {} 0.00',
    ].join('\n');

    expect(() => parseSie(unclosed)).toThrow(SieFormatError);
  });
});

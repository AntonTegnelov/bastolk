import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBankAmountToOre } from './amount.js';
import { BankFormatError } from './errors.js';
import { parseBankCsv } from './parse-bank-csv.js';

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../test/fixtures/synthetic-bank.csv',
);

const parsed = () => parseBankCsv(readFileSync(fixture));

describe('parseBankAmountToOre', () => {
  it('reads a decimal comma as integer ore', () => {
    expect(parseBankAmountToOre('-1036,81')).toBe(-103681);
    expect(parseBankAmountToOre('25000,00')).toBe(2500000);
  });

  it('ignores thousands grouping, including a non-breaking space', () => {
    expect(parseBankAmountToOre('-1 036,81')).toBe(-103681);
    expect(parseBankAmountToOre('-1 036,81')).toBe(-103681);
  });

  it('refuses an amount written with a decimal point', () => {
    expect(() => parseBankAmountToOre('-1036.81')).toThrow(BankFormatError);
  });
});

describe('parseBankCsv', () => {
  it('decodes CP1252, which is not the CP437 that SIE4 uses', () => {
    const rows = parsed();

    expect(rows.find((row) => row.text === 'LÖN')).toBeDefined();
  });

  it('skips the sep= preamble and the blank row after the header', () => {
    expect(parsed()).toHaveLength(6);
  });

  it('keeps the sign the statement shows, so money in is positive', () => {
    const rows = parsed();

    expect(rows.find((row) => row.text === 'KUNDBETALNING')?.amountOre).toBe(
      2500000,
    );
    expect(rows.find((row) => row.text === 'Bankavgifter')?.amountOre).toBe(
      -16200,
    );
  });

  it('gives every row a distinct hash so a re-upload cannot duplicate it', () => {
    const rows = parsed();

    expect(new Set(rows.map((row) => row.hash)).size).toBe(rows.length);
  });

  it('finds columns by name rather than position', () => {
    // The same three columns, in a different order and with fewer of them.
    const reordered = Buffer.from(
      [
        'Referens;Bokföringsdag;Insättning/Uttag',
        'TEST;2026-01-01;-100,00',
      ].join('\r\n'),
      'latin1',
    );

    const rows = parseBankCsv(reordered);

    expect(rows).toEqual([
      expect.objectContaining({
        text: 'TEST',
        bookedOn: '2026-01-01',
        amountOre: -10000,
      }),
    ]);
  });

  it('refuses a file with no recognisable header', () => {
    expect(() => parseBankCsv(Buffer.from('a;b;c\r\n1;2;3'))).toThrow(
      BankFormatError,
    );
  });
});

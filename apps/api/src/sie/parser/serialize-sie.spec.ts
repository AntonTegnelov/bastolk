import { decodeSie, encodeSie } from './decode.js';
import { SieFormatError } from './errors.js';
import { parseSie } from './parse-sie.js';
import { serializeSie, type ExportInput } from './serialize-sie.js';

const input: ExportInput = {
  companyName: 'Exempelbolaget AB',
  orgNumber: '556677-8899',
  generatedOn: '2026-09-20',
  accounts: [
    { number: '1930', name: 'Företagskonto' },
    { number: '2641', name: 'Debiterad ingående moms' },
    { number: '5420', name: 'Programvaror' },
  ],
  verifications: [
    {
      series: 'B',
      number: '1',
      date: '2026-09-17',
      text: 'MOLNTJÄNST AB',
      lines: [
        { accountNumber: '1930', amountOre: -103681 },
        { accountNumber: '5420', amountOre: 82945 },
        { accountNumber: '2641', amountOre: 20736 },
      ],
    },
  ],
};

describe('serializeSie', () => {
  // The export is read back by the parser that reads real files, so a change
  // to either side that broke the other would fail here.
  it('produces a file its own parser reads back unchanged', () => {
    const parsed = parseSie(decodeSie(encodeSie(serializeSie(input))));

    expect(parsed.companyName).toBe('Exempelbolaget AB');
    expect(parsed.orgNumber).toBe('556677-8899');
    expect(parsed.accounts).toHaveLength(3);
    expect(parsed.verifications).toHaveLength(1);

    const [verification] = parsed.verifications;
    expect(verification.date).toBe('2026-09-17');
    expect(
      verification.transactions.map((t) => t.amountOre).sort((a, b) => a - b),
    ).toEqual([-103681, 20736, 82945]);
  });

  it('survives the CP437 round trip with Swedish characters intact', () => {
    const parsed = parseSie(decodeSie(encodeSie(serializeSie(input))));

    expect(parsed.accounts.find((a) => a.number === '1930')?.name).toBe(
      'Företagskonto',
    );
  });

  it('refuses to write a verification that does not balance', () => {
    const broken: ExportInput = {
      ...input,
      verifications: [
        {
          ...input.verifications[0],
          lines: [
            { accountNumber: '1930', amountOre: -103681 },
            { accountNumber: '5420', amountOre: 82945 },
          ],
        },
      ],
    };

    expect(() => serializeSie(broken)).toThrow(SieFormatError);
  });

  it('refuses to write a verification with no lines', () => {
    const empty: ExportInput = {
      ...input,
      verifications: [{ ...input.verifications[0], lines: [] }],
    };

    expect(() => serializeSie(empty)).toThrow(SieFormatError);
  });
});

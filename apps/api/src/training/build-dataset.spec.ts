import { VatTreatment } from '@prisma/client';
import { buildDataset, toJsonl, type GeneratedPair } from './build-dataset.js';

const pairs: GeneratedPair[] = [
  {
    account: '5420',
    vat: 'DOMESTIC_25',
    texts: ['MOLNTJANST AB', 'LICENS SVERIGE', 'PROG AB STHLM'],
  },
  {
    account: '4535',
    vat: 'REVERSE_CHARGE_EU',
    texts: ['SERVEREU GMBH', 'HOSTING.NL', 'CODEBASE EU'],
  },
  { account: '6570', vat: 'NONE', texts: ['Bankavgifter', 'Arsavgift konto'] },
];

describe('buildDataset', () => {
  it('keeps every label represented in both halves', () => {
    const dataset = buildDataset(pairs);

    expect(dataset.stats.labels).toBe(3);
    for (const label of Object.keys(dataset.stats.perLabel)) {
      expect(
        dataset.validation.some((e) => `${e.account}|${e.vat}` === label),
      ).toBe(true);
      expect(dataset.train.some((e) => `${e.account}|${e.vat}` === label)).toBe(
        true,
      );
    }
  });

  it('gives the same text the same amount every time it is built', () => {
    const first = buildDataset(pairs);
    const second = buildDataset(pairs);

    expect(toJsonl(first.train)).toBe(toJsonl(second.train));
  });

  it('signs payments negative and revenue positive', () => {
    const withRevenue = buildDataset([
      ...pairs,
      {
        account: '3011',
        vat: 'DOMESTIC_25',
        texts: ['KUNDBETALNING AB', 'FAKTURA 1234'],
      },
    ]);
    const all = [...withRevenue.train, ...withRevenue.validation];

    for (const example of all) {
      if (example.account === '3011') {
        expect(example.amountOre).toBeGreaterThan(0);
      } else {
        expect(example.amountOre).toBeLessThan(0);
      }
    }
  });

  it('drops a repeated text rather than training on it twice', () => {
    const dataset = buildDataset([
      {
        account: '6570',
        vat: 'NONE',
        texts: ['Bankavgifter', 'bankavgifter', 'Bankavgifter'],
      },
    ]);

    expect(dataset.stats.duplicatesDropped).toBe(2);
    expect([...dataset.train, ...dataset.validation]).toHaveLength(1);
  });

  // A text written for two different labels is a contradiction. Keeping one
  // arbitrarily would teach the model that the label does not follow from the
  // text, which is the one thing it has to learn.
  it('drops a text that was written for two different labels', () => {
    const dataset = buildDataset([
      {
        account: '5420',
        vat: 'DOMESTIC_25',
        texts: ['MOLNTJANST AB', 'UNIK TEXT'],
      },
      { account: '4535', vat: 'REVERSE_CHARGE_EU', texts: ['MOLNTJANST AB'] },
    ]);
    const all = [...dataset.train, ...dataset.validation];

    expect(dataset.stats.ambiguousDropped).toBe(2);
    expect(all.map((e) => e.text)).toEqual(['UNIK TEXT']);
  });

  // Real statements carry these, but every one has a different label, so as
  // training examples they teach the model to guess rather than to read.
  it('drops a text that is only a reference number', () => {
    const dataset = buildDataset([
      {
        account: '6570',
        vat: 'NONE',
        texts: ['732-6853', '  445-1928 ', 'Bankavgifter'],
      },
    ]);

    expect(dataset.stats.unlearnableDropped).toBe(2);
    expect(
      [...dataset.train, ...dataset.validation].map((e) => e.text),
    ).toEqual(['Bankavgifter']);
  });

  it('refuses a pair whose VAT treatment is not one we know', () => {
    expect(() =>
      buildDataset([{ account: '5420', vat: 'DOMESTIC_99', texts: ['X'] }]),
    ).toThrow(/unknown VAT/);
  });

  it('writes one JSON object per line', () => {
    const dataset = buildDataset(pairs);
    const lines = toJsonl(dataset.train).trim().split('\n');

    expect(lines).toHaveLength(dataset.train.length);
    expect(JSON.parse(lines[0])).toHaveProperty('vat');
    expect(Object.values(VatTreatment)).toContain(JSON.parse(lines[0]).vat);
  });
});

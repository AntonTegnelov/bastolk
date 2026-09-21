import { formatOreAsAmount, parseAmountToOre } from './amount.js';
import { SieFormatError } from './errors.js';

describe('parseAmountToOre', () => {
  it('reads a two-decimal amount as integer ore', () => {
    expect(parseAmountToOre('1250.00')).toBe(125000);
    expect(parseAmountToOre('-1036.81')).toBe(-103681);
  });

  it('reads amounts with fewer decimals than two', () => {
    expect(parseAmountToOre('162')).toBe(16200);
    expect(parseAmountToOre('-0.5')).toBe(-50);
  });

  it('keeps ore exact where binary floating point would not', () => {
    // 0.1 + 0.2 !== 0.3 in float. Through ore this is ordinary integer work,
    // which is the whole reason the parser does not use parseFloat.
    const total = parseAmountToOre('0.10') + parseAmountToOre('0.20');

    expect(total).toBe(parseAmountToOre('0.30'));
  });

  it('refuses anything that is not a SIE amount', () => {
    expect(() => parseAmountToOre('1 250,00')).toThrow(SieFormatError);
    expect(() => parseAmountToOre('abc')).toThrow(SieFormatError);
    expect(() => parseAmountToOre('1.234')).toThrow(SieFormatError);
  });
});

describe('formatOreAsAmount', () => {
  it('is the inverse of parsing, so an import and an export agree', () => {
    for (const amount of ['0.00', '162.00', '-1036.81', '30000.00', '-0.05']) {
      expect(formatOreAsAmount(parseAmountToOre(amount))).toBe(
        amount.replace(/^(-?)(\d+)$/, '$1$2.00'),
      );
    }
  });
});

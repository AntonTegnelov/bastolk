import { SieFormatError } from './errors.js';
import { tokenizeLine } from './tokenize.js';

describe('tokenizeLine', () => {
  it('splits bare fields on whitespace', () => {
    expect(tokenizeLine('#KONTO 1930 x')).toEqual(['#KONTO', '1930', 'x']);
  });

  it('keeps a quoted field whole, spaces included', () => {
    expect(tokenizeLine('#FNAMN "Exempelbolaget AB"')).toEqual([
      '#FNAMN',
      'Exempelbolaget AB',
    ]);
  });

  it('keeps an empty object list as its own field so later fields keep their position', () => {
    expect(tokenizeLine('#TRANS 5420 {} 1000.00')).toEqual([
      '#TRANS',
      '5420',
      '{}',
      '1000.00',
    ]);
  });

  it('keeps a populated object list whole', () => {
    expect(tokenizeLine('#TRANS 5420 {1 "100"} 1000.00')).toEqual([
      '#TRANS',
      '5420',
      '{1 "100"}',
      '1000.00',
    ]);
  });

  it('refuses an unterminated quote rather than guessing where it ended', () => {
    expect(() => tokenizeLine('#FNAMN "Exempelbolaget')).toThrow(
      SieFormatError,
    );
  });
});

import { SieFormatError } from './errors.js';

/// Splits one SIE record into fields. Fields are whitespace separated, may be
/// quoted, and an object list is braced. The brace form is kept whole because
/// this project ignores dimensions but must not misread the fields after them.
export function tokenizeLine(line: string): string[] {
  const tokens: string[] = [];
  let index = 0;

  while (index < line.length) {
    const character = line[index];

    if (character === ' ' || character === '\t') {
      index += 1;
      continue;
    }

    if (character === '"') {
      let value = '';
      index += 1;
      while (index < line.length && line[index] !== '"') {
        if (line[index] === '\\' && index + 1 < line.length) {
          index += 1;
        }
        value += line[index];
        index += 1;
      }
      if (index >= line.length) {
        throw new SieFormatError(`Unterminated quoted field in: ${line}`);
      }
      index += 1;
      tokens.push(value);
      continue;
    }

    if (character === '{') {
      const end = line.indexOf('}', index);
      if (end === -1) {
        throw new SieFormatError(`Unterminated object list in: ${line}`);
      }
      tokens.push(line.slice(index, end + 1));
      index = end + 1;
      continue;
    }

    let value = '';
    while (index < line.length && !' \t'.includes(line[index])) {
      value += line[index];
      index += 1;
    }
    tokens.push(value);
  }

  return tokens;
}

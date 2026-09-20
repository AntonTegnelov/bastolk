import { parseAmountToOre } from './amount.js';
import { SieFormatError } from './errors.js';
import { tokenizeLine } from './tokenize.js';
import type {
  ParsedAccount,
  ParsedSie,
  ParsedTransaction,
  ParsedVerification,
} from './types.js';

const SIE_DATE = /^(\d{4})(\d{2})(\d{2})$/;

function parseSieDate(raw: string): string {
  const match = SIE_DATE.exec(raw);
  if (!match) {
    throw new SieFormatError(`Not a SIE date: "${raw}"`);
  }

  const [, year, month, day] = match;
  return `${year}-${month}-${day}`;
}

/// A verification whose lines do not sum to zero is not a verification. The
/// file comes from outside, so this is reported with the offending id rather
/// than assumed impossible.
function assertBalanced(verification: ParsedVerification): void {
  const total = verification.transactions.reduce(
    (sum, line) => sum + line.amountOre,
    0,
  );

  if (total !== 0) {
    throw new SieFormatError(
      `Verification ${verification.series}${verification.number} does not balance: ${total} ore`,
    );
  }
}

/// Parses the records this project needs: the company, the chart of accounts
/// and the verifications. Other records are skipped rather than rejected,
/// because a real export carries many that say nothing about bookkeeping.
export function parseSie(text: string): ParsedSie {
  const accounts: ParsedAccount[] = [];
  const verifications: ParsedVerification[] = [];
  let companyName: string | null = null;
  let orgNumber: string | null = null;

  let current: ParsedVerification | null = null;
  let inBlock = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '') {
      continue;
    }

    if (line === '{') {
      if (!current) {
        throw new SieFormatError(
          'An entry block opened outside a verification',
        );
      }
      inBlock = true;
      continue;
    }

    if (line === '}') {
      if (!current) {
        throw new SieFormatError(
          'An entry block closed outside a verification',
        );
      }
      assertBalanced(current);
      verifications.push(current);
      current = null;
      inBlock = false;
      continue;
    }

    if (!line.startsWith('#')) {
      continue;
    }

    const [label, ...fields] = tokenizeLine(line);

    switch (label) {
      case '#FNAMN':
        companyName = fields[0] ?? null;
        break;

      case '#ORGNR':
        orgNumber = fields[0] ?? null;
        break;

      case '#KONTO':
        if (fields.length < 2) {
          throw new SieFormatError(`#KONTO needs a number and a name: ${line}`);
        }
        accounts.push({ number: fields[0], name: fields[1] });
        break;

      case '#VER': {
        if (fields.length < 3) {
          throw new SieFormatError(
            `#VER needs a series, a number and a date: ${line}`,
          );
        }
        current = {
          series: fields[0],
          number: fields[1],
          date: parseSieDate(fields[2]),
          text: fields[3] ?? '',
          transactions: [],
        };
        break;
      }

      case '#TRANS': {
        if (!current || !inBlock) {
          throw new SieFormatError(
            `#TRANS outside a verification block: ${line}`,
          );
        }
        if (fields.length < 3) {
          throw new SieFormatError(
            `#TRANS needs an account, an object list and an amount: ${line}`,
          );
        }
        const transaction: ParsedTransaction = {
          accountNumber: fields[0],
          amountOre: parseAmountToOre(fields[2]),
          text: fields[4] ?? null,
        };
        current.transactions.push(transaction);
        break;
      }

      default:
        break;
    }
  }

  if (current) {
    throw new SieFormatError(
      `Verification ${current.series}${current.number} was never closed with }`,
    );
  }

  return { companyName, orgNumber, accounts, verifications };
}

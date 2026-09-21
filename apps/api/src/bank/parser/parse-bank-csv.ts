import { createHash } from 'node:crypto';
import iconv from 'iconv-lite';
import { parseBankAmountToOre } from './amount.js';
import { BankFormatError } from './errors.js';

/// Swedish bank exports are CP1252, not UTF-8, and not the CP437 that SIE4
/// uses. Decoding one as the other corrupts every Swedish supplier name.
const BANK_ENCODING = 'win1252';

const DATE_COLUMN = 'Bokföringsdag';
const TEXT_COLUMN = 'Referens';
const AMOUNT_COLUMN = 'Insättning/Uttag';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface ParsedBankTransaction {
  readonly bookedOn: string;
  readonly text: string;
  readonly amountOre: number;
  /// Date, amount and text together. Re-uploading the same export must not
  /// create the same transaction twice.
  readonly hash: string;
}

function splitRow(line: string): string[] {
  return line.split(';').map((field) => field.trim().replace(/^"|"$/g, ''));
}

/// Columns are found by name rather than position, because bank exports differ
/// between banks and the same bank changes them between years.
function findHeader(lines: readonly string[]): {
  index: number;
  columns: string[];
} {
  for (const [index, line] of lines.entries()) {
    const columns = splitRow(line);
    if (columns.includes(TEXT_COLUMN) && columns.includes(AMOUNT_COLUMN)) {
      return { index, columns };
    }
  }

  throw new BankFormatError(
    `No header row with "${TEXT_COLUMN}" and "${AMOUNT_COLUMN}" columns was found`,
  );
}

export function parseBankCsv(contents: Buffer): ParsedBankTransaction[] {
  const lines = iconv.decode(contents, BANK_ENCODING).split(/\r?\n/);
  const header = findHeader(lines);

  const columnOf = (name: string): number => {
    const index = header.columns.indexOf(name);
    if (index === -1) {
      throw new BankFormatError(`The export has no "${name}" column`);
    }
    return index;
  };

  const dateAt = columnOf(DATE_COLUMN);
  const textAt = columnOf(TEXT_COLUMN);
  const amountAt = columnOf(AMOUNT_COLUMN);

  const transactions: ParsedBankTransaction[] = [];

  for (const line of lines.slice(header.index + 1)) {
    if (line.trim() === '') {
      continue;
    }

    const fields = splitRow(line);
    const bookedOn = fields[dateAt] ?? '';
    const text = fields[textAt] ?? '';
    const rawAmount = fields[amountAt] ?? '';

    // A trailing summary row has no date and no amount; a row that has one but
    // not the other is malformed and is reported rather than guessed at.
    if (bookedOn === '' && rawAmount === '') {
      continue;
    }
    if (!ISO_DATE.test(bookedOn)) {
      throw new BankFormatError(
        `Not an ISO date in the ${DATE_COLUMN} column: "${bookedOn}"`,
      );
    }

    const amountOre = parseBankAmountToOre(rawAmount);
    if (amountOre === 0) {
      continue;
    }

    transactions.push({
      bookedOn,
      text,
      amountOre,
      hash: createHash('sha256')
        .update(`${bookedOn}|${amountOre}|${text}`)
        .digest('hex'),
    });
  }

  return transactions;
}

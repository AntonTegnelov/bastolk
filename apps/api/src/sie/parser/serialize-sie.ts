import { formatOreAsAmount } from './amount.js';
import { SieFormatError } from './errors.js';

export interface ExportAccount {
  readonly number: string;
  readonly name: string;
}

export interface ExportLine {
  readonly accountNumber: string;
  readonly amountOre: number;
}

export interface ExportVerification {
  readonly series: string;
  readonly number: string;
  /// ISO date, YYYY-MM-DD.
  readonly date: string;
  readonly text: string;
  readonly lines: readonly ExportLine[];
}

export interface ExportInput {
  readonly companyName: string;
  readonly orgNumber: string;
  readonly generatedOn: string;
  readonly accounts: readonly ExportAccount[];
  readonly verifications: readonly ExportVerification[];
}

function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function sieDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    throw new SieFormatError(`Not an ISO date: "${isoDate}"`);
  }

  return `${match[1]}${match[2]}${match[3]}`;
}

/// Writes SIE4 for the accounting system to import. Every verification is
/// checked before it is written: an export that does not balance would be
/// rejected by the receiving system at best, and accepted at worst.
export function serializeSie(input: ExportInput): string {
  const lines: string[] = [
    '#FLAGGA 0',
    `#PROGRAM ${quote('Bastolk')} 0.1`,
    '#FORMAT PC8',
    '#SIETYP 4',
    `#GEN ${sieDate(input.generatedOn)}`,
    `#FNAMN ${quote(input.companyName)}`,
    `#ORGNR ${input.orgNumber}`,
  ];

  for (const account of input.accounts) {
    lines.push(`#KONTO ${account.number} ${quote(account.name)}`);
  }

  for (const verification of input.verifications) {
    const total = verification.lines.reduce(
      (sum, line) => sum + line.amountOre,
      0,
    );
    if (total !== 0) {
      throw new SieFormatError(
        `Refusing to export verification ${verification.series}${verification.number}: it is ${total} ore out of balance`,
      );
    }
    if (verification.lines.length === 0) {
      throw new SieFormatError(
        `Refusing to export verification ${verification.series}${verification.number}: it has no lines`,
      );
    }

    lines.push(
      `#VER ${quote(verification.series)} ${quote(verification.number)} ${sieDate(verification.date)} ${quote(verification.text)}`,
      '{',
      ...verification.lines.map(
        (line) =>
          `   #TRANS ${line.accountNumber} {} ${formatOreAsAmount(line.amountOre)}`,
      ),
      '}',
    );
  }

  // CRLF, because SIE4 is a DOS-era format and some importers are strict.
  return `${lines.join('\r\n')}\r\n`;
}

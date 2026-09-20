import { VatTreatment } from '@prisma/client';

export interface GeneratedPair {
  readonly account: string;
  readonly vat: string;
  readonly texts: readonly string[];
}

export interface DatasetExample {
  readonly text: string;
  /// Signed as a bank statement shows it.
  readonly amountOre: number;
  readonly account: string;
  readonly vat: VatTreatment;
}

export interface DatasetStats {
  readonly rawTexts: number;
  readonly duplicatesDropped: number;
  /// Texts that appeared under more than one label. They are dropped rather
  /// than assigned to one, because a training set that contradicts itself
  /// teaches the model that the label is arbitrary.
  readonly ambiguousDropped: number;
  /// Texts with no learnable content, such as a bare reference number. Real
  /// statements contain them, but as training examples they teach guessing:
  /// the same shape carries a different label every time.
  readonly unlearnableDropped: number;
  readonly labels: number;
  readonly perLabel: Readonly<Record<string, number>>;
}

export interface BuiltDataset {
  readonly train: DatasetExample[];
  /// The slice early stopping runs on. Real data never drives a training
  /// decision, so the validation set is synthetic too.
  readonly validation: DatasetExample[];
  readonly stats: DatasetStats;
}

/// Plausible amount ranges in ore, by account. The generator writes texts; the
/// amounts are produced here, because inventing numbers is not a job for a
/// language model and a reproducible dataset must not depend on one.
const AMOUNT_RANGES: Record<string, readonly [number, number]> = {
  '1930': [50_000, 5_000_000],
  '2510': [100_000, 2_000_000],
  '2710': [50_000, 900_000],
  '2730': [50_000, 900_000],
  '3011': [500_000, 15_000_000],
  '5611': [30_000, 150_000],
  '5615': [200_000, 700_000],
  '5800': [15_000, 400_000],
  '5831': [80_000, 300_000],
  '6070': [20_000, 150_000],
  '6310': [100_000, 1_200_000],
  '6530': [200_000, 2_500_000],
  '7010': [1_500_000, 4_500_000],
};

const DEFAULT_RANGE: readonly [number, number] = [5_000, 500_000];

/// Digits, spaces and dashes only: a reference number with no vendor in it.
const UNLEARNABLE = /^[\d\s-]+$/;

/// Money comes in only for a revenue account; everything else is a payment.
const INCOMING_ACCOUNTS = new Set(['3011']);

/// FNV-1a. The amount has to be reproducible from the text alone, so the same
/// dataset is built twice identically and a diff means the texts changed.
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value;
}

function amountFor(text: string, account: string): number {
  const [low, high] = AMOUNT_RANGES[account] ?? DEFAULT_RANGE;
  // Rounded to whole kronor, as most real amounts on a statement are not, but
  // a spread of round and unround values is more realistic than either alone.
  const span = high - low;
  const raw = low + (hash(text) % span);
  const amount =
    hash(`${text}#round`) % 3 === 0 ? Math.round(raw / 100) * 100 : raw;

  return INCOMING_ACCOUNTS.has(account) ? amount : -amount;
}

function isVatTreatment(value: string): value is VatTreatment {
  return value in VatTreatment;
}

export interface BuildOptions {
  /// Share of each label held out for early stopping.
  readonly validationShare?: number;
}

export function buildDataset(
  pairs: readonly GeneratedPair[],
  options: BuildOptions = {},
): BuiltDataset {
  const validationShare = options.validationShare ?? 0.1;

  // First pass: find every label a text was written for.
  const labelsByText = new Map<string, Set<string>>();
  let rawTexts = 0;

  for (const pair of pairs) {
    if (!isVatTreatment(pair.vat)) {
      throw new Error(
        `Generated pair for account ${pair.account} has unknown VAT "${pair.vat}"`,
      );
    }
    for (const text of pair.texts) {
      const key = text.trim().toUpperCase();
      if (key === '') {
        continue;
      }
      rawTexts += 1;
      const labels = labelsByText.get(key) ?? new Set<string>();
      labels.add(`${pair.account}|${pair.vat}`);
      labelsByText.set(key, labels);
    }
  }

  const ambiguous = new Set(
    [...labelsByText.entries()]
      .filter(([, labels]) => labels.size > 1)
      .map(([key]) => key),
  );

  const byLabel = new Map<string, DatasetExample[]>();
  const taken = new Set<string>();
  let duplicatesDropped = 0;
  let ambiguousDropped = 0;
  let unlearnableDropped = 0;

  for (const pair of pairs) {
    const vat = pair.vat as VatTreatment;
    const label = `${pair.account}|${vat}`;

    for (const raw of pair.texts) {
      const text = raw.trim();
      const key = text.toUpperCase();
      if (key === '') {
        continue;
      }
      if (UNLEARNABLE.test(text)) {
        unlearnableDropped += 1;
        continue;
      }
      if (ambiguous.has(key)) {
        ambiguousDropped += 1;
        continue;
      }
      if (taken.has(key)) {
        duplicatesDropped += 1;
        continue;
      }

      taken.add(key);
      const examples = byLabel.get(label) ?? [];
      examples.push({
        text,
        amountOre: amountFor(text, pair.account),
        account: pair.account,
        vat,
      });
      byLabel.set(label, examples);
    }
  }

  // Stratified, so every label is represented in both halves and early
  // stopping is not driven by whichever labels happened to land there.
  const train: DatasetExample[] = [];
  const validation: DatasetExample[] = [];
  const perLabel: Record<string, number> = {};

  for (const [label, examples] of [...byLabel.entries()].sort()) {
    perLabel[label] = examples.length;
    const holdOut = Math.max(1, Math.round(examples.length * validationShare));

    examples.forEach((example, index) => {
      if (index < holdOut) {
        validation.push(example);
      } else {
        train.push(example);
      }
    });
  }

  return {
    train,
    validation,
    stats: {
      rawTexts,
      duplicatesDropped,
      ambiguousDropped,
      unlearnableDropped,
      labels: byLabel.size,
      perLabel,
    },
  };
}

/// One JSON object per line: what the trainer reads.
export function toJsonl(examples: readonly DatasetExample[]): string {
  return `${examples.map((example) => JSON.stringify(example)).join('\n')}\n`;
}

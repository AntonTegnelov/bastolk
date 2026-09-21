import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildDataset,
  toJsonl,
  type GeneratedPair,
} from './training/build-dataset.js';

/// Assembles the training file from generated texts. Kept out of the Python
/// trainer: the trainer receives files and returns files, and everything that
/// decides what goes into them is TypeScript.
const input = process.argv[2] ?? '../../data/generated/raw-texts.json';
const outputDir = process.argv[3] ?? '../../data/datasets';

const pairs = JSON.parse(readFileSync(input, 'utf8')) as GeneratedPair[];
const dataset = buildDataset(pairs);

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'train.jsonl'), toJsonl(dataset.train));
writeFileSync(join(outputDir, 'validation.jsonl'), toJsonl(dataset.validation));
writeFileSync(
  join(outputDir, 'stats.json'),
  `${JSON.stringify({ ...dataset.stats, train: dataset.train.length, validation: dataset.validation.length }, null, 2)}\n`,
);

console.log(
  [
    `raw texts:          ${dataset.stats.rawTexts}`,
    `duplicates dropped: ${dataset.stats.duplicatesDropped}`,
    `ambiguous dropped:  ${dataset.stats.ambiguousDropped}`,
    `labels:             ${dataset.stats.labels}`,
    `train:              ${dataset.train.length}`,
    `validation:         ${dataset.validation.length}`,
  ].join('\n'),
);

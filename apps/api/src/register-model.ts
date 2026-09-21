import { readFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ModelRegistryService } from './training/model-registry.service.js';

/// Registers a finished training run. This is what the queued training job
/// will call; until the queue exists, it is a command.
///
/// The version is registered without held-out metrics, because the trainer
/// only measures the synthetic validation slice. A version with no real
/// metrics cannot be promoted, and that is the gate working rather than a gap.
const metricsPath = process.argv[2];
const name = process.argv[3];

if (!metricsPath || !name) {
  console.error('usage: register-model <metrics.json> <version-name>');
  process.exit(2);
}

const report = JSON.parse(readFileSync(metricsPath, 'utf8')) as {
  baseModel: string;
  trainExamples: number;
  mergedDir: string;
  bothAccuracy: number;
  accountAccuracy: number;
  vatAccuracy: number;
  examples: number;
  unparsable: number;
};

const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['error'],
});
const registry = app.get(ModelRegistryService);

const version = await registry.register({
  name,
  baseModel: report.baseModel,
  datasetSize: report.trainExamples,
  filePath: report.mergedDir,
  metrics: null,
});

console.log(
  [
    `registered ${version.name} (${version.status})`,
    `  base model         ${report.baseModel}`,
    `  train examples     ${report.trainExamples}`,
    `  synthetic held-out ${report.examples} examples`,
    `    account          ${(report.accountAccuracy * 100).toFixed(1)}%`,
    `    VAT              ${(report.vatAccuracy * 100).toFixed(1)}%`,
    `    both             ${(report.bothAccuracy * 100).toFixed(1)}%`,
    `    unparsable       ${report.unparsable}`,
    '',
    'No real held-out metrics are stored, so the gate cannot promote this',
    'version. That needs real history imported and `POST /models/evaluate`.',
  ].join('\n'),
);

await app.close();
process.exit(0);

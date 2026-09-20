import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ExampleSource, Prisma, type VatTreatment } from '@prisma/client';
import { PrismaService } from '../common/prisma.service.js';
import { extractLabel } from '../rules/extract-label.js';
import type { ParsedVerification } from '../sie/parser/types.js';
import { EmbeddingService } from './embedding.service.js';

export interface ExampleToStore {
  readonly text: string;
  readonly amountOre: number;
  readonly accountNumber: string;
  readonly vatTreatment: VatTreatment;
  readonly source: ExampleSource;
  readonly occurredOn: Date;
}

/// The store the nearest-neighbour model searches. Embeddings live next to the
/// text they describe, so a correction becomes searchable the moment its row
/// is inserted and the model needs no training step.
@Injectable()
export class TrainingExamplesService {
  private readonly logger = new Logger(TrainingExamplesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
  ) {}

  /// Prisma has no vector type, so the column is written with raw SQL. That is
  /// expected rather than a workaround: it is the one place the ORM does not
  /// reach, and it is why pgvector needs no second data store.
  async store(
    companyId: string,
    examples: readonly ExampleToStore[],
  ): Promise<number> {
    if (examples.length === 0) {
      return 0;
    }

    const vectors = await this.embeddings.embed(
      examples.map((example) => example.text),
    );

    for (const [index, example] of examples.entries()) {
      const literal = `[${vectors[index].join(',')}]`;

      await this.prisma.$executeRaw`
        INSERT INTO training_example
          (id, company_id, text, amount_ore, account_number, vat_treatment, source, occurred_on, embedding)
        VALUES (
          ${randomUUID()},
          ${companyId},
          ${example.text},
          ${example.amountOre},
          ${example.accountNumber},
          ${Prisma.raw(`'${example.vatTreatment}'::vat_treatment`)},
          ${Prisma.raw(`'${example.source}'::example_source`)},
          ${example.occurredOn},
          ${literal}::vector
        )`;
    }

    return examples.length;
  }

  /// History becomes examples through the same label rules the metrics use, so
  /// a verification that is not the shape of a bank transaction is skipped in
  /// both places.
  async storeFromVerifications(
    companyId: string,
    verifications: readonly ParsedVerification[],
  ): Promise<number> {
    const examples: ExampleToStore[] = [];

    for (const verification of verifications) {
      const label = extractLabel(verification);
      if (!label) {
        continue;
      }

      examples.push({
        text: label.text,
        amountOre: label.amountOre,
        accountNumber: label.accountNumber,
        vatTreatment: label.vatTreatment,
        source: ExampleSource.HISTORY,
        occurredOn: new Date(label.date),
      });
    }

    const stored = await this.store(companyId, examples);
    this.logger.log(
      `Stored ${stored} examples from ${verifications.length} verifications (${verifications.length - stored} were not single-subject entries)`,
    );

    return stored;
  }
}

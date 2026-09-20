import { Injectable } from '@nestjs/common';
import type { Company, VatTreatment } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service.js';
import { EmbeddingService } from './embedding.service.js';
import type {
  NeighbourMatch,
  PredictOptions,
  Prediction,
  PredictionCandidate,
  Predictor,
  TransactionToPredict,
} from './predictor.interface.js';

const NEIGHBOURS = 10;

interface NeighbourRow {
  text: string;
  account_number: string;
  vat_treatment: VatTreatment;
  occurred_on: Date;
  similarity: number;
}

/// Knows what this company has done before. It learns from a correction
/// instantly, because a correction is just a new stored example, and it can
/// show the past entries it matched.
@Injectable()
export class KnnPredictor implements Predictor {
  readonly name = 'knn';

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
  ) {}

  async predict(
    company: Company,
    transaction: TransactionToPredict,
    options: PredictOptions = {},
  ): Promise<Prediction> {
    const vector = await this.embeddings.embedOne(transaction.text);
    const literal = `[${vector.join(',')}]`;

    // pgvector's <=> is cosine distance, so similarity is one minus it.
    const rows = await this.prisma.$queryRaw<NeighbourRow[]>`
      SELECT text, account_number, vat_treatment, occurred_on,
             1 - (embedding <=> ${literal}::vector) AS similarity
      FROM training_example
      WHERE company_id = ${company.id}
        AND embedding IS NOT NULL
        ${options.onlyBefore ? Prisma.sql`AND occurred_on < ${options.onlyBefore}` : Prisma.empty}
      ORDER BY embedding <=> ${literal}::vector
      LIMIT ${NEIGHBOURS}`;

    if (rows.length === 0) {
      return {
        candidates: [],
        predictor: this.name,
        modelVersionId: null,
        evidence: {
          kind: 'none',
          reason: 'This company has no stored examples yet',
        },
      };
    }

    return {
      candidates: this.vote(rows),
      predictor: this.name,
      modelVersionId: null,
      evidence: { kind: 'neighbours', matches: rows.map(toMatch) },
    };
  }

  /// Confidence is the share of similarity-weighted votes the top answer won,
  /// so ten close neighbours that disagree score lower than three that agree.
  private vote(rows: readonly NeighbourRow[]): PredictionCandidate[] {
    const weights = new Map<
      string,
      { candidate: PredictionCandidate; weight: number }
    >();
    let total = 0;

    for (const row of rows) {
      // A negative cosine similarity is a vote against, not a small vote for.
      const weight = Math.max(row.similarity, 0);
      if (weight === 0) {
        continue;
      }

      const key = `${row.account_number}|${row.vat_treatment}`;
      const existing = weights.get(key);
      total += weight;

      if (existing) {
        existing.weight += weight;
      } else {
        weights.set(key, {
          candidate: {
            accountNumber: row.account_number,
            vatTreatment: row.vat_treatment,
            confidence: 0,
          },
          weight,
        });
      }
    }

    if (total === 0) {
      return [];
    }

    return [...weights.values()]
      .map((entry) => ({
        ...entry.candidate,
        confidence: entry.weight / total,
      }))
      .sort((a, b) => b.confidence - a.confidence);
  }
}

function toMatch(row: NeighbourRow): NeighbourMatch {
  return {
    text: row.text,
    accountNumber: row.account_number,
    vatTreatment: row.vat_treatment,
    similarity: row.similarity,
    occurredOn: row.occurred_on.toISOString().slice(0, 10),
  };
}

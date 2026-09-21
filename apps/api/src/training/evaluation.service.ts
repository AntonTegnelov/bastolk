import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Company } from '@prisma/client';
import { PrismaService } from '../common/prisma.service.js';
import {
  PREDICTOR,
  type Predictor,
} from '../predictors/predictor.interface.js';
import { KnnPredictor } from '../predictors/knn.predictor.js';
import { extractLabel } from '../rules/extract-label.js';
import type { ParsedVerification } from '../sie/parser/types.js';
import type { EvaluationMetrics } from './metrics.js';

/// The newest months are the final test set. They are scored rarely and never
/// used to tune anything.
const TEST_MONTHS = 3;

@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PREDICTOR) private readonly predictor: Predictor,
    private readonly knn: KnnPredictor,
  ) {}

  /// Scores a predictor on the held-out months of this company's real history.
  ///
  /// The predictor is given a date filter, so the nearest-neighbour model
  /// cannot see examples from the test months. Recurring suppliers appear
  /// dozens of times, so without that filter this would measure memorisation
  /// and report it as accuracy.
  async evaluate(
    company: Company,
    which: 'active' | 'knn' = 'active',
  ): Promise<EvaluationMetrics> {
    const newest = await this.prisma.verification.findFirst({
      where: { companyId: company.id },
      orderBy: { date: 'desc' },
      select: { date: true },
    });

    if (!newest) {
      throw new BadRequestException(
        'This company has no imported history to score against',
      );
    }

    const testFrom = new Date(newest.date);
    testFrom.setMonth(testFrom.getMonth() - TEST_MONTHS);

    const verifications = await this.prisma.verification.findMany({
      where: { companyId: company.id, date: { gte: testFrom } },
      include: { lines: true },
      orderBy: { date: 'asc' },
    });

    const labelled = verifications
      .map((verification) => extractLabel(toParsed(verification)))
      .filter((label): label is NonNullable<typeof label> => label !== null);

    if (labelled.length === 0) {
      throw new BadRequestException(
        `No usable examples in the held-out months from ${iso(testFrom)}. ` +
          'Only verifications with exactly one non-bank, non-VAT line can be scored.',
      );
    }

    const model = which === 'knn' ? this.knn : this.predictor;
    let accountRight = 0;
    let vatRight = 0;
    let bothRight = 0;

    for (const label of labelled) {
      const prediction = await model.predict(
        company,
        {
          text: label.text,
          amountOre: label.amountOre,
          bookedOn: new Date(label.date),
        },
        { onlyBefore: testFrom },
      );

      const [best] = prediction.candidates;
      const accountOk = best?.accountNumber === label.accountNumber;
      const vatOk = best?.vatTreatment === label.vatTreatment;

      if (accountOk) accountRight += 1;
      if (vatOk) vatRight += 1;
      if (accountOk && vatOk) bothRight += 1;
    }

    const metrics: EvaluationMetrics = {
      examples: labelled.length,
      accountAccuracy: accountRight / labelled.length,
      vatAccuracy: vatRight / labelled.length,
      bothAccuracy: bothRight / labelled.length,
      testFrom: iso(testFrom),
      testTo: iso(newest.date),
      predictor: which === 'knn' ? 'knn' : 'active',
      // Filled in by the training job from the trainer's own report. The
      // baseline has no synthetic validation slice, so it stays null.
      syntheticAccuracy: null,
    };

    this.logger.log(
      `Scored ${which} on ${labelled.length} held-out examples from ${metrics.testFrom}: ` +
        `account ${(metrics.accountAccuracy * 100).toFixed(1)}%, both ${(metrics.bothAccuracy * 100).toFixed(1)}%`,
    );

    return metrics;
  }
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toParsed(verification: {
  series: string;
  number: string;
  date: Date;
  text: string;
  lines: { accountNumber: string; amountOre: number; text: string | null }[];
}): ParsedVerification {
  return {
    series: verification.series,
    number: verification.number,
    date: iso(verification.date),
    text: verification.text,
    transactions: verification.lines.map((line) => ({
      accountNumber: line.accountNumber,
      amountOre: line.amountOre,
      text: line.text,
    })),
  };
}

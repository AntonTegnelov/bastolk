import { Injectable, Logger } from '@nestjs/common';
import type { Company } from '@prisma/client';
import { PrismaService } from '../common/prisma.service.js';
import { KnnPredictor } from './knn.predictor.js';
import { LlmPredictor } from './llm.predictor.js';
import type {
  PredictOptions,
  Prediction,
  Predictor,
  TransactionToPredict,
} from './predictor.interface.js';

export interface CompositeSettings {
  /// Above this, a stored example is close enough that the company's own
  /// history should decide. Configuration rather than code, which is what
  /// makes a side-by-side comparison of the two models a one-line change.
  readonly knnConfidenceThreshold: number;
}

@Injectable()
export class CompositePredictor implements Predictor {
  readonly name = 'composite';
  private readonly logger = new Logger(CompositePredictor.name);

  constructor(
    private readonly knn: KnnPredictor,
    private readonly llm: LlmPredictor,
    private readonly prisma: PrismaService,
    private readonly settings: CompositeSettings,
  ) {}

  /// Nearest-neighbour answers first: a supplier this company has booked
  /// before should be booked the same way again. Otherwise the LLM is asked,
  /// and its answer is only used if it names an account the company actually
  /// has.
  async predict(
    company: Company,
    transaction: TransactionToPredict,
    options: PredictOptions = {},
  ): Promise<Prediction> {
    const fromKnn = await this.knn.predict(company, transaction, options);
    const best = fromKnn.candidates[0];

    if (best && best.confidence >= this.settings.knnConfidenceThreshold) {
      return fromKnn;
    }

    const fromLlm = await this.llm.predict(company, transaction, options);
    const proposed = fromLlm.candidates[0];

    if (!proposed) {
      return fromKnn;
    }

    if (!(await this.accountExists(company, proposed.accountNumber))) {
      // An account the company does not have is a hallucination, not a
      // suggestion. It is never stored as a candidate.
      this.logger.warn(
        `Model proposed account ${proposed.accountNumber}, which is not in this chart`,
      );
      return fromKnn;
    }

    return fromLlm;
  }

  private async accountExists(
    company: Company,
    accountNumber: string,
  ): Promise<boolean> {
    const account = await this.prisma.account.findUnique({
      where: {
        companyId_number: { companyId: company.id, number: accountNumber },
      },
      select: { id: true },
    });

    return account !== null;
  }
}

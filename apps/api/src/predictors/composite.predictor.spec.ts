import { Test } from '@nestjs/testing';
import { VatTreatment, type Company } from '@prisma/client';
import { PrismaService } from '../common/prisma.service.js';
import {
  CompositePredictor,
  type CompositeSettings,
} from './composite.predictor.js';
import { KnnPredictor } from './knn.predictor.js';
import { LlmPredictor } from './llm.predictor.js';
import type {
  Prediction,
  TransactionToPredict,
} from './predictor.interface.js';

const company: Company = {
  id: 'company-1',
  name: 'Exempelbolaget AB',
  orgNumber: '556677-8899',
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

const transaction: TransactionToPredict = {
  text: 'MOLNTJANST AB',
  amountOre: -125000,
  bookedOn: new Date('2026-09-17'),
};

function answer(
  predictor: string,
  accountNumber: string | null,
  confidence = 1,
): Prediction {
  return {
    candidates: accountNumber
      ? [{ accountNumber, vatTreatment: VatTreatment.DOMESTIC_25, confidence }]
      : [],
    predictor,
    modelVersionId: null,
    evidence: accountNumber
      ? { kind: 'model', modelName: 'stub' }
      : { kind: 'none', reason: 'stub has nothing' },
  };
}

/// Both models are handed in through the testing module, which is the same
/// seam CI uses to run without a GPU.
async function compositeWith(options: {
  knn: Prediction;
  llm: Prediction;
  chartHas: string[];
  threshold?: number;
}): Promise<CompositePredictor> {
  const settings: CompositeSettings = {
    knnConfidenceThreshold: options.threshold ?? 0.6,
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      {
        provide: KnnPredictor,
        useValue: { name: 'knn', predict: async () => options.knn },
      },
      {
        provide: LlmPredictor,
        useValue: { name: 'llm', predict: async () => options.llm },
      },
      {
        provide: PrismaService,
        useValue: {
          account: {
            findUnique: async ({
              where,
            }: {
              where: { companyId_number: { number: string } };
            }) =>
              options.chartHas.includes(where.companyId_number.number)
                ? { id: 'a' }
                : null,
          },
        },
      },
      {
        provide: CompositePredictor,
        inject: [KnnPredictor, LlmPredictor, PrismaService],
        useFactory: (
          knn: KnnPredictor,
          llm: LlmPredictor,
          prisma: PrismaService,
        ) => new CompositePredictor(knn, llm, prisma, settings),
      },
    ],
  }).compile();

  return moduleRef.get(CompositePredictor);
}

describe('CompositePredictor', () => {
  it('takes the company own history when the match is close enough', async () => {
    const composite = await compositeWith({
      knn: answer('knn', '5420', 0.9),
      llm: answer('llm', '4535'),
      chartHas: ['5420', '4535'],
    });

    const prediction = await composite.predict(company, transaction);

    expect(prediction.predictor).toBe('knn');
    expect(prediction.candidates[0].accountNumber).toBe('5420');
  });

  it('asks the model when history is not confident enough', async () => {
    const composite = await compositeWith({
      knn: answer('knn', '5420', 0.2),
      llm: answer('llm', '4535'),
      chartHas: ['5420', '4535'],
    });

    const prediction = await composite.predict(company, transaction);

    expect(prediction.predictor).toBe('llm');
    expect(prediction.candidates[0].accountNumber).toBe('4535');
  });

  // An account the company does not have is a hallucination, not a
  // suggestion, whichever model produced it.
  it('discards a model answer naming an account outside the chart', async () => {
    const composite = await compositeWith({
      knn: answer('knn', '5420', 0.2),
      llm: answer('llm', '9999'),
      chartHas: ['5420'],
    });

    const prediction = await composite.predict(company, transaction);

    expect(prediction.predictor).toBe('knn');
    expect(prediction.candidates[0].accountNumber).toBe('5420');
  });

  // While training holds the GPU the model is legitimately absent, and
  // suggestions must keep coming.
  it('falls back to history when the model has no answer', async () => {
    const composite = await compositeWith({
      knn: answer('knn', '5420', 0.2),
      llm: answer('llm', null),
      chartHas: ['5420'],
    });

    const prediction = await composite.predict(company, transaction);

    expect(prediction.predictor).toBe('knn');
  });

  it('returns nothing when neither model has anything, rather than guessing', async () => {
    const composite = await compositeWith({
      knn: answer('knn', null),
      llm: answer('llm', null),
      chartHas: ['5420'],
    });

    const prediction = await composite.predict(company, transaction);

    expect(prediction.candidates).toEqual([]);
  });

  // The threshold is configuration, which is what makes a side-by-side
  // comparison of the two models a one-line change rather than a code change.
  it('follows the configured threshold', async () => {
    const composite = await compositeWith({
      knn: answer('knn', '5420', 0.5),
      llm: answer('llm', '4535'),
      chartHas: ['5420', '4535'],
      threshold: 0.4,
    });

    const prediction = await composite.predict(company, transaction);

    expect(prediction.predictor).toBe('knn');
  });
});

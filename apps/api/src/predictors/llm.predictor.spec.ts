import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ModelStatus, VatTreatment, type Company } from '@prisma/client';
import { PrismaService } from '../common/prisma.service.js';
import { LlmPredictor } from './llm.predictor.js';

const company: Company = {
  id: 'company-1',
  name: 'Exempelbolaget AB',
  orgNumber: '556677-8899',
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

const transaction = {
  text: 'MOLNTJANST AB',
  amountOre: -125000,
  bookedOn: new Date('2026-09-17'),
};

const activeVersion = {
  id: 'version-1',
  name: 'bastolk-v1',
  status: ModelStatus.ACTIVE,
};

async function predictorWith(options: {
  active: unknown;
  respond?: () => Promise<Response>;
}): Promise<LlmPredictor> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      LlmPredictor,
      {
        provide: PrismaService,
        useValue: { modelVersion: { findFirst: async () => options.active } },
      },
      {
        provide: ConfigService,
        useValue: { getOrThrow: () => 'http://model-server' },
      },
    ],
  }).compile();

  if (options.respond) {
    vi.stubGlobal('fetch', options.respond);
  }

  return moduleRef.get(LlmPredictor);
}

function jsonReply(body: unknown, ok = true): () => Promise<Response> {
  return async () =>
    ({
      ok,
      status: ok ? 200 : 500,
      json: async () => body,
    }) as unknown as Response;
}

describe('LlmPredictor', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports itself unavailable when no version is active', async () => {
    const predictor = await predictorWith({ active: null });

    const prediction = await predictor.predict(company, transaction);

    expect(prediction.candidates).toEqual([]);
    expect(prediction.evidence).toEqual({
      kind: 'none',
      reason: 'No model version is active',
    });
  });

  it('returns the account and VAT treatment the model answered', async () => {
    const predictor = await predictorWith({
      active: activeVersion,
      respond: jsonReply({
        message: { content: '{"account":"5420","vat":"DOMESTIC_25"}' },
        logprobs: [{ token: '5420', logprob: Math.log(0.8) }],
      }),
    });

    const prediction = await predictor.predict(company, transaction);

    expect(prediction.candidates[0].accountNumber).toBe('5420');
    expect(prediction.candidates[0].vatTreatment).toBe(
      VatTreatment.DOMESTIC_25,
    );
    expect(prediction.candidates[0].confidence).toBeCloseTo(0.8, 5);
    expect(prediction.modelVersionId).toBe('version-1');
  });

  // Confidence is built on log-probabilities. A build that returns none gets
  // zero rather than a number made up to look like a measurement.
  it('reports zero confidence rather than inventing one when there are no log-probabilities', async () => {
    const predictor = await predictorWith({
      active: activeVersion,
      respond: jsonReply({
        message: { content: '{"account":"5420","vat":"NONE"}' },
      }),
    });

    const prediction = await predictor.predict(company, transaction);

    expect(prediction.candidates[0].confidence).toBe(0);
  });

  // Model output is input from outside the system. Each of these would
  // otherwise travel into a suggestion and in front of a person.
  it.each([
    [
      'a VAT treatment that does not exist',
      '{"account":"5420","vat":"DOMESTIC_99"}',
    ],
    ['a missing account', '{"vat":"NONE"}'],
    ['an account that is not a string', '{"account":5420,"vat":"NONE"}'],
    ['text that is not JSON at all', 'konto 5420 tack'],
  ])('refuses %s', async (_case, content) => {
    const predictor = await predictorWith({
      active: activeVersion,
      respond: jsonReply({ message: { content } }),
    });

    const prediction = await predictor.predict(company, transaction);

    expect(prediction.candidates).toEqual([]);
    expect(prediction.evidence.kind).toBe('none');
  });

  it('treats an unreachable model server as unavailable, not as an error', async () => {
    const predictor = await predictorWith({
      active: activeVersion,
      respond: async () => {
        throw new Error('connect ECONNREFUSED');
      },
    });

    const prediction = await predictor.predict(company, transaction);

    expect(prediction.candidates).toEqual([]);
    expect(prediction.evidence).toMatchObject({ kind: 'none' });
  });
});

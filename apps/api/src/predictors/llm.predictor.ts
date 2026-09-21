import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModelStatus, VatTreatment, type Company } from '@prisma/client';
import { PrismaService } from '../common/prisma.service.js';
import type {
  PredictOptions,
  Prediction,
  Predictor,
  TransactionToPredict,
} from './predictor.interface.js';

interface OllamaLogprob {
  token: string;
  logprob: number;
}

interface OllamaChatResponse {
  message?: { content?: string };
  logprobs?: OllamaLogprob[];
}

/// The answer schema. Constraining the output at serving time removes a whole
/// class of parsing failures; the account number is still checked against the
/// company's chart afterwards, because a valid shape is not a valid account.
const ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    account: { type: 'string' },
    vat: { type: 'string', enum: Object.values(VatTreatment) },
  },
  required: ['account', 'vat'],
} as const;

/// Knows what suppliers generally are, for example that a cloud provider is an
/// IT cost from a foreign company. It knows nothing about this company.
@Injectable()
export class LlmPredictor implements Predictor {
  readonly name = 'llm';
  private readonly logger = new Logger(LlmPredictor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /// The date filter is a nearest-neighbour concern: this model holds no
  /// company examples to leak, so it takes the option and ignores it.
  async predict(
    _company: Company,
    transaction: TransactionToPredict,
    _options: PredictOptions = {},
  ): Promise<Prediction> {
    const active = await this.prisma.modelVersion.findFirst({
      where: { status: ModelStatus.ACTIVE },
    });

    if (!active) {
      return this.unavailable('No model version is active');
    }

    try {
      return await this.ask(active.id, active.name, transaction);
    } catch (error) {
      // The model server is an external system: while training holds the GPU
      // it is legitimately absent, and suggestions must keep coming from the
      // nearest-neighbour model.
      const reason = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Model server unavailable: ${reason}`);
      return this.unavailable(`Model server unavailable: ${reason}`);
    }
  }

  private async ask(
    modelVersionId: string,
    modelName: string,
    transaction: TransactionToPredict,
  ): Promise<Prediction> {
    const base = this.config.getOrThrow<string>('OLLAMA_URL');
    const direction = transaction.amountOre < 0 ? 'ut' : 'in';
    const amount = (Math.abs(transaction.amountOre) / 100).toFixed(2);

    const response = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: modelName,
        stream: false,
        format: ANSWER_SCHEMA,
        logprobs: true,
        messages: [
          {
            role: 'user',
            content: `Text: ${transaction.text}\nBelopp: ${amount} SEK\nRiktning: ${direction}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`Ollama answered ${response.status}`);
    }

    const body = (await response.json()) as OllamaChatResponse;
    const content = body.message?.content;
    if (!content) {
      throw new Error('Ollama returned no message content');
    }

    const answer = JSON.parse(content) as { account?: unknown; vat?: unknown };
    if (typeof answer.account !== 'string' || typeof answer.vat !== 'string') {
      throw new Error(`Model answer had the wrong shape: ${content}`);
    }
    if (!(answer.vat in VatTreatment)) {
      throw new Error(
        `Model answered with an unknown VAT treatment: ${answer.vat}`,
      );
    }

    return {
      candidates: [
        {
          accountNumber: answer.account,
          vatTreatment: answer.vat as VatTreatment,
          confidence: confidenceFromLogprobs(body.logprobs, answer.account),
        },
      ],
      predictor: this.name,
      modelVersionId,
      evidence: { kind: 'model', modelName },
    };
  }

  private unavailable(reason: string): Prediction {
    return {
      candidates: [],
      predictor: this.name,
      modelVersionId: null,
      evidence: { kind: 'none', reason },
    };
  }
}

/// Confidence is the product of the probabilities of the account-number
/// tokens. Ollama's OpenAI-compatible endpoint drops log-probabilities, which
/// is why the native chat endpoint is the one called. When a build returns
/// none, the answer is reported with zero confidence rather than a fabricated
/// number: an uncalibrated score presented as a real one is worse than none.
function confidenceFromLogprobs(
  logprobs: OllamaLogprob[] | undefined,
  account: string,
): number {
  if (!logprobs || logprobs.length === 0) {
    return 0;
  }

  const digits = logprobs.filter((entry) =>
    account.includes(entry.token.trim()),
  );
  if (digits.length === 0) {
    return 0;
  }

  return digits.reduce(
    (product, entry) => product * Math.exp(entry.logprob),
    1,
  );
}

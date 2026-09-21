import type { Company, VatTreatment } from '@prisma/client';

/// The injection token. The interface itself cannot be one: interfaces do not
/// exist at runtime, so there is no type for Nest to resolve. Everything
/// downstream asks for PREDICTOR and never learns which implementation it got.
export const PREDICTOR = 'PREDICTOR';

export interface TransactionToPredict {
  readonly text: string;
  /// Signed as the bank statement shows it.
  readonly amountOre: number;
  readonly bookedOn: Date;
}

export interface PredictionCandidate {
  readonly accountNumber: string;
  readonly vatTreatment: VatTreatment;
  /// Between 0 and 1. The scales of the two models are not comparable raw,
  /// which is why the review screen shows a calibrated hit rate instead.
  readonly confidence: number;
}

export interface NeighbourMatch {
  readonly text: string;
  readonly accountNumber: string;
  readonly vatTreatment: VatTreatment;
  readonly similarity: number;
  readonly occurredOn: string;
}

/// What the user is shown to justify a suggestion. Past entries are real
/// evidence; a model name is an admission that there is none to show.
export type PredictionEvidence =
  | { readonly kind: 'neighbours'; readonly matches: NeighbourMatch[] }
  | { readonly kind: 'model'; readonly modelName: string }
  | { readonly kind: 'none'; readonly reason: string };

export interface Prediction {
  readonly candidates: PredictionCandidate[];
  /// Which implementation answered, recorded so the two can be compared.
  readonly predictor: string;
  readonly modelVersionId: string | null;
  readonly evidence: PredictionEvidence;
}

export interface PredictOptions {
  /// Ignore examples dated on or after this. Evaluation sets it to the start
  /// of the held-out months so the model cannot look up its own test answers;
  /// recurring suppliers appear dozens of times, so without it the baseline
  /// measures memorisation.
  readonly onlyBefore?: Date;
}

export interface Predictor {
  predict(
    company: Company,
    transaction: TransactionToPredict,
    options?: PredictOptions,
  ): Promise<Prediction>;
}

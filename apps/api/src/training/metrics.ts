/// What a model version was scored on. Stored with the version so the gate
/// compares like with like: a figure from a different dataset version or a
/// different split is not comparable and must never be written here.
export interface EvaluationMetrics {
  /// How many labelled examples the figures are based on. Reported beside
  /// every figure, because with a few hundred entries a difference of a few
  /// points is noise.
  readonly examples: number;
  readonly accountAccuracy: number;
  readonly vatAccuracy: number;
  /// Both right at once, which is what actually produces a correct entry.
  readonly bothAccuracy: number;
  /// Inclusive start of the held-out months, ISO date.
  readonly testFrom: string;
  readonly testTo: string;
  /// Which predictor produced these figures.
  readonly predictor: string;
  /// Accuracy on the synthetic validation slice, when the version was trained
  /// on one. The gap between this and the real figure is the finding, so one
  /// is never presented without the other.
  readonly syntheticAccuracy: number | null;
}

export type PromotionVerdict =
  | { readonly promote: true; readonly reason: string }
  | { readonly promote: false; readonly reason: string };

/// A version is promoted only if it is no worse than the active one on the
/// same split. This is a gate that reads stored numbers, not a judgement call,
/// because retraining on a handful of corrections can easily make a small
/// model worse and nobody would notice.
export function decidePromotion(
  candidate: EvaluationMetrics,
  active: EvaluationMetrics | null,
): PromotionVerdict {
  if (!active) {
    return {
      promote: true,
      reason: 'No version is active, so this one becomes the baseline',
    };
  }

  if (
    candidate.testFrom !== active.testFrom ||
    candidate.testTo !== active.testTo
  ) {
    return {
      promote: false,
      reason:
        `Scored on ${candidate.testFrom} to ${candidate.testTo}, but the active version was ` +
        `scored on ${active.testFrom} to ${active.testTo}. Those numbers are not comparable.`,
    };
  }

  if (candidate.bothAccuracy < active.bothAccuracy) {
    return {
      promote: false,
      reason:
        `${percent(candidate.bothAccuracy)} against the active version's ` +
        `${percent(active.bothAccuracy)} on ${active.examples} held-out examples`,
    };
  }

  return {
    promote: true,
    reason:
      `${percent(candidate.bothAccuracy)} against the active version's ` +
      `${percent(active.bothAccuracy)} on ${active.examples} held-out examples`,
  };
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

import { decidePromotion, type EvaluationMetrics } from './metrics.js';

const base: EvaluationMetrics = {
  examples: 120,
  accountAccuracy: 0.7,
  vatAccuracy: 0.8,
  bothAccuracy: 0.65,
  testFrom: '2026-06-01',
  testTo: '2026-09-01',
  predictor: 'llm',
  syntheticAccuracy: 0.91,
};

describe('decidePromotion', () => {
  it('promotes the first version, since there is nothing to beat', () => {
    expect(decidePromotion(base, null).promote).toBe(true);
  });

  it('promotes a version that ties the active one', () => {
    expect(decidePromotion(base, base).promote).toBe(true);
  });

  it('refuses a version that scores worse', () => {
    const worse = { ...base, bothAccuracy: 0.64 };

    expect(decidePromotion(worse, base).promote).toBe(false);
  });

  // A metric from a different split is not a comparison, and a gate that
  // accepted one would look like control while providing none.
  it('refuses to compare figures from different held-out months', () => {
    const otherSplit = { ...base, bothAccuracy: 0.99, testFrom: '2026-01-01' };
    const verdict = decidePromotion(otherSplit, base);

    expect(verdict.promote).toBe(false);
    expect(verdict.reason).toContain('not comparable');
  });
});

import { useState } from 'react';
import type { EvaluationMetrics, PromotionVerdict } from '../api/types.js';
import { useEvaluate, useModels, usePromote } from '../hooks.js';

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function MetricsTable({ metrics }: { metrics: EvaluationMetrics }) {
  return (
    <table className="lines">
      <tbody>
        <tr>
          <td>Account and VAT both right</td>
          <td className="mono right">{percent(metrics.bothAccuracy)}</td>
        </tr>
        <tr>
          <td>Account right</td>
          <td className="mono right">{percent(metrics.accountAccuracy)}</td>
        </tr>
        <tr>
          <td>VAT right</td>
          <td className="mono right">{percent(metrics.vatAccuracy)}</td>
        </tr>
        <tr>
          {/* Reported beside every figure: with a few hundred entries a
              difference of a few points is noise, not an improvement. */}
          <td>Held-out examples</td>
          <td className="mono right">{metrics.examples}</td>
        </tr>
        <tr>
          <td>Test months</td>
          <td className="mono right">
            {metrics.testFrom} to {metrics.testTo}
          </td>
        </tr>
        <tr>
          <td>Synthetic validation</td>
          <td className="mono right">
            {metrics.syntheticAccuracy === null
              ? '—'
              : percent(metrics.syntheticAccuracy)}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export function ModelsPage({ companyId }: { companyId: string }) {
  const models = useModels(companyId);
  const evaluate = useEvaluate(companyId);
  const promote = usePromote(companyId);

  const [baseline, setBaseline] = useState<EvaluationMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<PromotionVerdict | null>(null);

  return (
    <div className="stack">
      <section className="card">
        <h3>Baseline</h3>
        <p className="muted">
          The nearest-neighbour model, scored on this company&apos;s newest
          three months. It cannot see examples from those months, so the figure
          is transfer rather than recall.
        </p>
        <button
          disabled={evaluate.isPending}
          onClick={async () => {
            setError(null);
            try {
              setBaseline(await evaluate.mutateAsync('knn'));
            } catch (e) {
              setError(
                e instanceof Error ? e.message : 'Could not score the baseline',
              );
            }
          }}
        >
          {evaluate.isPending ? 'Scoring…' : 'Score the baseline'}
        </button>
        {error && <p className="error">{error}</p>}
        {baseline && <MetricsTable metrics={baseline} />}
      </section>

      <section className="card">
        <h3>Model versions</h3>
        {models.data?.length === 0 && (
          <p className="muted">
            No model has been trained yet. Until one is, every suggestion comes
            from the baseline.
          </p>
        )}

        {verdict && (
          <p className={verdict.promote ? 'result' : 'error'}>
            {verdict.promote ? 'Promoted: ' : 'Refused: '}
            {verdict.reason}
          </p>
        )}

        {(models.data ?? []).map((version) => (
          <div key={version.id} className="card">
            <div className="toolbar">
              <strong className="mono">{version.name}</strong>
              <span
                className={`badge ${version.status === 'ACTIVE' ? 'high' : 'medium'}`}
              >
                {version.status}
              </span>
              <span className="muted">
                {version.baseModel}, {version.datasetSize} examples
              </span>
              {version.status !== 'ACTIVE' && (
                <button
                  disabled={promote.isPending}
                  onClick={async () => {
                    setVerdict(null);
                    const result = await promote.mutateAsync(version.id);
                    setVerdict(result.verdict);
                  }}
                >
                  Run the gate
                </button>
              )}
            </div>
            {version.metrics ? (
              <MetricsTable metrics={version.metrics} />
            ) : (
              <p className="muted">
                No stored metrics, so the gate has nothing to judge.
              </p>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}

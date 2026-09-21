import { useState } from 'react';
import { formatOre } from '../api/client.js';
import type { Evidence, SuggestionView, VatTreatment } from '../api/types.js';
import {
  useAccounts,
  useDecide,
  useGenerate,
  useSuggestions,
} from '../hooks.js';

const VAT_TREATMENTS: VatTreatment[] = [
  'DOMESTIC_25',
  'DOMESTIC_12',
  'DOMESTIC_6',
  'REVERSE_CHARGE_EU',
  'REVERSE_CHARGE_NON_EU',
  'NONE',
];

function EvidenceDetail({ evidence }: { evidence: Evidence }) {
  if (evidence.kind === 'neighbours') {
    return (
      <ul className="evidence">
        {evidence.matches.slice(0, 3).map((match, index) => (
          <li key={index}>
            <span className="mono">{match.accountNumber}</span> {match.text}
            <span className="muted">
              {' '}
              ({(match.similarity * 100).toFixed(0)}% alike, {match.occurredOn})
            </span>
          </li>
        ))}
      </ul>
    );
  }

  if (evidence.kind === 'model') {
    return (
      <p className="muted">
        Answered by model {evidence.modelName}. No past entry to show.
      </p>
    );
  }

  return <p className="muted">{evidence.reason}</p>;
}

function Row({
  row,
  companyId,
  accounts,
}: {
  row: SuggestionView;
  companyId: string;
  accounts: { number: string; name: string }[];
}) {
  const decide = useDecide(companyId);
  const [account, setAccount] = useState(row.suggestion?.accountNumber ?? '');
  const [vat, setVat] = useState<VatTreatment>(
    row.suggestion?.vatTreatment ?? 'NONE',
  );
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const changed =
    row.suggestion !== null &&
    (account !== row.suggestion.accountNumber ||
      vat !== row.suggestion.vatTreatment);

  // Confidence decides how much attention a row gets, never whether it is
  // exported. Every row still needs a person to press a button.
  const confidence = row.suggestion?.confidence ?? 0;
  const attention =
    confidence >= 0.8 ? 'high' : confidence >= 0.5 ? 'medium' : 'low';

  return (
    <>
      <tr className={row.decided ? 'decided' : ''}>
        <td className="mono">{row.bookedOn}</td>
        <td>{row.text}</td>
        <td className="mono right">{formatOre(row.amountOre)}</td>
        <td>
          {row.suggestion ? (
            <span className={`badge ${attention}`}>
              {(confidence * 100).toFixed(0)}%
            </span>
          ) : (
            <span className="badge low">none</span>
          )}
        </td>
        <td>
          <select
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            disabled={row.decided}
          >
            <option value="">Pick an account</option>
            {accounts.map((a) => (
              <option key={a.number} value={a.number}>
                {a.number} {a.name}
              </option>
            ))}
          </select>
        </td>
        <td>
          <select
            value={vat}
            onChange={(e) => setVat(e.target.value as VatTreatment)}
            disabled={row.decided}
          >
            {VAT_TREATMENTS.map((treatment) => (
              <option key={treatment} value={treatment}>
                {treatment}
              </option>
            ))}
          </select>
        </td>
        <td>
          {row.decided ? (
            <span className="muted">booked</span>
          ) : (
            <button
              disabled={account === '' || decide.isPending}
              onClick={async () => {
                setError(null);
                try {
                  await decide.mutateAsync({
                    transactionId: row.transactionId,
                    accountNumber: account,
                    vatTreatment: vat,
                  });
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : 'Could not record that decision',
                  );
                }
              }}
            >
              {changed ? 'Correct' : 'Approve'}
            </button>
          )}
        </td>
        <td>
          <button className="link" onClick={() => setOpen(!open)}>
            {open ? 'hide' : 'why'}
          </button>
        </td>
      </tr>
      {open && (
        <tr className="detail">
          <td colSpan={8}>
            {row.suggestion ? (
              <div className="detail-grid">
                <div>
                  <h4>Entry this would create</h4>
                  {row.suggestion.buildError && (
                    // A stored proposal that the rules module can no longer
                    // build. Saying so beats rendering an empty table.
                    <p className="error">
                      No entry can be built from this proposal:{' '}
                      {row.suggestion.buildError}
                    </p>
                  )}
                  <table className="lines">
                    <tbody>
                      {row.suggestion.lines.map((line, index) => (
                        <tr key={index}>
                          <td className="mono">{line.accountNumber}</td>
                          <td className="mono right">
                            {formatOre(line.amountOre)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <h4>Why ({row.suggestion.predictor})</h4>
                  <EvidenceDetail evidence={row.suggestion.evidence} />
                </div>
              </div>
            ) : (
              <p className="muted">No proposal for this transaction yet.</p>
            )}
          </td>
        </tr>
      )}
      {error && (
        <tr className="detail">
          <td colSpan={8}>
            <p className="error">{error}</p>
          </td>
        </tr>
      )}
    </>
  );
}

export function ReviewPage({ companyId }: { companyId: string }) {
  const suggestions = useSuggestions(companyId);
  const accounts = useAccounts(companyId);
  const generate = useGenerate(companyId);
  const [onlyPending, setOnlyPending] = useState(true);

  const rows = (suggestions.data ?? []).filter(
    (row) => !onlyPending || !row.decided,
  );
  const postable = (accounts.data ?? []).filter(
    (account) => account.role === 'OTHER',
  );

  return (
    <div className="stack">
      <div className="toolbar">
        <button onClick={() => generate.mutate()} disabled={generate.isPending}>
          {generate.isPending ? 'Proposing…' : 'Propose entries'}
        </button>
        <label>
          <input
            type="checkbox"
            checked={onlyPending}
            onChange={(e) => setOnlyPending(e.target.checked)}
          />
          Only undecided
        </label>
        {generate.data && (
          <span className="muted">
            {generate.data.suggested} proposed, {generate.data.withoutCandidate}{' '}
            with nothing to go on
          </span>
        )}
      </div>

      {suggestions.isLoading && <p className="muted">Loading…</p>}

      <table className="rows">
        <thead>
          <tr>
            <th>Date</th>
            <th>Text</th>
            <th className="right">Amount</th>
            <th>Confidence</th>
            <th>Account</th>
            <th>VAT</th>
            <th />
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Row
              key={row.transactionId}
              row={row}
              companyId={companyId}
              accounts={postable}
            />
          ))}
        </tbody>
      </table>

      {rows.length === 0 && !suggestions.isLoading && (
        <p className="muted">
          Nothing to review. Import a bank file, then propose entries.
        </p>
      )}
    </div>
  );
}

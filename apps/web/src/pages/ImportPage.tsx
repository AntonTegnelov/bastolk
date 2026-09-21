import { useRef, useState } from 'react';
import { useSummary, useUpload } from '../hooks.js';

interface Props {
  companyId: string;
}

function UploadCard({
  title,
  description,
  accept,
  path,
  companyId,
}: Props & {
  title: string;
  description: string;
  accept: string;
  path: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useUpload(companyId, path);
  const [result, setResult] = useState<string | null>(null);

  return (
    <section className="card">
      <h3>{title}</h3>
      <p className="muted">{description}</p>
      <input
        ref={input}
        type="file"
        accept={accept}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          setResult(null);
          try {
            const response = await upload.mutateAsync(file);
            setResult(
              Object.entries(response)
                .filter(([key]) => key !== 'importId')
                .map(([key, value]) => `${key}: ${String(value)}`)
                .join(', '),
            );
          } catch (error) {
            setResult(error instanceof Error ? error.message : 'Upload failed');
          } finally {
            if (input.current) input.current.value = '';
          }
        }}
      />
      {upload.isPending && <p className="muted">Working…</p>}
      {result && <p className="result">{result}</p>}
    </section>
  );
}

export function ImportPage({ companyId }: Props) {
  const summary = useSummary(companyId);

  return (
    <div className="stack">
      <UploadCard
        companyId={companyId}
        title="Bookkeeping history (SIE4)"
        description="The chart of accounts and past verifications. Supplies the examples the baseline model searches."
        accept=".se,.si,.sie"
        path="/sie/import"
      />
      <UploadCard
        companyId={companyId}
        title="Bank transactions (CSV)"
        description="The rows to be coded."
        accept=".csv"
        path="/bank/import"
      />

      {summary.data && (
        <section className="card">
          <h3>Imported</h3>
          <dl className="facts">
            <div>
              <dt>Accounts</dt>
              <dd>{summary.data.accounts}</dd>
            </div>
            <div>
              <dt>Verifications</dt>
              <dd>{summary.data.verifications}</dd>
            </div>
            <div>
              <dt>Imports</dt>
              <dd>{summary.data.imports}</dd>
            </div>
            <div>
              <dt>Period</dt>
              <dd>
                {summary.data.firstVerification ?? '—'} to{' '}
                {summary.data.lastVerification ?? '—'}
              </dd>
            </div>
          </dl>
        </section>
      )}
    </div>
  );
}

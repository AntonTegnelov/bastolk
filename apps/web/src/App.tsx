import { useEffect, useState } from 'react';
import { useCompanies, useCreateCompany, useHealth } from './hooks.js';
import { ImportPage } from './pages/ImportPage.js';
import { ReviewPage } from './pages/ReviewPage.js';

type Tab = 'review' | 'import';

const STORED_COMPANY = 'bastolk.companyId';

function CompanyPicker({
  companyId,
  onChange,
}: {
  companyId: string | null;
  onChange: (id: string) => void;
}) {
  const companies = useCompanies();
  const create = useCreateCompany();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [orgNumber, setOrgNumber] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (adding) {
    return (
      <form
        className="inline"
        onSubmit={async (event) => {
          event.preventDefault();
          setError(null);
          try {
            const company = await create.mutateAsync({ name, orgNumber });
            onChange(company.id);
            setAdding(false);
            setName('');
            setOrgNumber('');
          } catch (e) {
            setError(
              e instanceof Error ? e.message : 'Could not create that company',
            );
          }
        }}
      >
        <input
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          placeholder="556677-8899"
          value={orgNumber}
          onChange={(e) => setOrgNumber(e.target.value)}
          required
        />
        <button type="submit">Add</button>
        <button type="button" className="link" onClick={() => setAdding(false)}>
          cancel
        </button>
        {error && <span className="error">{error}</span>}
      </form>
    );
  }

  return (
    <div className="inline">
      <select
        value={companyId ?? ''}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Pick a company</option>
        {(companies.data ?? []).map((company) => (
          <option key={company.id} value={company.id}>
            {company.name}
          </option>
        ))}
      </select>
      <button className="link" onClick={() => setAdding(true)}>
        add company
      </button>
    </div>
  );
}

function HealthBadge() {
  const health = useHealth();

  if (!health.data) {
    return <span className="badge low">api unreachable</span>;
  }

  return (
    <span className="inline">
      <span className={`badge ${health.data.database ? 'high' : 'low'}`}>
        db {health.data.database ? 'ok' : 'down'}
      </span>
      {/* While training holds the GPU the model is legitimately absent and
          suggestions come from the baseline, so this is reported, not an error. */}
      <span className={`badge ${health.data.llm ? 'high' : 'medium'}`}>
        model {health.data.llm ? 'ready' : 'unavailable'}
      </span>
    </span>
  );
}

export default function App() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('review');

  useEffect(() => {
    const stored = localStorage.getItem(STORED_COMPANY);
    if (stored) {
      setCompanyId(stored);
    }
  }, []);

  const pick = (id: string) => {
    setCompanyId(id || null);
    if (id) {
      localStorage.setItem(STORED_COMPANY, id);
    } else {
      localStorage.removeItem(STORED_COMPANY);
    }
  };

  return (
    <div className="app">
      <header>
        <div>
          <h1>Bastolk</h1>
          <p className="muted">
            Every entry is proposed, never posted. A person approves each one.
          </p>
        </div>
        <div className="header-right">
          <CompanyPicker companyId={companyId} onChange={pick} />
          <HealthBadge />
        </div>
      </header>

      <nav>
        <button
          className={tab === 'review' ? 'active' : ''}
          onClick={() => setTab('review')}
        >
          Review
        </button>
        <button
          className={tab === 'import' ? 'active' : ''}
          onClick={() => setTab('import')}
        >
          Import
        </button>
      </nav>

      <main>
        {companyId === null ? (
          <p className="muted">Pick a company, or add one, to begin.</p>
        ) : tab === 'review' ? (
          <ReviewPage companyId={companyId} />
        ) : (
          <ImportPage companyId={companyId} />
        )}
      </main>
    </div>
  );
}

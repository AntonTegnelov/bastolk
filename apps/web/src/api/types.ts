import type { components, paths } from './schema.js';

export type Company = components['schemas']['CreateCompanyDto'] & {
  id: string;
};

export type Account = {
  id: string;
  number: string;
  name: string;
  role: 'BANK' | 'VAT' | 'OTHER';
};

export type VatTreatment =
  | 'DOMESTIC_25'
  | 'DOMESTIC_12'
  | 'DOMESTIC_6'
  | 'REVERSE_CHARGE_EU'
  | 'REVERSE_CHARGE_NON_EU'
  | 'NONE';

export interface JournalLine {
  accountNumber: string;
  amountOre: number;
}

export interface NeighbourMatch {
  text: string;
  accountNumber: string;
  vatTreatment: VatTreatment;
  similarity: number;
  occurredOn: string;
}

export type Evidence =
  | { kind: 'neighbours'; matches: NeighbourMatch[] }
  | { kind: 'model'; modelName: string }
  | { kind: 'none'; reason: string };

export interface SuggestionView {
  transactionId: string;
  bookedOn: string;
  text: string;
  amountOre: number;
  decided: boolean;
  suggestion: {
    id: string;
    predictor: string;
    confidence: number;
    accountNumber: string;
    vatTreatment: VatTreatment;
    evidence: Evidence;
    lines: JournalLine[];
    buildError: string | null;
  } | null;
}

export interface LedgerSummary {
  accounts: number;
  verifications: number;
  imports: number;
  firstVerification: string | null;
  lastVerification: string | null;
}

export interface Health {
  status: 'ok' | 'degraded';
  database: boolean;
  llm: boolean;
  modelServer: boolean;
  activeModel: string | null;
}

export type ApiPaths = paths;

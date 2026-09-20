export interface ParsedAccount {
  number: string;
  name: string;
}

export interface ParsedTransaction {
  accountNumber: string;
  amountOre: number;
  text: string | null;
}

export interface ParsedVerification {
  series: string;
  number: string;
  /// ISO date, YYYY-MM-DD.
  date: string;
  text: string;
  transactions: ParsedTransaction[];
}

export interface ParsedSie {
  companyName: string | null;
  orgNumber: string | null;
  accounts: ParsedAccount[];
  verifications: ParsedVerification[];
}

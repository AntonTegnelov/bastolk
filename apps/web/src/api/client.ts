const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  // Written out rather than as a constructor parameter property, because the
  // Vite template enables erasableSyntaxOnly.
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface RequestOptions {
  method?: string;
  companyId?: string | null;
  body?: unknown;
  formData?: FormData;
}

/// One place that talks to the API. The company header is added here, so no
/// screen can forget it and no screen has to remember it.
export async function api<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.companyId) {
    headers['x-company-id'] = options.companyId;
  }
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }

  const response = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body:
      options.formData ??
      (options.body === undefined ? undefined : JSON.stringify(options.body)),
  });

  if (!response.ok) {
    // The API maps internal failures to sanitised messages, so showing what it
    // returns is safe and far more useful than a generic failure.
    const detail = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      detail?.message ?? `Request failed (${response.status})`,
    );
  }

  return (await response.json()) as T;
}

/// Amounts are integer ore everywhere, including over the wire. They are
/// formatted for display here, at the edge, and nowhere else.
export function formatOre(ore: number): string {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
  }).format(ore / 100);
}

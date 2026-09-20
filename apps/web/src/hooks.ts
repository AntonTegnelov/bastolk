import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api/client.js';
import type {
  Account,
  Company,
  Health,
  LedgerSummary,
  SuggestionView,
  VatTreatment,
} from './api/types.js';

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => api<Health>('/health'),
    refetchInterval: 15_000,
  });
}

export function useCompanies() {
  return useQuery({
    queryKey: ['companies'],
    queryFn: () => api<Company[]>('/companies'),
  });
}

export function useCreateCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: { name: string; orgNumber: string }) =>
      api<Company>('/companies', { method: 'POST', body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['companies'] }),
  });
}

export function useSummary(companyId: string | null) {
  return useQuery({
    queryKey: ['summary', companyId],
    queryFn: () => api<LedgerSummary>('/ledger/summary', { companyId }),
    enabled: companyId !== null,
  });
}

export function useAccounts(companyId: string | null) {
  return useQuery({
    queryKey: ['accounts', companyId],
    queryFn: () => api<Account[]>('/ledger/accounts', { companyId }),
    enabled: companyId !== null,
  });
}

export function useSuggestions(companyId: string | null) {
  return useQuery({
    queryKey: ['suggestions', companyId],
    queryFn: () =>
      api<SuggestionView[]>('/suggestions?limit=500', { companyId }),
    enabled: companyId !== null,
  });
}

/// Approving a row changes the list and the counters, so both are invalidated
/// together rather than patched by hand on the client.
function invalidateReview(
  queryClient: ReturnType<typeof useQueryClient>,
  companyId: string | null,
) {
  void queryClient.invalidateQueries({ queryKey: ['suggestions', companyId] });
  void queryClient.invalidateQueries({ queryKey: ['summary', companyId] });
}

export function useUpload(companyId: string | null, path: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api<Record<string, unknown>>(path, {
        method: 'POST',
        companyId,
        formData,
      });
    },
    onSuccess: () => invalidateReview(queryClient, companyId),
  });
}

export function useGenerate(companyId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api<{ considered: number; suggested: number; withoutCandidate: number }>(
        '/suggestions/generate',
        { method: 'POST', companyId },
      ),
    onSuccess: () => invalidateReview(queryClient, companyId),
  });
}

export function useDecide(companyId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      transactionId: string;
      accountNumber: string;
      vatTreatment: VatTreatment;
    }) =>
      api(`/suggestions/${input.transactionId}/decide`, {
        method: 'POST',
        companyId,
        body: {
          accountNumber: input.accountNumber,
          vatTreatment: input.vatTreatment,
        },
      }),
    onSuccess: () => invalidateReview(queryClient, companyId),
  });
}

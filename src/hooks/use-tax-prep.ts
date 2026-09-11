'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { TaxPrepDocument, SafeHarborResult, FilingStrategyRecommendation } from '@/lib/types';

interface TaxPrepResponse {
  taxYear: number;
  documents: TaxPrepDocument[];
  safeHarborStatus: SafeHarborResult | null;
  filingStrategy: FilingStrategyRecommendation | null;
  estimatedRefund: number | null;
  priorYearTaxAmount: number | null;
}

export function useTaxPrep(taxYear?: number) {
  const queryClient = useQueryClient();
  const year = taxYear ?? 2026;

  const query = useQuery({
    queryKey: ['tax-prep', year],
    queryFn: async () => {
      const res = await fetch(`/api/tax-prep?year=${year}`);
      if (!res.ok) {
        throw new Error('Failed to fetch tax prep kit');
      }
      return res.json() as Promise<TaxPrepResponse>;
    },
    staleTime: 2 * 60 * 1000,
  });

  const addDocument = useMutation({
    mutationFn: async (doc: { taxYear: number; documentType: string; documentName: string; employerName?: string; notes?: string }) => {
      const res = await fetch('/api/tax-prep/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(doc),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to add document');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax-prep', year] });
      toast.success('Document added');
    },
  });

  const updateDocument = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; status?: string; receivedDate?: string; amount?: number; notes?: string }) => {
      const res = await fetch(`/api/tax-prep/documents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to update document');
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tax-prep', year] });
      if (variables.status) {
        const labels: Record<string, string> = { needed: 'needed', received: 'received', verified: 'verified' };
        toast.success(`Document marked as ${labels[variables.status] ?? variables.status}`);
      }
    },
  });

  const removeDocument = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/tax-prep/documents/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to delete document');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax-prep', year] });
      toast.success('Document removed');
    },
  });

  return {
    taxPrepKit: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    addDocument,
    updateDocument,
    removeDocument,
  };
}

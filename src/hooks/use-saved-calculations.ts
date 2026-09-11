'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SavedCalculation, SaveCalculationRequest } from '@/lib/types';

export function useSavedCalculations() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['saved-calculations'],
    queryFn: async () => {
      const response = await fetch('/api/saved-calculations');
      if (!response.ok) throw new Error('Failed to load saved calculations');
      const data = await response.json();

      // Map snake_case DB columns to camelCase TypeScript interface
      return (data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id,
        name: row.name,
        inputData: row.input_data,
        resultData: row.result_data,
        isDraft: row.is_draft,
        source: row.source,
        tags: row.tags ?? [],
        jobIds: row.job_ids ?? [],
        w2EntryIds: row.w2_entry_ids ?? [],
        snapshotIds: row.snapshot_ids ?? [],
        calculationBasis: row.calculation_basis,
        dataFreshnessDate: row.data_freshness_date,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })) as SavedCalculation[];
    },
    staleTime: 2 * 60 * 1000,
  });

  const save = useMutation({
    mutationFn: async (req: SaveCalculationRequest) => {
      const res = await fetch('/api/saved-calculations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to save calculation');
      }
      return res.json() as Promise<SavedCalculation>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-calculations'] });
    },
  });

  const deleteCalc = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/saved-calculations/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to delete calculation');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-calculations'] });
    },
  });

  return {
    calculations: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    save,
    deleteCalc,
  };
}

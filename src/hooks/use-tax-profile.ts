'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { TaxProfile } from '@/lib/types';

export function useTaxProfile(year: number) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['tax-profile', year],
    queryFn: async () => {
      const response = await fetch(`/api/tax-profile?year=${year}`);
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? 'Failed to load tax profile');
      return (json.data ?? null) as TaxProfile | null;
    },
    staleTime: 2 * 60 * 1000,
  });
  async function save(body: unknown) {
    const response = await fetch('/api/tax-profile', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error ?? 'Failed to save tax profile');
    return;
  }
  const onSuccess = () => { queryClient.invalidateQueries({ queryKey: ['tax-profile', year] }); };
  const updateProfile = useMutation({ mutationFn: (fields: Partial<TaxProfile>) => save({ ...fields, tax_year: year }), onSuccess });
  const importFromYear = useMutation({ mutationFn: (sourceYear: number) => save({ action: 'import', fromYear: sourceYear, toYear: year }), onSuccess });
  return {
    profile: query.data ?? null, isLoading: query.isLoading, error: query.error,
    updateProfile: updateProfile.mutateAsync, importFromYear: importFromYear.mutateAsync,
    isSaving: updateProfile.isPending, isImporting: importFromYear.isPending,
  };
}

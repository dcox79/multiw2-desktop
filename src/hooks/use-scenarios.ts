'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { TaxScenario, ScenarioModificationType, ScenarioModification } from '@/lib/types';

interface CreateScenarioInput {
  name: string;
  modificationType: ScenarioModificationType;
  modifications: ScenarioModification;
}

export function useScenarios() {
  const queryClient = useQueryClient();

  const { data: scenarios = [], isLoading } = useQuery<TaxScenario[]>({
    queryKey: ['scenarios'],
    queryFn: async () => {
      const res = await fetch('/api/scenarios');
      if (!res.ok) return [];
      const { data } = await res.json();
      return data ?? [];
    },
    staleTime: 2 * 60 * 1000,
  });

  const createScenario = useMutation({
    mutationFn: async (input: CreateScenarioInput) => {
      const res = await fetch('/api/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to create scenario');
      }
      const { data } = await res.json();
      return data as TaxScenario;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
      toast.success('Scenario created');
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const deleteScenario = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/scenarios/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
      toast.success('Scenario deleted');
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  return { scenarios, isLoading, createScenario, deleteScenario };
}

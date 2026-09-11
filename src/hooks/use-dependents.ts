'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Dependent } from '@/lib/types';

interface AddDependentInput {
  firstName: string;
  relationship: Dependent['relationship'];
  dateOfBirth: string;
  isFullTimeStudent?: boolean;
  isDisabled?: boolean;
}

interface UpdateDependentInput extends Partial<AddDependentInput> {
  id: string;
}

export function useDependents() {
  const queryClient = useQueryClient();

  const { data: dependents = [], isLoading, error } = useQuery<Dependent[]>({
    queryKey: ['dependents'],
    queryFn: async () => {
      const res = await fetch('/api/dependents');
      if (!res.ok) throw new Error('Failed to fetch dependents');
      const { data } = await res.json();
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const addMutation = useMutation({
    mutationFn: async (input: AddDependentInput) => {
      const res = await fetch('/api/dependents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add dependent');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dependents'] });
      toast.success('Dependent added');
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (input: UpdateDependentInput) => {
      const res = await fetch('/api/dependents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update dependent');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dependents'] });
      toast.success('Dependent updated');
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/dependents?id=${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to remove dependent');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dependents'] });
      toast.success('Dependent removed');
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  // Computed: CTC and ODC eligible counts
  const currentYear = new Date().getFullYear();
  const taxYearEnd = new Date(currentYear, 11, 31); // Dec 31

  const ctcRelationships = ['child', 'stepchild', 'foster_child', 'sibling'];

  const ctcEligible = dependents.filter((d) => {
    const dob = new Date(d.dateOfBirth);
    const ageAtYearEnd = (taxYearEnd.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    return ageAtYearEnd < 17 && ctcRelationships.includes(d.relationship);
  });

  const odcEligible = dependents.filter((d) => !ctcEligible.some((c) => c.id === d.id));

  return {
    dependents,
    isLoading,
    error,
    addDependent: addMutation.mutateAsync,
    updateDependent: updateMutation.mutateAsync,
    removeDependent: deleteMutation.mutateAsync,
    ctcEligibleCount: ctcEligible.length,
    odcEligibleCount: odcEligible.length,
    isAdding: addMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

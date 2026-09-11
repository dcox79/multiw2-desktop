'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { JobW2Entry } from '@/lib/types';

export function useW2Entries(jobId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['w2-entries', jobId],
    queryFn: async () => {
      const response = await fetch('/api/w2-entries' + (jobId ? '?job_id=' + encodeURIComponent(jobId) : ''));
      if (!response.ok) throw new Error('Failed to load w2-entries');
      return await response.json() as JobW2Entry[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const upsert = useMutation({
    mutationFn: async (entry: {
      job_id: string;
      tax_year: number;
      box1_wages: number;
      box2_federal_withheld: number;
      box3_ss_wages?: number;
      box5_medicare_wages?: number;
      box4_ss_withheld: number;
      box6_medicare_withheld: number;
      box12_code_d?: number;
      box12_code_aa?: number;
      box12_code_w?: number;
      box12_code_c?: number;
      box12_code_dd?: number;
      box12_code_v?: number;
      correction_note?: string;
    }) => {
      const res = await fetch('/api/w2-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to save W2 entry');
      }
      return res.json() as Promise<JobW2Entry>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['w2-entries'] });
    },
  });

  const deleteEntry = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/w2-entries/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to delete W2 entry');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['w2-entries'] });
    },
  });

  return {
    entries: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    upsert,
    deleteEntry,
  };
}

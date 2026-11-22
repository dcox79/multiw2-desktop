'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { YTDSnapshot } from '@/lib/types';

export function useYTDSnapshots(jobId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['ytd-snapshots', jobId],
    queryFn: async () => {
      const response = await fetch('/api/ytd-snapshots' + (jobId ? '?job_id=' + encodeURIComponent(jobId) : ''));
      if (!response.ok) throw new Error('Failed to load ytd-snapshots');
      return await response.json() as YTDSnapshot[];
    },
    staleTime: 2 * 60 * 1000,
  });

  const create = useMutation({
    mutationFn: async (snapshot: {
      job_id: string;
      paycheck_date: string;
      ytd_gross: number;
      ytd_federal_withheld: number;
      ytd_ss_withheld: number;
      ytd_medicare_withheld: number;
      ytd_traditional_401k?: number;
      ytd_roth_401k?: number;
      ytd_hsa?: number;
      notes?: string;
    }) => {
      const res = await fetch('/api/ytd-snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to create snapshot');
      }
      return res.json() as Promise<YTDSnapshot>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ytd-snapshots'] });
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, ...data }: {
      id: string;
      paycheck_date: string;
      ytd_gross: number;
      ytd_federal_withheld: number;
      ytd_ss_withheld: number;
      ytd_medicare_withheld: number;
      ytd_traditional_401k?: number;
      ytd_roth_401k?: number;
      ytd_hsa?: number;
      notes?: string;
    }) => {
      const res = await fetch(`/api/ytd-snapshots/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to update snapshot');
      }
      return res.json() as Promise<YTDSnapshot>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ytd-snapshots'] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/ytd-snapshots/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to delete snapshot');
      }
      return res.json() as Promise<{ deleted: true }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ytd-snapshots'] });
    },
  });

  return {
    snapshots: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    create,
    update,
    remove,
  };
}

export function useLatestSnapshots(taxYear?: number) {

  return useQuery({
    queryKey: ['ytd-snapshots', 'latest', taxYear],
    queryFn: async () => {
      const response = await fetch('/api/ytd-snapshots');
      if (!response.ok) throw new Error('Failed to load ytd-snapshots');
      const data = await response.json() as YTDSnapshot[];

      const latestByJob = new Map<string, YTDSnapshot>();
      for (const snapshot of (data ?? []) as YTDSnapshot[]) {
        if (taxYear != null && !snapshot.paycheck_date.startsWith(taxYear + '-')) continue;
        const previous = latestByJob.get(snapshot.job_id);
        if (!previous || snapshot.paycheck_date > previous.paycheck_date) {
          latestByJob.set(snapshot.job_id, snapshot);
        }
      }
      return latestByJob;
    },
    staleTime: 2 * 60 * 1000,
  });
}

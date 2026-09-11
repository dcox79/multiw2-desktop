'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { Job } from '@/lib/types';

export function useJobs(includeArchived = false) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['jobs', includeArchived],
    queryFn: async () => {
      const res = await fetch('/api/jobs' + (includeArchived ? '?include_archived=true' : ''));
      if (!res.ok) throw new Error('Failed to fetch jobs');
      return (await res.json()) as Job[];
    },
    staleTime: 2 * 60 * 1000,
  });

  const allJobs = useMemo(() => query.data ?? [], [query.data]);
  const activeJobs = useMemo(() => allJobs.filter((j) => j.employment_status === 'active'), [allJobs]);
  const formerJobs = useMemo(() => allJobs.filter((j) => j.employment_status === 'former'), [allJobs]);

  const createJob = useMutation({
    mutationFn: async (job: {
      name: string;
      annual_salary: number;
      income_source: 'w2' | 'paystub';
      pay_frequency: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';
      started_this_year: boolean;
      start_month?: number;
    }) => {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(job),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to create job');
      }
      return res.json() as Promise<Job>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
  });

  const updateJob = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Job> & { id: string }) => {
      const res = await fetch(`/api/jobs/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to update job');
      }
      return res.json() as Promise<Job>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
  });

  const deleteJob = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/jobs/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to delete job');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
  });

  return {
    jobs: allJobs,
    activeJobs,
    formerJobs,
    isLoading: query.isLoading,
    error: query.error,
    createJob,
    updateJob,
    deleteJob,
  };
}

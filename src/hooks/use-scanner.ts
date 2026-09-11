'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { JobScanResult } from '@/lib/types';

export function useScanner() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['scanner'],
    queryFn: async () => {
      const response = await fetch('/api/scanner');
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? 'Failed to load scanner history');
      return (json.data ?? []) as JobScanResult[];
    },
    staleTime: 2 * 60 * 1000,
  });
  const deleteScan = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/scanner/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete scan');
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['scanner'] }); toast.success('Scan deleted'); },
    onError: (err: Error) => toast.error(err.message),
  });
  return { history: query.data ?? [], isLoading: query.isLoading, error: query.error, deleteScan };
}

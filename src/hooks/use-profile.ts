'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Profile } from '@/lib/types';

export function useProfile() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const response = await fetch('/api/profile');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Failed to load local profile');
      return data.profile as Profile;
    },
    staleTime: 2 * 60 * 1000,
  });
  const update = useMutation({
    mutationFn: async (fields: Partial<Profile>) => {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Failed to save local profile');
      return data.profile as Profile;
    },
    onSuccess: (profile) => queryClient.setQueryData(['profile'], profile),
  });
  return { profile: query.data ?? null, isLoading: query.isLoading, error: query.error, update };
}

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { EmployerBenefitPlan, BenefitsOptimizationResult } from '@/lib/types';
import { useState } from 'react';
import { useProfile } from './use-profile';

interface AddPlanInput {
  jobId: string;
  jobName: string;
  matchType: 'percentage' | 'dollar';
  matchPercent?: number;
  matchCapPercent?: number;
  matchCapDollar?: number;
  employerHSAContribution?: number;
  hasMegaBackdoorRoth?: boolean;
  vestingSchedule?: string;
  healthPremiumMonthly?: number;
  dentalPremiumMonthly?: number;
  visionPremiumMonthly?: number;
  notes?: string;
}

export function useBenefits(activeOnly: boolean = true) {
  const queryClient = useQueryClient();
  const { profile } = useProfile();
  const [optimizationResult, setOptimizationResult] = useState<BenefitsOptimizationResult | null>(null);

  // Derive: prefer local mutation result, fall back to persisted profile result
  const effectiveResult = optimizationResult ?? profile?.last_optimization_result ?? null;

  const queryKey = ['benefits', activeOnly ? 'active' : 'all'];

  const { data: plans = [], isLoading, error } = useQuery<EmployerBenefitPlan[]>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (!activeOnly) params.set('active', 'false');

      const response = await fetch(`/api/benefits?${params}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch benefit plans');
      }
      const { data } = await response.json();
      return data;
    },
    staleTime: 2 * 60 * 1000,
  });

  const addPlanMutation = useMutation({
    mutationFn: async (input: AddPlanInput) => {
      const response = await fetch('/api/benefits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add benefit plan');
      }

      const { data } = await response.json();
      return data as EmployerBenefitPlan;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['benefits'] });
      toast.success('Benefit plan added');
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const updatePlanMutation = useMutation({
    mutationFn: async ({ id, ...input }: AddPlanInput & { id: string }) => {
      const response = await fetch('/api/benefits', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...input }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update benefit plan');
      }

      const { data } = await response.json();
      return data as EmployerBenefitPlan;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['benefits'] });
      toast.success('Benefit plan updated');
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const deactivatePlanMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch('/api/benefits', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, deactivate: true }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to deactivate plan');
      }

      const { data } = await response.json();
      return data as EmployerBenefitPlan;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['benefits'] });
      toast.success('Plan deactivated');
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const reactivatePlanMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch('/api/benefits', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, reactivate: true }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to reactivate plan');
      }

      const { data } = await response.json();
      return data as EmployerBenefitPlan;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['benefits'] });
      toast.success('Plan reactivated');
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const removePlanMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/benefits?id=${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete plan');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['benefits'] });
      toast.success('Plan deleted');
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const optimizeMutation = useMutation({
    mutationFn: async (salaries: Record<string, number>) => {
      const response = await fetch('/api/benefits/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ salaries }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to optimize');
      }

      const { data } = await response.json();
      return data as BenefitsOptimizationResult;
    },
    onSuccess: (data) => {
      setOptimizationResult(data);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  return {
    plans,
    isLoading,
    error: error ? (error as Error).message : null,
    addPlan: addPlanMutation.mutateAsync,
    updatePlan: updatePlanMutation.mutateAsync,
    deactivatePlan: deactivatePlanMutation.mutateAsync,
    reactivatePlan: reactivatePlanMutation.mutateAsync,
    removePlan: removePlanMutation.mutateAsync,
    optimize: optimizeMutation.mutateAsync,
    optimizationResult: effectiveResult,
    isOptimizing: optimizeMutation.isPending,
    isAdding: addPlanMutation.isPending,
  };
}

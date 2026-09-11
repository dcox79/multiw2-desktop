'use client';

import { useState } from 'react';
import type { CalculateRequest, CalculationResult } from '@/lib/types';

interface UseCalculationReturn {
  result: CalculationResult | null;
  isCalculating: boolean;
  isLoading: boolean;
  error: string | null;
  calculate: (request: CalculateRequest) => Promise<void>;
  reset: () => void;
}

export function useCalculation(): UseCalculationReturn {
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calculate = async (request: CalculateRequest) => {
    setIsCalculating(true);
    setError(null);
    try {
      const res = await fetch('/api/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Calculation failed');
      }
      const data = await res.json() as CalculationResult;
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Calculation failed');
    } finally {
      setIsCalculating(false);
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
  };

  return { result, isCalculating, isLoading: isCalculating, error, calculate, reset };
}

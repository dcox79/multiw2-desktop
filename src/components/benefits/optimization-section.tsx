'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AlertTriangle, TrendingUp, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { RETIREMENT_LIMITS, PAY_FREQUENCIES } from '@/lib/tax/tax-data-2026';
import { toast } from 'sonner';
import type { EmployerBenefitPlan, BenefitsOptimizationResult, BenefitsAllocation, Job } from '@/lib/types';

interface OptimizationSectionProps {
  plans: EmployerBenefitPlan[];
  salaries: Record<string, number>;
  jobs: Job[];
  result: BenefitsOptimizationResult | null;
  onOptimize: () => void;
  isOptimizing: boolean;
}

function getFrequencyLabel(frequency: string): string {
  switch (frequency) {
    case 'weekly': return 'per week';
    case 'biweekly': return 'per paycheck';
    case 'semimonthly': return 'per paycheck';
    case 'monthly': return 'per month';
    default: return 'per period';
  }
}

/**
 * Reallocate contributions client-side when target or weights change.
 * Match portions are locked (non-redistributable). Only excess is redistributed by weight.
 */
function reallocateWithWeights(
  baseResult: BenefitsOptimizationResult,
  customTarget: number,
  weights: Record<string, number>,
): BenefitsOptimizationResult {
  const allocations: BenefitsAllocation[] = baseResult.allocations.map(a => ({ ...a }));

  // Step 1: Lock each job's match contribution
  const totalMatched = allocations.reduce((sum, a) => sum + a.matchContribution, 0);

  // Step 2: Distribute remaining room by weights
  const excessRoom = Math.max(0, customTarget - totalMatched);
  const totalWeight = Object.values(weights).reduce((s, w) => s + w, 0) || 1;

  for (const alloc of allocations) {
    const weightFraction = (weights[alloc.jobId] ?? 0) / totalWeight;
    const excessPortion = Math.round(excessRoom * weightFraction);
    alloc.recommended401kContribution = alloc.matchContribution + excessPortion;
    alloc.totalBenefitValue = alloc.recommended401kContribution + alloc.employerMatchAmount + alloc.recommendedHSAContribution;
  }

  // Step 3: Recalculate totals
  const total401k = allocations.reduce((s, a) => s + a.recommended401kContribution, 0);

  return {
    ...baseResult,
    allocations,
    total401kContributions: total401k,
    estimatedTaxSavings: (total401k + baseResult.totalHSAContributions) * 0.24,
  };
}

export function OptimizationSection({
  plans,
  salaries,
  jobs,
  result,
  onOptimize,
  isOptimizing,
}: OptimizationSectionProps) {
  // Restore persisted custom target and weights from saved result metadata
  const savedMeta = result as (BenefitsOptimizationResult & { _customTarget?: number; _jobWeights?: Record<string, number> }) | null;

  const [customTarget, setCustomTarget] = useState(
    savedMeta?._customTarget ?? RETIREMENT_LIMITS.employee401k
  );
  const [jobWeights, setJobWeights] = useState<Record<string, number>>(
    savedMeta?._jobWeights ?? {}
  );

  // Initialize weights when result first arrives (highest-match job gets 100%, rest 0)
  useEffect(() => {
    if (!result) return;
    // Only initialize if weights are empty (no persisted weights)
    setJobWeights(prev => {
      if (Object.keys(prev).length > 0) return prev;
      const weights: Record<string, number> = {};
      result.allocations.forEach((a, i) => {
        weights[a.jobId] = i === 0 ? 100 : 0;
      });
      return weights;
    });
  }, [result]);

  // Reset custom target when new result arrives from API (unless persisted)
  useEffect(() => {
    if (savedMeta?._customTarget != null) {
      setCustomTarget(savedMeta._customTarget);
    }
    if (savedMeta?._jobWeights && Object.keys(savedMeta._jobWeights).length > 0) {
      setJobWeights(savedMeta._jobWeights);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  // Compute adjusted result based on custom target and weights
  const adjustedResult = useMemo(() => {
    if (!result) return null;
    return reallocateWithWeights(result, customTarget, jobWeights);
  }, [result, customTarget, jobWeights]);

  // Debounced save to DB
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const persistToDb = useCallback((adjusted: BenefitsOptimizationResult, target: number, weights: Record<string, number>) => {
    clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      try {
        const response = await fetch('/api/profile', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ last_optimization_result: { ...adjusted, _customTarget: target, _jobWeights: weights } }),
        });
        if (!response.ok) throw new Error('Failed to save benefit allocation');
      } catch (error) { toast.error(error instanceof Error ? error.message : 'Failed to save benefit allocation'); }
    }, 500);
  }, []);

  useEffect(() => {
    if (adjustedResult) {
      persistToDb(adjustedResult, customTarget, jobWeights);
    }
    return () => clearTimeout(saveTimeout.current);
  }, [adjustedResult, customTarget, jobWeights, persistToDb]);

  const handleWeightChange = useCallback((jobId: string, rawValue: number) => {
    const value = Math.max(0, Math.min(100, rawValue));
    setJobWeights(prev => {
      const otherIds = Object.keys(prev).filter(id => id !== jobId);
      const remaining = 100 - value;

      if (otherIds.length === 0) return { [jobId]: 100 };

      // Distribute remaining proportionally among other jobs
      const otherTotal = otherIds.reduce((s, id) => s + (prev[id] ?? 0), 0);
      const next: Record<string, number> = { [jobId]: value };

      if (otherTotal > 0) {
        // Proportional redistribution
        let distributed = 0;
        otherIds.forEach((id, i) => {
          if (i === otherIds.length - 1) {
            // Last one gets the remainder to avoid rounding drift
            next[id] = Math.max(0, remaining - distributed);
          } else {
            const share = Math.round(remaining * ((prev[id] ?? 0) / otherTotal));
            next[id] = share;
            distributed += share;
          }
        });
      } else {
        // All others are 0 — split equally
        const equal = Math.floor(remaining / otherIds.length);
        let distributed = 0;
        otherIds.forEach((id, i) => {
          if (i === otherIds.length - 1) {
            next[id] = remaining - distributed;
          } else {
            next[id] = equal;
            distributed += equal;
          }
        });
      }

      return next;
    });
  }, []);

  const handleTargetChange = useCallback((value: number) => {
    setCustomTarget(Math.max(0, Math.min(RETIREMENT_LIMITS.employee401k, value)));
  }, []);

  if (!adjustedResult) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <TrendingUp className="size-8 text-amber-500 mx-auto mb-3" />
          <p className="font-medium mb-1">Optimize your benefits allocation</p>
          <p className="text-sm text-muted-foreground mb-4">
            Get personalized recommendations to maximize employer match and minimize tax liability across {plans.length} plan{plans.length > 1 ? 's' : ''}.
          </p>
          <Button onClick={onOptimize} disabled={isOptimizing}>
            {isOptimizing ? 'Optimizing...' : 'Optimize allocations'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const combined401k = adjustedResult.total401kContributions;
  const combinedHSA = adjustedResult.totalHSAContributions;
  const limit401k = RETIREMENT_LIMITS.employee401k;
  const limitHSA = RETIREMENT_LIMITS.hsaIndividual;
  const pct401k = limit401k > 0 ? Math.round((combined401k / limit401k) * 100) : 0;
  const pctHSA = limitHSA > 0 ? Math.round((combinedHSA / limitHSA) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total 401(k)" value={formatCurrency(adjustedResult.total401kContributions)} />
        <StatCard label="Employer Match" value={formatCurrency(adjustedResult.totalEmployerMatch)} accent />
        <StatCard label="Total HSA" value={formatCurrency(adjustedResult.totalHSAContributions)} />
        <StatCard label="Est. Tax Savings" value={formatCurrency(adjustedResult.estimatedTaxSavings)} accent />
      </div>

      {/* Combined limit tracking with adjustable 401(k) target */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground mb-1.5">401(k) Target</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleTargetChange(customTarget - 100)}
              className="flex items-center justify-center size-7 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Decrease target by $100"
            >
              <Minus className="size-3.5" />
            </button>
            <input
              type="text"
              inputMode="numeric"
              value={customTarget.toLocaleString()}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9]/g, '');
                handleTargetChange(parseInt(raw) || 0);
              }}
              className="w-24 font-mono tabular-nums text-center text-sm font-semibold bg-transparent border border-border rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
              aria-label="Custom 401(k) target"
            />
            <button
              onClick={() => handleTargetChange(customTarget + 100)}
              className="flex items-center justify-center size-7 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Increase target by $100"
            >
              <Plus className="size-3.5" />
            </button>
            <span className="text-xs text-muted-foreground">
              of {formatCurrency(limit401k)} limit
            </span>
          </div>
          <p className={cn('font-mono tabular-nums text-xs mt-1', pct401k > 100 ? 'text-destructive' : pct401k > 90 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
            {formatCurrency(combined401k)} allocated ({pct401k}%)
          </p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground mb-1">Combined HSA</p>
          <p className={cn('font-mono tabular-nums text-sm font-semibold', pctHSA > 100 ? 'text-destructive' : pctHSA > 90 ? 'text-amber-600 dark:text-amber-400' : '')}>
            {formatCurrency(combinedHSA)} of {formatCurrency(limitHSA)} limit ({pctHSA}%)
          </p>
        </div>
      </div>

      {/* Per-job allocation cards */}
      <div className="space-y-3">
        {adjustedResult.allocations.map((alloc) => {
          const job = jobs.find((j) => j.id === alloc.jobId);
          const paychecksPerYear = PAY_FREQUENCIES[job?.pay_frequency ?? 'biweekly'] ?? 26;
          const freqLabel = getFrequencyLabel(job?.pay_frequency ?? 'biweekly');
          const perPaycheck401k = alloc.recommended401kContribution / paychecksPerYear;
          const perPaycheckHSA = alloc.recommendedHSAContribution / paychecksPerYear;
          const annualSalary = alloc.annualSalary ?? salaries[alloc.jobId] ?? 0;
          const percent401k = annualSalary > 0
            ? ((alloc.recommended401kContribution / annualSalary) * 100).toFixed(1)
            : '0.0';
          const excessPortion = alloc.recommended401kContribution - alloc.matchContribution;
          const weight = jobWeights[alloc.jobId] ?? 0;

          return (
            <Card key={alloc.jobId} className="border-l-4 border-l-amber-500 p-0 overflow-hidden">
              <div className="px-5 py-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold">{alloc.jobName}</h4>
                  <span className="text-xs text-muted-foreground font-mono tabular-nums">
                    {formatCurrency(annualSalary)}/yr
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">401(k) Contribution</p>
                    <p className="font-mono tabular-nums font-semibold">
                      {formatCurrency(alloc.recommended401kContribution)}/yr
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <span className="font-mono tabular-nums text-foreground">{formatCurrency(perPaycheck401k)}</span> {freqLabel} · <span className="font-mono tabular-nums text-foreground">{percent401k}%</span> of salary
                    </p>
                    {alloc.matchContribution > 0 && excessPortion > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Match: <span className="font-mono tabular-nums">{formatCurrency(alloc.matchContribution)}</span> + Excess: <span className="font-mono tabular-nums">{formatCurrency(excessPortion)}</span>
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Employer Match</p>
                    <p className="font-mono tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(alloc.employerMatchAmount)}/yr
                    </p>
                  </div>
                  {alloc.recommendedHSAContribution > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground">HSA Contribution</p>
                      <p className="font-mono tabular-nums font-semibold">
                        {formatCurrency(alloc.recommendedHSAContribution)}/yr
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        <span className="font-mono tabular-nums text-foreground">{formatCurrency(perPaycheckHSA)}</span> {freqLabel}
                        {annualSalary > 0 && (
                          <> · <span className="font-mono tabular-nums text-foreground">{((alloc.recommendedHSAContribution / annualSalary) * 100).toFixed(1)}%</span> of salary</>
                        )}
                      </p>
                    </div>
                  )}
                </div>

                {/* Excess allocation weight */}
                {adjustedResult.allocations.length > 1 && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">Excess allocation:</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={weight}
                      onChange={(e) => handleWeightChange(alloc.jobId, parseInt(e.target.value) || 0)}
                      className="w-16 font-mono tabular-nums text-center text-sm bg-transparent border border-border rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
                      aria-label={`Excess allocation weight for ${alloc.jobName}`}
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Warnings */}
      {adjustedResult.overlapWarnings.length > 0 && (
        <div className="space-y-2">
          {adjustedResult.overlapWarnings.map((warning, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/30"
            >
              <AlertTriangle className="size-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-800 dark:text-amber-200">{warning}</p>
            </div>
          ))}
        </div>
      )}

      {/* Recommendations */}
      {adjustedResult.recommendations.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm font-medium mb-2">Recommendations</p>
            <ul className="space-y-1.5">
              {adjustedResult.recommendations.map((rec, i) => (
                <li key={i} className="text-sm text-muted-foreground flex gap-2">
                  <span className="text-amber-500 shrink-0">&#8226;</span>
                  {rec}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Recalculate */}
      <Button onClick={onOptimize} disabled={isOptimizing} variant="outline" size="sm">
        {isOptimizing ? 'Recalculating...' : 'Recalculate'}
      </Button>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-mono tabular-nums text-lg font-semibold ${accent ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
        {value}
      </p>
    </div>
  );
}

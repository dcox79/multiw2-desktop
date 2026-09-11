'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, DollarSign, Pencil, MinusCircle, RotateCcw, Trash2, Shield, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { BenefitPlanForm } from './benefit-plan-form';
import { ComparisonTable } from './comparison-table';
import { OptimizationSection } from './optimization-section';
import { useJobs } from '@/hooks/use-jobs';
import { useBenefits } from '@/hooks/use-benefits';
import { formatCurrency } from '@/lib/utils';
import type { EmployerBenefitPlan } from '@/lib/types';

export function BenefitsPageContent() {
  const router = useRouter();
  const { activeJobs: jobs, isLoading: jobsLoading } = useJobs();
  const {
    plans,
    isLoading: plansLoading,
    addPlan,
    updatePlan,
    deactivatePlan,
    reactivatePlan,
    removePlan,
    optimize,
    optimizationResult,
    isOptimizing,
    isAdding,
  } = useBenefits(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<EmployerBenefitPlan | null>(null);

  const isLoading = jobsLoading || plansLoading;

  const activePlans = useMemo(() => plans.filter((p) => p.isActive), [plans]);

  // Jobs that don't yet have an active benefit plan
  const availableJobs = useMemo(() => {
    const planJobIds = new Set(activePlans.map((p) => p.jobId));
    return jobs.filter((j) => !planJobIds.has(j.id));
  }, [jobs, activePlans]);

  const salaryMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const job of jobs) {
      map[job.id] = Number(job.annual_salary);
    }
    return map;
  }, [jobs]);

  const handleOptimize = useCallback(() => {
    optimize(salaryMap);
  }, [optimize, salaryMap]);

  const handleEdit = useCallback((plan: EmployerBenefitPlan) => {
    setEditingPlan(plan);
    setFormOpen(true);
  }, []);

  const handleFormClose = useCallback(() => {
    setFormOpen(false);
    setEditingPlan(null);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <button
          onClick={() => router.push('/dashboard')}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Back to Dashboard"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-2xl font-bold">Benefits Optimizer</h1>
      </div>
      <p className="text-muted-foreground mb-6 ml-8">
        Compare and optimize employer benefits across all your jobs
      </p>

      {/* Section 1: Benefit Plans */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Benefit Plans</h2>
          <Button
            size="sm"
            onClick={() => { setEditingPlan(null); setFormOpen(true); }}
            disabled={availableJobs.length === 0 && !editingPlan}
          >
            <Plus className="size-4 mr-1" />
            Add benefit plan
          </Button>
        </div>

        {plans.length === 0 ? (
          <Card className="border-dashed p-8 text-center">
            <DollarSign className="size-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium mb-1">No benefit plans configured</p>
            <p className="text-sm text-muted-foreground mb-4">
              {jobs.length === 0
                ? 'Add jobs on the dashboard first, then configure their benefits.'
                : 'Add your first benefit plan to start comparing employer benefits.'}
            </p>
            {jobs.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setEditingPlan(null); setFormOpen(true); }}
              >
                <Plus className="size-4 mr-1" />
                Add your first plan
              </Button>
            )}
          </Card>
        ) : (
          <div className="space-y-3">
            {plans.map((plan) => {
              const salary = salaryMap[plan.jobId] ?? 0;
              const matchFormula = plan.matchType === 'percentage'
                ? `${plan.matchPercent}% match up to ${plan.matchCapPercent}% of salary`
                : `${plan.matchPercent}% match up to ${formatCurrency(plan.matchCapDollar)}`;

              const maxMatch = plan.matchType === 'percentage'
                ? (salary * plan.matchCapPercent / 100) * (plan.matchPercent / 100)
                : plan.matchCapDollar * (plan.matchPercent / 100);

              const totalMonthlyPremiums =
                plan.healthPremiumMonthly + plan.dentalPremiumMonthly + plan.visionPremiumMonthly;

              return (
                <Card key={plan.id} className={`border-l-4 border-l-amber-500 p-0 overflow-hidden ${!plan.isActive ? 'opacity-60' : ''}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold truncate">{plan.jobName}</h3>
                        {!plan.isActive && (
                          <Badge variant="secondary" className="text-xs text-muted-foreground">Inactive</Badge>
                        )}
                        {plan.hasMegaBackdoorRoth && plan.isActive && (
                          <Badge variant="secondary" className="gap-1 text-xs shrink-0">
                            <Zap className="size-3" />
                            Mega Backdoor
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        <span className="font-mono tabular-nums">{formatCurrency(salary)}</span>
                        {' · '}
                        {matchFormula}
                        {' = '}
                        <span className="font-mono tabular-nums text-foreground font-medium">
                          {formatCurrency(maxMatch)}/yr
                        </span>
                      </p>

                      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-sm text-muted-foreground">
                        {plan.employerHSAContribution > 0 && (
                          <span>
                            HSA: <span className="font-mono tabular-nums text-foreground">{formatCurrency(plan.employerHSAContribution)}/yr</span>
                          </span>
                        )}
                        {totalMonthlyPremiums > 0 && (
                          <span>
                            Premiums: <span className="font-mono tabular-nums text-foreground">{formatCurrency(totalMonthlyPremiums)}/mo</span>
                            {' ('}
                            <span className="font-mono tabular-nums">{formatCurrency(totalMonthlyPremiums * 12)}/yr</span>
                            {')'}
                          </span>
                        )}
                        {plan.vestingSchedule && (
                          <span>
                            Vesting: {plan.vestingSchedule}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {plan.isActive ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(plan)}
                            aria-label={`Edit ${plan.jobName} plan`}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deactivatePlan(plan.id)}
                            aria-label={`Deactivate ${plan.jobName} plan`}
                          >
                            <MinusCircle className="size-3.5" />
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => reactivatePlan(plan.id)}
                          aria-label={`Reactivate ${plan.jobName} plan`}
                        >
                          <RotateCcw className="size-3.5 mr-1" />
                          Reactivate
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => removePlan(plan.id)}
                        aria-label={`Delete ${plan.jobName} plan`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Section 2: Side-by-Side Comparison (available to all users) */}
      {activePlans.length >= 2 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Side-by-Side Comparison</h2>
          <ComparisonTable plans={activePlans} salaries={salaryMap} />
        </section>
      )}

      {/* Section 3: Optimization Engine */}
      {activePlans.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Shield className="size-5 text-amber-500" />
            Optimization Engine
          </h2>
          <>
            <OptimizationSection
              plans={activePlans}
              salaries={salaryMap}
              jobs={jobs}
              result={optimizationResult}
              onOptimize={handleOptimize}
              isOptimizing={isOptimizing}
            />
          </>
        </section>
      )}

      {/* Plan form modal */}
      <BenefitPlanForm
        open={formOpen}
        onOpenChange={handleFormClose}
        jobs={jobs}
        availableJobs={editingPlan ? jobs : availableJobs}
        existingPlan={editingPlan}
        onSubmit={async (data) => {
          if (editingPlan) {
            await updatePlan({ id: editingPlan.id, ...data });
          } else {
            await addPlan(data);
          }
          handleFormClose();
        }}
        isSubmitting={isAdding}
      />
    </div>
  );
}

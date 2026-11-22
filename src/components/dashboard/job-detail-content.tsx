'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Plus,
  FileText,
  TrendingUp,
  BarChart3,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { ErrorState } from '@/components/shared/error-state';
import { CreateJobModal } from './create-job-modal';
import { SnapshotForm } from '@/components/tracker/snapshot-form';
import { W2Wizard } from '@/components/w2/w2-wizard';
import { useJobs } from '@/hooks/use-jobs';
import { useYTDSnapshots, useLatestSnapshots } from '@/hooks/use-ytd-snapshots';
import { useW2Entries } from '@/hooks/use-w2-entries';
import { useProfile } from '@/hooks/use-profile';
import { useTaxProfile } from '@/hooks/use-tax-profile';
import { useSavedCalculations } from '@/hooks/use-saved-calculations';
import { TAX_YEAR } from '@/lib/tax/tax-data-2026';
import { computeProjections } from '@/lib/tax/projections';
import { CURRENT_TAX_MODEL_VERSION } from '@/lib/tax/run-calculators';
import { calculateFederalTax } from '@/lib/tax/federal-tax';
import { calculateSSOverpayment } from '@/lib/tax/social-security';
import { calculateMedicareTax } from '@/lib/tax/medicare-tax';
import { calculateW4Adjustments } from '@/lib/tax/w4-optimizer';
import { calculateRetirementLimits } from '@/lib/tax/retirement-limits';
import { calculateQuarterlyEstimates } from '@/lib/tax/quarterly-estimates';
import { formatCurrency, formatCurrencyRounded } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { YTDSnapshot, CalculationResult, CalculationInput, JobInput, FilingStatus } from '@/lib/types';

function formatAmount(value: number): string { return formatCurrency(value); }

const frequencyLabels: Record<string, string> = {
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  semimonthly: 'Semi-monthly',
  monthly: 'Monthly',
};

interface JobDetailContentProps {
  jobId: string;
}

export function JobDetailContent({ jobId }: JobDetailContentProps) {
  const router = useRouter();
  const { jobs, isLoading: jobsLoading, error: jobsError, deleteJob } = useJobs(true);
  const { snapshots, isLoading: snapshotsLoading, remove: removeSnapshot } = useYTDSnapshots(jobId);
  const { entries: w2Entries, isLoading: w2Loading, deleteEntry: deleteW2 } = useW2Entries(jobId);
  const { isLoading: subLoading, profile } = useProfile();
  const { profile: taxProfile2026 } = useTaxProfile(2026);
  const { calculations: savedCalcs, isLoading: calcsLoading } = useSavedCalculations();
  const { data: latestSnapMap, isLoading: latestSnapsLoading } = useLatestSnapshots(2026);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [snapshotFormOpen, setSnapshotFormOpen] = useState(false);
  const [editingSnapshot, setEditingSnapshot] = useState<YTDSnapshot | null>(null);
  const [w2WizardOpen, setW2WizardOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const isLoading = jobsLoading || snapshotsLoading || w2Loading || subLoading || calcsLoading || latestSnapsLoading;
  const job = jobs.find((j) => j.id === jobId);
  const [selectedW2Year, setSelectedW2Year] = useState<number | null>(null);
  const w2Entry = w2Entries.find(entry => entry.tax_year === (selectedW2Year ?? w2Entries[0]?.tax_year));

  // Find the latest combined calculation that includes this job
  const combinedResult: CalculationResult | null = useMemo(() => {
    const calc = savedCalcs.find(
      (c) => c.source === 'calculator' && c.resultData?.modelVersion === CURRENT_TAX_MODEL_VERSION && c.jobIds.includes(jobId)
    );
    return calc?.resultData ?? null;
  }, [savedCalcs, jobId]);

  const estimatedPaymentsYTD2026 = useMemo(() => (
    Number(taxProfile2026?.estimated_payment_q1 ?? 0) +
    Number(taxProfile2026?.estimated_payment_q2 ?? 0) +
    Number(taxProfile2026?.estimated_payment_q3 ?? 0) +
    Number(taxProfile2026?.estimated_payment_q4 ?? 0)
  ), [taxProfile2026]);

  // W2-based calculation for this job (year-end planning estimate)
  const w2CalcResult = useMemo(() => {
    if (!w2Entry || !job || w2Entry.tax_year !== TAX_YEAR) return null;
    const w2JobInput: JobInput = {
      id: job.id,
      name: job.name,
      incomeSource: 'w2' as const,
      annualSalary: w2Entry.box1_wages,
      socialSecurityWages: w2Entry.box3_ss_wages ?? undefined,
      medicareWages: w2Entry.box5_medicare_wages ?? undefined,
      federalWithholdingYTD: w2Entry.box2_federal_withheld,
      socialSecurityWithholdingYTD: w2Entry.box4_ss_withheld,
      medicareWithholdingYTD: w2Entry.box6_medicare_withheld,
      traditional401k: w2Entry.box12_code_d ?? undefined,
      roth401k: w2Entry.box12_code_aa ?? undefined,
      hsaContributions: w2Entry.box12_code_w ?? undefined,
      payFrequency: job.pay_frequency as JobInput['payFrequency'],
      startMonth: job.start_month ?? 1,
    };
    // Use combined saved calculation if available, otherwise single-job
    if (combinedResult?.input.taxYear === TAX_YEAR && combinedResult.metadata?.calculationBasis === 'w2_and_ytd') {
      return combinedResult;
    }
    const calcInput: CalculationInput = {
      taxYear: TAX_YEAR,
      jobs: [w2JobInput],
      filingStatus: (taxProfile2026?.filing_status ?? profile?.filing_status ?? 'single') as FilingStatus,
      standardDeduction: taxProfile2026?.use_standard_deduction ?? profile?.use_standard_deduction ?? true,
      itemizedDeductions: taxProfile2026?.itemized_deduction_amount ?? 0,
      estimatedPaymentsYTD: estimatedPaymentsYTD2026,
      dependents: taxProfile2026?.dependents ?? profile?.dependents ?? 0,
      childTaxCreditEligible: taxProfile2026?.child_tax_credit_eligible ?? profile?.child_tax_credit_eligible ?? 0,
      otherDependentsEligible: 0,
    };
    const federal = calculateFederalTax(calcInput);
    const socialSecurity = calculateSSOverpayment(calcInput);
    const medicare = calculateMedicareTax(calcInput);
    const w4 = calculateW4Adjustments(calcInput, federal);
    const retirement = calculateRetirementLimits(calcInput);
    const quarterly = calculateQuarterlyEstimates(calcInput, federal);
    return { federal, socialSecurity, medicare, w4, retirement, quarterly, isSingleJob: true } as const;
  }, [w2Entry, job, profile, taxProfile2026, combinedResult, estimatedPaymentsYTD2026]);

  // YTD projection for all jobs (combined)
  const ytdProjection = useMemo(() => {
    if (!latestSnapMap || latestSnapMap.size === 0 || !job) return null;
    // Only compute if this job has a snapshot
    if (!latestSnapMap.has(jobId)) return null;
    const relevantJobs = jobs.filter(j => j.employment_status !== 'deleted' && !j.is_draft);
    return computeProjections(
      relevantJobs,
      latestSnapMap,
      taxProfile2026?.filing_status ?? profile?.filing_status ?? 'single',
      taxProfile2026?.dependents ?? profile?.dependents ?? 0,
      taxProfile2026?.use_standard_deduction ?? profile?.use_standard_deduction ?? true,
      estimatedPaymentsYTD2026,
      taxProfile2026?.itemized_deduction_amount ?? 0,
      TAX_YEAR,
      taxProfile2026?.child_tax_credit_eligible ?? profile?.child_tax_credit_eligible ?? 0,
    );
  }, [latestSnapMap, jobs, job, jobId, profile, taxProfile2026, estimatedPaymentsYTD2026]);

  // This job's projection within the combined result
  const thisJobProjection = useMemo(() => {
    if (!ytdProjection) return null;
    return ytdProjection.jobProjections.find(jp => jp.jobId === jobId) ?? null;
  }, [ytdProjection, jobId]);

  const handleDeleteJob = useCallback(async () => {
    try {
      await deleteJob.mutateAsync(jobId);
      toast.success('Job deleted');
      router.push('/dashboard');
    } catch {
      toast.error('Failed to delete job');
    }
  }, [deleteJob, jobId, router]);

  const handleDeleteSnapshot = useCallback(async (id: string) => {
    if (!confirm('Delete this snapshot?')) return;
    try {
      await removeSnapshot.mutateAsync(id);
      toast.success('Snapshot deleted');
    } catch {
      toast.error('Failed to delete snapshot');
    }
  }, [removeSnapshot]);

  const handleDeleteW2 = useCallback(async (id: string) => {
    if (!confirm('Delete this W2 entry? This cannot be undone.')) return;
    try {
      await deleteW2.mutateAsync(id);
      toast.success('W2 entry deleted');
    } catch {
      toast.error('Failed to delete W2 entry');
    }
  }, [deleteW2]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <LoadingSpinner />
      </div>
    );
  }

  if (jobsError || !job) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ErrorState
          title="Job not found"
          description="This job doesn't exist or has been deleted."
          onRetry={() => router.push('/dashboard')}
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Back link */}
      <button
        onClick={() => router.push('/dashboard')}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        Back to Dashboard
      </button>

      {/* Job header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{job.name}</h1>
          <p className="font-mono tabular-nums text-lg text-muted-foreground mt-1">
            {formatCurrencyRounded(job.annual_salary)}
          </p>
          <div className="flex gap-2 mt-2">
            <Badge variant="outline">{job.income_source === 'w2' ? 'W2' : 'Paystub'}</Badge>
            <Badge variant="outline">{frequencyLabels[job.pay_frequency] ?? job.pay_frequency}</Badge>
            {job.started_this_year && job.start_month && (
              <Badge variant="secondary">Started month {job.start_month}</Badge>
            )}
          </div>
          {job.extra_withholding_per_paycheck > 0 && (
            <div className="flex items-center gap-2 text-sm mt-2">
              <span className="text-muted-foreground">Extra W-4 withholding:</span>
              <span className="font-mono tabular-nums">{formatCurrency(job.extra_withholding_per_paycheck)}/paycheck</span>
            </div>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setEditModalOpen(true)}>
            <Pencil className="size-3.5" />
            Edit
          </Button>
          {!deleteConfirm ? (
            <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(true)}>
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          ) : (
            <div className="flex gap-1">
              <Button variant="destructive" size="sm" onClick={handleDeleteJob}>
                Confirm
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(false)}>
                Cancel
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* YTD Snapshots Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>YTD Snapshots</CardTitle>
          <Button size="sm" variant="outline" onClick={() => { setEditingSnapshot(null); setSnapshotFormOpen(true); }}>
            <Plus className="size-3.5" />
            Add snapshot
          </Button>
        </CardHeader>
        <CardContent>
          {snapshots.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="size-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No snapshots yet. Add your first YTD snapshot from a pay stub.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-3">Date</th>
                    <th className="text-right py-2 px-3">YTD Gross</th>
                    <th className="text-right py-2 px-3">Federal</th>
                    <th className="text-right py-2 px-3">SS</th>
                    <th className="text-right py-2 px-3">Medicare</th>
                    <th className="text-right py-2 pl-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((snap) => (
                    <tr key={snap.id} className="border-b border-border last:border-0">
                      <td className="py-2.5 pr-3">{new Date(snap.paycheck_date).toLocaleDateString()}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">{formatCurrency(snap.ytd_gross)}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">{formatCurrency(snap.ytd_federal_withheld)}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">{formatCurrency(snap.ytd_ss_withheld)}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">{formatCurrency(snap.ytd_medicare_withheld)}</td>
                      <td className="py-2.5 pl-3 text-right">
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={() => { setEditingSnapshot(snap); setSnapshotFormOpen(true); }}
                            className="text-muted-foreground hover:text-foreground p-1"
                            aria-label="Edit snapshot"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteSnapshot(snap.id)}
                            className="text-muted-foreground hover:text-destructive p-1"
                            aria-label="Delete snapshot"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* W2 Data Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="space-y-2"><CardTitle>W2 Data</CardTitle>
            {w2Entries.length > 0 && <label className="text-xs text-muted-foreground">Tax year <select aria-label="W2 tax year" className="rounded border bg-background p-1 ml-2" value={w2Entry?.tax_year ?? ''} onChange={e => { setSelectedW2Year(Number(e.target.value)); setW2WizardOpen(false); }}>{w2Entries.map(entry => <option key={entry.id} value={entry.tax_year}>{entry.tax_year}</option>)}</select></label>}
          </div>
          {(
            <Button size="sm" variant="outline" onClick={() => setW2WizardOpen(true)}>
              <FileText className="size-3.5" />
              {w2Entry ? 'Edit W2' : 'Enter W2'}
            </Button>
          )}
        </CardHeader>
        <CardContent>
            {w2Entry ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <W2Field label="Box 1 — Wages" value={w2Entry.box1_wages} />
                  <W2Field label="Box 2 — Federal W/H" value={w2Entry.box2_federal_withheld} />
                  <W2Field label="Box 4 — SS W/H" value={w2Entry.box4_ss_withheld} />
                  <W2Field label="Box 6 — Medicare W/H" value={w2Entry.box6_medicare_withheld} />
                </div>

                {/* Box 12 codes */}
                {(w2Entry.box12_code_d || w2Entry.box12_code_aa || w2Entry.box12_code_w || w2Entry.box12_code_c || w2Entry.box12_code_dd || w2Entry.box12_code_v) && (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground mb-2">Box 12 Codes</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {w2Entry.box12_code_d != null && <W2Field label="Code D — 401(k)" value={w2Entry.box12_code_d} />}
                      {w2Entry.box12_code_aa != null && <W2Field label="Code AA — Roth 401(k)" value={w2Entry.box12_code_aa} />}
                      {w2Entry.box12_code_w != null && <W2Field label="Code W — HSA" value={w2Entry.box12_code_w} />}
                      {w2Entry.box12_code_c != null && <W2Field label="Code C — Group Life" value={w2Entry.box12_code_c} />}
                      {w2Entry.box12_code_dd != null && <W2Field label="Code DD — Health" value={w2Entry.box12_code_dd} />}
                      {w2Entry.box12_code_v != null && <W2Field label="Code V — Stock Options" value={w2Entry.box12_code_v} />}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t border-border">
                  <span>Tax year: {w2Entry.tax_year}</span>
                  <span>Version: {w2Entry.version}</span>
                  {w2Entry.correction_note && (
                    <span>Note: {w2Entry.correction_note}</span>
                  )}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => handleDeleteW2(w2Entry.id)}
                >
                  <Trash2 className="size-3.5" />
                  Delete W2
                </Button>
              </div>
            ) : (
              <div className="text-center py-8">
                <FileText className="size-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground mb-3">
                  No W2 data entered yet.
                </p>
              </div>
            )}
        </CardContent>
      </Card>

      {/* W2 Tax Calculations — year-end input */}
      <Card className="border-l-4 border-l-emerald-500">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="size-5" />
            W2 Tax Calculations
          </CardTitle>
          {w2Entry && (
            <div className="flex items-center gap-2">
              <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0 text-xs">
                Planning estimate
              </Badge>
              <span className="text-xs text-muted-foreground">
                Based on W2 data · Tax year {w2Entry.tax_year}
              </span>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {w2CalcResult ? (
            <div className="space-y-4">
              {/* This job's W2 data */}
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-2">This job (W2 data)</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <ResultField label="Box 1 Wages" value={formatCurrency(w2Entry!.box1_wages)} />
                  <ResultField label="Federal withheld (Box 2)" value={formatCurrency(w2Entry!.box2_federal_withheld)} />
                  <ResultField label="SS withheld (Box 4)" value={formatCurrency(w2Entry!.box4_ss_withheld)} />
                  <ResultField label="Medicare withheld (Box 6)" value={formatCurrency(w2Entry!.box6_medicare_withheld)} />
                  {w2Entry!.box12_code_d != null && w2Entry!.box12_code_d > 0 && (
                    <ResultField label="401(k) (Code D)" value={formatCurrency(w2Entry!.box12_code_d)} />
                  )}
                  {w2Entry!.box12_code_aa != null && w2Entry!.box12_code_aa > 0 && (
                    <ResultField label="Roth 401(k) (Code AA)" value={formatCurrency(w2Entry!.box12_code_aa)} />
                  )}
                  {w2Entry!.box12_code_w != null && w2Entry!.box12_code_w > 0 && (
                    <ResultField label="HSA (Code W)" value={formatCurrency(w2Entry!.box12_code_w)} />
                  )}
                </div>
              </div>

              {/* Combined W2 results */}
              <div className="border-t border-border pt-4">
                <h4 className="text-xs font-medium text-muted-foreground mb-2">
                  {'isSingleJob' in w2CalcResult ? 'Tax calculation (this job)' : `Combined (${w2CalcResult.metadata?.jobIds.length ?? 1} jobs)`}
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <ResultField label="Federal tax" value={formatCurrency(w2CalcResult.federal.totalFederalTax)} />
                  <ResultField label="AGI" value={formatCurrency(w2CalcResult.federal.adjustedGrossIncome)} />
                  <ResultField label="Effective rate" value={`${(w2CalcResult.federal.effectiveRate * 100).toFixed(1)}%`} />
                  <ResultField label="Marginal rate" value={`${(w2CalcResult.federal.marginalRate * 100).toFixed(0)}%`} />
                  <ResultField
                    label="Owed at filing"
                    value={formatCurrency(Math.abs(w2CalcResult.federal.remainingBalance))}
                    color={w2CalcResult.federal.remainingBalance > 0 ? 'text-destructive' : 'text-success'}
                    suffix={w2CalcResult.federal.remainingBalance > 0 ? ' owed' : ' refund'}
                  />
                  <ResultField
                    label="Withholding gap"
                    value={formatCurrency(Math.abs(w2CalcResult.federal.withholdingGap))}
                    color={w2CalcResult.federal.withholdingGap > 0 ? 'text-destructive' : 'text-success'}
                    suffix={w2CalcResult.federal.withholdingGap > 0 ? ' under' : ' over'}
                  />
                  {w2CalcResult.socialSecurity.overpayment > 0 && (
                    <ResultField label="SS overpayment" value={formatCurrency(w2CalcResult.socialSecurity.overpayment)} />
                  )}
                  {w2CalcResult.medicare.medicareGap !== 0 && (
                    <ResultField
                      label="Medicare gap"
                      value={formatCurrency(Math.abs(w2CalcResult.medicare.medicareGap))}
                      color={w2CalcResult.medicare.medicareGap > 0 ? 'text-destructive' : 'text-success'}
                      suffix={w2CalcResult.medicare.medicareGap > 0 ? ' owed' : ' overpaid'}
                    />
                  )}
                  {w2CalcResult.retirement.total401kContributions > 0 && (
                    <ResultField
                      label="401(k) total"
                      value={`${formatCurrency(w2CalcResult.retirement.total401kContributions)} of ${formatCurrency(w2CalcResult.retirement.limit401k)}`}
                    />
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <FileText className="size-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-3">
                This view calculates {TAX_YEAR} only. Saved W-2 data for other years remains available above.
              </p>
              <Button size="sm" variant="outline" onClick={() => setW2WizardOpen(true)}>
                Enter W2 data
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* YTD Tax Calculations — Projected from snapshots */}
      <Card className="border-l-4 border-l-blue-500">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="size-5" />
            YTD Tax Calculations
          </CardTitle>
          {ytdProjection && thisJobProjection && (
            <div className="flex items-center gap-2">
              <Badge className={cn(
                'border-0 text-xs',
                'bg-blue-500/10 text-blue-600 dark:text-blue-400'
              )}>
                {'Projected'}
              </Badge>
              <span className="text-xs text-muted-foreground">
                From {new Date(ytdProjection.latestSnapshotDate).toLocaleDateString()} · {Math.round(thisJobProjection.fractionElapsed * 100)}% of year
              </span>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {ytdProjection && thisJobProjection ? (
            <div className="space-y-4">
              {/* Warnings */}
              {(thisJobProjection.capped || thisJobProjection.insufficientData) && (
                <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  {thisJobProjection.capped && 'Projection capped (snapshot may be from a prior year)'}
                  {thisJobProjection.insufficientData && 'Limited data (less than 3 weeks into the year)'}
                </div>
              )}

              {/* This job's projected data */}
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-2">This job (projected annual)</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <ResultField label="Projected gross" value={formatAmount(thisJobProjection.projectedGross)} />
                  <ResultField label="Projected federal W/H" value={formatAmount(thisJobProjection.projectedFedWithheld)} />
                  <ResultField label="Projected SS W/H" value={formatAmount(thisJobProjection.projectedSSWithheld)} />
                  <ResultField label="Projected Medicare W/H" value={formatAmount(thisJobProjection.projectedMedWithheld)} />
                </div>
              </div>

              {/* Combined projection results */}
              <div className="border-t border-border pt-4">
                <h4 className="text-xs font-medium text-muted-foreground mb-2">
                  Combined projection ({ytdProjection.jobProjections.length} job{ytdProjection.jobProjections.length !== 1 ? 's' : ''})
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <ResultField label="Projected federal tax" value={formatAmount(ytdProjection.federal.totalFederalTax)} />
                  <ResultField label="Projected AGI" value={formatAmount(ytdProjection.federal.adjustedGrossIncome)} />
                  <ResultField
                    label="Effective rate"
                    value={`${(ytdProjection.federal.effectiveRate * 100).toFixed(1)}%`}
                  />
                  <ResultField
                    label="Owed at filing"
                    value={formatAmount(Math.abs(ytdProjection.federal.remainingBalance))}
                    color={ytdProjection.federal.remainingBalance > 0 ? 'text-destructive' : 'text-success'}
                    suffix={ytdProjection.federal.remainingBalance > 0 ? ' owed' : ' refund'}
                  />
                  <ResultField
                    label="Withholding gap"
                    value={formatAmount(Math.abs(ytdProjection.federal.withholdingGap))}
                    color={ytdProjection.federal.withholdingGap > 0 ? 'text-destructive' : 'text-success'}
                    suffix={ytdProjection.federal.withholdingGap > 0 ? ' under' : ' over'}
                  />
                  {ytdProjection.socialSecurity.overpayment > 0 && (
                    <ResultField label="SS overpayment" value={formatAmount(ytdProjection.socialSecurity.overpayment)} />
                  )}
                  {ytdProjection.medicare.medicareGap !== 0 && (
                    <ResultField
                      label="Medicare gap"
                      value={formatAmount(Math.abs(ytdProjection.medicare.medicareGap))}
                      color={ytdProjection.medicare.medicareGap > 0 ? 'text-destructive' : 'text-success'}
                      suffix={ytdProjection.medicare.medicareGap > 0 ? ' owed' : ' overpaid'}
                    />
                  )}
                  {ytdProjection.quarterly.requiredAnnualEstimate > 0 && (() => {
                    const nextQ = ytdProjection.quarterly.quarterlyPayments.find(q => !q.isPast);
                    return nextQ ? (
                      <ResultField label="Next quarterly payment" value={formatAmount(nextQ.amount)} />
                    ) : null;
                  })()}
                  {ytdProjection.w4.adjustments.some(a => a.recommendedExtraWithholding > 0) && (() => {
                    const adj = ytdProjection.w4.adjustments.find(a => a.recommendedExtraWithholding > 0);
                    return adj ? (
                      <ResultField label="W-4 extra recommended" value={`${formatAmount(adj.recommendedExtraWithholding)}/paycheck`} />
                    ) : null;
                  })()}
                </div>
              </div>

              {null}
            </div>
          ) : snapshots.length === 0 ? (
            <div className="text-center py-6">
              <BarChart3 className="size-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-3">
                No YTD snapshots for this job.
              </p>
              <Button size="sm" variant="outline" onClick={() => setSnapshotFormOpen(true)}>
                Add a snapshot
              </Button>
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-sm text-muted-foreground">
                Loading projections...
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modals */}
      <CreateJobModal
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        editJob={{
          id: job.id,
          name: job.name,
          annual_salary: Number(job.annual_salary),
          income_source: job.income_source as 'w2' | 'paystub',
          pay_frequency: job.pay_frequency,
          started_this_year: job.started_this_year,
          start_month: job.start_month,
          extra_withholding_per_paycheck: job.extra_withholding_per_paycheck,
        }}
      />

      <SnapshotForm
        open={snapshotFormOpen}
        onOpenChange={(open) => {
          if (!open) { setSnapshotFormOpen(false); setEditingSnapshot(null); }
        }}
        jobId={job.id}
        jobName={job.name}
        priorSnapshot={snapshots[0]}
        existingSnapshot={editingSnapshot ?? undefined}
      />

      {w2WizardOpen && (
        <W2Wizard
          open={w2WizardOpen}
          onOpenChange={setW2WizardOpen}
          jobId={job.id}
          jobName={job.name}
          annualSalary={Number(job.annual_salary)}
          existingEntry={w2Entry}
        />
      )}
    </div>
  );
}

function W2Field({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className="font-mono tabular-nums text-sm">{formatCurrency(value)}</p>
    </div>
  );
}

function ResultField({ label, value, color, suffix }: { label: string; value: string; color?: string; suffix?: string }) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className={`font-mono tabular-nums text-sm font-medium ${color ?? 'text-foreground'}`}>
        {value}{suffix ?? ''}
      </p>
    </div>
  );
}

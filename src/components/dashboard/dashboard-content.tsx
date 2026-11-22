'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Briefcase,
  Calculator,
  BarChart3,
  Target,
  DollarSign,
  ClipboardList,
  Search,
  AlertTriangle,
  ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { ErrorState } from '@/components/shared/error-state';
import { CurrencyInput } from '@/components/shared/currency-input';
import { ResponsiveModal } from '@/components/shared/responsive-modal';
import { JobManagementSection } from './job-management-section';
import { TaxProfileCard } from './tax-profile-card';
import { WorkflowCard } from './workflow-card';
import { Reminders } from './reminders';
import { TAX_YEAR } from '@/lib/tax/tax-data-2026';
import { CreateJobModal } from './create-job-modal';
import { SnapshotForm } from '@/components/tracker/snapshot-form';
import { W2Wizard } from '@/components/w2/w2-wizard';
import { useQueryClient } from '@tanstack/react-query';
import { useJobs } from '@/hooks/use-jobs';
import { useLatestSnapshots } from '@/hooks/use-ytd-snapshots';
import { useW2Entries } from '@/hooks/use-w2-entries';
import { useProfile } from '@/hooks/use-profile';
import { useCalculation } from '@/hooks/use-calculation';
import { useBenefits } from '@/hooks/use-benefits';
import { useTaxProfile } from '@/hooks/use-tax-profile';
import { useSavedCalculations } from '@/hooks/use-saved-calculations';
import { useScanner } from '@/hooks/use-scanner';
import { useScenarios } from '@/hooks/use-scenarios';
import { useTaxPrep } from '@/hooks/use-tax-prep';
import { computeProjections } from '@/lib/tax/projections';
import { CURRENT_TAX_MODEL_VERSION } from '@/lib/tax/run-calculators';
import { STALENESS_THRESHOLDS } from '@/lib/constants';
import { formatCurrency, cn } from '@/lib/utils';
import type { FilingStatus, Job } from '@/lib/types';

function formatAmount(value: number): string { return formatCurrency(value); }

const workflowIcons: Record<string, typeof Calculator> = {
  Calculator, BarChart3, Target, DollarSign, ClipboardList, Search,
};

export function DashboardContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { jobs, isLoading: jobsLoading, error: jobsError } = useJobs();
  const { data: latestSnapshots, isLoading: snapshotsLoading } = useLatestSnapshots(TAX_YEAR);
  const { entries: w2Entries } = useW2Entries();
  // W2 year analysis
  const w2Years = useMemo(() => {
    const years = new Set<number>();
    for (const entry of w2Entries) years.add(entry.tax_year);
    return [...years].sort((a, b) => b - a);
  }, [w2Entries]);
  const [w2Year, setW2Year] = useState<string>('');
  const effectiveW2Year = w2Year || (w2Years[0]?.toString() ?? '');

  const { profile: selectedTaxProfile, updateProfile: saveSelected } = useTaxProfile(Number(effectiveW2Year) || TAX_YEAR);

  const { isLoading: subLoading, profile } = useProfile();
  const { result, isCalculating, error: calcError, calculate } = useCalculation();
  const { plans: benefitPlans, isLoading: benefitsLoading } = useBenefits();
  const { calculations: savedCalcs, save: saveCalc } = useSavedCalculations();
  const { history: scanHistory } = useScanner();
  const { scenarios } = useScenarios();
  const { taxPrepKit } = useTaxPrep();
  const {
    profile: taxProfile2025, isLoading: tp2025Loading,
    updateProfile: save2025, isSaving: tp2025Saving,
  } = useTaxProfile(2025);
  const {
    profile: taxProfile2026, isLoading: tp2026Loading,
    updateProfile: save2026, importFromYear: import2025To2026,
    isSaving: tp2026Saving, isImporting: tp2026Importing,
  } = useTaxProfile(2026);

  // Saved calculator result (persisted to DB for all users)
  const latestSavedCalc = useMemo(() => {
    return savedCalcs.find((c) => c.source === 'calculator' && c.resultData?.modelVersion === CURRENT_TAX_MODEL_VERSION && c.inputData?.taxYear === Number(effectiveW2Year));
  }, [savedCalcs, effectiveW2Year]);
  const displayResult = result?.input.taxYear === Number(effectiveW2Year) ? result : latestSavedCalc?.resultData ?? null;

  // Staleness detection
  const filingStatusChanged = useMemo(() => {
    if (!latestSavedCalc?.inputData || !profile?.filing_status) return false;
    return latestSavedCalc.inputData.filingStatus !== profile.filing_status;
  }, [latestSavedCalc, profile]);

  const newW2DataAvailable = useMemo(() => {
    if (!latestSavedCalc?.dataFreshnessDate || w2Entries.length === 0) return false;
    const savedDate = new Date(latestSavedCalc.dataFreshnessDate).getTime();
    return w2Entries.some((e) => new Date(e.updated_at).getTime() > savedDate);
  }, [latestSavedCalc, w2Entries]);

  const [calcDataOpen, setCalcDataOpen] = useState(false);
  const [createJobOpen, setCreateJobOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [snapshotJobId, setSnapshotJobId] = useState<string | null>(null);
  const [quickSnapshotOpen, setQuickSnapshotOpen] = useState(false);
  const [w2JobId, setW2JobId] = useState<string | null>(null);
  const [showFilingForm, setShowFilingForm] = useState(false);
  const [filingStatus, setFilingStatus] = useState<FilingStatus>('single');
  const [ctcChildren, setCtcChildren] = useState(0);
  const [otherDeps, setOtherDeps] = useState(0);
  const dependents = ctcChildren + otherDeps;
  const [useStandardDeduction, setUseStandardDeduction] = useState(true);
  const [itemizedAmount, setItemizedAmount] = useState(0);

  // Sync filing form state from 2025 tax profile (render-time sync pattern, matches tax-profile-card.tsx)
  const profileSyncKey = `${selectedTaxProfile?.id}-${selectedTaxProfile?.updated_at}`;
  const [prevProfileSyncKey, setPrevProfileSyncKey] = useState<string | undefined>(undefined);
  if (prevProfileSyncKey !== profileSyncKey && selectedTaxProfile?.filing_status) {
    setPrevProfileSyncKey(profileSyncKey);
    setFilingStatus(selectedTaxProfile.filing_status as FilingStatus);
    setCtcChildren(selectedTaxProfile.child_tax_credit_eligible ?? 0);
    setOtherDeps(0);
    setUseStandardDeduction(selectedTaxProfile.use_standard_deduction ?? true);
    setItemizedAmount(selectedTaxProfile.itemized_deduction_amount ?? 0);
  }

  const [extraWhJobId, setExtraWhJobId] = useState<string | null>(null);
  const [extraWhAmount, setExtraWhAmount] = useState(0);
  // Sum Q1-Q4 from the 2025 tax profile (used for W2-year calcs; W2 data is 2025 by default)
  const totalQuarterlyPayments = useMemo(() => {
    return (
      Number(selectedTaxProfile?.estimated_payment_q1 ?? 0) +
      Number(selectedTaxProfile?.estimated_payment_q2 ?? 0) +
      Number(selectedTaxProfile?.estimated_payment_q3 ?? 0) +
      Number(selectedTaxProfile?.estimated_payment_q4 ?? 0)
    );
  }, [selectedTaxProfile]);

  // Sum Q1-Q4 from the 2026 tax profile (used for the current-year YTD projection card)
  const totalQuarterlyPayments2026 = useMemo(() => {
    return (
      Number(taxProfile2026?.estimated_payment_q1 ?? 0) +
      Number(taxProfile2026?.estimated_payment_q2 ?? 0) +
      Number(taxProfile2026?.estimated_payment_q3 ?? 0) +
      Number(taxProfile2026?.estimated_payment_q4 ?? 0)
    );
  }, [taxProfile2026]);

  const quarterlyPaymentsChanged = useMemo(() => {
    if (!latestSavedCalc?.inputData) return false;
    const savedEstimated = Number(latestSavedCalc.inputData.estimatedPaymentsYTD ?? 0);
    return Math.abs(savedEstimated - totalQuarterlyPayments) > 0.01;
  }, [latestSavedCalc, totalQuarterlyPayments]);

  // Jobs with W2 data for the selected year
  const w2JobsForYear = useMemo(() => {
    if (!effectiveW2Year) return [];
    const year = parseInt(effectiveW2Year);
    return w2Entries.filter((e) => e.tax_year === year);
  }, [w2Entries, effectiveW2Year]);

  // Auto-save after successful calculation
  const lastSavedResultRef = useRef<string | null>(null);
  useEffect(() => {
    if (!result) return;
    const resultKey = result.timestamp;
    if (lastSavedResultRef.current === resultKey) return;
    lastSavedResultRef.current = resultKey;
    saveCalc.mutate({
      name: `W2 Analysis ${effectiveW2Year || new Date().getFullYear()} — ${new Date().toLocaleString()}`,
      input: result.input,
      result,
      source: 'calculator',
    });
  }, [result, effectiveW2Year, saveCalc]);

  const isLoading = jobsLoading || snapshotsLoading || subLoading;
  const emptyMap = useMemo(() => new Map(), []);
  const snapMap = latestSnapshots ?? emptyMap;

  // Compute stale job IDs
  const staleJobIds = useMemo(() => {
    const stale = new Set<string>();
    if (!snapMap.size) return stale;
    const now = new Date();
    for (const job of jobs) {
      const snapshot = snapMap.get(job.id);
      if (!snapshot) continue;
      const threshold = STALENESS_THRESHOLDS[job.pay_frequency] ?? 17;
      const diffDays = Math.floor((now.getTime() - new Date(snapshot.paycheck_date).getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > threshold) stale.add(job.id);
    }
    return stale;
  }, [jobs, snapMap]);

  // Compute W2 job IDs
  const w2JobIds = useMemo(() => {
    const ids = new Set<string>();
    for (const entry of w2Entries) {
      ids.add(entry.job_id);
    }
    return ids;
  }, [w2Entries]);

  // Jobs missing W2 data
  const jobsMissingW2 = useMemo(() => {
    return jobs.filter((j) => !w2JobIds.has(j.id));
  }, [jobs, w2JobIds]);


  const handleAddJob = () => setCreateJobOpen(true);


  const runW2Calc = useCallback(async (fs: FilingStatus, deps: number, stdDeduction?: boolean, itemized?: number, estPayments?: number, ctcCount?: number, odcCount?: number) => {
    const jobIds = w2JobsForYear.map((e) => e.job_id);
    if (jobIds.length === 0) {
      toast.error('No W2 data for this year');
      return;
    }
    const year = parseInt(effectiveW2Year);
    if (year !== TAX_YEAR) { toast.error(`New calculations support ${TAX_YEAR} only. Historical W-2 data is retained.`); return; }
    await calculate({
      jobIds,
      filingStatus: fs,
      dependents: deps,
      childTaxCreditEligible: ctcCount,
      otherDependentsEligible: odcCount,
      useStandardDeduction: stdDeduction ?? profile?.use_standard_deduction ?? true,
      itemizedDeductions: itemized ?? 0,
      estimatedPaymentsYTD: estPayments ?? totalQuarterlyPayments,
      taxYear: year,
    });
  }, [w2JobsForYear, effectiveW2Year, profile, calculate, totalQuarterlyPayments]);

  const handleRunCalc = useCallback(() => {
    if (w2JobsForYear.length === 0) {
      toast.error('Enter W2 data for at least one job first');
      return;
    }
    if (!selectedTaxProfile?.filing_status && !profile?.filing_status && !showFilingForm) {
      setShowFilingForm(true);
      return;
    }
    runW2Calc(
      selectedTaxProfile?.filing_status ?? profile?.filing_status ?? filingStatus,
      selectedTaxProfile?.dependents ?? profile?.dependents ?? dependents,
      selectedTaxProfile?.use_standard_deduction ?? undefined,
      (selectedTaxProfile?.use_standard_deduction === false) ? (selectedTaxProfile?.itemized_deduction_amount ?? 0) : undefined,
      totalQuarterlyPayments,
      selectedTaxProfile?.child_tax_credit_eligible ?? undefined,
      undefined, // Other dependent credits must be explicitly confirmed.
    );
  }, [w2JobsForYear, profile, showFilingForm, filingStatus, dependents, totalQuarterlyPayments, runW2Calc, selectedTaxProfile]);

  const handleFilingSubmit = useCallback(async () => {
    setShowFilingForm(false);
    const totalDeps = ctcChildren + otherDeps;
    runW2Calc(filingStatus, totalDeps, useStandardDeduction, useStandardDeduction ? 0 : itemizedAmount, totalQuarterlyPayments, ctcChildren, otherDeps);

    // Persist filing preferences to the selected tax profile
    try {
      await saveSelected({
        filing_status: filingStatus,
        dependents: totalDeps,
        child_tax_credit_eligible: ctcChildren,
        use_standard_deduction: useStandardDeduction,
        itemized_deduction_amount: useStandardDeduction ? 0 : itemizedAmount,
      });
    } catch { /* silent — not critical */ }
  }, [filingStatus, ctcChildren, otherDeps, useStandardDeduction, itemizedAmount, totalQuarterlyPayments, runW2Calc, saveSelected]);

  const handleFilingSkip = useCallback(() => {
    setShowFilingForm(false);
    setFilingStatus('single');
    setUseStandardDeduction(true);
    setItemizedAmount(0);
    runW2Calc('single', 0, true, 0, 0);
  }, [runW2Calc]);

  const handleDeleteJob = useCallback(async (jobId: string) => {
    try {
      // All users: soft-delete to former (preserves W2 data, frees up active slot)
      // Former jobs don't count toward active-slot limits (see ADD-027).
      const res = await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast.success('Job marked as former');
    } catch {
      toast.error('Failed to mark job as former');
    }
  }, [queryClient]);

  const handleReactivateJob = useCallback(async (jobId: string) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employment_status: 'active' }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to reactivate');
      }
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast.success('Job reactivated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reactivate job');
    }
  }, [queryClient]);

  const handlePermanentDeleteJob = useCallback(async (jobId: string) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}?permanent=true`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['w2-entries'] });
      queryClient.invalidateQueries({ queryKey: ['ytd-snapshots'] });
      toast.success('Job archived; history retained');
    } catch {
      toast.error('Failed to delete job');
    }
  }, [queryClient]);

  const handleEnterW2 = useCallback((jobId: string) => {
    setW2JobId(jobId);
  }, []);

  const handleSetExtraWithholding = useCallback((job: Job) => {
    setExtraWhJobId(job.id);
    setExtraWhAmount(job.extra_withholding_per_paycheck ?? 0);
  }, []);

  const handleSaveExtraWithholding = useCallback(async () => {
    if (!extraWhJobId) return;
    try {
      const res = await fetch(`/api/jobs/${extraWhJobId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extra_withholding_per_paycheck: extraWhAmount }),
      });
      if (!res.ok) throw new Error('Failed');
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast.success('Extra withholding updated');
      setExtraWhJobId(null);
    } catch {
      toast.error('Failed to update');
    }
  }, [extraWhJobId, extraWhAmount, queryClient]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <LoadingSpinner />
      </div>
    );
  }

  if (jobsError) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ErrorState
          title="Couldn't load your jobs"
          description="Something went wrong. Please try again."
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  // Empty state
  if (jobs.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Reminders />
        <div className="max-w-lg mx-auto text-center py-20">
          <Briefcase className="size-12 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Welcome to MultiW2</h1>
          <p className="text-muted-foreground mb-8">
            Add your first job to get started. It takes about 30 seconds.
          </p>
          <Button size="lg" onClick={() => setCreateJobOpen(true)}>
            + Create your first job
          </Button>
          <ul className="mt-8 text-left text-sm text-muted-foreground space-y-2 max-w-sm mx-auto">
            <li className="flex gap-2">
              <span className="text-foreground">1.</span>
              Enter your pay stub YTD totals and see your projected tax liability
            </li>
            <li className="flex gap-2">
              <span className="text-foreground">2.</span>
              Track your withholding gap in real time as you add new pay stubs
            </li>
            <li className="flex gap-2">
              <span className="text-foreground">3.</span>
              Get W-4 adjustment recommendations per job
            </li>
            <li className="flex gap-2">
              <span className="text-foreground">4.</span>
              Model &ldquo;what if&rdquo; tax scenarios before making career moves
            </li>
          </ul>
        </div>
        <CreateJobModal open={createJobOpen} onOpenChange={setCreateJobOpen} />
      </div>
    );
  }

  // Active state
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <Reminders />
      <TaxProfileCard
        profile2025={taxProfile2025}
        profile2026={taxProfile2026}
        isLoading={tp2025Loading || tp2026Loading}
        onSave2025={save2025}
        onSave2026={save2026}
        onImport2025To2026={() => import2025To2026(2025)}
        isSaving={tp2025Saving || tp2026Saving}
        isImporting={tp2026Importing}
      />

      <JobManagementSection
        jobs={jobs}
        latestSnapshots={snapMap}
        staleJobIds={staleJobIds}
        w2JobIds={w2JobIds}
        onAddJob={handleAddJob}
        onAddSnapshot={(jobId) => setSnapshotJobId(jobId)}
        onEditJob={(job) => setEditingJob(job)}
        onDeleteJob={handleDeleteJob}
        onReactivateJob={handleReactivateJob}
        onPermanentDeleteJob={handlePermanentDeleteJob}
        onEnterW2={handleEnterW2}
        onSetExtraWithholding={handleSetExtraWithholding}
        onQuickAddSnapshot={() => {
          const active = jobs.filter(j => j.employment_status === 'active');
          if (active.length === 1) {
            setSnapshotJobId(active[0].id);
          } else if (active.length > 1) {
            setQuickSnapshotOpen(true);
          }
        }}
      />

      {/* Workflow cards */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Workflows</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Tax Calculator card — W2 analysis only */}
          <WorkflowCard
            title={`Tax Calculator${effectiveW2Year ? ` — ${effectiveW2Year} W2 Analysis` : ''}`}
            icon={Calculator}
            accentColor="border-l-blue-500"
            status={displayResult ? 'complete' : w2Years.length > 0 ? 'not-started' : 'not-started'}
            statusText={displayResult ? 'Calculation complete' : w2Years.length > 0 ? `${w2JobsForYear.length} W2s for ${effectiveW2Year}` : 'No W2 data yet'}
            primaryAction={w2Years.length > 0 ? {
              label: isCalculating ? 'Calculating...' : (displayResult ? 'Recalculate' : 'Calculate taxes'),
              onClick: handleRunCalc,
              disabled: isCalculating,
            } : {
              label: 'Enter W2 data',
              onClick: () => { if (jobs.length > 0) handleEnterW2(jobs[0].id); },
            }}
            secondaryAction={displayResult ? {
              label: 'View history',
              onClick: () => router.push('/dashboard/history'),
            } : null}
          >
            {w2Years.length === 0 ? (
              <div className="space-y-2">
                <p>Enter W2 data for at least one job to calculate your tax liability.</p>
                {jobs.length > 1 && (
                  <div className="space-y-1 pt-1">
                    {jobs.map((job) => (
                      <button
                        key={job.id}
                        onClick={() => handleEnterW2(job.id)}
                        className="flex items-center justify-between w-full text-xs px-2 py-1.5 rounded-md hover:bg-accent transition-colors"
                      >
                        <span className="truncate text-muted-foreground">{job.name}</span>
                        <span className="text-primary shrink-0 ml-2">Enter W2 &rarr;</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {/* Year selector */}
                {w2Years.length > 1 && (
                  <div className="flex items-center gap-2 pb-1">
                    <span className="text-xs text-muted-foreground">Tax year:</span>
                    <Select value={effectiveW2Year} onValueChange={(v) => { if (v) setW2Year(v); }}>
                      <SelectTrigger className="h-7 w-[90px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {w2Years.map((y) => (
                          <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Calculation Data toggle */}
                <button
                  type="button"
                  onClick={() => setCalcDataOpen(!calcDataOpen)}
                  className="flex items-center justify-between w-full text-xs text-muted-foreground hover:text-foreground py-1"
                >
                  <span>
                    Calculation Data: {w2JobsForYear.length} job{w2JobsForYear.length !== 1 ? 's' : ''}
                    {totalQuarterlyPayments > 0
                      ? ` · ${formatCurrency(totalQuarterlyPayments)} in quarterly payments`
                      : ' · No quarterly payments'}
                  </span>
                  <ChevronDown className={cn('size-3.5 transition-transform duration-200', calcDataOpen && 'rotate-180')} />
                </button>

                {calcDataOpen && (
                  <div className="space-y-2 pt-1">
                    {/* W2 job breakdown */}
                    <div className="space-y-0.5 text-xs">
                      {w2JobsForYear.map((entry) => {
                        const job = jobs.find((j) => j.id === entry.job_id);
                        return (
                          <div key={entry.id} className="flex items-center justify-between gap-2">
                            <span className="truncate text-muted-foreground">{job?.name ?? 'Unknown'}</span>
                            <div className="flex gap-3 shrink-0">
                              <span className="font-mono tabular-nums">{formatCurrency(entry.box1_wages)}</span>
                              <span className="font-mono tabular-nums text-muted-foreground">{formatCurrency(entry.box2_federal_withheld)} W/H</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Jobs missing W2 data */}
                    {jobsMissingW2.length > 0 && (
                      <div className="space-y-1 pt-1.5 border-t border-border/50">
                        <p className="text-xs text-muted-foreground">{jobsMissingW2.length} job{jobsMissingW2.length > 1 ? 's' : ''} missing W2 data:</p>
                        {jobsMissingW2.map((job) => (
                          <button
                            key={job.id}
                            onClick={() => handleEnterW2(job.id)}
                            className="flex items-center justify-between w-full text-xs px-2 py-1 rounded-md hover:bg-accent transition-colors"
                          >
                            <span className="truncate text-muted-foreground">{job.name}</span>
                            <span className="text-primary shrink-0 ml-2">Enter W2 &rarr;</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Quarterly estimated payments */}
                    {w2Years.length > 0 && (
                      <div className="space-y-1.5 pt-2 border-t border-border/50">
                        <p className="text-xs font-medium text-muted-foreground">2025 quarterly payments</p>
                        <div className="grid grid-cols-4 gap-2">
                          {['Q1', 'Q2', 'Q3', 'Q4'].map((q, i) => {
                            const field = `estimated_payment_q${i + 1}` as 'estimated_payment_q1' | 'estimated_payment_q2' | 'estimated_payment_q3' | 'estimated_payment_q4';
                            const amount = Number(taxProfile2025?.[field] ?? 0);
                            return (
                              <div key={q} className="space-y-0.5">
                                <span className="text-[10px] text-muted-foreground">{q}</span>
                                <p className="font-mono tabular-nums text-xs">{formatCurrency(amount)}</p>
                              </div>
                            );
                          })}
                        </div>
                        {totalQuarterlyPayments > 0 && (
                          <p className="text-[10px] text-muted-foreground">
                            Total: {formatCurrency(totalQuarterlyPayments)}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Staleness indicators */}
                {displayResult && !result && (filingStatusChanged || newW2DataAvailable || quarterlyPaymentsChanged) && (
                  <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 pt-1">
                    <AlertTriangle className="size-3.5 shrink-0" />
                    <span>
                      {filingStatusChanged
                        ? 'Filing status changed'
                        : quarterlyPaymentsChanged
                          ? 'Quarterly payments changed'
                          : 'New W2 data available'}
                    </span>
                    <Button size="sm" variant="outline" onClick={handleRunCalc} disabled={isCalculating} className="ml-auto h-7 text-xs">
                      Recalculate
                    </Button>
                  </div>
                )}

                {/* Results */}
                {displayResult && (
                  <div className="space-y-1 pt-2 border-t border-border">
                    <div className="flex justify-between">
                      <span>Owed at filing</span>
                      <span className={`font-mono tabular-nums font-medium ${
                        displayResult.federal.remainingBalance > 0 ? 'text-destructive' : 'text-success'
                      }`}>
                        {displayResult.isApproximate
                          ? formatAmount(Math.abs(displayResult.federal.remainingBalance))
                          : formatCurrency(Math.abs(displayResult.federal.remainingBalance))}
                        {displayResult.federal.remainingBalance > 0 ? ' owed' : ' refund'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Federal tax liability</span>
                      <span className="font-mono tabular-nums font-medium text-foreground">
                        {displayResult.isApproximate && displayResult.liabilityRange
                          ? `${formatCurrency(displayResult.liabilityRange.min)} – ${formatCurrency(displayResult.liabilityRange.max)}`
                          : formatCurrency(displayResult.federal.totalFederalTax)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Withholding gap</span>
                      <span className={`font-mono tabular-nums font-medium ${
                        displayResult.federal.withholdingGap > 0 ? 'text-destructive' : 'text-success'
                      }`}>
                        {formatAmount(Math.abs(displayResult.federal.withholdingGap))}
                        {displayResult.federal.withholdingGap > 0 ? ' underpaid' : ' overpaid'}
                      </span>
                    </div>
                    {displayResult.socialSecurity.overpayment > 0 && (
                      <div className="flex justify-between">
                        <span>SS overpayment</span>
                        <span className="font-mono tabular-nums font-medium text-foreground">
                          {formatAmount(displayResult.socialSecurity.overpayment)}
                        </span>
                      </div>
                    )}
                    {displayResult.w4.recommendationStatus === 'projected' && displayResult.w4.adjustments.some((a) => a.recommendedExtraWithholding > 0) && (() => {
                      const adj = displayResult.w4.adjustments.find((a) => a.recommendedExtraWithholding > 0)!;
                      return (
                        <div className="flex justify-between">
                          <span>W-4 extra withholding</span>
                          <span className="font-mono tabular-nums font-medium text-foreground">
                            {`${formatCurrency(adj.recommendedExtraWithholding)}/paycheck at ${adj.jobName}`}
                          </span>
                        </div>
                      );
                    })()}
                    {displayResult.quarterly.requiredAnnualEstimate > 0 && (() => {
                      const nextQ = displayResult.quarterly.quarterlyPayments.find((q) => !q.isPast);
                      if (!nextQ || nextQ.amount <= 0) return null;
                      return (
                        <div className="flex justify-between">
                          <span>Next quarterly payment</span>
                          <span className="font-mono tabular-nums font-medium text-foreground">
                            {formatAmount(nextQ.amount)}
                          </span>
                        </div>
                      );
                    })()}
                    {/* Last calculated timestamp */}
                    {latestSavedCalc && !result && (
                      <p className="text-xs text-muted-foreground pt-1">
                        Last calculated: {getRelativeTime(latestSavedCalc.updatedAt)}
                      </p>
                    )}
                    {result && (
                      <p className="text-xs text-muted-foreground pt-1">Last calculated: just now</p>
                    )}
                  </div>
                )}
              </div>
            )}
            {calcError && (
              <p className="text-destructive text-xs mt-2">{calcError}</p>
            )}
          </WorkflowCard>

          {/* Filing status inline form */}
          {showFilingForm && (
            <div className="lg:col-span-2 border border-border rounded-lg p-5 space-y-4">
              <h3 className="font-semibold">Filing status</h3>
              <p className="text-sm text-muted-foreground">We need this for your first calculation. You can change it later in Account settings.</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <div className="space-y-1.5">
                  <Label>Filing status</Label>
                  <Select value={filingStatus} onValueChange={(v) => { if (v) setFilingStatus(v as FilingStatus); }}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single">Single</SelectItem>
                      <SelectItem value="married_filing_jointly">Married Filing Jointly</SelectItem>
                      <SelectItem value="married_filing_separately">Married Filing Separately</SelectItem>
                      <SelectItem value="head_of_household">Head of Household</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ctc-children">Children under 17</Label>
                  <input
                    id="ctc-children"
                    type="number"
                    min={0}
                    value={ctcChildren}
                    onChange={(e) => setCtcChildren(parseInt(e.target.value) || 0)}
                    className="flex h-8 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="other-deps">Other dependents</Label>
                  <input
                    id="other-deps"
                    type="number"
                    min={0}
                    value={otherDeps}
                    onChange={(e) => setOtherDeps(parseInt(e.target.value) || 0)}
                    className="flex h-8 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Deductions</Label>
                  <Select
                    value={useStandardDeduction ? 'standard' : 'itemized'}
                    onValueChange={(v) => {
                      if (v === 'standard') {
                        setUseStandardDeduction(true);
                        setItemizedAmount(0);
                      } else if (v === 'itemized') {
                        setUseStandardDeduction(false);
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard deduction</SelectItem>
                      <SelectItem value="itemized">Itemized deductions</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {!useStandardDeduction && (
                  <div className="space-y-1.5">
                    <Label htmlFor="itemized-amount">Itemized amount</Label>
                    <input
                      id="itemized-amount"
                      type="number"
                      min={0}
                      value={itemizedAmount || ''}
                      onChange={(e) => setItemizedAmount(parseFloat(e.target.value) || 0)}
                      placeholder="Total itemized deductions"
                      className="flex h-8 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm font-mono tabular-nums"
                    />
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleFilingSubmit}>Calculate</Button>
                <Button size="sm" variant="ghost" onClick={handleFilingSkip}>Skip (use Single)</Button>
              </div>
            </div>
          )}

          {/* Estimate Tax Liability card — projection-based */}
          {(() => {
            const trackedCount = jobs.filter((j) => snapMap.has(j.id)).length;
            const hasSnapshots = snapMap.size > 0;
            const staleCount = staleJobIds.size;

            const dashProjection = hasSnapshots
              ? computeProjections(jobs, snapMap, taxProfile2026?.filing_status ?? profile?.filing_status ?? 'single', taxProfile2026?.dependents ?? profile?.dependents ?? 0, taxProfile2026?.use_standard_deduction ?? profile?.use_standard_deduction ?? true, totalQuarterlyPayments2026, (taxProfile2026?.use_standard_deduction ?? true) ? 0 : Number(taxProfile2026?.itemized_deduction_amount ?? 0), TAX_YEAR, taxProfile2026?.child_tax_credit_eligible ?? 0)
              : null;

            const projectedAnnualIncome = dashProjection?.jobProjections.reduce((s, j) => s + j.projectedGross, 0) ?? 0;
            const projectedFedWithheld = dashProjection?.jobProjections.reduce((s, j) => s + j.projectedFedWithheld, 0) ?? 0;

            return (
              <WorkflowCard
                title="Estimate Tax Liability"
                icon={BarChart3}
                accentColor="border-l-emerald-500"
                status={hasSnapshots ? (staleCount > 0 ? 'stale' : 'complete') : 'not-started'}
                statusText={hasSnapshots ? `${trackedCount} of ${jobs.length} jobs tracked` : 'Not started'}
                primaryAction={{
                  label: hasSnapshots ? 'View estimator' : 'Add snapshot',
                  onClick: () => {
                    if (hasSnapshots) {
                      router.push('/dashboard/tracker');
                    } else if (jobs.length > 0) {
                      setSnapshotJobId(jobs[0].id);
                    }
                  },
                }}
              >
                {hasSnapshots ? (
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span>Projected annual income</span>
                      <span className="font-mono tabular-nums font-medium text-foreground">
                        {formatAmount(projectedAnnualIncome)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Projected federal withheld</span>
                      <span className="font-mono tabular-nums font-medium text-foreground">
                        {formatAmount(projectedFedWithheld)}
                      </span>
                    </div>
                    {dashProjection && (
                      <div className="flex justify-between">
                        <span>Projected gap</span>
                        <span className={`font-mono tabular-nums font-medium ${
                          dashProjection.federal.withholdingGap > 0 ? 'text-destructive' : 'text-success'
                        }`}>
                          {formatAmount(Math.abs(dashProjection.federal.withholdingGap))}
                          {dashProjection.federal.withholdingGap > 0 ? ' owed' : ' refund'}
                        </span>
                      </div>
                    )}
                    {dashProjection?.w4.adjustments.some((a) => a.recommendedExtraWithholding > 0) && (
                      <div className="flex justify-between">
                        <span>Est. W-4 extra</span>
                        <span className="font-mono tabular-nums font-medium text-foreground">
                          {formatAmount(dashProjection.w4.adjustments.find((a) => a.recommendedExtraWithholding > 0)!.recommendedExtraWithholding)}/paycheck
                        </span>
                      </div>
                    )}
                    {dashProjection && dashProjection.quarterly.requiredAnnualEstimate > 0 && (() => {
                      const nextQ = dashProjection.quarterly.quarterlyPayments.find((q) => !q.isPast);
                      if (!nextQ || nextQ.amount <= 0) return null;
                      return (
                        <div className="flex justify-between">
                          <span>Est. quarterly payment</span>
                          <span className="font-mono tabular-nums font-medium text-foreground">
                            {formatAmount(nextQ.amount)}
                          </span>
                        </div>
                      );
                    })()}
                    {staleCount > 0 && (
                      <div className="flex items-center gap-1.5 mt-2 text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="size-3.5" />
                        <span className="text-xs">{staleCount} job{staleCount > 1 ? 's' : ''} need{staleCount === 1 ? 's' : ''} an update</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p>Add your first YTD snapshot from a pay stub to start tracking.</p>
                )}
              </WorkflowCard>
            );
          })()}

          {/* Benefits Optimizer card — functional */}
          {(() => {
            const activeBenefitPlans = benefitPlans.filter((p) => p.isActive);
            const hasPlans = activeBenefitPlans.length > 0;
            const totalEstMatch = activeBenefitPlans.reduce((sum, p) => {
              const salary = jobs.find((j) => j.id === p.jobId)?.annual_salary;
              const sal = Number(salary ?? 0);
              if (p.matchType === 'percentage') {
                return sum + (sal * p.matchCapPercent / 100) * (p.matchPercent / 100);
              }
              return sum + p.matchCapDollar * (p.matchPercent / 100);
            }, 0);

            return (
              <WorkflowCard
                title="Benefits Optimizer"
                icon={DollarSign}
                accentColor="border-l-amber-500"
                status={hasPlans ? 'complete' : 'not-started'}
                statusText={hasPlans ? `${activeBenefitPlans.length} plan${activeBenefitPlans.length > 1 ? 's' : ''} configured` : 'Not started'}
                isLoading={benefitsLoading}
                primaryAction={{
                  label: hasPlans ? 'View benefits' : 'Configure benefits',
                  onClick: () => router.push('/dashboard/benefits'),
                }}
              >
                {hasPlans ? (
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span>Active plans</span>
                      <span className="font-mono tabular-nums font-medium text-foreground">
                        {activeBenefitPlans.length}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Est. annual match</span>
                      <span className="font-mono tabular-nums font-medium text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(totalEstMatch)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p>Compare employer benefits across jobs</p>
                )}
              </WorkflowCard>
            );
          })()}

          <WorkflowCard title="Scanner History" icon={Search} accentColor="border-l-pink-500"
            status={scanHistory.length ? 'complete' : 'not-started'} statusText={scanHistory.length + ' imported scans'}
            primaryAction={{ label: 'View history', onClick: () => router.push('/dashboard/scanner') }}>
            <p>AI scanning is disabled. Compare a prospective job offline in Scenarios.</p>
          </WorkflowCard>

          {/* Tax Scenarios card */}
          {(() => {
            const latestScenario = scenarios[0];
            const latestImpact = latestScenario?.taxImpact ? Number(latestScenario.taxImpact) : null;
            return (
              <WorkflowCard
                title="Tax Scenarios"
                icon={Target}
                accentColor="border-l-violet-500"
                status={scenarios.length > 0 ? 'complete' : 'not-started'}
                statusText={scenarios.length > 0 ? `${scenarios.length} scenario${scenarios.length > 1 ? 's' : ''} saved` : 'Not started'}
                primaryAction={{
                  label: scenarios.length > 0 ? 'View scenarios' : 'Create scenario',
                  onClick: () => router.push('/dashboard/scenarios'),
                }}
              >
                {latestScenario ? (
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="truncate">{latestScenario.name}</span>
                      <span className={`font-mono tabular-nums font-medium ${
                        (latestImpact ?? 0) > 0 ? 'text-destructive' : (latestImpact ?? 0) < 0 ? 'text-success' : ''
                      }`}>
                        {latestImpact !== null ? `${latestImpact > 0 ? '+' : ''}${formatCurrency(latestImpact)}` : '—'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p>Model &ldquo;what if&rdquo; before you make the move. See the tax impact of quitting a job, adding a 1099 gig, or maxing out your 401(k).</p>
                )}
              </WorkflowCard>
            );
          })()}

          {/* Tax Prep Kit card */}
          {(() => {
            const taxPrepDocs = taxPrepKit?.documents ?? [];
            const collected = taxPrepDocs.filter((d) => d.status !== 'needed').length;
            const total = taxPrepDocs.length;
            const hasSafeHarbor = taxPrepKit?.safeHarborStatus != null;
            const safeHarborMet = taxPrepKit?.safeHarborStatus?.isSafeHarbor;

            return (
              <WorkflowCard
                title="Tax Prep Kit"
                icon={workflowIcons['ClipboardList']}
                accentColor="border-l-cyan-500"
                status={total > 0 && collected === total ? 'complete' : total > 0 ? 'in-progress' : 'not-started'}
                statusText={total > 0 ? `${collected} of ${total} documents` : 'Not started'}
                primaryAction={{
                  label: 'View checklist',
                  onClick: () => router.push('/dashboard/tax-prep'),
                }}
              >
                {total > 0 ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{collected} of {total} documents collected</span>
                      <span>{Math.round((collected / total) * 100)}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-cyan-500 rounded-full transition-all"
                        style={{ width: `${Math.round((collected / total) * 100)}%` }}
                      />
                    </div>
                    {hasSafeHarbor && (
                      <p className="text-xs text-muted-foreground pt-0.5">
                        Safe harbor: {safeHarborMet ? <span className="text-emerald-500">Met</span> : <span className="text-amber-500">Not met</span>}
                      </p>
                    )}
                  </div>
                ) : (
                  <p>{getWorkflowDescription('tax-prep')}</p>
                )}
              </WorkflowCard>
            );
          })()}
        </div>
      </section>

      {null}

      {/* Modals */}
      <CreateJobModal open={createJobOpen} onOpenChange={setCreateJobOpen} />
      <CreateJobModal
        open={!!editingJob}
        onOpenChange={(open) => { if (!open) setEditingJob(null); }}
        editJob={editingJob ? {
          id: editingJob.id,
          name: editingJob.name,
          annual_salary: Number(editingJob.annual_salary),
          income_source: editingJob.income_source as 'w2' | 'paystub',
          pay_frequency: editingJob.pay_frequency,
          started_this_year: editingJob.started_this_year,
          start_month: editingJob.start_month,
          extra_withholding_per_paycheck: editingJob.extra_withholding_per_paycheck,
        } : undefined}
      />

      {snapshotJobId && (() => {
        const job = jobs.find((j) => j.id === snapshotJobId);
        return job ? (
          <SnapshotForm
            open={!!snapshotJobId}
            onOpenChange={(open) => { if (!open) setSnapshotJobId(null); }}
            jobId={job.id}
            jobName={job.name}
            priorSnapshot={snapMap.get(job.id)}
          />
        ) : null;
      })()}
      <ResponsiveModal open={quickSnapshotOpen} onOpenChange={setQuickSnapshotOpen} title="Which job?">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Select the job to add YTD data for:</p>
          <div className="space-y-2">
            {jobs.filter(j => j.employment_status === 'active').map((job) => (
              <button
                key={job.id}
                type="button"
                onClick={() => {
                  setQuickSnapshotOpen(false);
                  setSnapshotJobId(job.id);
                }}
                className="w-full flex items-center justify-between rounded-lg border border-border p-3 text-left hover:bg-accent/50 transition-colors"
              >
                <span className="text-sm font-medium">{job.name}</span>
                <span className="text-xs text-muted-foreground">
                  {snapMap.get(job.id) ? 'Update' : 'New'}
                </span>
              </button>
            ))}
          </div>
        </div>
      </ResponsiveModal>
      {w2JobId && (() => {
        const job = jobs.find((j) => j.id === w2JobId);
        const existingW2 = w2Entries.find((e) => e.job_id === w2JobId);
        return job ? (
          <W2Wizard
            open={!!w2JobId}
            onOpenChange={(open) => { if (!open) setW2JobId(null); }}
            jobId={job.id}
            jobName={job.name}
            annualSalary={Number(job.annual_salary)}
            existingEntry={existingW2}
          />
        ) : null;
      })()}

      {/* Extra withholding modal */}
      {extraWhJobId && (
        <ResponsiveModal
          open={!!extraWhJobId}
          onOpenChange={(v) => { if (!v) setExtraWhJobId(null); }}
          title="Set extra W-4 withholding"
        >
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              W-4 Line 4(c) — additional federal tax withheld each paycheck for {jobs.find(j => j.id === extraWhJobId)?.name ?? 'this job'}.
            </p>
            <CurrencyInput
              id="extra-wh-modal"
              value={extraWhAmount || undefined}
              onChange={(v) => setExtraWhAmount(v ?? 0)}
              placeholder="0"
            />
            <Button className="w-full" onClick={handleSaveExtraWithholding}>
              Save
            </Button>
          </div>
        </ResponsiveModal>
      )}
    </div>
  );
}

function getRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
  return new Date(dateStr).toLocaleDateString();
}

function getWorkflowDescription(id: string): string {
  const descriptions: Record<string, string> = {
    tracker: 'Track your withholding without logging every paycheck. Enter YTD totals from your pay stub whenever it\'s convenient.',
    scenarios: 'Model "what if" before you make the move. See the tax impact of quitting a job, adding a 1099 gig, or maxing out your 401(k).',
    benefits: 'Stop leaving money on the table across employers. Optimize your 401(k) and HSA contributions across all jobs.',
    'tax-prep': 'Walk into tax season ready. A guided checklist of every document you\'ll need, plus safe harbor analysis.',
    scanner: 'Evaluate any job posting for compatibility. AI-powered scoring across 6 dimensions.',
  };
  return descriptions[id] ?? '';
}

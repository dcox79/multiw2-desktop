'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, AlertTriangle, BarChart3, TrendingDown, TrendingUp, Minus, Shield, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { EmptyState } from '@/components/shared/empty-state';
import { SnapshotForm } from './snapshot-form';
import { SnapshotHistoryTable } from './snapshot-history-table';
import { useJobs } from '@/hooks/use-jobs';
import { useYTDSnapshots } from '@/hooks/use-ytd-snapshots';
import { useW2Entries } from '@/hooks/use-w2-entries';
import { useTaxProfile } from '@/hooks/use-tax-profile';
import { computeProjections } from '@/lib/tax/projections';
import { STANDARD_DEDUCTION } from '@/lib/tax/tax-data-2026';
import { STALENESS_THRESHOLDS } from '@/lib/constants';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { Job, YTDSnapshot, SafeHarborResult } from '@/lib/types';

const FILING_STATUS_LABELS: Record<string, string> = {
  single: 'Single',
  married_filing_jointly: 'Married Filing Jointly',
  married_filing_separately: 'Married Filing Separately',
  head_of_household: 'Head of Household',
};

function formatFilingStatus(status: string): string {
  return FILING_STATUS_LABELS[status] || status;
}

function parseLocalDate(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00');
}

function formatApprox(value: number): string { return formatCurrency(value); }

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - parseLocalDate(dateStr).getTime()) / 86_400_000);
}

function isStale(snapshot: YTDSnapshot | undefined, job: Job): boolean {
  if (!snapshot) return false;
  const threshold = STALENESS_THRESHOLDS[job.pay_frequency] ?? 17;
  return daysSince(snapshot.paycheck_date) > threshold;
}

export function TrackerContent() {
  const router = useRouter();
  const { jobs: allJobs, activeJobs: jobs, isLoading: jobsLoading } = useJobs(true);
  const { snapshots, isLoading: snapsLoading } = useYTDSnapshots();
  const { entries: w2Entries } = useW2Entries();
  const { profile: taxProfile, isLoading: tpLoading } = useTaxProfile(2026);

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [snapshotFormJobId, setSnapshotFormJobId] = useState<string | null>(null);
  const [safeHarbor, setSafeHarbor] = useState<(SafeHarborResult & { perPaycheckRecommendation?: number }) | null>(null);

  const estimatedPaymentsYTD = (
    Number(taxProfile?.estimated_payment_q1 ?? 0) +
    Number(taxProfile?.estimated_payment_q2 ?? 0) +
    Number(taxProfile?.estimated_payment_q3 ?? 0) +
    Number(taxProfile?.estimated_payment_q4 ?? 0)
  );
  const itemizedAmount = Number(taxProfile?.itemized_deduction_amount ?? 0);

  const isLoading = jobsLoading || snapsLoading || tpLoading;

  // Group snapshots by job
  const snapshotsByJob = useMemo(() => {
    const map = new Map<string, YTDSnapshot[]>();
    for (const snap of snapshots) {
      const existing = map.get(snap.job_id) ?? [];
      existing.push(snap);
      map.set(snap.job_id, existing);
    }
    for (const [, list] of map) {
      list.sort((a, b) => new Date(b.paycheck_date).getTime() - new Date(a.paycheck_date).getTime());
    }
    return map;
  }, [snapshots]);

  // Latest snapshot per job
  const latestByJob = useMemo(() => {
    const map = new Map<string, YTDSnapshot>();
    for (const [jobId, list] of snapshotsByJob) {
      const selected = list.find(snap => snap.paycheck_date.startsWith('2026-'));
      if (selected) map.set(jobId, selected);
    }
    return map;
  }, [snapshotsByJob]);

  // Automatic projection — runs whenever data changes
  const projection = useMemo(() => {
    return computeProjections(
      jobs,
      latestByJob,
      taxProfile?.filing_status ?? 'single',
      taxProfile?.dependents ?? 0,
      taxProfile?.use_standard_deduction ?? true,
      estimatedPaymentsYTD,
      taxProfile?.use_standard_deduction ? 0 : itemizedAmount,
      undefined,
      taxProfile?.child_tax_credit_eligible ?? 0,
    );
  }, [jobs, latestByJob, taxProfile, estimatedPaymentsYTD, itemizedAmount]);

  // Fetch safe harbor from API (uses prior year W2 data for threshold, current year payments for amount paid)
  const hasPriorW2 = w2Entries.length > 0;
  useEffect(() => {
    if (!hasPriorW2) return;
    fetch('/api/safe-harbor')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data && !data.error) setSafeHarbor(data); })
      .catch(() => {});
  }, [hasPriorW2, taxProfile]);

  // Filtered jobs
  const visibleJobs = selectedJobId
    ? allJobs.filter((j) => j.id === selectedJobId)
    : allJobs;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <LoadingSpinner />
      </div>
    );
  }

  const hasAnySnapshots = snapshots.length > 0;

  // Determine action item — use remainingBalance (includes quarterly payments) not withholdingGap
  const projectedBalance = projection?.federal.remainingBalance ?? 0;
  const actionStatus: 'underpaid' | 'overpaid' | 'on-track' =
    projectedBalance > 1000 ? 'underpaid' : projectedBalance < -1000 ? 'overpaid' : 'on-track';

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
        <h1 className="text-2xl font-bold">Estimate Tax Liability</h1>
      </div>
      <p className="text-muted-foreground mb-6 ml-8">
        Projected tax liability based on your pay stubs
      </p>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedJobId(null)}
            className={cn(
              'px-3 py-1 text-sm rounded-md border transition-colors',
              !selectedJobId
                ? 'bg-foreground text-background border-foreground'
                : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
            )}
          >
            All Jobs
          </button>
          {jobs.map((job) => (
            <button
              key={job.id}
              onClick={() => setSelectedJobId(job.id)}
              className={cn(
                'px-3 py-1 text-sm rounded-md border transition-colors',
                selectedJobId === job.id
                  ? 'bg-foreground text-background border-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
              )}
            >
              {job.name}
            </button>
          ))}
        </div>

        <Button
          size="sm"
          onClick={() => setSnapshotFormJobId(jobs[0]?.id ?? null)}
          disabled={jobs.length === 0}
        >
          <Plus className="size-4 mr-1" />
          Add snapshot
        </Button>
      </div>

      {!hasAnySnapshots ? (
        <EmptyState
          icon={BarChart3}
          title="No snapshots yet"
          description="Add your first YTD snapshot from a pay stub to start tracking your withholding."
          action={jobs.length > 0 ? {
            label: 'Add your first snapshot',
            onClick: () => setSnapshotFormJobId(jobs[0].id),
          } : undefined}
        />
      ) : (
        <div className="space-y-6">
          {/* Your Tax Profile (read-only) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">2026 Tax Profile</CardTitle>
              <p className="text-xs text-muted-foreground">These settings affect all projections below</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Row 1: Filing status, Dependents, Deductions */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Filing status</Label>
                  <p className="text-sm font-medium">
                    {formatFilingStatus(taxProfile?.filing_status ?? 'single')}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Dependents</Label>
                  <p className="text-sm font-medium">
                    {taxProfile?.dependents ?? 0}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Deductions</Label>
                  <p className="text-sm font-medium">
                    {taxProfile?.use_standard_deduction !== false
                      ? `Standard ($${(STANDARD_DEDUCTION[taxProfile?.filing_status ?? 'single'] ?? 0).toLocaleString()})`
                      : `Itemized: ${formatCurrency(itemizedAmount)}`}
                  </p>
                </div>
              </div>

              {/* Row 2: Quarterly estimated payments (read-only) */}
              <div className="space-y-1.5">
                <Label className="text-xs">Quarterly estimated payments</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {['Q1', 'Q2', 'Q3', 'Q4'].map((q, i) => {
                    const field = `estimated_payment_q${i + 1}` as 'estimated_payment_q1' | 'estimated_payment_q2' | 'estimated_payment_q3' | 'estimated_payment_q4';
                    const amount = Number(taxProfile?.[field] ?? 0);
                    return (
                      <div key={q} className="space-y-1">
                        <p className="text-xs text-muted-foreground">{q}</p>
                        <p className="font-mono tabular-nums text-sm">{formatCurrency(amount)}</p>
                      </div>
                    );
                  })}
                </div>
                {estimatedPaymentsYTD > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Total: {formatCurrency(estimatedPaymentsYTD)} in estimated payments
                  </p>
                )}
              </div>

              {/* Edit link */}
              <p className="text-xs text-muted-foreground">
                Edit your tax profile in the{' '}
                <button onClick={() => router.push('/dashboard')} className="text-primary underline-offset-2 hover:underline">
                  2026 Tax Profile
                </button>
                {' '}on the dashboard.
              </p>
            </CardContent>
          </Card>

          {/* Action item alert */}
          {projection && (
            <Card className={cn('border-l-4 p-0', {
              'border-l-red-500': actionStatus === 'underpaid',
              'border-l-emerald-500': actionStatus === 'overpaid',
              'border-l-blue-500': actionStatus === 'on-track',
            })}>
              <CardContent className="py-4 px-5">
                <div className="flex items-start gap-3">
                  {actionStatus === 'underpaid' && <TrendingDown className="size-5 text-destructive shrink-0 mt-0.5" />}
                  {actionStatus === 'overpaid' && <TrendingUp className="size-5 text-success shrink-0 mt-0.5" />}
                  {actionStatus === 'on-track' && <Minus className="size-5 text-blue-500 shrink-0 mt-0.5" />}
                  <div>
                    {actionStatus === 'underpaid' && (
                      <>
                        <p className="font-semibold text-destructive">
                          You&apos;re on track to owe {formatApprox(projectedBalance)} at filing
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {estimatedPaymentsYTD > 0
                            ? `After ${formatCurrency(estimatedPaymentsYTD)} in estimated payments. Consider increasing withholding or adding more.`
                            : 'Consider increasing withholding or making estimated payments.'}
                        </p>
                      </>
                    )}
                    {actionStatus === 'overpaid' && (
                      <>
                        <p className="font-semibold text-success">
                          You&apos;re on track for a {formatApprox(Math.abs(projectedBalance))} refund
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {estimatedPaymentsYTD > 0
                            ? `Including ${formatCurrency(estimatedPaymentsYTD)} in estimated payments. You could reduce withholding.`
                            : 'You could reduce withholding to keep more per paycheck.'}
                        </p>
                      </>
                    )}
                    {actionStatus === 'on-track' && (
                      <>
                        <p className="font-semibold text-blue-600 dark:text-blue-400">
                          You&apos;re roughly on track
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          No immediate action needed. Projected balance: {formatApprox(Math.abs(projectedBalance))}{projectedBalance > 0 ? ' owed' : projectedBalance < 0 ? ' refund' : ''}.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Projection summary */}
          {projection && (
            <Card className="border-l-4 border-l-emerald-500">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="size-5" />
                  Year-end Projections
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Based on current earning rate through {parseLocalDate(projection.latestSnapshotDate).toLocaleDateString()}
                </p>
              </CardHeader>
              <CardContent>
                {projection.hasWarnings && (
                  <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 mb-3">
                    <AlertTriangle className="size-3.5 shrink-0" />
                    Some projections were capped or have limited data — see Data Sources below
                  </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div className="overflow-hidden">
                    <p className="text-xs text-muted-foreground">Projected federal tax</p>
                    <p className="font-mono tabular-nums font-semibold truncate">{formatApprox(projection.federal.totalFederalTax)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Owed at filing</p>
                    <p className={cn('font-mono tabular-nums font-semibold', projection.federal.remainingBalance > 0 ? 'text-destructive' : 'text-success')}>
                      {formatApprox(Math.abs(projection.federal.remainingBalance))}
                      {projection.federal.remainingBalance > 0 ? ' owed' : ' refund'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Withholding gap</p>
                    <p className={cn('font-mono tabular-nums font-semibold', projection.federal.withholdingGap > 0 ? 'text-destructive' : 'text-success')}>
                      {formatApprox(Math.abs(projection.federal.withholdingGap))}
                      {projection.federal.withholdingGap > 0 ? ' under' : ' over'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Projected SS overpayment</p>
                    <p className="font-mono tabular-nums font-semibold">{formatApprox(projection.socialSecurity.overpayment)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Projected Medicare gap</p>
                    <p className={cn('font-mono tabular-nums font-semibold', projection.medicare.medicareGap > 0 ? 'text-destructive' : 'text-success')}>
                      {formatApprox(Math.abs(projection.medicare.medicareGap))}
                      {projection.medicare.medicareGap > 0 ? ' owed' : ' overpaid'}
                    </p>
                  </div>
                  {projection.quarterly.requiredAnnualEstimate > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground">Recommended quarterly payment</p>
                      <p className="font-mono tabular-nums font-semibold">
                        {formatApprox(projection.quarterly.quarterlyPayments.find((q) => !q.isPast)?.amount ?? 0)}
                      </p>
                    </div>
                  )}
                  {projection.w4.adjustments.some((a) => a.recommendedExtraWithholding > 0) && (
                    <div>
                      <p className="text-xs text-muted-foreground">Recommended W-4 extra</p>
                      <p className="font-mono tabular-nums font-semibold">
                        {formatApprox(projection.w4.adjustments.find((a) => a.recommendedExtraWithholding > 0)?.recommendedExtraWithholding ?? 0)}/paycheck
                      </p>
                    </div>
                  )}
                </div>
                {null}
              </CardContent>
            </Card>
          )}

          {/* Safe harbor status */}
          {safeHarbor && (
            <Card className={cn('border-l-4', safeHarbor.isSafeHarbor ? 'border-l-emerald-500' : 'border-l-amber-500')}>
              <CardContent className="py-4 px-5">
                <div className="flex items-start gap-3">
                  <Shield className={cn('size-5 shrink-0 mt-0.5', safeHarbor.isSafeHarbor ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')} />
                  <div>
                    <p className="font-semibold text-sm">
                      Safe Harbor: {safeHarbor.isSafeHarbor ? 'Met' : 'Not met'}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {safeHarbor.recommendation}
                    </p>
                  </div>
                </div>
                {/* Safe harbor breakdown */}
                <div className="mt-3 grid grid-cols-3 gap-4 pt-3 border-t border-border">
                  <div>
                    <p className="text-xs text-muted-foreground">Threshold ({safeHarbor.thresholdPercent}%)</p>
                    <p className="font-mono tabular-nums text-sm font-medium">{formatCurrency(safeHarbor.thresholdAmount)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Paid to date</p>
                    <p className="font-mono tabular-nums text-sm font-medium">{formatCurrency(safeHarbor.amountPaidToDate)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{safeHarbor.shortfall > 0 ? 'Shortfall' : 'Surplus'}</p>
                    <p className={cn('font-mono tabular-nums text-sm font-medium', safeHarbor.shortfall > 0 ? 'text-destructive' : 'text-success')}>
                      {formatCurrency(Math.abs(safeHarbor.shortfall))}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Per-job snapshot cards */}
          {visibleJobs.map((job) => {
            const jobSnapshots = snapshotsByJob.get(job.id) ?? [];
            const latest = latestByJob.get(job.id);
            const stale = latest ? isStale(latest, job) : false;
            const staleDays = latest ? daysSince(latest.paycheck_date) : 0;

            return (
              <Card key={job.id} className="border-l-4 border-l-emerald-500 p-0 overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border">
                  <div>
                    <h2 className="font-semibold">{job.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      <span className="font-mono tabular-nums">{formatCurrency(Number(job.annual_salary))}</span>
                      {' · '}{job.pay_frequency}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {stale && (
                      <Badge variant="secondary" className="gap-1 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800">
                        <AlertTriangle className="size-3" />
                        {staleDays}d ago
                      </Badge>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setSnapshotFormJobId(job.id)}>
                      <Plus className="size-3.5 mr-1" />
                      Add snapshot
                    </Button>
                  </div>
                </div>

                {stale && (
                  <div className="flex items-center gap-2 px-5 py-2.5 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 text-sm">
                    <AlertTriangle className="size-4 shrink-0" />
                    Last updated {staleDays} days ago — consider adding a new snapshot
                  </div>
                )}

                {latest && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 px-5 py-4 border-b border-border">
                    <div>
                      <p className="text-xs text-muted-foreground">YTD Gross</p>
                      <p className="font-mono tabular-nums font-semibold">{formatCurrency(Number(latest.ytd_gross))}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">YTD Federal</p>
                      <p className="font-mono tabular-nums font-semibold">{formatCurrency(Number(latest.ytd_federal_withheld))}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">YTD SS</p>
                      <p className="font-mono tabular-nums font-semibold">{formatCurrency(Number(latest.ytd_ss_withheld))}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">YTD Medicare</p>
                      <p className="font-mono tabular-nums font-semibold">{formatCurrency(Number(latest.ytd_medicare_withheld))}</p>
                    </div>
                  </div>
                )}

                {jobSnapshots.length > 0 && (
                  <div className="px-5 py-4">
                    <SnapshotHistoryTable snapshots={jobSnapshots} jobId={job.id} jobName={job.name} />
                  </div>
                )}

                {jobSnapshots.length === 0 && (
                  <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                    No snapshots yet for this job.{' '}
                    <button onClick={() => setSnapshotFormJobId(job.id)} className="underline hover:text-foreground">Add one</button>
                  </div>
                )}
              </Card>
            );
          })}

          {/* Data Sources */}
          {projection && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Clock className="size-4" />
                  Data Sources
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-2">
                  {projection.jobProjections.length} job{projection.jobProjections.length !== 1 ? 's' : ''} included in projections
                </p>
                <div className="space-y-1.5">
                  {projection.jobProjections.map((jp) => {
                    const snap = latestByJob.get(jp.jobId);
                    const job = jobs.find((j) => j.id === jp.jobId);
                    const stale = snap && job ? isStale(snap, job) : false;
                    return (
                      <div key={jp.jobId}>
                        <div className="flex items-center justify-between text-xs gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {(stale || jp.capped || jp.insufficientData) && <AlertTriangle className="size-3 text-amber-600 dark:text-amber-400 shrink-0" />}
                            <span className="truncate">{jp.jobName}</span>
                          </div>
                          <div className="flex gap-3 shrink-0 text-muted-foreground">
                            <span>{snap ? parseLocalDate(snap.paycheck_date).toLocaleDateString() : '—'}</span>
                            <span className="font-mono tabular-nums">{formatCurrency(Number(snap?.ytd_gross ?? 0))}</span>
                            <span className="font-mono tabular-nums">{formatCurrency(Number(snap?.ytd_federal_withheld ?? 0))} W/H</span>
                          </div>
                        </div>
                        {jp.capped && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 ml-5 mt-0.5">
                            Projection capped — snapshot may be from a prior year
                          </p>
                        )}
                        {jp.insufficientData && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 ml-5 mt-0.5">
                            Not enough data for reliable projection (less than 3 weeks into the year)
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* Tax profile inputs */}
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-1">2026 Tax Profile used in projections</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Filing: <span className="text-foreground">{formatFilingStatus(taxProfile?.filing_status ?? 'single')}</span></span>
                    <span>Dependents: <span className="text-foreground">{taxProfile?.dependents ?? 0}</span></span>
                    <span>Deduction: <span className="text-foreground">
                      {taxProfile?.use_standard_deduction !== false ? 'Standard' : `Itemized (${formatCurrency(itemizedAmount)})`}
                    </span></span>
                    {estimatedPaymentsYTD > 0 && (
                      <span>Est. payments: <span className="text-foreground">{formatCurrency(estimatedPaymentsYTD)}</span></span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Snapshot form modal */}
      {snapshotFormJobId && (() => {
        const job = jobs.find((j) => j.id === snapshotFormJobId);
        return job ? (
          <SnapshotForm
            open
            onOpenChange={(open) => { if (!open) setSnapshotFormJobId(null); }}
            jobId={job.id}
            jobName={job.name}
            priorSnapshot={latestByJob.get(job.id)}
          />
        ) : null;
      })()}
    </div>
  );
}

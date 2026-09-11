'use client';

import { useState, useCallback } from 'react';
import { Calendar, ArrowRight, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ResponsiveModal } from '@/components/shared/responsive-modal';
import { CurrencyInput } from '@/components/shared/currency-input';
import type { TaxProfile, FilingStatus } from '@/lib/types';
import { STANDARD_DEDUCTION, QUARTERLY_DUE_DATES } from '@/lib/tax/tax-data-2026';

// ============================================
// Constants
// ============================================

const FILING_STATUS_LABELS: Record<string, string> = {
  single: 'Single',
  married_filing_jointly: 'Married Filing Jointly',
  married_filing_separately: 'Married Filing Separately',
  head_of_household: 'Head of Household',
};

const FILING_STATUS_OPTIONS: { value: FilingStatus; label: string }[] = [
  { value: 'single', label: 'Single' },
  { value: 'married_filing_jointly', label: 'Married Filing Jointly' },
  { value: 'married_filing_separately', label: 'Married Filing Separately' },
  { value: 'head_of_household', label: 'Head of Household' },
];

const TAX_DATES = QUARTERLY_DUE_DATES.map(item => ({ date: new Date(item.isoDate + 'T23:59:59'), label: item.dueDate, description: `Q${item.quarter} estimated payment` }));

// ============================================
// Types
// ============================================

interface TaxProfileCardProps {
  profile2025: TaxProfile | null;
  profile2026: TaxProfile | null;
  isLoading: boolean;
  onSave2025: (fields: Partial<TaxProfile>) => Promise<void>;
  onSave2026: (fields: Partial<TaxProfile>) => Promise<void>;
  onImport2025To2026: () => Promise<void>;
  isSaving: boolean;
  isImporting: boolean;
}

interface YearModalProps {
  year: 2025 | 2026;
  profile: TaxProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (fields: Partial<TaxProfile>) => Promise<void>;
  isSaving: boolean;
  // 2026-specific
  canImport?: boolean;
  hasImported?: boolean;
  onImport?: () => Promise<void>;
  isImporting?: boolean;
}

// ============================================
// Helpers
// ============================================

function getNextUpcomingIndex(dates: typeof TAX_DATES): number {
  const now = new Date();
  for (let i = 0; i < dates.length; i++) {
    if (dates[i].date > now) return i;
  }
  return -1; // all dates have passed
}

function formatProfileSummary(profile: TaxProfile | null): string {
  if (!profile || !profile.filing_status) return 'Not configured';
  const status = FILING_STATUS_LABELS[profile.filing_status] ?? profile.filing_status;
  const deps = profile.dependents > 0 ? ` \u00B7 ${profile.dependents} dep.` : '';
  const deduction = profile.use_standard_deduction
    ? (profile.tax_year === 2026 ? `Std $${(STANDARD_DEDUCTION[profile.filing_status] ?? 0).toLocaleString()}` : 'Standard deduction')
    : `Itemized $${Number(profile.itemized_deduction_amount ?? 0).toLocaleString()}`;
  return `${status}${deps} \u00B7 ${deduction}`;
}

// ============================================
// Tax Dates Row
// ============================================

function TaxDatesRow() {
  const nextIdx = getNextUpcomingIndex(TAX_DATES);

  return (
    <div className="flex flex-wrap gap-2">
      {TAX_DATES.map((item, i) => {
        const isPast = i < nextIdx || (nextIdx === -1);
        const isNext = i === nextIdx;

        return (
          <div
            key={item.label}
            className={`
              flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs
              ${isPast ? 'border-border/50 text-muted-foreground line-through' : ''}
              ${isNext ? 'border-primary/40 bg-primary/5 text-primary font-medium' : ''}
              ${!isPast && !isNext ? 'border-border text-muted-foreground' : ''}
            `}
          >
            {isNext && (
              <span className="size-1.5 rounded-full bg-primary shrink-0" />
            )}
            <span className="font-mono tabular-nums">{item.label}</span>
            <span className="hidden sm:inline">&mdash;</span>
            <span className="hidden sm:inline">{item.description}</span>
          </div>
        );
      })}
    </div>
  );
}

// ============================================
// Year Profile Modal
// ============================================

function YearProfileModal({
  year,
  profile,
  open,
  onOpenChange,
  onSave,
  isSaving,
  canImport = false,
  hasImported = false,
  onImport,
  isImporting = false,
}: YearModalProps) {
  // Local form state
  const [filingStatus, setFilingStatus] = useState<FilingStatus | ''>('');
  const [dependents, setDependents] = useState(0);
  const [childTaxCreditEligible, setChildTaxCreditEligible] = useState(0);
  const [useStandardDeduction, setUseStandardDeduction] = useState(true);
  const [itemizedAmount, setItemizedAmount] = useState<number | undefined>(undefined);
  const [q1, setQ1] = useState<number | undefined>(undefined);
  const [q2, setQ2] = useState<number | undefined>(undefined);
  const [q3, setQ3] = useState<number | undefined>(undefined);
  const [q4, setQ4] = useState<number | undefined>(undefined);

  // Reset form when modal opens (sync pattern — no useEffect)
  const syncKey = `${open}-${profile?.id}-${profile?.updated_at}`;
  const [prevSyncKey, setPrevSyncKey] = useState(syncKey);
  if (prevSyncKey !== syncKey && open) {
    setPrevSyncKey(syncKey);
    setFilingStatus(profile?.filing_status ?? '');
    setDependents(profile?.dependents ?? 0);
    setChildTaxCreditEligible(profile?.child_tax_credit_eligible ?? 0);
    setUseStandardDeduction(profile?.use_standard_deduction ?? true);
    setItemizedAmount(profile?.itemized_deduction_amount || undefined);
    setQ1(profile?.estimated_payment_q1 || undefined);
    setQ2(profile?.estimated_payment_q2 || undefined);
    setQ3(profile?.estimated_payment_q3 || undefined);
    setQ4(profile?.estimated_payment_q4 || undefined);
  }

  const handleSave = useCallback(async () => {
    if (!filingStatus) {
      toast.error('Please select a filing status');
      return;
    }
    try {
      await onSave({
        filing_status: filingStatus as FilingStatus,
        dependents,
        child_tax_credit_eligible: childTaxCreditEligible,
        use_standard_deduction: useStandardDeduction,
        itemized_deduction_amount: useStandardDeduction ? 0 : (itemizedAmount ?? 0),
        estimated_payment_q1: q1 ?? 0,
        estimated_payment_q2: q2 ?? 0,
        estimated_payment_q3: q3 ?? 0,
        estimated_payment_q4: q4 ?? 0,
      });
      toast.success(`${year} tax profile saved`);
      onOpenChange(false);
    } catch {
      toast.error('Failed to save tax profile');
    }
  }, [
    filingStatus, dependents, childTaxCreditEligible,
    useStandardDeduction, itemizedAmount, q1, q2, q3, q4,
    year, onSave, onOpenChange,
  ]);

  const handleImport = useCallback(async () => {
    if (!onImport) return;
    try {
      await onImport();
      toast.success('Imported 2025 settings to 2026');
    } catch {
      toast.error('Failed to import settings');
    }
  }, [onImport]);

  const subtitle = year === 2025
    ? 'W2 calculations for the 2025 tax return (filed in 2026)'
    : 'Projections for the 2026 tax return (filed in 2027)';

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={`${year} Tax Profile`}
      className="max-w-lg"
    >
      <div className="space-y-5">
        <p className="text-sm text-muted-foreground">{subtitle}</p>

        {/* Import banner for 2026 */}
        {year === 2026 && canImport && !hasImported && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
            <p className="text-sm">Import your 2025 settings?</p>
            <Button
              size="sm"
              variant="outline"
              onClick={handleImport}
              disabled={isImporting}
            >
              <Download className="size-3.5" />
              {isImporting ? 'Importing...' : 'Import'}
            </Button>
          </div>
        )}

        {year === 2026 && hasImported && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              Imported from 2025. Quarterly payments need to be set separately.
            </p>
            {canImport && (
              <Button
                size="xs"
                variant="ghost"
                onClick={handleImport}
                disabled={isImporting}
                className="text-xs text-muted-foreground"
              >
                Re-import from 2025
              </Button>
            )}
          </div>
        )}

        {/* Filing Status */}
        <div className="space-y-1.5">
          <Label htmlFor={`filing-status-${year}`}>Filing status</Label>
          <Select
            value={filingStatus || undefined}
            onValueChange={(val) => setFilingStatus((val ?? '') as FilingStatus | '')}
          >
            <SelectTrigger id={`filing-status-${year}`} className="w-full">
              <SelectValue placeholder="Select filing status">
                {filingStatus ? FILING_STATUS_LABELS[filingStatus] ?? filingStatus : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {FILING_STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Dependents */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor={`dependents-${year}`}>Total dependents</Label>
            <Input
              id={`dependents-${year}`}
              type="number"
              inputMode="numeric"
              min={0}
              max={20}
              value={dependents}
              onChange={(e) => setDependents(Math.max(0, parseInt(e.target.value) || 0))}
              className="font-mono tabular-nums"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`ctc-${year}`}>Children under 17</Label>
            <Input
              id={`ctc-${year}`}
              type="number"
              inputMode="numeric"
              min={0}
              max={20}
              value={childTaxCreditEligible}
              onChange={(e) => setChildTaxCreditEligible(Math.max(0, parseInt(e.target.value) || 0))}
              className="font-mono tabular-nums"
            />
          </div>
        </div>

        {/* Deduction Type */}
        <div className="space-y-1.5">
          <Label htmlFor={`deduction-${year}`}>Deduction type</Label>
          <Select
            value={useStandardDeduction ? 'standard' : 'itemized'}
            onValueChange={(val) => setUseStandardDeduction(val === 'standard')}
          >
            <SelectTrigger id={`deduction-${year}`} className="w-full">
              <SelectValue placeholder="Select deduction type">
                {useStandardDeduction ? 'Standard deduction' : 'Itemized deduction'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="standard">Standard deduction</SelectItem>
              <SelectItem value="itemized">Itemized deduction</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Itemized amount */}
        {!useStandardDeduction && (
          <div className="space-y-1.5">
            <Label htmlFor={`itemized-amount-${year}`}>Itemized deduction total</Label>
            <CurrencyInput
              id={`itemized-amount-${year}`}
              value={itemizedAmount}
              onChange={setItemizedAmount}
              placeholder="0"
            />
          </div>
        )}

        {/* Quarterly Estimated Payments */}
        <div className="space-y-1.5">
          <Label>Quarterly estimated payments</Label>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Q1</span>
              <CurrencyInput value={q1} onChange={setQ1} placeholder="0" />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Q2</span>
              <CurrencyInput value={q2} onChange={setQ2} placeholder="0" />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Q3</span>
              <CurrencyInput value={q3} onChange={setQ3} placeholder="0" />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Q4</span>
              <CurrencyInput value={q4} onChange={setQ4} placeholder="0" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Enter payments for the {year} tax year. Q4 {year} is due January 15, {year + 1} — record it here, not in the {year + 1} profile.
          </p>
        </div>

        {/* Save */}
        <Button
          className="w-full sm:w-auto"
          onClick={handleSave}
          disabled={isSaving || !filingStatus}
        >
          {isSaving ? 'Saving...' : `Save ${year} profile`}
        </Button>
      </div>
    </ResponsiveModal>
  );
}

// ============================================
// Main Component
// ============================================

export function TaxProfileCard({
  profile2025,
  profile2026,
  isLoading,
  onSave2025,
  onSave2026,
  onImport2025To2026,
  isSaving,
  isImporting,
}: TaxProfileCardProps) {
  const [modal2025Open, setModal2025Open] = useState(false);
  const [modal2026Open, setModal2026Open] = useState(false);

  const hasAnyProfile = !!profile2025 || !!profile2026;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="size-4 text-primary" />
            Your Tax Profile
          </CardTitle>
          <CardDescription>Tax settings that drive your calculations</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Tax dates */}
          <TaxDatesRow />

          {/* Year buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setModal2025Open(true)}
              disabled={isLoading}
              className="group flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted disabled:opacity-50"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium">2025</div>
                <div className="text-xs text-muted-foreground truncate">
                  {isLoading ? 'Loading...' : formatProfileSummary(profile2025)}
                </div>
                <div className="text-[11px] text-muted-foreground/70 mt-0.5">
                  Historical settings (calculations unavailable)
                </div>
              </div>
              <ArrowRight className="size-4 text-muted-foreground shrink-0 transition-transform group-hover:translate-x-0.5" />
            </button>

            <button
              type="button"
              onClick={() => setModal2026Open(true)}
              disabled={isLoading}
              className="group flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted disabled:opacity-50"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium">2026</div>
                <div className="text-xs text-muted-foreground truncate">
                  {isLoading ? 'Loading...' : formatProfileSummary(profile2026)}
                </div>
                <div className="text-[11px] text-muted-foreground/70 mt-0.5">
                  Projections &amp; planning
                </div>
              </div>
              <ArrowRight className="size-4 text-muted-foreground shrink-0 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>

          {/* Notification note */}
          {hasAnyProfile && (
            <p className="text-xs text-muted-foreground">
              Export the dashboard calendar for quarterly reminders.{' '}
              <a
                href="/settings"
                className="text-primary underline-offset-2 hover:underline"
              >
                Backup and local settings
              </a>
            </p>
          )}

          {/* Empty state hint */}
          {!isLoading && !hasAnyProfile && (
            <p className="text-xs text-muted-foreground">
              Set up your tax profile to tailor the estimates.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Modals */}
      <YearProfileModal
        year={2025}
        profile={profile2025}
        open={modal2025Open}
        onOpenChange={setModal2025Open}
        onSave={onSave2025}
        isSaving={isSaving}
      />

      <YearProfileModal
        year={2026}
        profile={profile2026}
        open={modal2026Open}
        onOpenChange={setModal2026Open}
        onSave={onSave2026}
        isSaving={isSaving}
        canImport={!!profile2025}
        hasImported={profile2026?.imported_from_year != null}
        onImport={onImport2025To2026}
        isImporting={isImporting}
      />
    </>
  );
}

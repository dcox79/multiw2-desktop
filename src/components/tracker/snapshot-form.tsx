'use client';

import { useState, useCallback } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/shared/currency-input';
import { ResponsiveModal } from '@/components/shared/responsive-modal';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { useYTDSnapshots } from '@/hooks/use-ytd-snapshots';
import type { YTDSnapshot } from '@/lib/types';

interface SnapshotFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  jobName: string;
  priorSnapshot?: YTDSnapshot;
  existingSnapshot?: YTDSnapshot;
}

interface FormState {
  paycheck_date: string;
  ytd_gross: number | undefined;
  ytd_federal_withheld: number | undefined;
  ytd_ss_withheld: number | undefined;
  ytd_medicare_withheld: number | undefined;
  ytd_traditional_401k: number | undefined;
  ytd_roth_401k: number | undefined;
  ytd_hsa: number | undefined;
  notes: string;
}

const initialForm: FormState = {
  paycheck_date: new Date().toISOString().slice(0, 10),
  ytd_gross: undefined,
  ytd_federal_withheld: undefined,
  ytd_ss_withheld: undefined,
  ytd_medicare_withheld: undefined,
  ytd_traditional_401k: undefined,
  ytd_roth_401k: undefined,
  ytd_hsa: undefined,
  notes: '',
};

function snapshotToForm(s: YTDSnapshot): FormState {
  return {
    paycheck_date: s.paycheck_date,
    ytd_gross: Number(s.ytd_gross),
    ytd_federal_withheld: Number(s.ytd_federal_withheld),
    ytd_ss_withheld: Number(s.ytd_ss_withheld),
    ytd_medicare_withheld: Number(s.ytd_medicare_withheld),
    ytd_traditional_401k: s.ytd_traditional_401k != null ? Number(s.ytd_traditional_401k) : undefined,
    ytd_roth_401k: s.ytd_roth_401k != null ? Number(s.ytd_roth_401k) : undefined,
    ytd_hsa: s.ytd_hsa != null ? Number(s.ytd_hsa) : undefined,
    notes: s.notes ?? '',
  };
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={<button type="button" tabIndex={-1} className="text-muted-foreground hover:text-foreground" />}>
          <Info className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p>{text}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function SnapshotForm({ open, onOpenChange, jobId, jobName, priorSnapshot, existingSnapshot }: SnapshotFormProps) {
  const isEditMode = !!existingSnapshot;
  const [form, setForm] = useState<FormState>(isEditMode ? snapshotToForm(existingSnapshot) : initialForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showOptional, setShowOptional] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const { create, update } = useYTDSnapshots(jobId);

  // Reset form when existingSnapshot or open state changes (key-based sync)
  const syncKey = `${open}-${existingSnapshot?.id ?? 'new'}`;
  const [prevSyncKey, setPrevSyncKey] = useState(syncKey);
  if (prevSyncKey !== syncKey) {
    setPrevSyncKey(syncKey);
    if (open) {
      if (existingSnapshot) {
        setForm(snapshotToForm(existingSnapshot));
        const hasOptional = existingSnapshot.ytd_traditional_401k != null ||
          existingSnapshot.ytd_roth_401k != null ||
          existingSnapshot.ytd_hsa != null ||
          (existingSnapshot.notes != null && existingSnapshot.notes !== '');
        setShowOptional(hasOptional);
      } else {
        setForm(initialForm);
        setShowOptional(false);
      }
      setErrors({});
      setWarnings([]);
    }
  }

  const validate = useCallback((): boolean => {
    const errs: Record<string, string> = {};
    if (!form.paycheck_date) errs.paycheck_date = 'Paycheck date is required';
    if (!form.ytd_gross || form.ytd_gross <= 0) errs.ytd_gross = 'Enter YTD gross income';
    if (form.ytd_federal_withheld === undefined) errs.ytd_federal_withheld = 'Enter YTD federal withheld';
    if (form.ytd_ss_withheld === undefined) errs.ytd_ss_withheld = 'Enter YTD SS withheld';
    if (form.ytd_medicare_withheld === undefined) errs.ytd_medicare_withheld = 'Enter YTD Medicare withheld';
    setErrors(errs);

    // Monotonic check — compare against the snapshot before this one in sequence
    const warns: string[] = [];
    if (priorSnapshot && form.ytd_gross !== undefined && form.ytd_gross < priorSnapshot.ytd_gross) {
      warns.push('YTD gross is less than your prior snapshot. Did you mean to enter a smaller amount?');
    }
    if (priorSnapshot && form.ytd_federal_withheld !== undefined && form.ytd_federal_withheld < priorSnapshot.ytd_federal_withheld) {
      warns.push('YTD federal withheld is less than prior snapshot.');
    }
    setWarnings(warns);

    return Object.keys(errs).length === 0;
  }, [form, priorSnapshot]);

  const handleSubmit = useCallback(async () => {
    if (!validate()) return;

    const payload = {
      paycheck_date: form.paycheck_date,
      ytd_gross: form.ytd_gross!,
      ytd_federal_withheld: form.ytd_federal_withheld!,
      ytd_ss_withheld: form.ytd_ss_withheld!,
      ytd_medicare_withheld: form.ytd_medicare_withheld!,
      ytd_traditional_401k: form.ytd_traditional_401k,
      ytd_roth_401k: form.ytd_roth_401k,
      ytd_hsa: form.ytd_hsa,
      notes: form.notes || undefined,
    };

    try {
      if (isEditMode) {
        await update.mutateAsync({ id: existingSnapshot.id, ...payload });
        toast.success('Snapshot updated');
      } else {
        await create.mutateAsync({ job_id: jobId, ...payload });
        toast.success('Snapshot saved');
      }
      setForm(initialForm);
      setErrors({});
      setWarnings([]);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to ${isEditMode ? 'update' : 'save'} snapshot`);
    }
  }, [form, validate, create, update, jobId, onOpenChange, isEditMode, existingSnapshot]);

  const isPending = isEditMode ? update.isPending : create.isPending;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((s) => ({ ...s, [key]: value }));

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={isEditMode ? `Edit YTD snapshot — ${jobName}` : `YTD snapshot — ${jobName}`}
    >
      <div className="space-y-4">
        {/* Paycheck date */}
        <div className="space-y-1.5">
          <Label htmlFor="paycheck-date">Paycheck date *</Label>
          <Input
            id="paycheck-date"
            type="date"
            value={form.paycheck_date}
            onChange={(e) => set('paycheck_date', e.target.value)}
            aria-invalid={!!errors.paycheck_date}
          />
          {errors.paycheck_date && <p className="text-xs text-destructive">{errors.paycheck_date}</p>}
        </div>

        {/* Required fields */}
        <div className="space-y-1.5">
          <Label htmlFor="ytd-gross">YTD gross income *</Label>
          <CurrencyInput id="ytd-gross" value={form.ytd_gross} onChange={(v) => set('ytd_gross', v)} aria-invalid={!!errors.ytd_gross} />
          {errors.ytd_gross && <p className="text-xs text-destructive">{errors.ytd_gross}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ytd-fed">YTD federal withheld *</Label>
          <CurrencyInput id="ytd-fed" value={form.ytd_federal_withheld} onChange={(v) => set('ytd_federal_withheld', v)} aria-invalid={!!errors.ytd_federal_withheld} />
          {errors.ytd_federal_withheld && <p className="text-xs text-destructive">{errors.ytd_federal_withheld}</p>}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Label htmlFor="ytd-ss">YTD SS withheld *</Label>
            <InfoTooltip text="Also called OASDI (Old-Age, Survivors, and Disability Insurance) on most pay stubs. This is the 6.2% Social Security tax withheld by your employer." />
          </div>
          <CurrencyInput id="ytd-ss" value={form.ytd_ss_withheld} onChange={(v) => set('ytd_ss_withheld', v)} aria-invalid={!!errors.ytd_ss_withheld} />
          {errors.ytd_ss_withheld && <p className="text-xs text-destructive">{errors.ytd_ss_withheld}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ytd-med">YTD Medicare withheld *</Label>
          <CurrencyInput id="ytd-med" value={form.ytd_medicare_withheld} onChange={(v) => set('ytd_medicare_withheld', v)} aria-invalid={!!errors.ytd_medicare_withheld} />
          {errors.ytd_medicare_withheld && <p className="text-xs text-destructive">{errors.ytd_medicare_withheld}</p>}
        </div>

        {/* Optional fields */}
        <button
          type="button"
          onClick={() => setShowOptional((v) => !v)}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {showOptional ? 'Hide optional fields' : 'Show optional fields (401k, HSA)'}
        </button>

        {showOptional && (
          <div className="space-y-4 border-t border-border pt-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label htmlFor="ytd-401k">YTD Traditional 401(k)</Label>
                <InfoTooltip text="W2 Box 12, Code D — Elective deferrals to a 401(k) plan. This is your pre-tax 401(k) contribution." />
              </div>
              <CurrencyInput id="ytd-401k" value={form.ytd_traditional_401k} onChange={(v) => set('ytd_traditional_401k', v)} />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label htmlFor="ytd-roth">YTD Roth 401(k)</Label>
                <InfoTooltip text="W2 Box 12, Code AA — Designated Roth contributions to a 401(k) plan. This is your after-tax Roth 401(k) contribution." />
              </div>
              <CurrencyInput id="ytd-roth" value={form.ytd_roth_401k} onChange={(v) => set('ytd_roth_401k', v)} />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label htmlFor="ytd-hsa">YTD HSA</Label>
                <InfoTooltip text="W2 Box 12, Code W — Employer contributions to a Health Savings Account (including your pre-tax payroll contributions)." />
              </div>
              <CurrencyInput id="ytd-hsa" value={form.ytd_hsa} onChange={(v) => set('ytd_hsa', v)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Input id="notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Optional note" />
            </div>
          </div>
        )}

        {/* Monotonic warnings */}
        {warnings.length > 0 && (
          <div className="flex gap-2 p-3 rounded-md bg-warning/10 border border-warning/20">
            <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" />
            <div className="text-sm text-warning">
              {warnings.map((w, i) => <p key={i}>{w}</p>)}
            </div>
          </div>
        )}

        <Button className="w-full" onClick={handleSubmit} disabled={isPending}>
          {isPending ? <><LoadingSpinner size="sm" /> {isEditMode ? 'Updating...' : 'Saving...'}</> : isEditMode ? 'Update snapshot' : 'Save snapshot'}
        </Button>
      </div>
    </ResponsiveModal>
  );
}

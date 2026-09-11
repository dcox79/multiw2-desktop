'use client';

import { useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CurrencyInput } from '@/components/shared/currency-input';
import { ResponsiveModal } from '@/components/shared/responsive-modal';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { useJobs } from '@/hooks/use-jobs';

interface CreateJobModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editJob?: { id: string; name: string; annual_salary: number; income_source: 'w2' | 'paystub'; pay_frequency: string; started_this_year: boolean; start_month?: number | null; extra_withholding_per_paycheck?: number };
}

interface FormState {
  name: string;
  annual_salary: number | undefined;
  income_source: 'w2' | 'paystub';
  pay_frequency: string;
  started_this_year: boolean;
  start_month: string;
  extra_withholding_per_paycheck: number;
}

const initialForm: FormState = {
  name: '',
  annual_salary: undefined,
  income_source: 'paystub',
  pay_frequency: 'biweekly',
  started_this_year: false,
  start_month: '',
  extra_withholding_per_paycheck: 0,
};

const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function CreateJobModal({ open, onOpenChange, editJob }: CreateJobModalProps) {
  const isEdit = !!editJob;
  const editFormKey = editJob?.id ?? '';
  const editInitial = useMemo<FormState>(() => {
    if (!editJob) return initialForm;
    return {
      name: editJob.name,
      annual_salary: editJob.annual_salary,
      income_source: editJob.income_source,
      pay_frequency: editJob.pay_frequency,
      started_this_year: editJob.started_this_year,
      start_month: editJob.start_month ? String(editJob.start_month) : '',
      extra_withholding_per_paycheck: editJob.extra_withholding_per_paycheck ?? 0,
    };
  }, [editJob]);
  const [form, setForm] = useState<FormState>(editInitial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { createJob, updateJob } = useJobs();

  // Reset form when editJob changes (key-based reset)
  const [prevKey, setPrevKey] = useState(editFormKey);
  if (prevKey !== editFormKey) {
    setPrevKey(editFormKey);
    setForm(editInitial);
    setErrors({});
  }

  const validate = useCallback((): boolean => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Job name is required';
    if (!form.annual_salary || form.annual_salary <= 0) errs.annual_salary = 'Enter a valid salary';
    if (!form.pay_frequency) errs.pay_frequency = 'Select pay frequency';
    if (form.started_this_year && !form.start_month) errs.start_month = 'Select a start month';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [form]);

  const handleSubmit = useCallback(async () => {
    if (!validate()) return;

    const payload = {
      name: form.name.trim(),
      annual_salary: form.annual_salary!,
      income_source: form.income_source,
      pay_frequency: form.pay_frequency as 'weekly' | 'biweekly' | 'semimonthly' | 'monthly',
      started_this_year: form.started_this_year,
      start_month: form.started_this_year ? parseInt(form.start_month) : undefined,
      extra_withholding_per_paycheck: form.extra_withholding_per_paycheck,
    };

    try {
      if (isEdit && editJob) {
        await updateJob.mutateAsync({ id: editJob.id, ...payload });
        toast.success('Job updated');
      } else {
        await createJob.mutateAsync(payload);
        toast.success(`${form.name.trim()} added`);
      }
      setForm(initialForm);
      setErrors({});
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : isEdit ? 'Failed to update job' : 'Failed to create job');
    }
  }, [form, validate, createJob, updateJob, isEdit, editJob, onOpenChange]);

  const handleClose = useCallback((v: boolean) => {
    if (!v) {
      setForm(initialForm);
      setErrors({});
    }
    onOpenChange(v);
  }, [onOpenChange]);

  return (
    <ResponsiveModal open={open} onOpenChange={handleClose} title={isEdit ? 'Edit job' : 'Add a job'}>
      <div className="space-y-4">
        {/* Job name */}
        <div className="space-y-1.5">
          <Label htmlFor="job-name">Job name *</Label>
          <Input
            id="job-name"
            placeholder="e.g. Fintech Corp"
            value={form.name}
            onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
            aria-invalid={!!errors.name}
          />
          {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
        </div>

        {/* Annual salary */}
        <div className="space-y-1.5">
          <Label htmlFor="job-salary">Annual salary *</Label>
          <CurrencyInput
            id="job-salary"
            value={form.annual_salary}
            onChange={(v) => setForm((s) => ({ ...s, annual_salary: v }))}
            placeholder="120,000"
            aria-invalid={!!errors.annual_salary}
          />
          {errors.annual_salary && <p className="text-xs text-destructive">{errors.annual_salary}</p>}
        </div>

        {/* Income source toggle */}
        <div className="space-y-1.5">
          <Label>Income source</Label>
          <div className="flex rounded-md border border-border overflow-hidden">
            <button
              type="button"
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                form.income_source === 'w2'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-transparent text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setForm((s) => ({ ...s, income_source: 'w2' }))}
            >
              W2 (Box 1)
            </button>
            <button
              type="button"
              className={`flex-1 py-2 text-sm font-medium transition-colors border-l border-border ${
                form.income_source === 'paystub'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-transparent text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setForm((s) => ({ ...s, income_source: 'paystub' }))}
            >
              Gross salary (paystub)
            </button>
          </div>
        </div>

        {/* Pay frequency */}
        <div className="space-y-1.5">
          <Label>Pay frequency *</Label>
          <Select
            value={form.pay_frequency}
            onValueChange={(v) => { if (v) setForm((s) => ({ ...s, pay_frequency: v })); }}
          >
            <SelectTrigger className="w-full" aria-invalid={!!errors.pay_frequency}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="biweekly">Biweekly</SelectItem>
              <SelectItem value="semimonthly">Semi-monthly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
          {errors.pay_frequency && <p className="text-xs text-destructive">{errors.pay_frequency}</p>}
        </div>

        {/* Started this year */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="started-this-year"
              checked={form.started_this_year}
              onChange={(e) => setForm((s) => ({ ...s, started_this_year: e.target.checked, start_month: '' }))}
              className="rounded border-border"
            />
            <Label htmlFor="started-this-year" className="cursor-pointer">
              Started this year
            </Label>
          </div>

          {form.started_this_year && (
            <Select
              value={form.start_month}
              onValueChange={(v) => { if (v) setForm((s) => ({ ...s, start_month: v })); }}
            >
              <SelectTrigger className="w-full" aria-invalid={!!errors.start_month}>
                <SelectValue placeholder="Start month" />
              </SelectTrigger>
              <SelectContent>
                {months.map((m, i) => (
                  <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {errors.start_month && <p className="text-xs text-destructive">{errors.start_month}</p>}
        </div>

        {/* Extra W-4 withholding */}
        <div className="space-y-1.5">
          <Label htmlFor="extra-wh">Extra W-4 withholding per paycheck</Label>
          <CurrencyInput
            id="extra-wh"
            value={form.extra_withholding_per_paycheck || undefined}
            onChange={(v) => setForm((s) => ({ ...s, extra_withholding_per_paycheck: v ?? 0 }))}
            placeholder="0"
          />
          <p className="text-xs text-muted-foreground">W-4 Line 4(c) — additional federal tax withheld each paycheck</p>
        </div>

        {/* Submit */}
        <Button
          className="w-full"
          onClick={handleSubmit}
          disabled={isEdit ? updateJob.isPending : createJob.isPending}
        >
          {(isEdit ? updateJob.isPending : createJob.isPending) ? (
            <>
              <LoadingSpinner size="sm" />
              {isEdit ? 'Saving...' : 'Adding...'}
            </>
          ) : (
            isEdit ? 'Save changes' : 'Add job'
          )}
        </Button>
      </div>
    </ResponsiveModal>
  );
}

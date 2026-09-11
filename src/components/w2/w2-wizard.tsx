'use client';

import { useState, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
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
import { CurrencyInput } from '@/components/shared/currency-input';
import { ResponsiveModal } from '@/components/shared/responsive-modal';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { useW2Entries } from '@/hooks/use-w2-entries';
import { formatCurrencyRounded } from '@/lib/utils';
import { TAX_YEAR, SOCIAL_SECURITY } from '@/lib/tax/tax-data-2026';
import type { JobW2Entry } from '@/lib/types';

interface W2WizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  jobName: string;
  annualSalary: number;
  existingEntry?: JobW2Entry;
}

const currentYear = new Date().getFullYear();
const defaultTaxYear = TAX_YEAR;

export function W2Wizard({ open, onOpenChange, jobId, jobName, annualSalary, existingEntry }: W2WizardProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [entryId, setEntryId] = useState<string | null>(existingEntry?.id ?? null);
  const { upsert } = useW2Entries(jobId);

  // Step 1 fields
  const [taxYear, setTaxYear] = useState(String(existingEntry?.tax_year ?? defaultTaxYear));
  const [box1, setBox1] = useState<number | undefined>(existingEntry?.box1_wages ?? annualSalary);
  const [box2, setBox2] = useState<number | undefined>(existingEntry?.box2_federal_withheld);
  const [box3, setBox3] = useState<number | undefined>(existingEntry?.box3_ss_wages ?? undefined);
  const [box5, setBox5] = useState<number | undefined>(existingEntry?.box5_medicare_wages ?? undefined);
  const [box4, setBox4] = useState<number | undefined>(existingEntry?.box4_ss_withheld);
  const [box6, setBox6] = useState<number | undefined>(existingEntry?.box6_medicare_withheld);
  const [correctionNote, setCorrectionNote] = useState('');

  // Step 2 fields
  const [codeD, setCodeD] = useState<number | undefined>(existingEntry?.box12_code_d ?? undefined);
  const [codeAA, setCodeAA] = useState<number | undefined>(existingEntry?.box12_code_aa ?? undefined);
  const [codeW, setCodeW] = useState<number | undefined>(existingEntry?.box12_code_w ?? undefined);
  const [codeC, setCodeC] = useState<number | undefined>(existingEntry?.box12_code_c ?? undefined);
  const [codeDD, setCodeDD] = useState<number | undefined>(existingEntry?.box12_code_dd ?? undefined);
  const [codeV, setCodeV] = useState<number | undefined>(existingEntry?.box12_code_v ?? undefined);

  const [enabledCodes, setEnabledCodes] = useState<Set<string>>(() => {
    const set = new Set<string>();
    if (existingEntry?.box12_code_d) set.add('D');
    if (existingEntry?.box12_code_aa) set.add('AA');
    if (existingEntry?.box12_code_w) set.add('W');
    if (existingEntry?.box12_code_c) set.add('C');
    if (existingEntry?.box12_code_dd) set.add('DD');
    if (existingEntry?.box12_code_v) set.add('V');
    return set;
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const expectedSS = Math.min(box3 ?? box1 ?? 0, SOCIAL_SECURITY.wageBase) * 0.062;
  const expectedMedicare = (box5 ?? box1 ?? 0) * 0.0145;
  // Only treat as a correction if the entry has been through at least one full save cycle.
  // Version 1 = initial entry (may be incomplete from Step 1 save).
  // Version 2+ = previously completed, now being corrected.
  const isCorrection = !!existingEntry && existingEntry.version > 1;

  const validateStep1 = useCallback((): boolean => {
    const errs: Record<string, string> = {};
    if (!box1 || box1 <= 0) errs.box1 = 'Enter Box 1 wages';
    if (box2 === undefined) errs.box2 = 'Enter Box 2 federal withheld';
    if (box4 === undefined) errs.box4 = 'Enter Box 4 SS withheld';
    if (box6 === undefined) errs.box6 = 'Enter Box 6 Medicare withheld';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [box1, box2, box4, box6]);

  const handleSaveStep1 = useCallback(async () => {
    if (!validateStep1()) return;
    if (isCorrection && !correctionNote.trim()) {
      setErrors((prev) => ({ ...prev, correctionNote: 'Describe what changed' }));
      return;
    }

    try {
      const result = await upsert.mutateAsync({
        job_id: jobId,
        tax_year: parseInt(taxYear),
        box1_wages: box1!,
        box2_federal_withheld: box2!,
        box3_ss_wages: box3,
        box5_medicare_wages: box5,
        box4_ss_withheld: box4!,
        box6_medicare_withheld: box6!,
        correction_note: isCorrection ? correctionNote : undefined,
      });
      setEntryId(result.id);
      setStep(2);
      toast.success('Core W2 data saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    }
  }, [validateStep1, upsert, jobId, taxYear, box1, box2, box3, box4, box5, box6, isCorrection, correctionNote]);

  const handleSaveStep2 = useCallback(async () => {
    if (!entryId) return;
    if (isCorrection && !correctionNote.trim()) {
      setErrors({ correctionNote: 'Describe what changed' });
      return;
    }

    try {
      await upsert.mutateAsync({
        job_id: jobId,
        tax_year: parseInt(taxYear),
        box1_wages: box1!,
        box2_federal_withheld: box2!,
        box3_ss_wages: box3,
        box5_medicare_wages: box5,
        box4_ss_withheld: box4!,
        box6_medicare_withheld: box6!,
        box12_code_d: enabledCodes.has('D') ? codeD : undefined,
        box12_code_aa: enabledCodes.has('AA') ? codeAA : undefined,
        box12_code_w: enabledCodes.has('W') ? codeW : undefined,
        box12_code_c: enabledCodes.has('C') ? codeC : undefined,
        box12_code_dd: enabledCodes.has('DD') ? codeDD : undefined,
        box12_code_v: enabledCodes.has('V') ? codeV : undefined,
        correction_note: isCorrection ? correctionNote : undefined,
      });
      toast.success('W2 saved');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    }
  }, [entryId, upsert, jobId, taxYear, box1, box2, box3, box4, box5, box6, enabledCodes, codeD, codeAA, codeW, codeC, codeDD, codeV, isCorrection, correctionNote, onOpenChange]);

  const toggleCode = (code: string) => {
    setEnabledCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={`W2 Entry — ${jobName}`}>
      {step === 1 ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Step 1 of 2 — Core boxes</span>
            <span className="font-mono tabular-nums">Tax Year {taxYear}</span>
          </div>

          {isCorrection && (
            <div className="flex gap-2 p-3 rounded-md bg-warning/10 border border-warning/20">
              <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" />
              <p className="text-sm text-warning">This will replace your existing W2 data.</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Tax year</Label>
            <Select value={taxYear} onValueChange={(v) => { if (v) setTaxYear(v); }}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from(new Set([existingEntry?.tax_year, ...Array.from({ length: currentYear - 2019 }, (_, i) => currentYear - i)])).filter((year): year is number => year !== undefined).sort((a, b) => b - a).map(year => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="box1">Box 1 — Wages</Label>
            <CurrencyInput id="box1" value={box1} onChange={setBox1} aria-invalid={!!errors.box1} />
            {errors.box1 && <p className="text-xs text-destructive">{errors.box1}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="box2">Box 2 — Federal income tax withheld</Label>
            <CurrencyInput id="box2" value={box2} onChange={setBox2} aria-invalid={!!errors.box2} />
            {errors.box2 && <p className="text-xs text-destructive">{errors.box2}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="box3">Box 3 — Social Security wages (optional)</Label><CurrencyInput id="box3" value={box3} onChange={setBox3} /></div>
            <div className="space-y-1.5"><Label htmlFor="box5">Box 5 — Medicare wages (optional)</Label><CurrencyInput id="box5" value={box5} onChange={setBox5} /></div>
          </div>
          <p className="text-xs text-muted-foreground">Enter Boxes 3 and 5 when available. Missing wages are estimated; historical entries are retained, while new calculations support {TAX_YEAR} only.</p>
          <div className="space-y-1.5">
            <Label htmlFor="box4">Box 4 — Social Security tax withheld</Label>
            <CurrencyInput id="box4" value={box4} onChange={setBox4} aria-invalid={!!errors.box4} />
            <p className="text-xs text-muted-foreground">
              {Number(taxYear) === TAX_YEAR ? `Base estimate: ${formatCurrencyRounded(expectedSS)} (6.2% of Box 3, or Box 1 if missing; subject to the ${TAX_YEAR} wage base)` : 'Enter the actual amount from your W-2.'}
            </p>
            {errors.box4 && <p className="text-xs text-destructive">{errors.box4}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="box6">Box 6 — Medicare tax withheld</Label>
            <CurrencyInput id="box6" value={box6} onChange={setBox6} aria-invalid={!!errors.box6} />
            <p className="text-xs text-muted-foreground">
              Base estimate: {formatCurrencyRounded(expectedMedicare)} (1.45% of Box 5, or Box 1 if missing; excludes additional Medicare withholding)
            </p>
            {errors.box6 && <p className="text-xs text-destructive">{errors.box6}</p>}
          </div>

          {isCorrection && (
            <div className="space-y-1.5">
              <Label htmlFor="correction-note">Correction note *</Label>
              <Input
                id="correction-note"
                value={correctionNote}
                onChange={(e) => setCorrectionNote(e.target.value)}
                placeholder="What changed?"
                aria-invalid={!!errors.correctionNote}
              />
              {errors.correctionNote && <p className="text-xs text-destructive">{errors.correctionNote}</p>}
            </div>
          )}

          <Button className="w-full" onClick={handleSaveStep1} disabled={upsert.isPending}>
            {upsert.isPending ? <><LoadingSpinner size="sm" /> Saving...</> : 'Next — Box 12 codes'}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Step 2 of 2 — Box 12 codes (optional)
          </div>

          {isCorrection && (
            <div className="flex gap-2 p-3 rounded-md bg-warning/10 border border-warning/20">
              <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" />
              <p className="text-sm text-warning">This will replace your existing W2 data.</p>
            </div>
          )}

          {getBox12Codes().map(({ code, label, value, setValue }) => (
            <div key={code} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`code-${code}`}
                  checked={enabledCodes.has(code)}
                  onChange={() => toggleCode(code)}
                  className="rounded border-border"
                />
                <Label htmlFor={`code-${code}`} className="cursor-pointer">
                  Code {code} — {label}
                </Label>
              </div>
              {enabledCodes.has(code) && (
                <CurrencyInput value={value} onChange={setValue} />
              )}
            </div>
          ))}

          {isCorrection && (
            <div className="space-y-1.5">
              <Label htmlFor="correction-note-step2">Correction note *</Label>
              <Input
                id="correction-note-step2"
                value={correctionNote}
                onChange={(e) => { setCorrectionNote(e.target.value); setErrors({}); }}
                placeholder="What changed?"
                aria-invalid={!!errors.correctionNote}
              />
              {errors.correctionNote && <p className="text-xs text-destructive">{errors.correctionNote}</p>}
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button className="flex-1" onClick={handleSaveStep2} disabled={upsert.isPending}>
              {upsert.isPending ? <><LoadingSpinner size="sm" /> Saving...</> : 'Save W2'}
            </Button>
          </div>

          <button
            type="button"
            className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => onOpenChange(false)}
          >
            Skip Box 12 — save core data only
          </button>
        </div>
      )}
    </ResponsiveModal>
  );

  // Must be defined inside component to access state setters
  function getBox12Codes() {
    return [
      { code: 'D', label: 'Traditional 401(k)', value: codeD, setValue: setCodeD },
      { code: 'AA', label: 'Roth 401(k)', value: codeAA, setValue: setCodeAA },
      { code: 'W', label: 'HSA', value: codeW, setValue: setCodeW },
      { code: 'C', label: 'Group term life', value: codeC, setValue: setCodeC },
      { code: 'DD', label: 'Employer health coverage', value: codeDD, setValue: setCodeDD },
      { code: 'V', label: 'Stock option income', value: codeV, setValue: setCodeV },
    ];
  }
}

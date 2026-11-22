'use client';

import { useState } from 'react';
import { UserMinus, UserPlus, TrendingUp, Users, PiggyBank, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ResponsiveModal } from '@/components/shared/responsive-modal';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { Job, ScenarioModificationType, ScenarioModification, FilingStatus } from '@/lib/types';

const SCENARIO_TYPES: Array<{
  type: ScenarioModificationType;
  icon: typeof UserMinus;
  title: string;
  description: string;
}> = [
  { type: 'quit_job', icon: UserMinus, title: 'Quit Job', description: 'See the impact of leaving an employer' },
  { type: 'add_job', icon: UserPlus, title: 'Add Job', description: 'Model adding a new W2 position' },
  { type: 'salary_change', icon: TrendingUp, title: 'Salary Change', description: 'Raise, bonus, or pay cut' },
  { type: 'filing_status_change', icon: Users, title: 'Filing Status', description: 'Illustrate bracket changes; not a filing recommendation' },
  { type: 'add_1099', icon: FileText, title: '1099 Income', description: 'Add freelance or side income' },
];

// Retirement change uses salary_change type with modified logic
const RETIREMENT_ENTRY = { type: 'custom' as ScenarioModificationType, icon: PiggyBank, title: 'Retirement Change', description: 'Adjust 401k or HSA contributions' };

interface ScenarioBuilderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobs: Job[];
  onSubmit: (data: { name: string; modificationType: ScenarioModificationType; modifications: ScenarioModification }) => Promise<void>;
  isSubmitting: boolean;
}

export function ScenarioBuilder({ open, onOpenChange, jobs, onSubmit, isSubmitting }: ScenarioBuilderProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedType, setSelectedType] = useState<ScenarioModificationType | null>(null);

  // Form fields
  const [selectedJobId, setSelectedJobId] = useState('');
  const [quitMonth, setQuitMonth] = useState('');
  const [newJobName, setNewJobName] = useState('');
  const [newSalary, setNewSalary] = useState('');
  const [startMonth, setStartMonth] = useState('');
  const [effectiveMonth, setEffectiveMonth] = useState('');
  const [newFilingStatus, setNewFilingStatus] = useState<FilingStatus>('married_filing_jointly');
  const [scenarioName, setScenarioName] = useState('');

  const resetForm = () => {
    setStep(1);
    setSelectedType(null);
    setSelectedJobId('');
    setQuitMonth('');
    setNewJobName('');
    setNewSalary('');
    setStartMonth('');
    setEffectiveMonth('');
    setScenarioName('');
  };

  const handleClose = () => {
    onOpenChange(false);
    resetForm();
  };

  const handleSelectType = (type: ScenarioModificationType) => {
    setSelectedType(type);
    setStep(2);

    // Auto-generate name
    const labels: Record<string, string> = {
      quit_job: 'Quit Job', add_job: 'Add Job', salary_change: 'Salary Change',
      filing_status_change: 'Filing Status Change', add_1099: '1099 Income', custom: 'Retirement Change',
    };
    setScenarioName(labels[type] ?? 'Scenario');
  };

  const handleSubmit = async () => {
    if (!selectedType) return;

    const mod: ScenarioModification = { type: selectedType };

    switch (selectedType) {
      case 'quit_job':
        mod.jobIdToRemove = selectedJobId;
        if (quitMonth) mod.quitMonth = parseInt(quitMonth);
        break;
      case 'add_job':
        mod.jobToAdd = { name: newJobName || 'New Job', annualSalary: parseFloat(newSalary) || 0 };
        if (startMonth) mod.startMonth = parseInt(startMonth);
        break;
      case 'salary_change':
        mod.jobIdForRaise = selectedJobId;
        mod.newSalary = parseFloat(newSalary) || 0;
        if (effectiveMonth) mod.effectiveMonth = parseInt(effectiveMonth);
        break;
      case 'filing_status_change':
        mod.newFilingStatus = newFilingStatus;
        break;
      case 'add_1099':
        mod.income1099 = parseFloat(newSalary) || 0;
        if (startMonth) mod.startMonth = parseInt(startMonth);
        break;
    }

    await onSubmit({ name: scenarioName, modificationType: selectedType, modifications: mod });
    handleClose();
  };

  const months = Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: new Date(2026, i).toLocaleString('en-US', { month: 'long' }),
  }));

  return (
    <ResponsiveModal open={open} onOpenChange={handleClose} title={step === 1 ? 'New Scenario' : scenarioName}>
      {step === 1 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground mb-2">
            {jobs.length} job{jobs.length !== 1 ? 's' : ''} · {formatCurrency(jobs.reduce((s, j) => s + Number(j.annual_salary), 0))} combined
          </p>
          <div className="grid grid-cols-2 gap-2">
            {[...SCENARIO_TYPES, RETIREMENT_ENTRY].map((st) => (
              <button
                key={st.type + st.title}
                onClick={() => handleSelectType(st.type)}
                className={cn(
                  'flex flex-col items-start gap-1 p-3 rounded-lg border border-border text-left hover:border-foreground/30 transition-colors',
                  selectedType === st.type && 'border-foreground'
                )}
              >
                <st.icon className="size-4 text-violet-500" />
                <span className="text-sm font-medium">{st.title}</span>
                <span className="text-xs text-muted-foreground">{st.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="scenario-name">Scenario name</Label>
            <Input id="scenario-name" value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} />
          </div>

          {/* Quit Job */}
          {selectedType === 'quit_job' && (
            <>
              <div className="space-y-1.5">
                <Label>Job to leave</Label>
                <Select value={selectedJobId} onValueChange={(v) => { if (v) setSelectedJobId(v); }}>
                  <SelectTrigger><SelectValue placeholder="Select job..." /></SelectTrigger>
                  <SelectContent>
                    {jobs.map((j) => <SelectItem key={j.id} value={j.id}>{j.name} — {formatCurrency(Number(j.annual_salary))}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Quit month (optional)</Label>
                <Select value={quitMonth} onValueChange={(v) => { if (v) setQuitMonth(v); }}>
                  <SelectTrigger><SelectValue placeholder="Remove for full year" /></SelectTrigger>
                  <SelectContent>
                    {months.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* Add Job */}
          {selectedType === 'add_job' && (
            <>
              <div className="space-y-1.5">
                <Label>Job name</Label>
                <Input value={newJobName} onChange={(e) => setNewJobName(e.target.value)} placeholder="e.g., Acme Corp" />
              </div>
              <div className="space-y-1.5">
                <Label>Annual salary</Label>
                <Input type="number" value={newSalary} onChange={(e) => setNewSalary(e.target.value)} placeholder="85000" />
              </div>
              <div className="space-y-1.5">
                <Label>Start month (optional)</Label>
                <Select value={startMonth} onValueChange={(v) => { if (v) setStartMonth(v); }}>
                  <SelectTrigger><SelectValue placeholder="January" /></SelectTrigger>
                  <SelectContent>
                    {months.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* Salary Change */}
          {selectedType === 'salary_change' && (
            <>
              <div className="space-y-1.5">
                <Label>Job</Label>
                <Select value={selectedJobId} onValueChange={(v) => { if (v) setSelectedJobId(v); }}>
                  <SelectTrigger><SelectValue placeholder="Select job..." /></SelectTrigger>
                  <SelectContent>
                    {jobs.map((j) => <SelectItem key={j.id} value={j.id}>{j.name} — {formatCurrency(Number(j.annual_salary))}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>New salary</Label>
                <Input type="number" value={newSalary} onChange={(e) => setNewSalary(e.target.value)} placeholder="95000" />
              </div>
              <div className="space-y-1.5">
                <Label>Effective month (optional)</Label>
                <Select value={effectiveMonth} onValueChange={(v) => { if (v) setEffectiveMonth(v); }}>
                  <SelectTrigger><SelectValue placeholder="January" /></SelectTrigger>
                  <SelectContent>
                    {months.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* Filing Status */}
          {selectedType === 'filing_status_change' && (
            <div className="space-y-1.5">
              <Label>New filing status</Label>
              <Select value={newFilingStatus} onValueChange={(v) => { if (v) setNewFilingStatus(v as FilingStatus); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single</SelectItem>
                  <SelectItem value="married_filing_jointly">Married Filing Jointly</SelectItem>
                  <SelectItem value="married_filing_separately">Married Filing Separately</SelectItem>
                  <SelectItem value="head_of_household">Head of Household</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* 1099 Income */}
          {selectedType === 'add_1099' && (
            <>
              <div className="space-y-1.5">
                <Label>Annual net self-employment profit (after business expenses)</Label>
                <Input type="number" value={newSalary} onChange={(e) => setNewSalary(e.target.value)} placeholder="25000" />
              </div>
              <div className="space-y-1.5">
                <Label>Start month (optional)</Label>
                <Select value={startMonth} onValueChange={(v) => { if (v) setStartMonth(v); }}>
                  <SelectTrigger><SelectValue placeholder="January" /></SelectTrigger>
                  <SelectContent>
                    {months.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* Custom / Retirement — v1 placeholder */}
          {selectedType === 'custom' && (
            <p className="text-sm text-muted-foreground">Retirement contribution modeling is coming soon.</p>
          )}

          <div className="flex gap-2 pt-2">
            <Button onClick={() => setStep(1)} variant="outline" size="sm">Back</Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || selectedType === 'custom'}
              className="flex-1"
            >
              {isSubmitting ? 'Calculating...' : 'Calculate Scenario'}
            </Button>
          </div>
        </div>
      )}
    </ResponsiveModal>
  );
}

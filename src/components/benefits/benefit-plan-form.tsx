'use client';

import { useState } from 'react';
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
import { ResponsiveModal } from '@/components/shared/responsive-modal';
import type { Job, EmployerBenefitPlan } from '@/lib/types';

interface SubmitData {
  jobId: string;
  jobName: string;
  matchType: 'percentage' | 'dollar';
  matchPercent: number;
  matchCapPercent: number;
  matchCapDollar: number;
  employerHSAContribution: number;
  hasMegaBackdoorRoth: boolean;
  vestingSchedule?: string;
  healthPremiumMonthly: number;
  dentalPremiumMonthly: number;
  visionPremiumMonthly: number;
  notes?: string;
}

interface BenefitPlanFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobs: Job[];
  availableJobs: Job[];
  existingPlan: EmployerBenefitPlan | null;
  onSubmit: (data: SubmitData) => Promise<void>;
  isSubmitting?: boolean;
}

export function BenefitPlanForm({
  open,
  onOpenChange,
  jobs,
  availableJobs,
  existingPlan,
  onSubmit,
  isSubmitting,
}: BenefitPlanFormProps) {
  const isEdit = !!existingPlan;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Edit Benefit Plan' : 'Add Benefit Plan'}
    >
      <BenefitPlanFormInner
        key={existingPlan?.id ?? 'new'}
        jobs={jobs}
        availableJobs={availableJobs}
        existingPlan={existingPlan}
        onSubmit={onSubmit}
        isSubmitting={isSubmitting}
      />
    </ResponsiveModal>
  );
}

function BenefitPlanFormInner({
  jobs,
  availableJobs,
  existingPlan,
  onSubmit,
  isSubmitting,
}: Omit<BenefitPlanFormProps, 'open' | 'onOpenChange'>) {
  const isEdit = !!existingPlan;
  const jobOptions = isEdit ? jobs : availableJobs;

  const [selectedJobId, setSelectedJobId] = useState(existingPlan?.jobId ?? '');
  const [matchType, setMatchType] = useState<'percentage' | 'dollar'>(existingPlan?.matchType ?? 'percentage');
  const [matchPercent, setMatchPercent] = useState(existingPlan?.matchPercent ? String(existingPlan.matchPercent) : '');
  const [matchCapPercent, setMatchCapPercent] = useState(existingPlan?.matchCapPercent ? String(existingPlan.matchCapPercent) : '');
  const [matchCapDollar, setMatchCapDollar] = useState(existingPlan?.matchCapDollar ? String(existingPlan.matchCapDollar) : '');
  const [employerHSA, setEmployerHSA] = useState(existingPlan?.employerHSAContribution ? String(existingPlan.employerHSAContribution) : '');
  const [hasMegaBackdoor, setHasMegaBackdoor] = useState(existingPlan?.hasMegaBackdoorRoth ?? false);
  const [vestingSchedule, setVestingSchedule] = useState(existingPlan?.vestingSchedule ?? '');
  const [healthPremium, setHealthPremium] = useState(existingPlan?.healthPremiumMonthly ? String(existingPlan.healthPremiumMonthly) : '');
  const [dentalPremium, setDentalPremium] = useState(existingPlan?.dentalPremiumMonthly ? String(existingPlan.dentalPremiumMonthly) : '');
  const [visionPremium, setVisionPremium] = useState(existingPlan?.visionPremiumMonthly ? String(existingPlan.visionPremiumMonthly) : '');
  const [notes, setNotes] = useState(existingPlan?.notes ?? '');

  if (jobOptions.length === 0 && !isEdit) {
    return (
      <div className="py-4 text-center">
        <p className="text-sm text-muted-foreground">
          {jobs.length === 0
            ? 'Add jobs on the dashboard first.'
            : 'All jobs already have benefit plans configured.'}
        </p>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!selectedJobId) {
      toast.error('Please select a job');
      return;
    }

    const job = jobs.find((j) => j.id === selectedJobId);
    if (!job) {
      toast.error('Selected job not found');
      return;
    }

    try {
      await onSubmit({
        jobId: job.id,
        jobName: job.name,
        matchType,
        matchPercent: parseFloat(matchPercent) || 0,
        matchCapPercent: parseFloat(matchCapPercent) || 0,
        matchCapDollar: parseFloat(matchCapDollar) || 0,
        employerHSAContribution: parseFloat(employerHSA) || 0,
        hasMegaBackdoorRoth: hasMegaBackdoor,
        vestingSchedule: vestingSchedule || undefined,
        healthPremiumMonthly: parseFloat(healthPremium) || 0,
        dentalPremiumMonthly: parseFloat(dentalPremium) || 0,
        visionPremiumMonthly: parseFloat(visionPremium) || 0,
        notes: notes || undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save plan';
      toast.error(message);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Job selection */}
      <div className="space-y-1.5">
        <Label>Job</Label>
        {isEdit ? (
          <p className="flex h-9 items-center text-sm">{existingPlan?.jobName}</p>
        ) : (
          <Select
            value={selectedJobId}
            onValueChange={(v) => { if (v) setSelectedJobId(v); }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a job..." />
            </SelectTrigger>
            <SelectContent>
              {jobOptions.map((job) => (
                <SelectItem key={job.id} value={job.id}>
                  {job.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Match Type */}
      <div className="space-y-1.5">
        <Label>Match Type</Label>
        <div className="flex gap-4">
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="radio"
              name="matchType"
              value="percentage"
              checked={matchType === 'percentage'}
              onChange={() => setMatchType('percentage')}
              className="accent-primary"
            />
            Percentage of Salary
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="radio"
              name="matchType"
              value="dollar"
              checked={matchType === 'dollar'}
              onChange={() => setMatchType('dollar')}
              className="accent-primary"
            />
            Dollar Amount
          </label>
        </div>
      </div>

      {/* Match details */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="bf-matchPercent">Match %</Label>
          <Input
            id="bf-matchPercent"
            type="number"
            step="0.01"
            min="0"
            placeholder="100"
            value={matchPercent}
            onChange={(e) => setMatchPercent(e.target.value)}
          />
        </div>
        {matchType === 'percentage' ? (
          <div className="space-y-1.5">
            <Label htmlFor="bf-matchCapPercent">Cap (% of salary)</Label>
            <Input
              id="bf-matchCapPercent"
              type="number"
              step="0.01"
              min="0"
              placeholder="6"
              value={matchCapPercent}
              onChange={(e) => setMatchCapPercent(e.target.value)}
            />
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="bf-matchCapDollar">Cap ($)</Label>
            <Input
              id="bf-matchCapDollar"
              type="number"
              step="0.01"
              min="0"
              placeholder="5000"
              value={matchCapDollar}
              onChange={(e) => setMatchCapDollar(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* Employer HSA */}
      <div className="space-y-1.5">
        <Label htmlFor="bf-employerHSA">Employer HSA contribution ($/yr)</Label>
        <Input
          id="bf-employerHSA"
          type="number"
          step="0.01"
          min="0"
          placeholder="500"
          value={employerHSA}
          onChange={(e) => setEmployerHSA(e.target.value)}
        />
      </div>

      {/* Mega Backdoor */}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={hasMegaBackdoor}
          onChange={(e) => setHasMegaBackdoor(e.target.checked)}
          className="accent-primary"
        />
        Mega Backdoor Roth available
      </label>

      {/* Vesting */}
      <div className="space-y-1.5">
        <Label htmlFor="bf-vestingSchedule">Vesting schedule (optional)</Label>
        <Input
          id="bf-vestingSchedule"
          placeholder="e.g., 4-year cliff"
          value={vestingSchedule}
          onChange={(e) => setVestingSchedule(e.target.value)}
        />
      </div>

      {/* Premiums */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="bf-healthPremium">Health ($/mo)</Label>
          <Input
            id="bf-healthPremium"
            type="number"
            step="0.01"
            min="0"
            placeholder="150"
            value={healthPremium}
            onChange={(e) => setHealthPremium(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bf-dentalPremium">Dental ($/mo)</Label>
          <Input
            id="bf-dentalPremium"
            type="number"
            step="0.01"
            min="0"
            placeholder="25"
            value={dentalPremium}
            onChange={(e) => setDentalPremium(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bf-visionPremium">Vision ($/mo)</Label>
          <Input
            id="bf-visionPremium"
            type="number"
            step="0.01"
            min="0"
            placeholder="10"
            value={visionPremium}
            onChange={(e) => setVisionPremium(e.target.value)}
          />
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label htmlFor="bf-notes">Notes (optional)</Label>
        <Input
          id="bf-notes"
          placeholder="e.g., Roth only for first year"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <Button type="submit" disabled={isSubmitting || !selectedJobId} className="w-full">
        {isSubmitting ? 'Saving...' : existingPlan ? 'Update Plan' : 'Add Plan'}
      </Button>
    </form>
  );
}

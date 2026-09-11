import { describe, it, expect } from 'vitest';
import { runScenario } from '@/lib/tax/scenario-engine';
import type { CalculationInput } from '@/lib/types';

function makeBaseInput(overrides: Partial<CalculationInput> = {}): CalculationInput {
  return {
    jobs: [],
    filingStatus: 'single',
    standardDeduction: true,
    estimatedPaymentsYTD: 0,
    dependents: 0,
    childTaxCreditEligible: 0,
    otherDependentsEligible: 0,
    ...overrides,
  };
}

function makePaystubJob(id: string, salary: number, overrides = {}) {
  return {
    id,
    name: 'Job',
    incomeSource: 'paystub' as const,
    annualSalary: salary,
    federalWithholdingYTD: 0,
    socialSecurityWithholdingYTD: 0,
    medicareWithholdingYTD: 0,
    payFrequency: 'biweekly' as const,
    startMonth: 1,
    ...overrides,
  };
}

describe('scenario-engine contribution scaling', () => {
  describe('quit_job with quitMonth', () => {
    it('scales traditional401k and HSA contributions by the time ratio', () => {
      const baseInput = makeBaseInput({
        jobs: [
          makePaystubJob('job-1', 120_000, {
            traditional401k: 12_000,
            hsaContributions: 2_600,
            federalWithholdingYTD: 12_000,
            socialSecurityWithholdingYTD: 6_000,
            medicareWithholdingYTD: 1_800,
          }),
        ],
      });

      const { modifiedResult } = runScenario(baseInput, {
        type: 'quit_job',
        jobIdToRemove: 'job-1',
        quitMonth: 6,
      });

      const job = modifiedResult.input.jobs[0];
      // Salary scaled by 6/12 = 0.5
      expect(job.annualSalary).toBe(60_000);
      // Contributions must scale by the same ratio
      expect(job.traditional401k).toBe(6_000);
      expect(job.hsaContributions).toBe(1_300);
    });

    it('AGI reflects scaled contributions, not full-year contributions', () => {
      const baseInput = makeBaseInput({
        jobs: [
          makePaystubJob('job-1', 120_000, {
            traditional401k: 12_000,
            hsaContributions: 0,
          }),
        ],
      });

      const { baseResult, modifiedResult } = runScenario(baseInput, {
        type: 'quit_job',
        jobIdToRemove: 'job-1',
        quitMonth: 6,
      });

      // Baseline AGI: $120,000 - $12,000 = $108,000
      expect(baseResult.federal.adjustedGrossIncome).toBe(108_000);

      // With fix: modified AGI = $60,000 - $6,000 = $54,000
      // Without fix (regression): modified AGI = $60,000 - $12,000 = $48,000
      expect(modifiedResult.federal.adjustedGrossIncome).toBe(54_000);
    });

    it('scales roth401k proportionally (affects retirement limits)', () => {
      const baseInput = makeBaseInput({
        jobs: [
          makePaystubJob('job-1', 100_000, {
            roth401k: 8_000,
          }),
        ],
      });

      const { modifiedResult } = runScenario(baseInput, {
        type: 'quit_job',
        jobIdToRemove: 'job-1',
        quitMonth: 3,
      });

      // ratio = 3/12 = 0.25
      expect(modifiedResult.input.jobs[0].roth401k).toBe(2_000);
    });

    it('retains full-year income and contributions when quitting in December', () => {
      const baseInput = makeBaseInput({
        jobs: [
          makePaystubJob('job-1', 100_000.23, { traditional401k: 10_000.17, federalWithholdingYTD: 15_001.13 }),
          makePaystubJob('job-2', 80_000),
        ],
      });

      const { modifiedResult } = runScenario(baseInput, {
        type: 'quit_job',
        jobIdToRemove: 'job-1',
        quitMonth: 12,
      });

      expect(modifiedResult.input.jobs).toHaveLength(2);
      expect(modifiedResult.input.jobs[0]).toEqual(baseInput.jobs[0]);
      expect(modifiedResult.federal.totalIncome).toBeCloseTo(180_000.23, 2);
    });

    it('removes the job for the full year only when no quit month is selected', () => {
      const { modifiedResult } = runScenario(makeBaseInput({
        jobs: [makePaystubJob('job-1', 100_000), makePaystubJob('job-2', 80_000)],
      }), { type: 'quit_job', jobIdToRemove: 'job-1' });
      expect(modifiedResult.input.jobs.map(job => job.id)).toEqual(['job-2']);
      expect(modifiedResult.federal.totalIncome).toBe(80_000);
    });
  });

  describe('salary_change', () => {
    it('scales contributions when salary decreases', () => {
      const baseInput = makeBaseInput({
        jobs: [
          makePaystubJob('job-1', 100_000, {
            traditional401k: 10_000,
            hsaContributions: 2_600,
          }),
        ],
      });

      const { modifiedResult } = runScenario(baseInput, {
        type: 'salary_change',
        jobIdForRaise: 'job-1',
        newSalary: 80_000,
      });

      const job = modifiedResult.input.jobs[0];
      expect(job.annualSalary).toBe(80_000);
      // salaryRatio = 80,000 / 100,000 = 0.8
      expect(job.traditional401k).toBe(8_000);
      expect(job.hsaContributions).toBe(2_080);
    });

    it('scales contributions when salary increases', () => {
      const baseInput = makeBaseInput({
        jobs: [
          makePaystubJob('job-1', 100_000, {
            traditional401k: 10_000,
          }),
        ],
      });

      const { modifiedResult } = runScenario(baseInput, {
        type: 'salary_change',
        jobIdForRaise: 'job-1',
        newSalary: 150_000,
      });

      const job = modifiedResult.input.jobs[0];
      expect(job.annualSalary).toBe(150_000);
      // salaryRatio = 150,000 / 100,000 = 1.5
      expect(job.traditional401k).toBe(15_000);
    });

    it('blends salary and scales contributions for mid-year effective date', () => {
      const baseInput = makeBaseInput({
        jobs: [
          makePaystubJob('job-1', 120_000, {
            traditional401k: 12_000,
          }),
        ],
      });

      // Raise to $180,000 effective month 7
      // oldMonths = 6, newMonths = 6
      // blended = (120,000 * 6 + 180,000 * 6) / 12 = 150,000
      const { modifiedResult } = runScenario(baseInput, {
        type: 'salary_change',
        jobIdForRaise: 'job-1',
        newSalary: 180_000,
        effectiveMonth: 7,
      });

      const job = modifiedResult.input.jobs[0];
      expect(job.annualSalary).toBe(150_000);
      // salaryRatio = 150,000 / 120,000 = 1.25
      expect(job.traditional401k).toBe(15_000);
    });

    it('AGI reflects scaled contributions after salary decrease', () => {
      const baseInput = makeBaseInput({
        jobs: [
          makePaystubJob('job-1', 100_000, {
            traditional401k: 10_000,
          }),
        ],
      });

      const { baseResult, modifiedResult } = runScenario(baseInput, {
        type: 'salary_change',
        jobIdForRaise: 'job-1',
        newSalary: 80_000,
      });

      // Baseline AGI: $100,000 - $10,000 = $90,000
      expect(baseResult.federal.adjustedGrossIncome).toBe(90_000);

      // With fix: AGI = $80,000 - $8,000 = $72,000
      // Without fix (regression): AGI = $80,000 - $10,000 = $70,000
      expect(modifiedResult.federal.adjustedGrossIncome).toBe(72_000);
    });
  });
});

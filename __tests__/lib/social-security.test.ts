import { describe, it, expect } from 'vitest';
import { calculateSSOverpayment } from '@/lib/tax/social-security';
import { SOCIAL_SECURITY } from '@/lib/tax/tax-data-2026';
import type { CalculationInput } from '@/lib/types';

function makeInput(overrides: Partial<CalculationInput> = {}): CalculationInput {
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

function makeJob(salary: number, overrides = {}) {
  return {
    id: String(Math.random()),
    name: `Job ${salary / 1000}K`,
    annualSalary: salary,
    federalWithholdingYTD: 0,
    socialSecurityWithholdingYTD: 0,
    medicareWithholdingYTD: 0,
    incomeSource: 'paystub' as const, // Estimated withholding; actual W-2 Box 4 is tested separately
    payFrequency: 'semimonthly' as const,
    startMonth: 1,
    ...overrides,
  };
}

describe('calculateSSOverpayment', () => {
  const { wageBase, employeeRate, maxPerPerson } = SOCIAL_SECURITY;

  describe('single job scenarios', () => {
    it('shows no overpayment for single job under the cap', () => {
      const result = calculateSSOverpayment(makeInput({ jobs: [makeJob(100000)] }));

      expect(result.combinedWages).toBe(100000);
      expect(result.totalSSWithheld).toBeCloseTo(100000 * employeeRate, 2);
      expect(result.overpayment).toBe(0);
    });

    it('caps withholding at wage base for single job over $184,500', () => {
      const result = calculateSSOverpayment(makeInput({ jobs: [makeJob(200000)] }));

      // Employer only withholds on first $184,500
      expect(result.perJobSS[0].ssWithheld).toBeCloseTo(wageBase * employeeRate, 2);
      // No overpayment with single employer
      expect(result.overpayment).toBe(0);
    });
  });

  describe('multiple job overpayment', () => {
    it('calculates overpayment for $165K + $145K', () => {
      const result = calculateSSOverpayment(makeInput({
        jobs: [makeJob(165000), makeJob(145000)],
      }));

      const job1SS = 165000 * employeeRate; // $10,230
      const job2SS = 145000 * employeeRate; // $8,990
      const totalSS = job1SS + job2SS;       // $19,220

      expect(result.perJobSS[0].ssWithheld).toBeCloseTo(job1SS, 2);
      expect(result.perJobSS[1].ssWithheld).toBeCloseTo(job2SS, 2);
      expect(result.totalSSWithheld).toBeCloseTo(totalSS, 2);
      expect(result.overpayment).toBeCloseTo(totalSS - maxPerPerson, 2);
      expect(result.creditAtFiling).toBeCloseTo(totalSS - maxPerPerson, 2);
    });

    it('calculates overpayment for two $100K jobs', () => {
      const result = calculateSSOverpayment(makeInput({
        jobs: [makeJob(100000), makeJob(100000)],
      }));

      // Combined wages $200K > $184,500 cap
      // Each employer withholds: $100K × 6.2% = $6,200
      // Total withheld: $12,400
      const expected = (100000 * employeeRate * 2) - maxPerPerson;
      expect(result.overpayment).toBeCloseTo(expected, 2);
      expect(result.overpayment).toBeGreaterThan(0);
    });
  });

  describe('monthly timeline', () => {
    it('generates 12-month timeline', () => {
      const result = calculateSSOverpayment(makeInput({
        jobs: [makeJob(165000), makeJob(145000)],
      }));

      expect(result.monthlyTimeline).toHaveLength(12);
      expect(result.monthlyTimeline[0].month).toBe(1);
      expect(result.monthlyTimeline[11].month).toBe(12);
    });

    it('shows increasing overpayment over time', () => {
      const result = calculateSSOverpayment(makeInput({
        jobs: [makeJob(165000), makeJob(145000)],
      }));

      // Overpayment should start at 0 and grow
      expect(result.monthlyTimeline[0].overpaymentToDate).toBe(0);
      // By end of year, should match the total overpayment
      const lastMonth = result.monthlyTimeline[11];
      expect(lastMonth.overpaymentToDate).toBeCloseTo(result.overpayment, 0);
    });

    it('correctly shows month when employer hits SS cap', () => {
      // $200K salary paid over 12 months = ~$16,667/month
      // Reaches $184,500 cap around month 11
      const result = calculateSSOverpayment(makeInput({
        jobs: [makeJob(200000)],
      }));

      expect(result.perJobSS[0].monthCapReached).not.toBeNull();
      expect(result.perJobSS[0].monthCapReached).toBeGreaterThanOrEqual(10);
      expect(result.perJobSS[0].monthCapReached).toBeLessThanOrEqual(12);
    });

    it('returns null monthCapReached for salary under wage base', () => {
      const result = calculateSSOverpayment(makeInput({
        jobs: [makeJob(100000)],
      }));

      expect(result.perJobSS[0].monthCapReached).toBeNull();
    });
  });

  describe('partial-year employment', () => {
    it('adjusts for job starting mid-year', () => {
      const result = calculateSSOverpayment(makeInput({
        jobs: [
          makeJob(165000, { startMonth: 1 }),
          makeJob(145000, { startMonth: 7 }),
        ],
      }));

      // Job 2 starts in July — only works 6 months
      // But annual salary is still $145K (not pro-rated for input)
      expect(result.monthlyTimeline).toHaveLength(12);

      // Before July, only job 1 contributes
      const juneTimeline = result.monthlyTimeline[5]; // month 6
      expect(juneTimeline.cumulativeWages).toBeGreaterThan(0);
    });
  });

  describe('constants', () => {
    it('uses correct 2026 wage base and rate', () => {
      const result = calculateSSOverpayment(makeInput({
        jobs: [makeJob(100000)],
      }));

      expect(result.wageBase).toBe(184500);
      expect(result.ssRate).toBe(0.062);
      expect(result.maxSSPerPerson).toBeCloseTo(184500 * 0.062, 2);
    });
  });
});

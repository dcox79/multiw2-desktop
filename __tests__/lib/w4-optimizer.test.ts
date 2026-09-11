import { describe, it, expect } from 'vitest';
import { calculateW4Adjustments } from '@/lib/tax/w4-optimizer';
import { calculateFederalTax } from '@/lib/tax/federal-tax';
import type { CalculationInput, FederalTaxResult } from '@/lib/types';

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
    incomeSource: 'w2' as const,
    annualSalary: salary,
    federalWithholdingYTD: 0,
    socialSecurityWithholdingYTD: 0,
    medicareWithholdingYTD: 0,
    payFrequency: 'semimonthly' as const,
    startMonth: 1,
    ...overrides,
  };
}

describe('calculateW4Adjustments', () => {
  describe('under-withheld scenarios', () => {
    it('recommends extra withholding on highest-paying job', () => {
      const input = makeInput({
        jobs: [
          makeJob(165000, { name: 'Fintech Corp', federalWithholdingYTD: 25000, payFrequency: 'monthly' }),
          makeJob(145000, { name: 'Startup Inc', federalWithholdingYTD: 20000, payFrequency: 'biweekly' }),
        ],
      });
      const federalResult = calculateFederalTax(input);
      const result = calculateW4Adjustments(input, federalResult);

      // Extra withholding should be on the $165K job (highest paying)
      const fintechAdj = result.adjustments.find((a) => a.jobName === 'Fintech Corp')!;
      const startupAdj = result.adjustments.find((a) => a.jobName === 'Startup Inc')!;

      expect(fintechAdj.recommendedExtraWithholding).toBeGreaterThan(0);
      expect(startupAdj.recommendedExtraWithholding).toBe(0);
    });

    it('calculates correct per-paycheck for monthly pay', () => {
      const input = makeInput({
        jobs: [makeJob(200000, { name: 'BigCorp', federalWithholdingYTD: 0, payFrequency: 'monthly' })],
      });
      const federalResult = calculateFederalTax(input);
      const result = calculateW4Adjustments(input, federalResult);

      // With monthly pay, extra = gap / 12
      if (federalResult.withholdingGap > 0) {
        const adj = result.adjustments[0];
        expect(adj.recommendedExtraWithholding).toBeCloseTo(federalResult.withholdingGap / 12, 0);
      }
    });

    it('calculates correct per-paycheck for biweekly pay', () => {
      const input = makeInput({
        jobs: [makeJob(200000, { federalWithholdingYTD: 0, payFrequency: 'biweekly' })],
      });
      const federalResult = calculateFederalTax(input);
      const result = calculateW4Adjustments(input, federalResult);

      if (federalResult.withholdingGap > 0) {
        const adj = result.adjustments[0];
        // biweekly = 26 paychecks
        expect(adj.recommendedExtraWithholding).toBeCloseTo(federalResult.withholdingGap / 26, 0);
      }
    });
  });

  describe('over-withheld scenarios', () => {
    it('recommends reducing withholding on highest-paying job only', () => {
      const input = makeInput({
        jobs: [
          makeJob(165000, { name: 'BigCorp', federalWithholdingYTD: 30000, payFrequency: 'semimonthly' }),
          makeJob(50000, { name: 'SideJob', federalWithholdingYTD: 20000, payFrequency: 'biweekly' }),
        ],
      });
      const federalResult = calculateFederalTax(input);
      expect(federalResult.withholdingGap).toBeLessThan(-100);

      const result = calculateW4Adjustments(input, federalResult);

      // Highest-paying job gets specific reduction advice
      const bigCorpAdj = result.adjustments.find(a => a.jobName === 'BigCorp')!;
      expect(bigCorpAdj.explanation).toContain('reducing withholding');
      expect(bigCorpAdj.explanation).toContain('BigCorp');
      expect(bigCorpAdj.explanation).toContain('$');
      expect(bigCorpAdj.annualImpact).toBeLessThan(0);

      // Other job gets neutral message
      const sideJobAdj = result.adjustments.find(a => a.jobName === 'SideJob')!;
      expect(sideJobAdj.explanation).toContain('No adjustment needed');
      expect(sideJobAdj.explanation).toContain('highest-paying');
      expect(sideJobAdj.annualImpact).toBe(0);
    });

    it('single job over-withheld gets reduction advice', () => {
      const input = makeInput({
        jobs: [makeJob(50000, { federalWithholdingYTD: 20000 })],
      });
      const federalResult = calculateFederalTax(input);
      const result = calculateW4Adjustments(input, federalResult);

      expect(federalResult.withholdingGap).toBeLessThan(0);
      const adj = result.adjustments[0];
      expect(adj.recommendedExtraWithholding).toBe(0);
      expect(adj.explanation).toContain('reducing withholding');
    });
  });

  describe('zero gap', () => {
    it('returns $0 adjustments when withholding matches tax', () => {
      const input = makeInput({
        jobs: [makeJob(100000, { federalWithholdingYTD: 0 })],
      });
      const federalResult = calculateFederalTax(input);
      // Artificially set withholding to match tax
      const modifiedResult: FederalTaxResult = {
        ...federalResult,
        totalWithheld: federalResult.totalFederalTax,
        withholdingGap: 0,
      };

      const result = calculateW4Adjustments(input, modifiedResult);
      expect(result.adjustments[0].recommendedExtraWithholding).toBe(0);
      expect(result.adjustments[0].explanation).toContain('on track');
    });
  });

  describe('explanation text', () => {
    it('includes dollar amounts in explanation', () => {
      const input = makeInput({
        jobs: [
          makeJob(165000, { name: 'Fintech Corp', federalWithholdingYTD: 25000, payFrequency: 'monthly' }),
          makeJob(145000, { name: 'Startup Inc', federalWithholdingYTD: 20000, payFrequency: 'biweekly' }),
        ],
      });
      const federalResult = calculateFederalTax(input);
      const result = calculateW4Adjustments(input, federalResult);

      const primaryAdj = result.adjustments.find((a) => a.recommendedExtraWithholding > 0);
      if (primaryAdj) {
        expect(primaryAdj.explanation).toContain('$');
        expect(primaryAdj.explanation).toContain('Line 4(c)');
      }
    });
  });

  describe('dead zone (±$100)', () => {
    it('over-withheld by $50 → reports "on track" (within dead zone)', () => {
      const input = makeInput({
        jobs: [makeJob(100000, { federalWithholdingYTD: 0 })],
      });
      const federalResult = calculateFederalTax(input);
      // Set withholding to $50 more than tax (gap = -50)
      const modifiedResult: FederalTaxResult = {
        ...federalResult,
        totalWithheld: federalResult.totalFederalTax + 50,
        withholdingGap: -50,
      };

      const result = calculateW4Adjustments(input, modifiedResult);
      expect(result.adjustments[0].explanation).toContain('on track');
      expect(result.adjustments[0].recommendedExtraWithholding).toBe(0);
    });

    it('over-withheld by $150 → reports reduction advice', () => {
      const input = makeInput({
        jobs: [makeJob(100000, { federalWithholdingYTD: 0 })],
      });
      const federalResult = calculateFederalTax(input);
      const modifiedResult: FederalTaxResult = {
        ...federalResult,
        totalWithheld: federalResult.totalFederalTax + 150,
        withholdingGap: -150,
      };

      const result = calculateW4Adjustments(input, modifiedResult);
      expect(result.adjustments[0].explanation).toContain('over-withheld');
      expect(result.adjustments[0].explanation).toContain('reducing withholding');
    });

    it('under-withheld by $50 → reports "on track" (within dead zone)', () => {
      const input = makeInput({
        jobs: [makeJob(100000, { federalWithholdingYTD: 0 })],
      });
      const federalResult = calculateFederalTax(input);
      const modifiedResult: FederalTaxResult = {
        ...federalResult,
        totalWithheld: federalResult.totalFederalTax - 50,
        withholdingGap: 50,
      };

      const result = calculateW4Adjustments(input, modifiedResult);
      expect(result.adjustments[0].explanation).toContain('on track');
      expect(result.adjustments[0].recommendedExtraWithholding).toBe(0);
    });
  });

  describe('pay frequency handling', () => {
    it('handles all pay frequencies', () => {
      const frequencies = ['weekly', 'biweekly', 'semimonthly', 'monthly'] as const;
      const expectedPaychecks = [52, 26, 24, 12];

      for (let i = 0; i < frequencies.length; i++) {
        const input = makeInput({
          jobs: [makeJob(200000, { federalWithholdingYTD: 0, payFrequency: frequencies[i] })],
        });
        const federalResult = calculateFederalTax(input);
        const result = calculateW4Adjustments(input, federalResult);

        if (federalResult.withholdingGap > 0) {
          const adj = result.adjustments[0];
          const expectedExtra = Math.ceil((federalResult.withholdingGap / expectedPaychecks[i]) * 100) / 100;
          expect(adj.recommendedExtraWithholding).toBeCloseTo(expectedExtra, 2);
        }
      }
    });
  });
});

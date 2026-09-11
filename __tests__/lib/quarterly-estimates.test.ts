import { describe, it, expect } from 'vitest';
import { calculateQuarterlyEstimates } from '@/lib/tax/quarterly-estimates';
import { calculateFederalTax } from '@/lib/tax/federal-tax';
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

describe('calculateQuarterlyEstimates', () => {
  describe('all quarters remaining', () => {
    it('distributes gap evenly across 4 quarters', () => {
      const input = makeInput({
        jobs: [makeJob(200000, { federalWithholdingYTD: 0 })],
      });
      const federalResult = calculateFederalTax(input);

      // Use a date before Q1 due date (Jan 1, 2026)
      const result = calculateQuarterlyEstimates(input, federalResult, new Date('2026-01-01'));

      const futureQuarters = result.quarterlyPayments.filter((q) => !q.isPast);
      expect(futureQuarters).toHaveLength(4);

      // All future quarters should have equal amounts
      const amounts = futureQuarters.map((q) => q.amount);
      expect(new Set(amounts).size).toBe(1);
    });
  });

  describe('some quarters past', () => {
    it('distributes remaining gap across Q3 and Q4 when Q1 and Q2 are past', () => {
      const input = makeInput({
        jobs: [makeJob(200000, { federalWithholdingYTD: 0 })],
      });
      const federalResult = calculateFederalTax(input);

      // Date after Q2 due date (Jun 15, 2026)
      const result = calculateQuarterlyEstimates(input, federalResult, new Date('2026-07-01'));

      const pastQuarters = result.quarterlyPayments.filter((q) => q.isPast);
      const futureQuarters = result.quarterlyPayments.filter((q) => !q.isPast);

      expect(pastQuarters).toHaveLength(2); // Q1 and Q2
      expect(futureQuarters).toHaveLength(2); // Q3 and Q4

      // Past quarters should have $0 recommended
      for (const q of pastQuarters) {
        expect(q.amount).toBe(0);
      }

      // Future quarters should split the remaining
      expect(futureQuarters[0].amount).toBeGreaterThan(0);
    });
  });

  describe('estimated payments already made', () => {
    it('reduces recommended amounts by payments already made', () => {
      const input = makeInput({
        jobs: [makeJob(200000, { federalWithholdingYTD: 0 })],
        estimatedPaymentsYTD: 10000,
      });
      const federalResult = calculateFederalTax(input);

      const resultWithPayments = calculateQuarterlyEstimates(input, federalResult, new Date('2026-01-01'));
      const inputNoPay = makeInput({
        jobs: [makeJob(200000, { federalWithholdingYTD: 0 })],
        estimatedPaymentsYTD: 0,
      });
      const resultWithout = calculateQuarterlyEstimates(inputNoPay, federalResult, new Date('2026-01-01'));

      // With $10K already paid, per-quarter amounts should be lower
      const totalWithPayments = resultWithPayments.quarterlyPayments.reduce((s, q) => s + q.amount, 0);
      const totalWithout = resultWithout.quarterlyPayments.reduce((s, q) => s + q.amount, 0);
      expect(totalWithPayments).toBeLessThan(totalWithout);
    });
  });

  describe('penalty risk', () => {
    it('triggers penalty risk when gap > $1,000 and estimates insufficient', () => {
      const input = makeInput({
        jobs: [makeJob(200000, { federalWithholdingYTD: 0 })],
        estimatedPaymentsYTD: 0,
      });
      const federalResult = calculateFederalTax(input);
      const result = calculateQuarterlyEstimates(input, federalResult, new Date('2026-01-01'));

      expect(result.penaltyRisk).toBe(true);
      expect(result.penaltyExplanation).toContain('underpayment penalties');
      expect(result.penaltyExplanation).toContain('Prior-year safe harbor is unknown');
    });

    it('no penalty risk when gap <= $1,000', () => {
      const input = makeInput({
        // Low salary where withholding gap would be small
        jobs: [makeJob(20000, { federalWithholdingYTD: 0 })],
      });
      const federalResult = calculateFederalTax(input);
      const result = calculateQuarterlyEstimates(input, federalResult, new Date('2026-01-01'));

      // Tax on $20K with standard deduction is likely ~$430, which is under $1,000
      expect(result.penaltyRisk).toBe(false);
      expect(result.penaltyExplanation).toContain('safe harbor');
    });
  });

  describe('due dates', () => {
    it('uses correct 2026 due dates', () => {
      const input = makeInput({
        jobs: [makeJob(100000)],
      });
      const federalResult = calculateFederalTax(input);
      const result = calculateQuarterlyEstimates(input, federalResult, new Date('2026-01-01'));

      expect(result.quarterlyPayments[0].dueDate).toBe('April 15, 2026');
      expect(result.quarterlyPayments[1].dueDate).toBe('June 15, 2026');
      expect(result.quarterlyPayments[2].dueDate).toBe('September 15, 2026');
      expect(result.quarterlyPayments[3].dueDate).toBe('January 15, 2027');
    });

    it('correctly identifies quarters', () => {
      const input = makeInput({ jobs: [makeJob(100000)] });
      const federalResult = calculateFederalTax(input);
      const result = calculateQuarterlyEstimates(input, federalResult);

      expect(result.quarterlyPayments.map((q) => q.quarter)).toEqual([1, 2, 3, 4]);
    });
  });

  describe('safe harbor', () => {
    it('uses the 90% current-year target even above $150K', () => {
      const input = makeInput({
        jobs: [makeJob(200000, { federalWithholdingYTD: 0 })],
      });
      const federalResult = calculateFederalTax(input);
      const result = calculateQuarterlyEstimates(input, federalResult);

      expect(result.safeHarborAmount).toBeCloseTo(result.totalAnnualTax * 0.9, 2);
    });

    it('uses the 90% current-year target under $150K', () => {
      const input = makeInput({
        jobs: [makeJob(100000, { federalWithholdingYTD: 0 })],
      });
      const federalResult = calculateFederalTax(input);
      const result = calculateQuarterlyEstimates(input, federalResult);

      expect(result.safeHarborAmount).toBeCloseTo(result.totalAnnualTax * 0.9, 2);
    });
  });
});

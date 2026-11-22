import { describe, expect, it } from 'vitest';
import { calculateFederalTax } from '@/lib/tax/federal-tax';
import { calculateW4Adjustments } from '@/lib/tax/w4-optimizer';
import type { CalculationInput, JobInput } from '@/lib/types';

const job: JobInput = {
  id: 'synthetic-employer', name: 'Example employer', incomeSource: 'paystub',
  annualSalary: 100000, federalWithholdingYTD: 9000, socialSecurityWithholdingYTD: 0,
  medicareWithholdingYTD: 0, payFrequency: 'biweekly', startMonth: 1,
  projectedFederalWithholding: 12000, remainingPaychecks: 5, extraWithholdingPerPaycheck: 50,
};

function result(overrides: Partial<JobInput> = {}, payments = 500) {
  const input: CalculationInput = {
    taxYear: 2026, jobs: [{ ...job, ...overrides }], filingStatus: 'single',
    standardDeduction: true, estimatedPaymentsYTD: payments,
    dependents: 0, childTaxCreditEligible: 0, otherDependentsEligible: 0,
  };
  return calculateW4Adjustments(input, calculateFederalTax(input));
}

describe('W-4 planning', () => {
  it('spreads the remaining $670 after estimated payments over five checks', () => {
    const r = result();
    expect(r.recommendationStatus).toBe('projected');
    expect(r.adjustments[0].recommendedExtraWithholding).toBe(134);
    expect(r.adjustments[0].explanation).toContain('$184');
    expect(r.remainingGapAfterAdjustment).toBeCloseTo(0, 2);
  });
  it('does not increase withholding when estimates already cover the modeled gap', () => {
    expect(result({}, 1170).adjustments[0].recommendedExtraWithholding).toBe(0);
  });
  it.each([
    { remainingPaychecks: undefined },
    { remainingPaychecks: 0 },
    { projectedFederalWithholding: undefined },
    { incomeSource: 'w2' as const },
  ])('suppresses advice when future withholding cannot be inferred: %o', values => {
    expect(result(values).recommendationStatus).toBe('insufficient_data');
    expect(result(values).adjustments).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import { calculateRetirementLimits } from '@/lib/tax/retirement-limits';
import { RETIREMENT_LIMITS } from '@/lib/tax/tax-data-2026';
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

describe('calculateRetirementLimits', () => {
  describe('401K limits', () => {
    it('flags over-contribution when combined exceeds $24,500', () => {
      const result = calculateRetirementLimits(makeInput({
        jobs: [
          makeJob(165000, { traditional401k: 15000 }),
          makeJob(145000, { traditional401k: 12000 }),
        ],
      }));

      expect(result.total401kContributions).toBe(27000);
      expect(result.isOver401k).toBe(true);
      expect(result.remaining401k).toBe(RETIREMENT_LIMITS.employee401k - 27000);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('27,000');
      expect(result.warnings[0]).toContain('24,500');
    });

    it('shows remaining room when under limit', () => {
      const result = calculateRetirementLimits(makeInput({
        jobs: [
          makeJob(165000, { traditional401k: 10000 }),
          makeJob(145000, { traditional401k: 10000 }),
        ],
      }));

      expect(result.total401kContributions).toBe(20000);
      expect(result.isOver401k).toBe(false);
      expect(result.remaining401k).toBe(4500);
    });

    it('traditional + Roth both count toward $24,500 limit', () => {
      const result = calculateRetirementLimits(makeInput({
        jobs: [
          makeJob(165000, { traditional401k: 15000 }),
          makeJob(145000, { roth401k: 10000 }),
        ],
      }));

      // D ($15K) + AA ($10K) = $25K total → exceeds $24,500 by $500
      expect(result.total401kContributions).toBe(25000);
      expect(result.isOver401k).toBe(true);
      expect(result.remaining401k).toBe(-500);
    });

    it('returns traditional/roth breakdown per job', () => {
      const result = calculateRetirementLimits(makeInput({
        jobs: [
          makeJob(165000, { traditional401k: 12000, roth401k: 3000 }),
          makeJob(145000, { traditional401k: 5000, roth401k: 4000 }),
        ],
      }));

      expect(result.perJob401k[0].traditional).toBe(12000);
      expect(result.perJob401k[0].roth).toBe(3000);
      expect(result.perJob401k[0].contribution).toBe(15000);
      expect(result.perJob401k[1].traditional).toBe(5000);
      expect(result.perJob401k[1].roth).toBe(4000);
      expect(result.perJob401k[1].contribution).toBe(9000);
      expect(result.total401kContributions).toBe(24000);
    });
  });

  describe('HSA limits', () => {
    it('flags over-contribution for individual HSA', () => {
      const result = calculateRetirementLimits(makeInput({
        jobs: [
          makeJob(100000, { hsaContributions: 3000 }),
          makeJob(100000, { hsaContributions: 2000 }),
        ],
      }));

      expect(result.totalHSAContributions).toBe(5000);
      expect(result.isOverHSA).toBe(true);
      expect(result.remainingHSA).toBe(RETIREMENT_LIMITS.hsaIndividual - 5000);
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('HSA'),
        ])
      );
    });

    it('shows remaining room when under HSA limit', () => {
      const result = calculateRetirementLimits(makeInput({
        jobs: [
          makeJob(100000, { hsaContributions: 2000 }),
          makeJob(100000, { hsaContributions: 1000 }),
        ],
      }));

      expect(result.totalHSAContributions).toBe(3000);
      expect(result.isOverHSA).toBe(false);
      expect(result.remainingHSA).toBe(1400);
    });

    it('defaults to individual coverage type', () => {
      const result = calculateRetirementLimits(makeInput({
        jobs: [makeJob(100000)],
      }));

      expect(result.hsaCoverageType).toBe('individual');
      expect(result.limitHSA).toBe(RETIREMENT_LIMITS.hsaIndividual);
    });

    it('Code DD and Code C have zero impact on limits', () => {
      const result = calculateRetirementLimits(makeInput({
        jobs: [
          makeJob(100000, {
            groupTermLife: 5000,
            employerHealthCoverage: 18000,
          }),
        ],
      }));

      expect(result.total401kContributions).toBe(0);
      expect(result.totalHSAContributions).toBe(0);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('warnings', () => {
    it('includes specific dollar amounts in warnings', () => {
      const result = calculateRetirementLimits(makeInput({
        jobs: [
          makeJob(100000, { traditional401k: 15000, hsaContributions: 3000 }),
          makeJob(100000, { traditional401k: 12000, hsaContributions: 2000 }),
        ],
      }));

      expect(result.warnings.length).toBe(2);
      for (const warning of result.warnings) {
        expect(warning).toContain('$');
      }
    });

    it('returns empty warnings when all under limits', () => {
      const result = calculateRetirementLimits(makeInput({
        jobs: [
          makeJob(100000, { traditional401k: 10000, hsaContributions: 2000 }),
        ],
      }));

      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('recommendations', () => {
    it('references job names', () => {
      const result = calculateRetirementLimits(makeInput({
        jobs: [
          makeJob(165000, { name: 'Fintech Corp', traditional401k: 15000 }),
          makeJob(145000, { name: 'Startup Inc', traditional401k: 12000 }),
        ],
      }));

      expect(result.recommendation).toContain('Fintech Corp');
    });

    it('suggests maxing at highest-paying job when over limit', () => {
      const result = calculateRetirementLimits(makeInput({
        jobs: [
          makeJob(165000, { name: 'Primary', traditional401k: 15000 }),
          makeJob(145000, { name: 'Secondary', traditional401k: 12000 }),
        ],
      }));

      expect(result.recommendation).toContain('Primary');
      expect(result.recommendation).toContain('24,500');
    });
  });

  describe('limits constants', () => {
    it('uses correct 2026 limits', () => {
      const result = calculateRetirementLimits(makeInput({
        jobs: [makeJob(100000)],
      }));

      expect(result.limit401k).toBe(24500);
      expect(result.limitHSA).toBe(4400);
    });
  });
});

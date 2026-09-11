import { describe, it, expect } from 'vitest';
import { calculateMedicareTax } from '@/lib/tax/medicare-tax';
import { MEDICARE } from '@/lib/tax/tax-data-2026';
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
    medicareWithholdingYTD: salary * MEDICARE.rate, // assume employer withholds regular 1.45%
    payFrequency: 'semimonthly' as const,
    startMonth: 1,
    ...overrides,
  };
}

describe('calculateMedicareTax', () => {
  describe('no additional Medicare tax', () => {
    it('single filer $150K — below $200K threshold, no additional Medicare', () => {
      const result = calculateMedicareTax(makeInput({
        jobs: [makeJob(150000)],
        filingStatus: 'single',
      }));

      expect(result.regularMedicareTax).toBeCloseTo(150000 * 0.0145, 2);
      expect(result.additionalMedicareTax).toBe(0);
      expect(result.wagesAboveThreshold).toBe(0);
      expect(result.additionalMedicareThreshold).toBe(200000);
    });
  });

  describe('additional Medicare tax — single filer', () => {
    it('single filer $250K — additional Medicare on $50K = $450', () => {
      const result = calculateMedicareTax(makeInput({
        jobs: [makeJob(250000)],
        filingStatus: 'single',
      }));

      expect(result.additionalMedicareThreshold).toBe(200000);
      expect(result.wagesAboveThreshold).toBe(50000);
      expect(result.additionalMedicareTax).toBeCloseTo(450, 2); // 50000 * 0.009
      expect(result.regularMedicareTax).toBeCloseTo(250000 * 0.0145, 2);
      expect(result.totalMedicareLiability).toBeCloseTo(
        250000 * 0.0145 + 450, 2
      );
    });
  });

  describe('additional Medicare tax — MFJ', () => {
    it('MFJ filer $300K combined — additional on $50K = $450 (threshold $250K)', () => {
      const result = calculateMedicareTax(makeInput({
        jobs: [makeJob(150000), makeJob(150000)],
        filingStatus: 'married_filing_jointly',
      }));

      expect(result.additionalMedicareThreshold).toBe(250000);
      expect(result.wagesAboveThreshold).toBe(50000);
      expect(result.additionalMedicareTax).toBeCloseTo(450, 2);
    });
  });

  describe('additional Medicare tax — MFS', () => {
    it('MFS filer $150K — additional on $25K = $225 (threshold $125K)', () => {
      const result = calculateMedicareTax(makeInput({
        jobs: [makeJob(150000)],
        filingStatus: 'married_filing_separately',
      }));

      expect(result.additionalMedicareThreshold).toBe(125000);
      expect(result.wagesAboveThreshold).toBe(25000);
      expect(result.additionalMedicareTax).toBeCloseTo(225, 2);
    });
  });

  describe('multi-W2 trap', () => {
    it('3 jobs × $100K = $300K combined, no single employer above $200K — gap = $900', () => {
      // Each employer pays $100K < $200K → no employer withholds additional
      // But combined $300K > $200K → user owes 0.9% on $100K = $900
      // Employers only withhold regular 1.45% each
      const jobs = [
        makeJob(100000, { name: 'Job A' }),
        makeJob(100000, { name: 'Job B' }),
        makeJob(100000, { name: 'Job C' }),
      ];
      const result = calculateMedicareTax(makeInput({ jobs, filingStatus: 'single' }));

      expect(result.additionalMedicareTax).toBeCloseTo(900, 2); // 0.009 × $100K
      expect(result.wagesAboveThreshold).toBe(100000);

      // No employer withheld additional
      for (const job of result.perJobMedicare) {
        expect(job.additionalWithheld).toBe(0);
      }

      // Regular Medicare fully withheld by employers (3 × $100K × 0.0145)
      expect(result.totalMedicareWithheld).toBeCloseTo(300000 * 0.0145, 2);

      // Gap should be approximately the $900 additional tax
      expect(result.medicareGap).toBeCloseTo(900, 0);
    });
  });

  describe('single high earner — employer withholds additional', () => {
    it('1 job at $400K — employer withholds additional on $200K, user owes on $200K, gap ≈ $0', () => {
      // Employer withholds: regular (1.45% × $400K) + additional (0.9% × ($400K - $200K))
      // User owes: regular (1.45% × $400K) + additional (0.9% × ($400K - $200K))
      // Gap should be ~$0 if employer withholding matches
      const employerRegular = 400000 * 0.0145;
      const employerAdditional = (400000 - 200000) * 0.009;
      const totalWithheld = employerRegular + employerAdditional;

      const result = calculateMedicareTax(makeInput({
        jobs: [makeJob(400000, { medicareWithholdingYTD: totalWithheld })],
        filingStatus: 'single',
      }));

      expect(result.wagesAboveThreshold).toBe(200000);
      expect(result.additionalMedicareTax).toBeCloseTo(1800, 2); // 0.009 × $200K
      expect(result.perJobMedicare[0].additionalWithheld).toBeCloseTo(1800, 2);
      expect(result.medicareGap).toBeCloseTo(0, 0);
    });
  });

  describe('partial employer withholding', () => {
    it('2 jobs $250K + $50K — employer withholds additional on $50K, user owes on $100K, gap = $450', () => {
      // Job 1 ($250K): employer withholds additional on ($250K - $200K) = $50K → $450
      // Job 2 ($50K): employer withholds $0 additional
      // User owes additional on combined ($300K - $200K) = $100K → $900
      // Employer withheld additional: $450
      // Additional Medicare gap: $900 - $450 = $450
      const job1Regular = 250000 * 0.0145;
      const job1Additional = (250000 - 200000) * 0.009;
      const job2Regular = 50000 * 0.0145;

      const result = calculateMedicareTax(makeInput({
        jobs: [
          makeJob(250000, { name: 'Big Job', medicareWithholdingYTD: job1Regular + job1Additional }),
          makeJob(50000, { name: 'Side Job', medicareWithholdingYTD: job2Regular }),
        ],
        filingStatus: 'single',
      }));

      expect(result.wagesAboveThreshold).toBe(100000);
      expect(result.additionalMedicareTax).toBeCloseTo(900, 2);
      expect(result.perJobMedicare[0].additionalWithheld).toBeCloseTo(450, 2);
      expect(result.perJobMedicare[1].additionalWithheld).toBe(0);
      // Total withheld = regular (300K × 0.0145) + additional ($450 from employer)
      // Liability = regular (300K × 0.0145) + additional ($900)
      // Gap = $900 - $450 = $450
      expect(result.medicareGap).toBeCloseTo(450, 0);
    });
  });
});

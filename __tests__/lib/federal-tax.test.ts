import { describe, it, expect } from 'vitest';
import { calculateFederalTax } from '@/lib/tax/federal-tax';
import { STANDARD_DEDUCTION } from '@/lib/tax/tax-data-2026';
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

describe('calculateFederalTax', () => {
  describe('zero and edge cases', () => {
    it('returns zero tax for zero income', () => {
      const result = calculateFederalTax(makeInput({ jobs: [makeJob(0)] }));
      expect(result.totalIncome).toBe(0);
      expect(result.totalFederalTax).toBe(0);
      expect(result.effectiveRate).toBe(0);
    });

    it('returns zero tax when deduction exceeds income', () => {
      const result = calculateFederalTax(makeInput({ jobs: [makeJob(10000)] }));
      expect(result.taxableIncome).toBe(0);
      expect(result.totalFederalTax).toBe(0);
    });
  });

  describe('single filer calculations', () => {
    it('correctly calculates tax for $165K single filer', () => {
      const result = calculateFederalTax(makeInput({
        jobs: [makeJob(165000)],
        filingStatus: 'single',
      }));

      expect(result.totalIncome).toBe(165000);
      expect(result.adjustedGrossIncome).toBe(165000);
      expect(result.taxableIncome).toBe(165000 - STANDARD_DEDUCTION.single);

      const bracketSum = result.bracketBreakdown.reduce((sum, b) => sum + b.taxInBracket, 0);
      expect(Math.abs(bracketSum - result.totalFederalTax)).toBeLessThan(0.01);

      expect(result.marginalRate).toBe(0.24);
      expect(result.totalFederalTax).toBeGreaterThan(25000);
      expect(result.totalFederalTax).toBeLessThan(35000);
    });

    it('correctly calculates combined $310K pushing into 35% bracket', () => {
      const result = calculateFederalTax(makeInput({
        jobs: [makeJob(165000), makeJob(145000)],
        filingStatus: 'single',
      }));

      expect(result.totalIncome).toBe(310000);
      expect(result.taxableIncome).toBe(310000 - STANDARD_DEDUCTION.single);
      expect(result.marginalRate).toBe(0.35);
    });

    it('shows withholding gap when two employers each withhold as if only job', () => {
      const result = calculateFederalTax(makeInput({
        jobs: [
          makeJob(165000, { federalWithholdingYTD: 28000 }),
          makeJob(145000, { federalWithholdingYTD: 22000 }),
        ],
        filingStatus: 'single',
      }));

      expect(result.totalWithheld).toBe(50000);
      expect(result.withholdingGap).toBeGreaterThan(0);
    });
  });

  describe('married filing jointly', () => {
    it('uses MFJ brackets and deduction', () => {
      const result = calculateFederalTax(makeInput({
        jobs: [makeJob(200000)],
        filingStatus: 'married_filing_jointly',
      }));

      expect(result.taxableIncome).toBe(200000 - STANDARD_DEDUCTION.married_filing_jointly);
      expect(result.marginalRate).toBeLessThanOrEqual(0.22);
    });
  });

  describe('head of household', () => {
    it('uses HOH brackets and deduction', () => {
      const result = calculateFederalTax(makeInput({
        jobs: [makeJob(100000)],
        filingStatus: 'head_of_household',
      }));

      expect(result.taxableIncome).toBe(100000 - STANDARD_DEDUCTION.head_of_household);
    });
  });

  describe('deductions and income source handling', () => {
    it('uses itemized deductions when standardDeduction is false', () => {
      const result = calculateFederalTax(makeInput({
        jobs: [makeJob(200000)],
        standardDeduction: false,
        itemizedDeductions: 40000,
      }));

      expect(result.taxableIncome).toBe(200000 - 40000);
    });

    it('pay stub source: traditional 401K and HSA reduce AGI', () => {
      const result = calculateFederalTax(makeInput({
        jobs: [makeJob(165000, {
          incomeSource: 'paystub',
          traditional401k: 15000,
          hsaContributions: 3000,
        })],
      }));

      expect(result.adjustedGrossIncome).toBe(165000 - 15000 - 3000);
    });

    it('W2 source: traditional 401K and HSA do NOT reduce AGI (already in Box 1)', () => {
      const result = calculateFederalTax(makeInput({
        jobs: [makeJob(150000, {
          incomeSource: 'w2',
          traditional401k: 15000,
          hsaContributions: 3000,
        })],
      }));

      expect(result.adjustedGrossIncome).toBe(150000);
    });

    it('pay stub with Roth only: Roth 401K never reduces AGI', () => {
      const result = calculateFederalTax(makeInput({
        jobs: [makeJob(165000, {
          incomeSource: 'paystub',
          roth401k: 10000,
          traditional401k: 0,
        })],
      }));

      expect(result.adjustedGrossIncome).toBe(165000);
    });

    it('W2 with Roth only: Roth 401K never reduces AGI', () => {
      const result = calculateFederalTax(makeInput({
        jobs: [makeJob(165000, {
          incomeSource: 'w2',
          roth401k: 10000,
        })],
      }));

      expect(result.adjustedGrossIncome).toBe(165000);
    });

    it('mixed sources: per-job above-the-line deductions calculated independently', () => {
      const result = calculateFederalTax(makeInput({
        jobs: [
          makeJob(150000, {
            incomeSource: 'w2',
            traditional401k: 15000,
          }),
          makeJob(145000, {
            incomeSource: 'paystub',
            traditional401k: 10000,
          }),
        ],
      }));

      expect(result.totalIncome).toBe(295000);
      expect(result.adjustedGrossIncome).toBe(285000);
    });
  });

  describe('child tax credit', () => {
    it('applies full credit under phaseout threshold', () => {
      const result = calculateFederalTax(makeInput({
        jobs: [makeJob(100000)],
        childTaxCreditEligible: 2,
      }));

      expect(result.childTaxCredit).toBe(4400); // 2 × $2,200 = $4,400
    });

    it('phases out correctly above $200K for single — exact math', () => {
      // AGI $220K, threshold $200K → excess $20K → reduction = $20K × 0.05 = $1,000
      // Total credit: $2,200 - $1,000 = $1,200
      const result = calculateFederalTax(makeInput({
        jobs: [makeJob(220000)],
        filingStatus: 'single',
        childTaxCreditEligible: 1,
      }));

      expect(result.childTaxCredit).toBe(1200);
    });

    it('phases out correctly above $400K for MFJ — exact math', () => {
      // AGI $420K, threshold $400K → excess $20K → reduction = $20K × 0.05 = $1,000
      // Total credit: $2,200 - $1,000 = $1,200
      const result = calculateFederalTax(makeInput({
        jobs: [makeJob(420000)],
        filingStatus: 'married_filing_jointly',
        childTaxCreditEligible: 1,
      }));

      expect(result.childTaxCredit).toBe(1200);
    });

    it('returns zero credit when fully phased out', () => {
      // AGI $500K, threshold $200K → excess $300K → reduction = $300K × 0.05 = $15,000 > $2,200
      const result = calculateFederalTax(makeInput({
        jobs: [makeJob(500000)],
        filingStatus: 'single',
        childTaxCreditEligible: 1,
      }));

      expect(result.childTaxCredit).toBe(0);
    });

    it('reduces total credit not per-child — multi-child phase-out', () => {
      // AGI $210K, threshold $200K → excess $10K → reduction = $10K × 0.05 = $500
      // 3 children → full credit $6,600 → phased credit = $6,600 - $500 = $6,100
      // The $500 reduction is flat against total, NOT $500 per child
      const result = calculateFederalTax(makeInput({
        jobs: [makeJob(210000)],
        filingStatus: 'single',
        childTaxCreditEligible: 3,
      }));

      expect(result.childTaxCredit).toBe(6100);
    });

    it('calculates Other Dependents Credit at $500 per dependent', () => {
      const result = calculateFederalTax(makeInput({
        jobs: [makeJob(100000)],
        otherDependentsEligible: 2,
      }));
      expect(result.otherDependentsCredit).toBe(1000); // 2 x $500
      expect(result.childTaxCredit).toBe(0);
    });

    it('calculates both CTC and ODC together', () => {
      const result = calculateFederalTax(makeInput({
        jobs: [makeJob(100000)],
        childTaxCreditEligible: 2,
        otherDependentsEligible: 1,
      }));
      expect(result.childTaxCredit).toBe(4400);
      expect(result.otherDependentsCredit).toBe(500);
    });

    it('phases out CTC first then ODC at high AGI', () => {
      // AGI $220K, threshold $200K -> excess $20K -> reduction = $1,000
      // CTC: 1 child = $2,200, ODC: 1 parent = $500, total = $2,700
      // Reduction $1,000 applied to CTC first -> CTC = $1,200, ODC = $500
      const result = calculateFederalTax(makeInput({
        jobs: [makeJob(220000)],
        filingStatus: 'single',
        childTaxCreditEligible: 1,
        otherDependentsEligible: 1,
      }));
      expect(result.childTaxCredit).toBe(1200);
      expect(result.otherDependentsCredit).toBe(500);
    });

    it('phases out ODC after CTC is fully reduced', () => {
      // AGI $260K, threshold $200K -> excess $60K -> reduction = $3,000
      // CTC: 1 child = $2,200, ODC: 2 parents = $1,000, total = $3,200
      // CTC reduced by $2,200 -> $0. Remaining $800 reduces ODC -> $200
      const result = calculateFederalTax(makeInput({
        jobs: [makeJob(260000)],
        filingStatus: 'single',
        childTaxCreditEligible: 1,
        otherDependentsEligible: 2,
      }));
      expect(result.childTaxCredit).toBe(0);
      expect(result.otherDependentsCredit).toBe(200);
    });

    it('rounds excess AGI up to next $1K increment', () => {
      // AGI $200,500, threshold $200K → excess $500 → rounds up to $1,000
      // Reduction = $1,000 × 0.05 = $50
      // Credit = $2,200 - $50 = $2,150
      const result = calculateFederalTax(makeInput({
        jobs: [makeJob(200500)],
        filingStatus: 'single',
        childTaxCreditEligible: 1,
      }));

      expect(result.childTaxCredit).toBe(2150);
    });
  });

  describe('bracket breakdown', () => {
    it('bracket breakdown sums to total tax for all filing statuses', () => {
      const statuses = ['single', 'married_filing_jointly', 'married_filing_separately', 'head_of_household'] as const;

      for (const status of statuses) {
        const result = calculateFederalTax(makeInput({
          jobs: [makeJob(250000)],
          filingStatus: status,
        }));

        const bracketSum = result.bracketBreakdown.reduce((sum, b) => sum + b.taxInBracket, 0);
        expect(Math.abs(bracketSum - (result.totalFederalTax + result.childTaxCredit + result.otherDependentsCredit))).toBeLessThan(0.01);
      }
    });

    it('handles income at exact bracket boundary', () => {
      const targetTaxable = 50400;
      const salary = targetTaxable + STANDARD_DEDUCTION.single;
      const result = calculateFederalTax(makeInput({
        jobs: [makeJob(salary)],
        filingStatus: 'single',
      }));

      expect(result.taxableIncome).toBe(targetTaxable);
      expect(result.marginalRate).toBe(0.12);
    });
  });

  describe('withholding and remaining balance', () => {
    it('calculates remaining balance accounting for estimated payments', () => {
      const result = calculateFederalTax(makeInput({
        jobs: [makeJob(200000, { federalWithholdingYTD: 30000 })],
        estimatedPaymentsYTD: 5000,
      }));

      expect(result.remainingBalance).toBe(result.totalFederalTax - 30000 - 5000);
    });

    it('returns negative withholdingGap when over-withheld', () => {
      const result = calculateFederalTax(makeInput({
        jobs: [makeJob(50000, { federalWithholdingYTD: 20000 })],
      }));

      expect(result.withholdingGap).toBeLessThan(0);
    });
  });

  describe('married filing separately — bracket divergence', () => {
    it('MFS at $400K hits 35% bracket (starts at $384,350 for MFS)', () => {
      const result = calculateFederalTax(makeInput({
        jobs: [makeJob(400000)],
        filingStatus: 'married_filing_separately',
      }));

      // Taxable income = $400K - $16,100 MFS standard deduction = $383,900
      // $383,900 < $384,350 (MFS 37% bracket start)
      expect(result.taxableIncome).toBe(400000 - STANDARD_DEDUCTION.married_filing_separately);
      expect(result.marginalRate).toBe(0.35);
    });

    it('MFS at $250K hits 32% bracket', () => {
      const result = calculateFederalTax(makeInput({
        jobs: [makeJob(250000)],
        filingStatus: 'married_filing_separately',
      }));

      // Taxable = $250K - $16,100 = $233,900 → in 32% bracket ($201,775 - $256,225)
      expect(result.taxableIncome).toBe(250000 - STANDARD_DEDUCTION.married_filing_separately);
      expect(result.marginalRate).toBe(0.32);
    });

    it('MFS vs Single at $500K — MFS tax is higher due to 37% bracket starting lower', () => {
      const mfsResult = calculateFederalTax(makeInput({
        jobs: [makeJob(500000)],
        filingStatus: 'married_filing_separately',
      }));

      const singleResult = calculateFederalTax(makeInput({
        jobs: [makeJob(500000)],
        filingStatus: 'single',
      }));

      // At $500K: Single is in 35% bracket (starts $256,225, 37% at $640,600)
      // MFS is in 37% bracket (starts $384,350)
      expect(singleResult.marginalRate).toBe(0.35);
      expect(mfsResult.marginalRate).toBe(0.37);
      expect(mfsResult.totalFederalTax).toBeGreaterThan(singleResult.totalFederalTax);
    });

    it('MFS at exactly $384,350 taxable income — boundary of 35%/37% bracket', () => {
      // Set salary so taxable = exactly $384,350
      const salary = 384350 + STANDARD_DEDUCTION.married_filing_separately;
      const result = calculateFederalTax(makeInput({
        jobs: [makeJob(salary)],
        filingStatus: 'married_filing_separately',
      }));

      expect(result.taxableIncome).toBe(384350);
      // At exactly $384,350, the last dollar is taxed at 35% (bracket is $256,225 to $384,350)
      expect(result.marginalRate).toBe(0.35);
    });
  });

  describe('high income scenarios', () => {
    it('handles $1M+ income correctly', () => {
      const result = calculateFederalTax(makeInput({
        jobs: [makeJob(1200000)],
        filingStatus: 'single',
      }));

      expect(result.marginalRate).toBe(0.37);
      expect(result.totalFederalTax).toBeGreaterThan(300000);
    });
  });

  describe('Marcus persona test case', () => {
    it('matches expected results for $165K + $145K single filer (pay stub source)', () => {
      const result = calculateFederalTax(makeInput({
        jobs: [
          makeJob(165000, {
            name: 'J1 — Fintech Corp',
            incomeSource: 'paystub',
            federalWithholdingYTD: 25000,
            socialSecurityWithholdingYTD: 8000,
            medicareWithholdingYTD: 2000,
            traditional401k: 15000,
            hsaContributions: 3000,
            payFrequency: 'semimonthly',
          }),
          makeJob(145000, {
            name: 'J2 — Startup Inc',
            incomeSource: 'paystub',
            federalWithholdingYTD: 20000,
            socialSecurityWithholdingYTD: 7000,
            medicareWithholdingYTD: 1800,
            traditional401k: 10000,
            payFrequency: 'biweekly',
          }),
        ],
        filingStatus: 'single',
      }));

      expect(result.totalIncome).toBe(310000);
      expect(result.adjustedGrossIncome).toBe(282000);
      expect(result.taxableIncome).toBe(265900);
      expect(result.marginalRate).toBe(0.35);
      expect(result.totalWithheld).toBe(45000);
      expect(result.withholdingGap).toBeGreaterThan(0);
    });
  });
});

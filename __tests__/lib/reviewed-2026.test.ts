import { describe, it, expect } from 'vitest';
import { runAllCalculators } from '@/lib/tax/run-calculators';
import { buildJobInputs } from '@/lib/tax/build-job-inputs';
import { computeProjections } from '@/lib/tax/projections';
import { runScenario } from '@/lib/tax/scenario-engine';
import { calculateQuarterlyEstimates } from '@/lib/tax/quarterly-estimates';
import { calculateSelfEmploymentTax } from '@/lib/tax/self-employment-tax';
import { optimizeBenefitsAllocation } from '@/lib/tax/benefits-optimizer';
import { assertSupportedTaxYear, RETIREMENT_LIMITS } from '@/lib/tax/tax-data-2026';
import type { CalculationInput, EmployerBenefitPlan, FilingStatus, Job, JobInput, JobW2Entry, YTDSnapshot } from '@/lib/types';

const job = (salary: number, overrides: Partial<JobInput> = {}): JobInput => ({ id: 'job', name: 'Job', incomeSource: 'paystub', annualSalary: salary, federalWithholdingYTD: 0, socialSecurityWithholdingYTD: 0, medicareWithholdingYTD: 0, payFrequency: 'biweekly', startMonth: 1, ...overrides });
const input = (jobs: JobInput[], overrides: Partial<CalculationInput> = {}): CalculationInput => ({ taxYear: 2026, jobs, filingStatus: 'single', standardDeduction: true, estimatedPaymentsYTD: 0, dependents: 0, childTaxCreditEligible: 0, otherDependentsEligible: 0, ...overrides });

describe('2026 source-reviewed regressions (IRS Rev. Proc. 2025-32)', () => {
  it('matches the published base tax at every ordinary-income bracket boundary', () => {
    // Independently transcribed base taxes from section 4.01 Tables 1-4.
    const cases: [FilingStatus, number[], number[]][] = [
      ['single', [12400, 50400, 105700, 201775, 256225, 640600], [1240, 5800, 17966, 41024, 58448, 192979.25]],
      ['married_filing_jointly', [24800, 100800, 211400, 403550, 512450, 768700], [2480, 11600, 35932, 82048, 116896, 206583.5]],
      ['married_filing_separately', [12400, 50400, 105700, 201775, 256225, 384350], [1240, 5800, 17966, 41024, 58448, 103291.75]],
      ['head_of_household', [17700, 67450, 105700, 201750, 256200, 640600], [1770, 7740, 16155, 39207, 56631, 191171]],
    ];
    for (const [filingStatus, boundaries, taxes] of cases) {
      boundaries.forEach((wages, i) => expect(runAllCalculators(input([job(wages)], { filingStatus, standardDeduction: false })).federal.totalFederalTax).toBeCloseTo(taxes[i], 2));
    }
  });

  it('matches reviewed multi-job, child-credit and MFS examples', () => {
    expect(runAllCalculators(input([job(165000), job(145000)])).federal.totalFederalTax).toBeCloseTo(71634.25, 2);
    expect(runAllCalculators(input([job(200000)], { filingStatus: 'married_filing_jointly', childTaxCreditEligible: 2 })).federal.totalFederalTax).toBeCloseTo(21940, 2);
    expect(runAllCalculators(input([job(400000)], { filingStatus: 'married_filing_separately' })).federal.totalFederalTax).toBeCloseTo(103134.25, 2);
    expect(RETIREMENT_LIMITS).toEqual({ employee401k: 24500, total401k: 72000, hsaIndividual: 4400, hsaFamily: 8750, catchUp401k: 8000 });
  });

  it('rejects unsupported years and isolates unsorted snapshots/W-2 records by selected year', () => {
    const jobs = [{ id: 'job', name: 'Job', annual_salary: 120000, pay_frequency: 'biweekly', income_source: 'w2' }] as Job[];
    const snapshots = [
      { job_id: 'job', paycheck_date: '2025-12-31', ytd_federal_withheld: 90000 },
      { job_id: 'job', paycheck_date: '2026-06-30', ytd_federal_withheld: 6000 },
      { job_id: 'job', paycheck_date: '2026-01-31', ytd_federal_withheld: 1000 },
    ] as YTDSnapshot[];
    const w2s = [{ job_id: 'job', tax_year: 2025, box1_wages: 999999 }] as JobW2Entry[];
    const assembled = buildJobInputs(jobs, snapshots, w2s, 2026);
    expect(assembled.jobInputs[0].federalWithholdingYTD).toBe(6000);
    expect(assembled.jobInputs[0].incomeSource).toBe('paystub');
    expect(assembled.calculationBasis).toBe('ytd_only');
    expect(computeProjections(jobs, new Map([['job', snapshots[0]]]), 'single', 0, true)).toBeNull();
    expect(() => runAllCalculators(input([], { taxYear: 2025 }))).toThrow('not supported');
    expect(() => assertSupportedTaxYear(2027)).toThrow('not supported');
    expect(() => buildJobInputs(jobs, snapshots, w2s, 2025)).toThrow('not supported');
  });

  it('uses actual W-2 Box 4 for refund and Box 5 for Medicare', () => {
    const result = runAllCalculators(input([
      job(80000, { incomeSource: 'w2', socialSecurityWages: 100000, medicareWages: 100000, socialSecurityWithholdingYTD: 6200 }),
      job(80000, { id: 'second', incomeSource: 'w2', socialSecurityWages: 100000, medicareWages: 100000, socialSecurityWithholdingYTD: 6200 }),
    ]));
    expect(result.socialSecurity.overpayment).toBe(961);
    expect(result.medicare.regularMedicareTax).toBe(2900);
    expect(result.socialSecurity.combinedWages).toBe(200000);
    const singleEmployer = runAllCalculators(input([job(200000, { incomeSource: 'w2', socialSecurityWithholdingYTD: 12400 })])).socialSecurity;
    expect(singleEmployer.creditAtFiling).toBe(0);
    expect(singleEmployer.monthlyTimeline[11].overpaymentToDate).toBe(0);
  });

  it('treats $1,000 as the payment threshold and keeps the due date available all day', () => {
    const result = runAllCalculators(input([job(10000)], { standardDeduction: false }));
    const quarterly = calculateQuarterlyEstimates(result.input, result.federal, new Date('2026-04-15T12:00:00'));
    expect(quarterly.safeHarborAmount).toBe(900);
    expect(quarterly.requiredAnnualEstimate).toBe(900);
    expect(quarterly.quarterlyPayments[0].isPast).toBe(false);
    expect(quarterly.penaltyExplanation).toContain('Prior-year safe harbor is unknown');
    const below = runAllCalculators(input([job(9990)], { standardDeduction: false }));
    expect(below.quarterly.requiredAnnualEstimate).toBe(0);
  });

  it('does not deduct Additional Medicare Tax or charge 1099 income employee payroll tax', () => {
    const se = calculateSelfEmploymentTax(100000, 200000, 'single');
    expect(se.additionalMedicarePortion).toBe(831.15);
    expect(se.seDeduction).toBe(1339.08);
    expect(calculateSelfEmploymentTax(400, 0, 'single').totalSETax).toBe(0);
    const scenario = runScenario(input([job(200000)]), { type: 'add_1099', income1099: 100000, startMonth: 7 });
    expect(scenario.modifiedResult.federal.totalIncome).toBe(250000);
    expect(scenario.deltas.medicareLiability).toBe(0);
    expect(scenario.deltas.ssOverpayment).toBe(0);
    expect(scenario.deltas.selfEmploymentTax).toBeCloseTo(1754.66, 2);
    expect(scenario.modifiedResult.federal.adjustedGrossIncome).toBeCloseTo(249330.46, 2);
  });

  it('subtracts every employer HSA contribution before recommending an employee amount', () => {
    const plans = [
      { id: 'a', jobId: 'a', jobName: 'A', isActive: true, matchType: 'percentage', matchPercent: 100, matchCapPercent: 4, employerHSAContribution: 1000 },
      { id: 'b', jobId: 'b', jobName: 'B', isActive: true, matchType: 'percentage', matchPercent: 100, matchCapPercent: 4, employerHSAContribution: 500 },
    ] as EmployerBenefitPlan[];
    const result = optimizeBenefitsAllocation(plans, { a: 100000, b: 100000 });
    expect(result.totalHSAContributions).toBe(2900);
    const lowSalary = optimizeBenefitsAllocation(plans, { a: 1000, b: 2000 });
    expect(lowSalary.total401kContributions).toBe(3000);
    const competing = optimizeBenefitsAllocation([
      { ...plans[0], matchPercent: 50, matchCapPercent: 100 },
      { ...plans[1], matchPercent: 100, matchCapPercent: 10 },
    ], { a: 100000, b: 100000 });
    expect(competing.totalEmployerMatch).toBe(17250);
  });
});

import { TAX_YEAR, assertSupportedTaxYear } from './tax-data-2026';
import { runAllCalculators } from './run-calculators';
import type {
  Job, YTDSnapshot, CalculationInput, JobInput,
  FederalTaxResult, SSOverpaymentResult, MedicareTaxResult, W4Result, QuarterlyEstimateResult,
} from '../types';

export interface JobProjection {
  jobId: string;
  jobName: string;
  projectedGross: number;
  projectedFedWithheld: number;
  projectedSSWithheld: number;
  projectedMedWithheld: number;
  fractionElapsed: number;
  capped: boolean;
  insufficientData: boolean;
}

export interface ProjectionResult {
  federal: FederalTaxResult;
  socialSecurity: SSOverpaymentResult;
  medicare: MedicareTaxResult;
  w4: W4Result;
  quarterly: QuarterlyEstimateResult;
  jobProjections: JobProjection[];
  latestSnapshotDate: string;
  hasWarnings: boolean;
}

export function computeProjections(
  jobs: Job[],
  latestByJob: Map<string, YTDSnapshot>,
  filingStatus: string,
  dependents: number,
  useStandardDeduction: boolean,
  estimatedPaymentsYTD: number = 0,
  itemizedDeductions: number = 0,
  taxYear: number = TAX_YEAR,
): ProjectionResult | null {
  assertSupportedTaxYear(taxYear);
  const jobsWithSnaps = jobs.filter((j) => latestByJob.get(j.id)?.paycheck_date.startsWith(`${taxYear}-`));
  if (jobsWithSnaps.length === 0) return null;

  const jobProjections: JobProjection[] = [];
  const jobInputs: JobInput[] = [];
  let latestDate = '';
  let hasWarnings = false;

  for (const job of jobsWithSnaps) {
    const snap = latestByJob.get(job.id)!;

    const snapDate = new Date(snap.paycheck_date + 'T00:00:00');
    const snapYear = snapDate.getFullYear();
    const yearStart = new Date(snapYear, 0, 1);
    const yearEnd = new Date(snapYear, 11, 31);
    const totalDays = (yearEnd.getTime() - yearStart.getTime()) / 86_400_000;
    const elapsedDays = (snapDate.getTime() - yearStart.getTime()) / 86_400_000;
    const fraction = Math.max(0.05, Math.min(1, elapsedDays / totalDays));

    const insufficientData = elapsedDays < 18;

    let projectedGross = Math.round(Number(snap.ytd_gross) / fraction);
    let projectedFedWithheld = Math.round(Number(snap.ytd_federal_withheld) / fraction);
    let projectedSSWithheld = Math.round(Number(snap.ytd_ss_withheld) / fraction);
    let projectedMedWithheld = Math.round(Number(snap.ytd_medicare_withheld) / fraction);

    // Project extra W-4 withholding for remaining portion of year
    const extraWH = Number(job.extra_withholding_per_paycheck ?? 0);
    if (extraWH > 0) {
      const periodsPerYear = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 }[job.pay_frequency as string] ?? 26;
      const remainingPeriods = Math.round(periodsPerYear * (1 - fraction));
      projectedFedWithheld += extraWH * remainingPeriods;
    }

    const saneMax = Number(job.annual_salary) * 3;
    let capped = false;
    if (projectedGross > saneMax) {
      const capRatio = Number(job.annual_salary) / projectedGross;
      projectedGross = Number(job.annual_salary);
      projectedFedWithheld = Math.round(projectedFedWithheld * capRatio);
      projectedSSWithheld = Math.round(projectedSSWithheld * capRatio);
      projectedMedWithheld = Math.round(projectedMedWithheld * capRatio);
      capped = true;
      hasWarnings = true;
    }
    if (insufficientData) hasWarnings = true;

    jobProjections.push({
      jobId: job.id, jobName: job.name,
      projectedGross, projectedFedWithheld, projectedSSWithheld, projectedMedWithheld,
      fractionElapsed: fraction, capped, insufficientData,
    });

    jobInputs.push({
      id: job.id, name: job.name, incomeSource: 'paystub',
      annualSalary: projectedGross,
      federalWithholdingYTD: projectedFedWithheld,
      socialSecurityWithholdingYTD: projectedSSWithheld,
      medicareWithholdingYTD: projectedMedWithheld,
      traditional401k: snap.ytd_traditional_401k ? Math.round(Number(snap.ytd_traditional_401k) / fraction) : undefined,
      roth401k: snap.ytd_roth_401k ? Math.round(Number(snap.ytd_roth_401k) / fraction) : undefined,
      hsaContributions: snap.ytd_hsa ? Math.round(Number(snap.ytd_hsa) / fraction) : undefined,
      payFrequency: job.pay_frequency as JobInput['payFrequency'],
      startMonth: job.start_month ?? 1,
    });

    if (snap.paycheck_date > latestDate) latestDate = snap.paycheck_date;
  }

  const calcInput: CalculationInput = {
    taxYear,
    jobs: jobInputs,
    filingStatus: filingStatus as CalculationInput['filingStatus'],
    standardDeduction: useStandardDeduction,
    itemizedDeductions,
    estimatedPaymentsYTD,
    dependents,
    childTaxCreditEligible: 0,
    otherDependentsEligible: 0,
  };

  const { federal, socialSecurity, medicare, w4, quarterly } = runAllCalculators(calcInput);

  return { federal, socialSecurity, medicare, w4, quarterly, jobProjections, latestSnapshotDate: latestDate, hasWarnings };
}

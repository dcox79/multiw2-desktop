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
  childTaxCreditEligible = 0,
): ProjectionResult | null {
  assertSupportedTaxYear(taxYear);
  const jobsWithSnaps = jobs.filter((j) => latestByJob.get(j.id)?.paycheck_date.startsWith(`${taxYear}-`));
  if (jobsWithSnaps.length === 0) return null;

  const jobProjections: JobProjection[] = [];
  const jobInputs: JobInput[] = [];
  let latestDate = '';
  let hasWarnings = jobsWithSnaps.length < jobs.length;

  const scaleFuture = (actual: number, projection: number, scale: number) => actual + Math.round((projection - actual) * scale * 100) / 100;

  for (const job of jobsWithSnaps) {
    const snap = latestByJob.get(job.id)!;

    const snapDate = Date.parse(snap.paycheck_date + 'T00:00:00Z');
    const yearStart = Date.UTC(taxYear, job.started_this_year ? (job.start_month ?? 1) - 1 : 0, 1);
    const yearEnd = Date.UTC(taxYear + 1, 0, 1);
    const totalDays = (yearEnd - yearStart) / 86_400_000;
    const elapsedDays = Math.max(0, (snapDate - yearStart) / 86_400_000 + 1);
    const former = job.employment_status === 'former';
    const fraction = former ? 1 : Math.max(0.05, Math.min(1, elapsedDays / totalDays));
    const insufficientData = !former && elapsedDays < 18;

    const extrapolate = (value: number) => fraction === 1 ? value : Math.max(value, Math.round(value / fraction));
    let projectedGross = extrapolate(Number(snap.ytd_gross));
    let projectedFedWithheld = extrapolate(Number(snap.ytd_federal_withheld));
    let projectedSSWithheld = extrapolate(Number(snap.ytd_ss_withheld));
    let projectedMedWithheld = extrapolate(Number(snap.ytd_medicare_withheld));

    // The observed rate can already include the current Line 4(c); do not add it again.

    const saneMax = Number(job.annual_salary) * 3;
    let capped = false;
    let futureScale = 1;
    if (!former && saneMax > 0 && projectedGross > saneMax) {
      const actual = Number(snap.ytd_gross);
      const cappedGross = Math.max(Number(job.annual_salary), actual);
      futureScale = projectedGross > actual ? (cappedGross - actual) / (projectedGross - actual) : 0;
      projectedGross = cappedGross;
      projectedFedWithheld = scaleFuture(Number(snap.ytd_federal_withheld), projectedFedWithheld, futureScale);
      projectedSSWithheld = scaleFuture(Number(snap.ytd_ss_withheld), projectedSSWithheld, futureScale);
      projectedMedWithheld = scaleFuture(Number(snap.ytd_medicare_withheld), projectedMedWithheld, futureScale);
      capped = true;
      hasWarnings = true;
    }
    if (insufficientData || Number(snap.ytd_hsa ?? 0) > 0) hasWarnings = true;

    jobProjections.push({
      jobId: job.id, jobName: job.name,
      projectedGross, projectedFedWithheld, projectedSSWithheld, projectedMedWithheld,
      fractionElapsed: fraction, capped, insufficientData,
    });

    jobInputs.push({
      id: job.id, name: job.name, incomeSource: 'paystub',
      annualSalary: projectedGross,
      federalWithholdingYTD: projectedFedWithheld,
      projectedFederalWithholding: projectedFedWithheld,
      socialSecurityWithholdingYTD: projectedSSWithheld,
      medicareWithholdingYTD: projectedMedWithheld,
      traditional401k: snap.ytd_traditional_401k == null ? undefined : scaleFuture(Number(snap.ytd_traditional_401k), extrapolate(Number(snap.ytd_traditional_401k)), futureScale),
      roth401k: snap.ytd_roth_401k == null ? undefined : scaleFuture(Number(snap.ytd_roth_401k), extrapolate(Number(snap.ytd_roth_401k)), futureScale),
      hsaContributions: snap.ytd_hsa == null ? undefined : scaleFuture(Number(snap.ytd_hsa), extrapolate(Number(snap.ytd_hsa)), futureScale),
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
    childTaxCreditEligible,
    otherDependentsEligible: 0,
  };

  const { federal, socialSecurity, medicare, w4, quarterly } = runAllCalculators(calcInput);

  return { federal, socialSecurity, medicare, w4, quarterly, jobProjections, latestSnapshotDate: latestDate, hasWarnings };
}

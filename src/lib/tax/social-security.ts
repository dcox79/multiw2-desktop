import { getPayrollWages } from './w2-helpers';
import { TAX_YEAR, assertSupportedTaxYear } from './tax-data-2026';
import { SOCIAL_SECURITY } from './tax-data-2026';
import type { CalculationInput, SSOverpaymentResult } from '../types';

// Note: Box 12 Code V (stock option income) is already included in Box 1 (annualSalary)
// and is subject to Social Security tax. No separate handling needed.

/**
 * Calculates Social Security overpayment across multiple employers.
 *
 * Each employer withholds SS tax independently up to the wage base cap ($184,500 in 2026).
 * With multiple jobs, total SS withheld can exceed the per-person maximum ($11,439).
 * The overpayment is reclaimable as a credit on the tax return.
 *
 * @param input - Calculation input with all jobs
 * @returns SS overpayment breakdown with per-job details and monthly timeline
 *
 * Edge cases handled:
 * - Single job under cap: no overpayment
 * - Single job over cap: employer stops at cap, no overpayment
 * - Multiple jobs all under cap individually but combined over: overpayment occurs
 * - Partial-year employment: pro-rated salary and adjusted timeline
 */
export function calculateSSOverpayment(input: CalculationInput): SSOverpaymentResult {
  assertSupportedTaxYear(input.taxYear ?? TAX_YEAR);
  const { wageBase, employeeRate, maxPerPerson } = SOCIAL_SECURITY;
  const { jobs } = input;

  const combinedWages = jobs.reduce((sum, job) => sum + getPayrollWages(job, 'socialSecurity'), 0);

  // Per-job SS calculations
  const perJobSS = jobs.map((job) => {
    // Each employer withholds on wages up to the SS wage base
    const wages = getPayrollWages(job, 'socialSecurity');
    const taxableWages = Math.min(wages, wageBase);
    const ssWithheld = job.incomeSource === 'w2' ? job.socialSecurityWithholdingYTD : taxableWages * employeeRate;

    // Calculate month when this employer's cumulative wages hit the cap
    const monthsWorked = 13 - job.startMonth; // months from startMonth through December
    const monthlyPay = monthsWorked > 0 ? getPayrollWages(job, 'socialSecurity') / monthsWorked : 0;
    let monthCapReached: number | null = null;

    if (wages >= wageBase && monthlyPay > 0) {
      let cumulative = 0;
      for (let m = job.startMonth; m <= 12; m++) {
        cumulative += monthlyPay;
        if (cumulative >= wageBase) {
          monthCapReached = m;
          break;
        }
      }
    }

    return {
      jobId: job.id,
      jobName: job.name,
      salary: wages,
      ssWithheld,
      monthCapReached,
    };
  });

  const totalSSWithheld = perJobSS.reduce((sum, job) => sum + job.ssWithheld, 0);
  // Excess withheld by a single employer must be recovered from that employer.
  const refundableWithheld = perJobSS.reduce((sum, job) => sum + Math.min(job.ssWithheld, maxPerPerson), 0);
  const overpayment = Math.max(0, refundableWithheld - maxPerPerson);

  // Monthly timeline across all employers
  const monthlyTimeline = buildMonthlyTimeline(jobs);

  return {
    wageBase,
    ssRate: employeeRate,
    combinedWages,
    maxSSPerPerson: maxPerPerson,
    perJobSS,
    totalSSWithheld,
    overpayment,
    creditAtFiling: overpayment,
    monthlyTimeline,
  };
}

/**
 * Builds a month-by-month timeline (1-12) showing cumulative wages,
 * cumulative SS withheld, and overpayment to date across all employers.
 */
function buildMonthlyTimeline(
  jobs: CalculationInput['jobs']
): SSOverpaymentResult['monthlyTimeline'] {
  const { wageBase, employeeRate, maxPerPerson } = SOCIAL_SECURITY;
  const timeline: SSOverpaymentResult['monthlyTimeline'] = [];

  // Track cumulative wages per job (each employer withholds independently)
  const jobCumulativeWages = jobs.map(() => 0);

  for (let month = 1; month <= 12; month++) {
    let totalCumulativeWages = 0;
    let totalCumulativeSS = 0;

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      if (month >= job.startMonth) {
        const monthsWorked = 13 - job.startMonth;
        const monthlyPay = monthsWorked > 0 ? getPayrollWages(job, 'socialSecurity') / monthsWorked : 0;
        jobCumulativeWages[i] += monthlyPay;

        // Each employer caps SS withholding at the wage base independently
        const taxableWagesForJob = Math.min(jobCumulativeWages[i], wageBase);
        totalCumulativeSS += job.incomeSource === 'w2'
          ? Math.min(job.socialSecurityWithholdingYTD, maxPerPerson) * (month - job.startMonth + 1) / monthsWorked
          : taxableWagesForJob * employeeRate;
      }
      totalCumulativeWages += jobCumulativeWages[i];
    }

    const overpaymentToDate = Math.max(0, totalCumulativeSS - maxPerPerson);

    timeline.push({
      month,
      cumulativeWages: totalCumulativeWages,
      cumulativeSS: totalCumulativeSS,
      overpaymentToDate,
    });
  }

  return timeline;
}

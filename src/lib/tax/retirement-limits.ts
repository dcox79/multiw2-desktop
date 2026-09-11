import { TAX_YEAR, assertSupportedTaxYear } from './tax-data-2026';
import { RETIREMENT_LIMITS } from './tax-data-2026';
import type { CalculationInput, RetirementLimitResult } from '../types';
import { formatCurrency } from '../utils';
import { getTotal401kDeferrals, getTraditional401k, getRoth401k, getHSAContributions } from './w2-helpers';

/**
 * Tracks 401K and HSA contributions across employers against IRS limits.
 * Flags over-contributions and generates recommendations.
 *
 * @param input - Calculation input with all jobs and their retirement contributions
 * @returns Retirement limit breakdown with warnings and recommendations
 *
 * Edge cases handled:
 * - Under limit: shows remaining room
 * - At limit: no warning
 * - Over limit: flags with specific dollar amounts
 * - Traditional (Code D) + Roth (Code AA) both count toward $24,500 employee limit
 *
 * TODO: Add HSA coverage type (individual vs family) to CalculationInput in V2.
 * Currently defaults to 'individual'.
 */
export function calculateRetirementLimits(input: CalculationInput): RetirementLimitResult {
  assertSupportedTaxYear(input.taxYear ?? TAX_YEAR);
  const { jobs } = input;

  // 401K calculations — both traditional (D) and Roth (AA) count toward the $24,500 employee limit
  const perJob401k = jobs.map((job) => ({
    jobId: job.id,
    jobName: job.name,
    traditional: getTraditional401k(job),
    roth: getRoth401k(job),
    contribution: getTotal401kDeferrals(job),
  }));

  const total401kContributions = perJob401k.reduce((sum, j) => sum + j.contribution, 0);
  const remaining401k = RETIREMENT_LIMITS.employee401k - total401kContributions;
  const isOver401k = total401kContributions > RETIREMENT_LIMITS.employee401k;

  // HSA calculations (default to individual coverage type for V1)
  const hsaCoverageType = 'individual' as const;
  const limitHSA = RETIREMENT_LIMITS.hsaIndividual;

  // HSA — Code W is employer + employee combined, which is what the IRS limit applies to
  const perJobHSA = jobs.map((job) => ({
    jobId: job.id,
    jobName: job.name,
    contribution: getHSAContributions(job),
  }));

  const totalHSAContributions = perJobHSA.reduce((sum, j) => sum + j.contribution, 0);
  const remainingHSA = limitHSA - totalHSAContributions;
  const isOverHSA = totalHSAContributions > limitHSA;

  // Generate warnings
  const warnings: string[] = [];

  if (isOver401k) {
    const overAmount = total401kContributions - RETIREMENT_LIMITS.employee401k;
    warnings.push(
      `Your combined 401K contributions (${formatCurrency(total401kContributions)}) exceed the ${formatCurrency(RETIREMENT_LIMITS.employee401k)} limit by ${formatCurrency(overAmount)}. You must reduce contributions at one employer to avoid penalties.`
    );
  }

  if (isOverHSA) {
    const overAmount = totalHSAContributions - limitHSA;
    warnings.push(
      `Your combined HSA contributions (${formatCurrency(totalHSAContributions)}) exceed the ${formatCurrency(limitHSA)} individual limit by ${formatCurrency(overAmount)}. Excess contributions are subject to a 6% excise tax.`
    );
  }

  // Generate recommendation
  const recommendation = generateRecommendation(jobs, total401kContributions, totalHSAContributions);

  return {
    limit401k: RETIREMENT_LIMITS.employee401k,
    limitHSA: limitHSA,
    hsaCoverageType,
    perJob401k,
    total401kContributions,
    remaining401k,
    isOver401k,
    perJobHSA,
    totalHSAContributions,
    remainingHSA,
    isOverHSA,
    warnings,
    recommendation,
  };
}

function generateRecommendation(
  jobs: CalculationInput['jobs'],
  total401k: number,
  totalHSA: number
): string {
  if (jobs.length === 0) return 'No jobs to analyze.';

  // Sort jobs by salary descending to recommend maxing at highest-paying
  const sorted = [...jobs].sort((a, b) => b.annualSalary - a.annualSalary);
  const primaryJob = sorted[0];

  const parts: string[] = [];

  if (total401k > RETIREMENT_LIMITS.employee401k) {
    parts.push(
      `Max your 401K at ${primaryJob.name} (${formatCurrency(RETIREMENT_LIMITS.employee401k)}) and set other employers to $0. If multiple employers offer matching, contribute enough at each to capture the full match before maxing.`
    );
  } else if (total401k < RETIREMENT_LIMITS.employee401k) {
    const remaining = RETIREMENT_LIMITS.employee401k - total401k;
    parts.push(
      `You have ${formatCurrency(remaining)} of 401K room remaining. Consider increasing contributions at ${primaryJob.name}.`
    );
  } else {
    parts.push('Your 401K contributions are exactly at the limit.');
  }

  const hsaLimit = RETIREMENT_LIMITS.hsaIndividual;
  if (totalHSA > hsaLimit) {
    parts.push(
      `Reduce HSA contributions to stay within the ${formatCurrency(hsaLimit)} individual limit.`
    );
  } else if (totalHSA < hsaLimit) {
    const remaining = hsaLimit - totalHSA;
    parts.push(`You have ${formatCurrency(remaining)} of HSA room remaining.`);
  }

  return parts.join(' ');
}

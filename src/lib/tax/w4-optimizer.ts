import { PAY_FREQUENCIES } from './tax-data-2026';
import type { CalculationInput, FederalTaxResult, W4Adjustment, W4Result } from '../types';
import { formatCurrency } from '../utils';

/**
 * Calculates optimal W-4 Line 4(c) extra withholding for each job to correct
 * under-withholding caused by multiple employers.
 *
 * Strategy: Recommends putting all extra withholding on the highest-paying job
 * (simplest for the user — one W-4 change instead of many).
 *
 * @param input - Calculation input with all jobs
 * @param federalResult - Pre-computed federal tax result (single source of truth)
 * @returns W-4 adjustments per job with human-readable explanations
 *
 * Edge cases handled:
 * - Zero withholding gap: returns $0 adjustments
 * - Negative gap (over-withheld): recommends reducing withholding
 * - All pay frequencies: weekly (52), biweekly (26), semimonthly (24), monthly (12)
 */
export function calculateW4Adjustments(
  input: CalculationInput,
  federalResult: FederalTaxResult
): W4Result {
  const { jobs } = input;
  const { withholdingGap, totalWithheld } = federalResult;

  // Find the highest-paying job (extra withholding goes here)
  const highestPayJobIndex = jobs.reduce(
    (maxIdx, job, idx) => (job.annualSalary > jobs[maxIdx].annualSalary ? idx : maxIdx),
    0
  );

  const adjustments: W4Adjustment[] = jobs.map((job, idx) => {
    const paychecksPerYear = PAY_FREQUENCIES[job.payFrequency];
    const currentWithholdingPerPaycheck = paychecksPerYear > 0
      ? job.federalWithholdingYTD / paychecksPerYear
      : 0;

    let recommendedExtraWithholding = 0;
    let annualImpact = 0;
    let explanation: string;

    if (idx === highestPayJobIndex && withholdingGap > 100) {
      // Put all extra withholding on the highest-paying job
      recommendedExtraWithholding = Math.ceil((withholdingGap / paychecksPerYear) * 100) / 100;
      annualImpact = recommendedExtraWithholding * paychecksPerYear;
      explanation = `Add ${formatCurrency(recommendedExtraWithholding)}/${getFrequencyLabel(job.payFrequency)} in extra withholding on Line 4(c) of your W-4 at ${job.name} to cover the ${formatCurrency(withholdingGap)} gap from combined income.`;
    } else if (idx === highestPayJobIndex && withholdingGap < -100) {
      // Recommend reducing withholding at the highest-paying job
      const reductionPerPaycheck = Math.floor((Math.abs(withholdingGap) / paychecksPerYear) * 100) / 100;
      annualImpact = -(reductionPerPaycheck * paychecksPerYear);
      explanation = `You're over-withheld by ${formatCurrency(Math.abs(withholdingGap))}. Consider reducing withholding at ${job.name} by ${formatCurrency(reductionPerPaycheck)}/${getFrequencyLabel(job.payFrequency)} to keep more in each paycheck.`;
    } else if (withholdingGap < -100) {
      explanation = `No adjustment needed at ${job.name}. Withholding reduction is recommended at your highest-paying job.`;
    } else if (withholdingGap >= -100 && withholdingGap <= 100) {
      explanation = 'Your withholding is on track.';
    } else {
      // withholdingGap > 100 but this isn't the highest-paying job
      explanation = `No adjustment needed at ${job.name}. Extra withholding is recommended at your highest-paying job.`;
    }

    return {
      jobId: job.id,
      jobName: job.name,
      currentWithholdingPerPaycheck,
      recommendedExtraWithholding,
      revisedWithholdingPerPaycheck: currentWithholdingPerPaycheck + recommendedExtraWithholding,
      annualImpact,
      explanation,
    };
  });

  const totalCurrentAnnualWithholding = totalWithheld;
  const totalRevisedAnnualWithholding = totalWithheld + adjustments.reduce((sum, a) => sum + a.annualImpact, 0);
  const remainingGapAfterAdjustment = federalResult.totalFederalTax - totalRevisedAnnualWithholding - federalResult.estimatedPaymentsYTD;

  return {
    adjustments,
    totalCurrentAnnualWithholding,
    totalRevisedAnnualWithholding,
    remainingGapAfterAdjustment,
  };
}

function getFrequencyLabel(frequency: string): string {
  switch (frequency) {
    case 'weekly': return 'week';
    case 'biweekly': return 'paycheck';
    case 'semimonthly': return 'paycheck';
    case 'monthly': return 'month';
    default: return 'period';
  }
}

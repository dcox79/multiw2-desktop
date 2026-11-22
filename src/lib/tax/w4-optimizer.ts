import type { CalculationInput, FederalTaxResult, W4Result } from '../types';
import { formatCurrency } from '../utils';

/** Income-tax planning only. Do not turn W-2 or YTD amounts into a midyear W-4. */
export function calculateW4Adjustments(input: CalculationInput, federal: FederalTaxResult): W4Result {
  const paystubJobs = input.jobs.filter(job => job.incomeSource === 'paystub');
  const forecastsComplete = input.jobs.every(job =>
    job.incomeSource === 'w2' || (
      Number.isFinite(job.projectedFederalWithholding) && job.projectedFederalWithholding! >= job.federalWithholdingYTD
    ),
  );
  const eligible = paystubJobs
    .filter(job => Number.isInteger(job.remainingPaychecks) && job.remainingPaychecks! > 0)
    .sort((a, b) => b.annualSalary - a.annualSalary)[0];
  const annualWithholding = input.jobs.reduce((sum, job) =>
    sum + (job.incomeSource === 'w2' ? job.federalWithholdingYTD : job.projectedFederalWithholding ?? job.federalWithholdingYTD), 0);
  const gap = federal.totalFederalTax - annualWithholding - federal.estimatedPaymentsYTD;
  const canRecommend = forecastsComplete && eligible !== undefined;
  const increment = canRecommend && gap > 0 ? Math.ceil(gap / eligible.remainingPaychecks! * 100) / 100 : 0;
  const impact = canRecommend ? increment * eligible.remainingPaychecks! : 0;
  const adjustments = canRecommend ? [{
    jobId: eligible.id,
    jobName: eligible.name,
    currentWithholdingPerPaycheck: (eligible.projectedFederalWithholding! - eligible.federalWithholdingYTD) / eligible.remainingPaychecks!,
    recommendedExtraWithholding: increment,
    revisedWithholdingPerPaycheck: (eligible.projectedFederalWithholding! - eligible.federalWithholdingYTD) / eligible.remainingPaychecks! + increment,
    annualImpact: impact,
    explanation: increment > 0
      ? 'Increase your existing Line 4(c) by ' + formatCurrency(increment) + ' per remaining paycheck (new Line 4(c): ' + formatCurrency((eligible.extraWithholdingPerPaycheck ?? 0) + increment) + '). Applies to this modeled regular income-tax gap only.'
      : 'The modeled regular income-tax estimate shows no additional withholding gap; it does not recommend reducing withholding.',
  }] : [];
  return {
    adjustments,
    totalCurrentAnnualWithholding: annualWithholding,
    totalRevisedAnnualWithholding: annualWithholding + impact,
    remainingGapAfterAdjustment: gap - impact,
    recommendationStatus: canRecommend ? 'projected' : 'insufficient_data',
  };
}

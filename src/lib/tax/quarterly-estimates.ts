import { QUARTERLY_DUE_DATES, TAX_YEAR, assertSupportedTaxYear } from './tax-data-2026';
import type { CalculationInput, FederalTaxResult, QuarterlyEstimateResult } from '../types';

/** Current-year income-tax planning target (2026 Form 1040-ES, lines 12a/14).
 * Prior-return liability and payment dates are unavailable, so this cannot
 * determine a prior-year safe harbor or certify that no penalty is due.
 */
export function calculateQuarterlyEstimates(
  input: CalculationInput,
  federalResult: FederalTaxResult,
  currentDate: Date = new Date(),
): QuarterlyEstimateResult {
  assertSupportedTaxYear(input.taxYear ?? TAX_YEAR);
  const totalAnnualTax = federalResult.totalFederalTax;
  const totalWithholdingProjected = federalResult.totalWithheld;
  const safeHarborAmount = totalAnnualTax * 0.9;
  const gap = totalAnnualTax - totalWithholdingProjected;
  const requiredAnnualEstimate = gap < 1000 ? 0 : Math.max(0, safeHarborAmount - totalWithholdingProjected);
  const remaining = Math.max(0, requiredAnnualEstimate - input.estimatedPaymentsYTD);
  const quarterlyPayments = QUARTERLY_DUE_DATES.map(q => ({
    quarter: q.quarter,
    dueDate: q.dueDate,
    amount: 0,
    // Payment remains timely throughout the due date in the user's local time.
    isPast: currentDate > new Date(`${q.isoDate}T23:59:59.999`),
    paidAmount: 0,
  }));
  const future = quarterlyPayments.filter(q => !q.isPast);
  for (const q of future) q.amount = Math.ceil(remaining / future.length * 100) / 100;
  const penaltyRisk = remaining > 0;
  const penaltyExplanation = (gap < 1000
    ? 'The estimated income-tax balance after withholding is below the $1,000 payment threshold. '
    : penaltyRisk
      ? 'Payments fall below 90% of estimated current-year income tax; underpayment penalties may apply. '
      : 'Payments cover 90% of estimated current-year income tax. ')
    + 'Prior-year safe harbor is unknown without the actual prior return. Payment timing, refundable credits, additional taxes and exceptions are not assessed; later payments do not erase earlier underpayments.';
  return { totalAnnualTax, totalWithholdingProjected, safeHarborAmount, requiredAnnualEstimate, quarterlyPayments, penaltyRisk, penaltyExplanation };
}

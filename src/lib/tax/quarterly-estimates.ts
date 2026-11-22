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
  const quarterlyPayments = QUARTERLY_DUE_DATES.map(q => ({
    quarter: q.quarter,
    dueDate: q.dueDate,
    amount: 0,
    // Payment remains timely throughout the due date in the user's local time.
    isPast: currentDate > new Date(`${q.isoDate}T23:59:59.999`),
    paidAmount: 0,
  }));
  const penaltyRisk = null;
  const penaltyExplanation = 'This annual planning benchmark is not a safe-harbor or installment determination. Use your actual prior return, payment dates, and Form 2210 rules. A later payment does not by itself erase a prior underpayment.';
  return { totalAnnualTax, totalWithholdingProjected, safeHarborAmount, requiredAnnualEstimate, quarterlyPayments, penaltyRisk, penaltyExplanation };
}

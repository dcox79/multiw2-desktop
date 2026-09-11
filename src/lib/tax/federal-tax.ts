import { TAX_YEAR, assertSupportedTaxYear } from './tax-data-2026';
import {
  FEDERAL_BRACKETS,
  STANDARD_DEDUCTION,
  CHILD_TAX_CREDIT,
  OTHER_DEPENDENTS_CREDIT,
} from './tax-data-2026';
import type { CalculationInput, FederalTaxResult, TaxBracketBreakdown } from '../types';
import { getAboveTheLineDeductions } from './w2-helpers';

/**
 * Calculates complete federal income tax liability for combined W2 income.
 *
 * Steps:
 * 1. Sum all job salaries → total income
 * 2. Subtract above-the-line deductions → AGI (depends on income source per job)
 * 3. Subtract standard or itemized deduction → taxable income
 * 4. Apply progressive tax brackets for filing status
 * 5. Apply child tax credit with phase-out
 * 6. Compare to total withholding → withholding gap
 *
 * @param input - Combined calculation input with all jobs
 * @returns Complete federal tax breakdown including bracket details and withholding gap
 *
 * Edge cases handled:
 * - Zero income returns zero tax
 * - Single job (no multi-job penalty)
 * - Income at exact bracket boundaries
 * - Negative taxable income (deductions exceed income) returns zero tax
 * - W2 vs pay stub income sources handled per-job (no double-counting)
 * - Roth 401k never subtracted from AGI (after-tax regardless of source)
 */
export function calculateFederalTax(input: CalculationInput): FederalTaxResult {
  assertSupportedTaxYear(input.taxYear ?? TAX_YEAR);
  const { jobs, filingStatus, standardDeduction, itemizedDeductions, estimatedPaymentsYTD, childTaxCreditEligible, otherDependentsEligible } = input;

  // 1. Total income
  const totalIncome = jobs.reduce((sum, job) => sum + job.annualSalary, 0);

  // 2. Above-the-line deductions depend on income source per job:
  // - W2 Box 1: already excludes pre-tax 401k and HSA → deductions = 0
  // - Pay stub gross: pre-tax items NOT yet subtracted → deductions = traditional 401k + HSA
  // Roth 401k is NEVER subtracted (after-tax regardless of source)
  const totalAboveTheLine = jobs.reduce((sum, job) => sum + getAboveTheLineDeductions(job), 0);
  const adjustedGrossIncome = Math.max(0, totalIncome - totalAboveTheLine - (input.selfEmploymentDeduction ?? 0));

  // 3. Standard or itemized deduction
  const deductionAmount = standardDeduction
    ? STANDARD_DEDUCTION[filingStatus]
    : (itemizedDeductions ?? 0);
  const taxableIncome = Math.max(0, adjustedGrossIncome - deductionAmount);

  // 4. Apply progressive tax brackets
  const brackets = FEDERAL_BRACKETS[filingStatus];
  const { totalTax, bracketBreakdown, marginalRate } = applyBrackets(taxableIncome, brackets);

  // 5. Dependent credits (CTC + ODC) with phase-out
  const { childTaxCredit, otherDependentsCredit } = calculateDependentCredits(
    childTaxCreditEligible, otherDependentsEligible ?? 0, adjustedGrossIncome, filingStatus
  );

  // Final federal tax (cannot be negative)
  const totalFederalTax = Math.max(0, totalTax - childTaxCredit - otherDependentsCredit);

  // 6. Withholding gap
  const totalWithheld = jobs.reduce((sum, job) => sum + job.federalWithholdingYTD, 0);
  const withholdingGap = totalFederalTax - totalWithheld;
  const remainingBalance = totalFederalTax - totalWithheld - estimatedPaymentsYTD;

  const effectiveRate = totalIncome > 0 ? totalFederalTax / totalIncome : 0;

  return {
    totalIncome,
    adjustedGrossIncome,
    taxableIncome,
    totalFederalTax,
    effectiveRate,
    marginalRate,
    bracketBreakdown,
    totalWithheld,
    withholdingGap,
    childTaxCredit,
    otherDependentsCredit,
    estimatedPaymentsYTD,
    remainingBalance,
  };
}

/**
 * Applies progressive tax brackets to taxable income.
 * Returns total tax, per-bracket breakdown, and the marginal rate.
 */
function applyBrackets(
  taxableIncome: number,
  brackets: Array<{ min: number; max: number; rate: number }>
): { totalTax: number; bracketBreakdown: TaxBracketBreakdown[]; marginalRate: number } {
  let totalTax = 0;
  let marginalRate = 0;
  const bracketBreakdown: TaxBracketBreakdown[] = [];

  for (const bracket of brackets) {
    if (taxableIncome <= bracket.min) break;

    const taxableInBracket = Math.min(taxableIncome, bracket.max) - bracket.min;
    const taxInBracket = taxableInBracket * bracket.rate;

    bracketBreakdown.push({
      rate: bracket.rate,
      rangeStart: bracket.min,
      rangeEnd: bracket.max,
      taxableInBracket,
      taxInBracket,
    });

    totalTax += taxInBracket;
    marginalRate = bracket.rate;
  }

  return { totalTax, bracketBreakdown, marginalRate };
}

/**
 * Calculates dependent credits (CTC + ODC) with income-based phase-out.
 *
 * Child Tax Credit: $2,200 per qualifying child (under 17).
 * Other Dependents Credit: $500 per non-CTC dependent.
 *
 * Phase-out applies to the TOTAL of both credits:
 * - Reduced by $50 for every $1,000 (or fraction thereof) of AGI exceeding threshold
 * - CTC is reduced first, then ODC
 *
 * Thresholds (2026):
 *   - Single / HoH / MFS: $200,000
 *   - MFJ: $400,000
 */
function calculateDependentCredits(
  ctcEligible: number,
  odcEligible: number,
  agi: number,
  filingStatus: string
): { childTaxCredit: number; otherDependentsCredit: number } {
  const ctcFull = ctcEligible * CHILD_TAX_CREDIT.perChild;
  const odcFull = odcEligible * OTHER_DEPENDENTS_CREDIT;
  const totalFull = ctcFull + odcFull;

  if (totalFull <= 0) return { childTaxCredit: 0, otherDependentsCredit: 0 };

  // Phase-out applies to total credits
  const threshold = CHILD_TAX_CREDIT.phaseoutStart[filingStatus] ?? CHILD_TAX_CREDIT.phaseoutStart.single;
  if (agi <= threshold) return { childTaxCredit: ctcFull, otherDependentsCredit: odcFull };

  // IRS rounds excess UP to next $1,000 increment
  const excessOver = Math.ceil((agi - threshold) / 1000) * 1000;
  const reduction = excessOver * CHILD_TAX_CREDIT.phaseoutRate;

  // Reduce CTC first, then ODC
  const ctcReduction = Math.min(reduction, ctcFull);
  const childTaxCredit = Math.max(0, ctcFull - ctcReduction);
  const remainingReduction = Math.max(0, reduction - ctcFull);
  const otherDependentsCredit = Math.max(0, odcFull - remainingReduction);

  return { childTaxCredit, otherDependentsCredit };
}

import { getPayrollWages } from './w2-helpers';
import { TAX_YEAR, assertSupportedTaxYear } from './tax-data-2026';
import { MEDICARE } from './tax-data-2026';
import type { CalculationInput, MedicareTaxResult } from '../types';

/**
 * Calculates Medicare tax including the 0.9% Additional Medicare Tax.
 *
 * Regular Medicare: 1.45% on all wages (no cap).
 * Additional Medicare: 0.9% on combined wages above threshold (filing-status dependent).
 *
 * Key multi-W2 insight: each employer only withholds the 0.9% Additional Medicare Tax
 * when THAT employer's wages alone exceed $200K. But the actual liability is based on
 * COMBINED wages across all employers. This creates an underpayment trap for multi-W2
 * filers whose individual jobs are each under $200K but combined exceed the threshold.
 *
 * Thresholds: $200K single, $250K MFJ, $125K MFS, $200K HoH
 */
export function calculateMedicareTax(input: CalculationInput): MedicareTaxResult {
  assertSupportedTaxYear(input.taxYear ?? TAX_YEAR);
  const { jobs, filingStatus } = input;
  const { rate, additionalRate, additionalThreshold } = MEDICARE;

  const threshold = additionalThreshold[filingStatus] ?? additionalThreshold.single;
  const combinedWages = jobs.reduce((sum, job) => sum + getPayrollWages(job, 'medicare'), 0);

  // Regular Medicare: 1.45% on all wages
  const regularMedicareTax = combinedWages * rate;

  // Additional Medicare Tax: 0.9% on combined wages above threshold
  const wagesAboveThreshold = Math.max(0, combinedWages - threshold);
  const additionalMedicareTax = wagesAboveThreshold * additionalRate;

  const totalMedicareLiability = regularMedicareTax + additionalMedicareTax;

  // Per-job breakdown: what each employer actually withholds
  const perJobMedicare = jobs.map((job) => {
    // Each employer withholds regular Medicare (1.45%) on all wages
    const regularWithheld = getPayrollWages(job, 'medicare') * rate;

    // Each employer withholds Additional Medicare (0.9%) only when THAT employer's
    // wages exceed $200K (always $200K regardless of filing status — this is the
    // employer withholding threshold per IRS rules)
    const employerAdditionalThreshold = 200000;
    const additionalWithheld = Math.max(0, getPayrollWages(job, 'medicare') - employerAdditionalThreshold) * additionalRate;

    return {
      jobName: job.name,
      wages: getPayrollWages(job, 'medicare'),
      regularWithheld,
      additionalWithheld,
    };
  });

  // Total Medicare withheld by all employers
  const totalMedicareWithheld = jobs.reduce((sum, job) => sum + job.medicareWithholdingYTD, 0);

  // Gap: positive = owes more, negative = overpaid
  const medicareGap = totalMedicareLiability - totalMedicareWithheld;

  return {
    regularMedicareTax,
    additionalMedicareTax,
    totalMedicareLiability,
    totalMedicareWithheld,
    medicareGap,
    additionalMedicareThreshold: threshold,
    wagesAboveThreshold,
    perJobMedicare,
  };
}

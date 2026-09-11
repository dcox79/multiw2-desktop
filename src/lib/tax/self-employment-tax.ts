import { SOCIAL_SECURITY, MEDICARE } from './tax-data-2026';
import type { FilingStatus } from '../types';

export interface SelfEmploymentTaxResult {
  grossIncome1099: number;
  seTaxBase: number;
  socialSecurityPortion: number;
  medicarePortion: number;
  additionalMedicarePortion: number;
  totalSETax: number;
  seDeduction: number;
}

export function calculateSelfEmploymentTax(
  income1099: number,
  w2WagesForSS: number,
  filingStatus: FilingStatus,
  w2MedicareWages: number = w2WagesForSS,
): SelfEmploymentTaxResult {
  if (income1099 <= 0) {
    return { grossIncome1099: 0, seTaxBase: 0, socialSecurityPortion: 0, medicarePortion: 0, additionalMedicarePortion: 0, totalSETax: 0, seDeduction: 0 };
  }

  const SE_FACTOR = 0.9235;
  const seTaxBase = Math.round(income1099 * SE_FACTOR * 100) / 100;
  if (seTaxBase < 400) {
    return { grossIncome1099: income1099, seTaxBase, socialSecurityPortion: 0, medicarePortion: 0, additionalMedicarePortion: 0, totalSETax: 0, seDeduction: 0 };
  }

  // Social Security: 12.4% (combined) on base up to SS wage base, minus W2 wages already subject
  const ssRoomRemaining = Math.max(0, SOCIAL_SECURITY.wageBase - w2WagesForSS);
  const ssSubject = Math.min(seTaxBase, ssRoomRemaining);
  const socialSecurityPortion = Math.round(ssSubject * 0.124 * 100) / 100;

  // Medicare: 2.9% on all SE income (no cap)
  const medicarePortion = Math.round(seTaxBase * 0.029 * 100) / 100;

  // Additional Medicare: 0.9% above threshold (combined W2 + SE)
  const threshold = MEDICARE.additionalThreshold[filingStatus] ?? 200000;
  const combinedIncome = w2MedicareWages + seTaxBase;
  const additionalMedicareSubject = Math.max(0, combinedIncome - threshold) - Math.max(0, w2MedicareWages - threshold);
  const additionalMedicarePortion = Math.round(Math.max(0, additionalMedicareSubject) * 0.009 * 100) / 100;

  const totalSETax = socialSecurityPortion + medicarePortion + additionalMedicarePortion;
  // Schedule SE line 13 excludes Additional Medicare Tax (Form 8959).
  const seDeduction = Math.round((socialSecurityPortion + medicarePortion) * 0.5 * 100) / 100;

  return {
    grossIncome1099: income1099,
    seTaxBase,
    socialSecurityPortion,
    medicarePortion,
    additionalMedicarePortion,
    totalSETax,
    seDeduction,
  };
}

import { calculateFederalTax } from './federal-tax';
import { calculateSSOverpayment } from './social-security';
import { calculateMedicareTax } from './medicare-tax';
import { calculateW4Adjustments } from './w4-optimizer';
import { calculateRetirementLimits } from './retirement-limits';
import { calculateQuarterlyEstimates } from './quarterly-estimates';
import type { CalculationInput, CalculationResult } from '../types';

/**
 * Run all 6 tax calculators and return a complete CalculationResult.
 * Shared across calculate route, projections, and scenario engine.
 */
export const CURRENT_TAX_MODEL_VERSION = 2;

export function runAllCalculators(input: CalculationInput): CalculationResult {
  const federal = calculateFederalTax(input);
  const socialSecurity = calculateSSOverpayment(input);
  const medicare = calculateMedicareTax(input);
  const w4 = calculateW4Adjustments(input, federal);
  const retirement = calculateRetirementLimits(input);
  const quarterly = calculateQuarterlyEstimates(input, federal);

  return {
    modelVersion: CURRENT_TAX_MODEL_VERSION,
    timestamp: new Date().toISOString(),
    input,
    federal,
    socialSecurity,
    medicare,
    w4,
    retirement,
    quarterly,
    isApproximate: true,
  };
}

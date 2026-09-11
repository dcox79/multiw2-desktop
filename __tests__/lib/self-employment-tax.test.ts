import { describe, it, expect } from 'vitest';
import { calculateSelfEmploymentTax } from '@/lib/tax/self-employment-tax';

describe('calculateSelfEmploymentTax', () => {
  it('calculates SE tax on $30K 1099 income (single, no W2)', () => {
    const result = calculateSelfEmploymentTax(30000, 0, 'single');
    expect(result.seTaxBase).toBeCloseTo(27705, 0);
    expect(result.totalSETax).toBeGreaterThan(4200);
    expect(result.totalSETax).toBeLessThan(4300);
    expect(result.seDeduction).toBeCloseTo(result.totalSETax / 2, 0);
  });

  it('reduces SS portion when W2 wages approach wage base', () => {
    // SS wage base is $184,500 in 2026. With $180K W2 wages, only $4,500 room remains.
    // SE base = 30000 * 0.9235 = 27705, but only $4,500 subject to SS = $558
    const result = calculateSelfEmploymentTax(30000, 180000, 'single');
    expect(result.socialSecurityPortion).toBeLessThan(600);
    expect(result.medicarePortion).toBeGreaterThan(800); // Medicare unchanged — no cap
  });

  it('returns zero for zero income', () => {
    const result = calculateSelfEmploymentTax(0, 0, 'single');
    expect(result.totalSETax).toBe(0);
  });

  it('applies Additional Medicare Tax for high earners', () => {
    const result = calculateSelfEmploymentTax(100000, 150000, 'single');
    expect(result.additionalMedicarePortion).toBeGreaterThan(0);
  });

  it('uses MFJ threshold for married filing jointly', () => {
    const single = calculateSelfEmploymentTax(100000, 150000, 'single');
    const mfj = calculateSelfEmploymentTax(100000, 150000, 'married_filing_jointly');
    // MFJ threshold is $250K vs $200K single — less additional Medicare for MFJ
    expect(mfj.additionalMedicarePortion).toBeLessThan(single.additionalMedicarePortion);
  });
});

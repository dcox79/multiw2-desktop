/**
 * 2026 federal planning tables, reviewed 2026-09-11 against official sources.
 * Brackets/deduction/CTC: IRS Rev. Proc. 2025-32, sections 4.01, 4.05, 4.14:
 * https://www.irs.gov/irb/2025-45_IRB#REV-PROC-2025-32
 * Retirement: IRS Notice 2025-67: https://www.irs.gov/irb/2025-49_IRB
 * HSA: https://www.irs.gov/pub/irs-drop/rp-25-19.pdf
 * SS: https://www.ssa.gov/oact/cola/cbb.html
 * Medicare: https://www.irs.gov/taxtopics/tc560 and Publication 15 (2026).
 * Credits/phaseout: https://www.irs.gov/instructions/i1040s8
 * Payment dates/safe harbor: https://www.irs.gov/pub/irs-pdf/f1040es.pdf (2026).
 * These are the implemented ordinary-income tables, not a complete tax return.
 */

export const TAX_YEAR = 2026;

export function assertSupportedTaxYear(year: number): asserts year is typeof TAX_YEAR {
  if (year !== TAX_YEAR) throw new RangeError(`Tax year ${year} is not supported. Reviewed tables are available for ${TAX_YEAR} only.`);
}
export const FEDERAL_BRACKETS: Record<string, Array<{ min: number; max: number; rate: number }>> = {
  single: [
    { min: 0,       max: 12400,   rate: 0.10 },
    { min: 12400,   max: 50400,   rate: 0.12 },
    { min: 50400,   max: 105700,  rate: 0.22 },
    { min: 105700,  max: 201775,  rate: 0.24 },
    { min: 201775,  max: 256225,  rate: 0.32 },
    { min: 256225,  max: 640600,  rate: 0.35 },
    { min: 640600,  max: Infinity, rate: 0.37 },
  ],
  married_filing_jointly: [
    { min: 0,       max: 24800,   rate: 0.10 },
    { min: 24800,   max: 100800,   rate: 0.12 },
    { min: 100800,   max: 211400,  rate: 0.22 },
    { min: 211400,  max: 403550,  rate: 0.24 },
    { min: 403550,  max: 512450,  rate: 0.32 },
    { min: 512450,  max: 768700,  rate: 0.35 },
    { min: 768700,  max: Infinity, rate: 0.37 },
  ],
  married_filing_separately: [
    { min: 0,       max: 12400,   rate: 0.10 },
    { min: 12400,   max: 50400,   rate: 0.12 },
    { min: 50400,   max: 105700,  rate: 0.22 },
    { min: 105700,  max: 201775,  rate: 0.24 },
    { min: 201775,  max: 256225,  rate: 0.32 },
    { min: 256225,  max: 384350,  rate: 0.35 },
    { min: 384350,  max: Infinity, rate: 0.37 },
  ],
  head_of_household: [
    { min: 0,       max: 17700,   rate: 0.10 },
    { min: 17700,   max: 67450,   rate: 0.12 },
    { min: 67450,   max: 105700,  rate: 0.22 },
    { min: 105700,  max: 201750,  rate: 0.24 },
    { min: 201750,  max: 256200,  rate: 0.32 },
    { min: 256200,  max: 640600,  rate: 0.35 },
    { min: 640600,  max: Infinity, rate: 0.37 },
  ],
};
export const STANDARD_DEDUCTION: Record<string, number> = {
  single: 16100,
  married_filing_jointly: 32200,
  married_filing_separately: 16100,
  head_of_household: 24150,
};

export const SOCIAL_SECURITY = {
  wageBase: 184500,
  employeeRate: 0.062,
  maxPerPerson: 184500 * 0.062,            // $11,439, derived from wageBase
};

export const MEDICARE = {
  rate: 0.0145,                            // STATUTORY — not inflation-adjusted
  additionalRate: 0.009,                   // IRC section 3101(b)(2), not inflation-adjusted
  additionalThreshold: {                   // Not inflation-adjusted
    single: 200000,
    married_filing_jointly: 250000,
    married_filing_separately: 125000,
    head_of_household: 200000,
  } as Record<string, number>,
};
export const RETIREMENT_LIMITS = {
  employee401k: 24500,
  total401k: 72000,
  hsaIndividual: 4400,
  hsaFamily: 8750,
  catchUp401k: 8000,
};

export const CHILD_TAX_CREDIT = {
  perChild: 2200,
  phaseoutStart: {
    single: 200000,
    married_filing_jointly: 400000,
    married_filing_separately: 200000,
    head_of_household: 200000,
  } as Record<string, number>,
  phaseoutRate: 0.05,                   // $50 reduction per $1,000 over threshold
};

export const OTHER_DEPENDENTS_CREDIT = 500; // $500 per non-CTC dependent

export const QUARTERLY_DUE_DATES: Array<{ quarter: 1 | 2 | 3 | 4; dueDate: string; isoDate: string }> = [
  { quarter: 1, dueDate: 'April 15, 2026',    isoDate: '2026-04-15' },
  { quarter: 2, dueDate: 'June 15, 2026',     isoDate: '2026-06-15' },
  { quarter: 3, dueDate: 'September 15, 2026', isoDate: '2026-09-15' },
  { quarter: 4, dueDate: 'January 15, 2027',  isoDate: '2027-01-15' },
];

export const SAFE_HARBOR_THRESHOLD = 150000; // Prior-year AGI; $75,000 for current-year MFS.

export const PAY_FREQUENCIES: Record<string, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
};

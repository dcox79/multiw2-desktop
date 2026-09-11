import { z } from 'zod';

// ============================================
// JOB SCHEMAS
// ============================================

const jobFieldsSchema = z.object({
  name: z.string().min(1, 'Enter an employer name').max(100),
  annual_salary: z.number().positive('Enter an annual salary').max(10_000_000, 'Salary exceeds maximum ($10M)'),
  income_source: z.enum(['w2', 'paystub']),
  pay_frequency: z.enum(['weekly', 'biweekly', 'semimonthly', 'monthly']),
  start_month: z.number().int().min(1).max(12).optional(),
  started_this_year: z.boolean().default(false),
  is_draft: z.boolean().default(false),
  extra_withholding_per_paycheck: z.number().min(0).max(50000).default(0),
});

export const createJobSchema = jobFieldsSchema.refine(
  (data) => !data.started_this_year || data.start_month !== undefined,
  { message: 'Start month is required when job started this year', path: ['start_month'] }
);

export const updateJobSchema = jobFieldsSchema.partial().extend({
  employment_status: z.enum(['active', 'former', 'deleted']).optional(),
});

// ============================================
// YTD SNAPSHOT SCHEMAS
// ============================================

export const createSnapshotSchema = z.object({
  job_id: z.string().uuid('Invalid job ID'),
  paycheck_date: z.string().refine((d) => !isNaN(Date.parse(d)), 'Invalid date'),
  ytd_gross: z.number().min(0, 'Must be >= 0'),
  ytd_federal_withheld: z.number().min(0, 'Must be >= 0'),
  ytd_ss_withheld: z.number().min(0, 'Must be >= 0'),
  ytd_medicare_withheld: z.number().min(0, 'Must be >= 0'),
  ytd_traditional_401k: z.number().min(0).optional(),
  ytd_roth_401k: z.number().min(0).optional(),
  ytd_hsa: z.number().min(0).optional(),
  notes: z.string().max(500).optional(),
});

export const updateSnapshotSchema = z.object({
  paycheck_date: z.string().refine((d) => !isNaN(Date.parse(d)), 'Invalid date'),
  ytd_gross: z.number().min(0, 'Must be >= 0'),
  ytd_federal_withheld: z.number().min(0, 'Must be >= 0'),
  ytd_ss_withheld: z.number().min(0, 'Must be >= 0'),
  ytd_medicare_withheld: z.number().min(0, 'Must be >= 0'),
  ytd_traditional_401k: z.number().min(0).optional(),
  ytd_roth_401k: z.number().min(0).optional(),
  ytd_hsa: z.number().min(0).optional(),
  notes: z.string().max(500).optional(),
});

// ============================================
// W2 ENTRY SCHEMAS
// ============================================

export const createW2EntrySchema = z.object({
  job_id: z.string().uuid('Invalid job ID'),
  tax_year: z.number().int().min(2020).max(2030),
  box1_wages: z.number().min(0, 'Must be >= 0'),
  box2_federal_withheld: z.number().min(0, 'Must be >= 0'),
  box4_ss_withheld: z.number().min(0, 'Must be >= 0'),
  box6_medicare_withheld: z.number().min(0, 'Must be >= 0'),
  box12_code_d: z.number().min(0).optional(),
  box12_code_aa: z.number().min(0).optional(),
  box12_code_w: z.number().min(0).optional(),
  box12_code_c: z.number().min(0).optional(),
  box12_code_dd: z.number().min(0).optional(),
  box12_code_v: z.number().min(0).optional(),
  correction_note: z.string().max(500).optional(),
});

// ============================================
// CALCULATE REQUEST SCHEMA
// ============================================

export const calculateRequestSchema = z.object({
  jobIds: z.array(z.string().uuid()).min(1, 'At least one job is required'),
  filingStatus: z.enum(['single', 'married_filing_jointly', 'married_filing_separately', 'head_of_household']).optional(),
  dependents: z.number().int().min(0).optional(),
  childTaxCreditEligible: z.number().int().min(0).optional(),
  otherDependentsEligible: z.number().int().min(0).optional(),
  useStandardDeduction: z.boolean().optional(),
  itemizedDeductions: z.number().min(0).optional(),
  estimatedPaymentsYTD: z.number().min(0).optional(),
  taxYear: z.number().int().min(2020).max(2030).optional(),
});

// ============================================
// SAVED CALCULATION SCHEMAS
// ============================================

export const saveCalculationSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  input: z.any(),
  result: z.any().nullable(),
  isDraft: z.boolean().default(false),
  source: z.enum(['calculator', 'scenario', 'import']).default('calculator'),
});

export const updateSavedCalculationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  result: z.any().nullable().optional(),
  isDraft: z.boolean().optional(),
});

// ============================================
// VALIDATE HELPER
// ============================================

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; errors: Record<string, string> } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join('.');
    if (!errors[path]) {
      errors[path] = issue.message;
    }
  }
  return { success: false, errors };
}

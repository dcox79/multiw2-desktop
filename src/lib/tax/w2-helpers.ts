import type { JobInput } from '../types';

/** Traditional pre-tax 401(k) deferrals. Reduces AGI. W2: Box 12 Code D. */
export function getTraditional401k(job: JobInput): number {
  return job.traditional401k ?? 0;
}

/** Roth 401(k) contributions. Does NOT reduce AGI. W2: Box 12 Code AA. */
export function getRoth401k(job: JobInput): number {
  return job.roth401k ?? 0;
}

/** Total 401(k) employee deferrals (traditional + Roth). Both count toward $24,500 limit. */
export function getTotal401kDeferrals(job: JobInput): number {
  return getTraditional401k(job) + getRoth401k(job);
}

/** HSA contributions (employer + employee combined), for contribution tracking. W2: Box 12 Code W. */
export function getHSAContributions(job: JobInput): number {
  return job.hsaContributions ?? 0;
}

/** Group-term life insurance > $50K. Already in Box 1, informational. W2: Box 12 Code C. */
export function getGroupTermLife(job: JobInput): number {
  return job.groupTermLife ?? 0;
}

/** Employer health coverage cost. Zero tax impact, informational. W2: Box 12 Code DD. */
export function getHealthCoverage(job: JobInput): number {
  return job.employerHealthCoverage ?? 0;
}

/** Stock option income. Already in Box 1, informational. W2: Box 12 Code V. */
export function getStockOptionIncome(job: JobInput): number {
  return job.stockOptionIncome ?? 0;
}

/**
 * Returns the above-the-line deductions that should be subtracted from
 * annualSalary to compute AGI. This depends on the income source:
 *
 * - W2 (Box 1): Pre-tax 401k and HSA are ALREADY excluded from Box 1 by the employer.
 *   Do NOT subtract them again. Above-the-line deductions from salary = 0.
 *
 * - Pay stub (Gross): Pre-tax 401k and HSA have NOT been subtracted yet.
 *   Subtract traditional 401(k) and separately identified employee pretax HSA.
 *
 * Roth 401k (Code AA) is NEVER subtracted — it's after-tax regardless of source.
 */
export function getAboveTheLineDeductions(job: JobInput): number {
  if (job.incomeSource === 'w2') {
    return 0;
  }
  return getTraditional401k(job) + (job.employeePretaxHsa ?? 0);
}

/** Box 3/5 when supplied; legacy W-2 approximates by restoring pre-tax 401(k).
 * Only confirmed employee pretax HSA is subtracted from paystub gross.
 */
export function getPayrollWages(job: JobInput, kind: 'socialSecurity' | 'medicare'): number {
  return job[kind === 'socialSecurity' ? 'socialSecurityWages' : 'medicareWages']
    ?? Math.max(0, job.annualSalary + (job.incomeSource === 'w2' ? getTraditional401k(job) : -(job.employeePretaxHsa ?? 0)));
}

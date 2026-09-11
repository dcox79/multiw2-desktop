import { assertSupportedTaxYear } from './tax-data-2026';
import type { Job, YTDSnapshot, JobW2Entry, JobInput } from '../types';

export interface BuildJobInputsResult {
  jobInputs: JobInput[];
  calculationBasis: 'manual' | 'ytd_only' | 'w2_and_ytd';
}

/**
 * Build deduplicated maps and assemble JobInput[] from raw DB rows.
 * Canonical implementation — used by calculate, scenarios, and scanner routes.
 */
export function buildJobInputs(
  jobs: Job[],
  allSnapshots: YTDSnapshot[],
  allW2Entries: JobW2Entry[],
  taxYear: number,
): BuildJobInputsResult {
  assertSupportedTaxYear(taxYear);
  // Build latest snapshot map (one per job, ordered desc by paycheck_date)
  const latestSnapshots = new Map<string, YTDSnapshot>();
  for (const snap of allSnapshots) {
    if (!snap.paycheck_date.startsWith(`${taxYear}-`)) continue;
    if (!latestSnapshots.has(snap.job_id) || snap.paycheck_date > latestSnapshots.get(snap.job_id)!.paycheck_date) {
      latestSnapshots.set(snap.job_id, snap);
    }
  }

  // Build latest W2 entries map (one per job, ordered desc by tax_year)
  const latestW2Entries = new Map<string, JobW2Entry>();
  for (const entry of allW2Entries) {
    if (entry.tax_year !== taxYear) continue;
    if (!latestW2Entries.has(entry.job_id)) {
      latestW2Entries.set(entry.job_id, entry);
    }
  }

  // Determine calculation basis
  const hasW2 = jobs.some((j) => latestW2Entries.has(j.id));
  const hasSnapshots = jobs.some((j) => latestSnapshots.has(j.id));
  const calculationBasis = hasW2 ? 'w2_and_ytd' as const : hasSnapshots ? 'ytd_only' as const : 'manual' as const;

  const jobInputs: JobInput[] = jobs.map((job) => {
    const w2 = latestW2Entries.get(job.id);
    const snapshot = latestSnapshots.get(job.id);

    if (w2) {
      return {
        id: job.id,
        name: job.name,
        incomeSource: 'w2' as const,
        annualSalary: w2.box1_wages,
        socialSecurityWages: w2.box3_ss_wages ?? undefined,
        medicareWages: w2.box5_medicare_wages ?? undefined,
        federalWithholdingYTD: w2.box2_federal_withheld,
        socialSecurityWithholdingYTD: w2.box4_ss_withheld,
        medicareWithholdingYTD: w2.box6_medicare_withheld,
        traditional401k: w2.box12_code_d ?? undefined,
        roth401k: w2.box12_code_aa ?? undefined,
        hsaContributions: w2.box12_code_w ?? undefined,
        groupTermLife: w2.box12_code_c ?? undefined,
        employerHealthCoverage: w2.box12_code_dd ?? undefined,
        stockOptionIncome: w2.box12_code_v ?? undefined,
        payFrequency: job.pay_frequency as JobInput['payFrequency'],
        startMonth: job.start_month ?? 1,
        extraWithholdingPerPaycheck: Number(job.extra_withholding_per_paycheck ?? 0),
      };
    }

    if (snapshot) {
      return {
        id: job.id,
        name: job.name,
        incomeSource: 'paystub' as const,
        annualSalary: job.annual_salary,
        federalWithholdingYTD: snapshot.ytd_federal_withheld,
        socialSecurityWithholdingYTD: snapshot.ytd_ss_withheld,
        medicareWithholdingYTD: snapshot.ytd_medicare_withheld,
        traditional401k: snapshot.ytd_traditional_401k ?? undefined,
        roth401k: snapshot.ytd_roth_401k ?? undefined,
        hsaContributions: snapshot.ytd_hsa ?? undefined,
        payFrequency: job.pay_frequency as JobInput['payFrequency'],
        startMonth: job.start_month ?? 1,
        extraWithholdingPerPaycheck: Number(job.extra_withholding_per_paycheck ?? 0),
      };
    }

    // Manual fallback — use job data directly
    return {
      id: job.id,
      name: job.name,
      incomeSource: 'paystub' as const,
      annualSalary: job.annual_salary,
      federalWithholdingYTD: 0,
      socialSecurityWithholdingYTD: 0,
      medicareWithholdingYTD: 0,
      payFrequency: job.pay_frequency as JobInput['payFrequency'],
      startMonth: job.start_month ?? 1,
      extraWithholdingPerPaycheck: Number(job.extra_withholding_per_paycheck ?? 0),
    };
  });

  return { jobInputs, calculationBasis };
}

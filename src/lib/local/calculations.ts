import { z } from 'zod';
import { rows, row, profile, insert, update, profileId, transaction } from './db';
import { api, ApiError, camelRow, snakeFields } from './api';
import { calculateRequestSchema } from '@/lib/validation';
import { buildJobInputs } from '@/lib/tax/build-job-inputs';
import { runAllCalculators } from '@/lib/tax/run-calculators';
import { runScenario } from '@/lib/tax/scenario-engine';
import { TAX_YEAR, assertSupportedTaxYear } from '@/lib/tax/tax-data-2026';
import { calculateFederalTax } from '@/lib/tax/federal-tax';
import { optimizeBenefitsAllocation } from '@/lib/tax/benefits-optimizer';
import { generateDocumentChecklist } from '@/lib/tax/tax-prep';
import type { CalculateRequest, CalculationInput, Job, YTDSnapshot, JobW2Entry, TaxProfile, Profile, EmployerBenefitPlan, TaxPrepDocument, ScenarioModification } from '@/lib/types';

export function assembleCalculation(request: CalculateRequest) {
  const year = request.taxYear ?? TAX_YEAR;
  assertSupportedTaxYear(year);
  const ids = [...new Set(request.jobIds)];
  const placeholders = ids.map(() => '?').join(',');
  const jobs = rows<Job>(`SELECT * FROM jobs WHERE id IN (${placeholders}) ORDER BY created_at, id`, ...ids);
  if (!jobs.length || jobs.length !== ids.length) throw new ApiError('One or more selected jobs were not found', 404);
  const snapshots = rows<YTDSnapshot>(`SELECT * FROM ytd_snapshots WHERE job_id IN (${placeholders}) AND paycheck_date >= ? AND paycheck_date < ? ORDER BY paycheck_date DESC, created_at DESC, id`, ...ids, `${year}-01-01`, `${year + 1}-01-01`);
  const w2Entries = rows<JobW2Entry>(`SELECT * FROM job_w2_entries WHERE job_id IN (${placeholders}) AND tax_year = ? ORDER BY tax_year DESC, updated_at DESC, id`, ...ids, year);
  const tp = row<TaxProfile>('SELECT * FROM tax_profiles WHERE tax_year = ?', year);
  const settings = tp ?? profile<Profile>();
  // Personal dependent records alone cannot establish Schedule 8812 eligibility.
  const childCredits = request.childTaxCreditEligible ?? settings.child_tax_credit_eligible ?? 0;
  const dependentCount = request.dependents ?? settings.dependents;
  const { jobInputs, calculationBasis } = buildJobInputs(jobs, snapshots, w2Entries, year);
  const input: CalculationInput = {
    taxYear: year, jobs: jobInputs, filingStatus: request.filingStatus ?? settings.filing_status ?? 'single',
    standardDeduction: request.useStandardDeduction ?? settings.use_standard_deduction,
    itemizedDeductions: request.itemizedDeductions ?? settings.itemized_deduction_amount,
    estimatedPaymentsYTD: request.estimatedPaymentsYTD ?? (tp ? tp.estimated_payment_q1 + tp.estimated_payment_q2 + tp.estimated_payment_q3 + tp.estimated_payment_q4 : 0),
    dependents: dependentCount, childTaxCreditEligible: childCredits,
    otherDependentsEligible: request.otherDependentsEligible ?? 0,
  };
  const w2Jobs = new Set(w2Entries.map(entry => entry.job_id));
  const seen = new Set<string>();
  const usedSnapshots = snapshots.filter(snapshot => {
    if (w2Jobs.has(snapshot.job_id) || seen.has(snapshot.job_id)) return false;
    seen.add(snapshot.job_id); return true;
  });
  const dates = [...usedSnapshots.map(snapshot => snapshot.paycheck_date), ...w2Entries.map(entry => entry.updated_at)];
  return { input, jobs, w2Entries, calculationBasis, metadata: { jobIds: ids, snapshotIds: usedSnapshots.map(snapshot => snapshot.id), w2EntryIds: w2Entries.map(entry => entry.id), calculationBasis,
    dataFreshnessDate: dates.sort().at(-1) ?? new Date().toISOString().slice(0, 10) } };
}

export const calculatePOST = (request: Request) => api(async () => {
  const { input, metadata } = assembleCalculation(calculateRequestSchema.parse(await request.json()));
  return { ...runAllCalculators(input), metadata };
});

const modificationTypes = ['quit_job','add_job','salary_change','filing_status_change','add_1099','custom','saved_calculation'] as const;
const modificationSchema = z.object({ type: z.enum(modificationTypes), jobIdToRemove: z.uuid().optional(), quitMonth: z.number().int().min(1).max(12).optional(),
  jobToAdd: z.object({ name: z.string().min(1), annualSalary: z.number().nonnegative().max(10_000_000), payFrequency: z.enum(['weekly','biweekly','semimonthly','monthly']).optional() }).optional(),
  startMonth: z.number().int().min(1).max(12).optional(), jobIdForRaise: z.uuid().optional(), newSalary: z.number().nonnegative().max(10_000_000).optional(), effectiveMonth: z.number().int().min(1).max(12).optional(),
  newFilingStatus: z.enum(['single','married_filing_jointly','married_filing_separately','head_of_household']).optional(), income1099: z.number().nonnegative().max(10_000_000).optional(), description: z.string().max(2000).optional() });
export const scenariosGET = () => api(() => ({ data: rows('SELECT * FROM tax_scenarios ORDER BY created_at DESC, id').map(camelRow) }));
export const scenariosPOST = (request: Request) => api(async () => {
  const { name, modificationType, modifications, taxYear } = z.object({ name: z.string().min(1).max(200), modificationType: z.enum(modificationTypes), modifications: modificationSchema, taxYear: z.number().int().default(TAX_YEAR) }).parse(await request.json());
  assertSupportedTaxYear(taxYear);
  if (modificationType === 'custom' || modificationType === 'saved_calculation') throw new ApiError('This scenario type is not available for new calculations. Existing imported scenarios remain in history.', 409);
  if (modificationType !== modifications.type) throw new ApiError('Scenario type must match modification type');
  const ids = rows<{ id: string }>("SELECT id FROM jobs WHERE employment_status = 'active' AND is_draft = 0 ORDER BY created_at, id").map(job => job.id);
  if (!ids.length) throw new ApiError('No active jobs found');
  if (modificationType === 'quit_job' && (!modifications.jobIdToRemove || !ids.includes(modifications.jobIdToRemove))) throw new ApiError('Select an active job to remove');
  if (modificationType === 'add_job' && !modifications.jobToAdd) throw new ApiError('Enter the prospective job');
  if (modificationType === 'salary_change' && (!modifications.jobIdForRaise || !ids.includes(modifications.jobIdForRaise) || modifications.newSalary === undefined)) throw new ApiError('Select an active job and new salary');
  if (modificationType === 'filing_status_change' && !modifications.newFilingStatus) throw new ApiError('Choose a filing status');
  if (modificationType === 'add_1099' && modifications.income1099 === undefined) throw new ApiError('Enter self-employment income');
  const { input } = assembleCalculation({ jobIds: ids, taxYear });
  const result = runScenario(input, modifications as ScenarioModification);
  const saved = insert('tax_scenarios', { name, is_baseline: false, base_input: input, modification_type: modificationType, modifications,
    result_data: { baseResult: result.baseResult, modifiedResult: result.modifiedResult, deltas: result.deltas }, tax_impact: result.taxImpact });
  return { data: camelRow(saved) };
}, 201);

export const optimizePOST = (request: Request) => api(async () => {
  const { salaries, taxYear } = z.object({ salaries: z.record(z.uuid(), z.number().nonnegative()), taxYear: z.number().int().default(TAX_YEAR) }).parse(await request.json());
  assertSupportedTaxYear(taxYear);
  const plans = rows("SELECT b.* FROM employer_benefits b JOIN jobs j ON j.id = b.job_id WHERE b.is_active = 1 AND j.employment_status = 'active' AND j.is_draft = 0 ORDER BY b.created_at, b.id").map(camelRow) as unknown as EmployerBenefitPlan[];
  const jobs = Object.entries(salaries).map(([id, annualSalary]) => ({ id, name: '', incomeSource: 'paystub' as const, annualSalary, federalWithholdingYTD: 0, socialSecurityWithholdingYTD: 0, medicareWithholdingYTD: 0, payFrequency: 'biweekly' as const, startMonth: 1 }));
  const settings = row<TaxProfile>('SELECT * FROM tax_profiles WHERE tax_year = ?', taxYear) ?? profile<Profile>();
  const federal = calculateFederalTax({ taxYear, jobs, filingStatus: settings.filing_status ?? 'single', standardDeduction: settings.use_standard_deduction, itemizedDeductions: settings.itemized_deduction_amount, estimatedPaymentsYTD: 0, dependents: settings.dependents, childTaxCreditEligible: settings.child_tax_credit_eligible, otherDependentsEligible: 0 });
  const result = optimizeBenefitsAllocation(plans, salaries, federal.marginalRate);
  update('profiles', profileId(), { last_optimization_result: result });
  return { data: result };
});

export const taxPrepGET = (request: Request) => api(() => {
  const year = z.number().int().min(1900).max(2200).parse(Number(new URL(request.url).searchParams.get('year') ?? TAX_YEAR));
  const jobs = rows<Job>("SELECT * FROM jobs WHERE employment_status != 'deleted' ORDER BY created_at, id");
  const w2 = rows<JobW2Entry>('SELECT * FROM job_w2_entries WHERE tax_year = ? ORDER BY updated_at DESC, id', year).filter(entry => jobs.some(job => job.id === entry.job_id));
  const relevantJobs = jobs.filter(job => job.employment_status === 'active' || w2.some(entry => entry.job_id === job.id));
  const documents = transaction(() => {
    const tracked = rows('SELECT * FROM tax_prep_documents WHERE tax_year = ? ORDER BY created_at, id', year).map(camelRow) as unknown as TaxPrepDocument[];
    return generateDocumentChecklist(relevantJobs, w2, tracked, year).map(document => {
      if (document.id) return document;
      const data = { taxYear: year, documentType: document.documentType, documentName: document.documentName, employerName: document.employerName ?? null, status: document.status };
      return camelRow(insert('tax_prep_documents', snakeFields(data))) as unknown as TaxPrepDocument;
    });
  });
  return { taxYear: year, documents, safeHarborStatus: null, filingStrategy: null, estimatedRefund: null, priorYearTaxAmount: null,
    calculationNotice: year !== TAX_YEAR ? `Tax calculations are available for ${TAX_YEAR} only. Historical documents remain editable.` : 'Prior-year safe harbor requires actual prior-return tax and AGI; W-2 income alone does not establish it. Joint-versus-separate estimates require separate information for each spouse.' };
});
export const safeHarborGET = () => api(() => { throw new ApiError('Prior-year safe harbor is unavailable without actual prior-return total tax and AGI. W-2 income alone does not establish the threshold.', 409); });

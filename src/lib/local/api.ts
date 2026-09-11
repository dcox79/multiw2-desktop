import { NextResponse } from 'next/server';
import { z } from 'zod';
import { row, rows, profile, profileId, insert, update, remove, transaction, type Row } from './db';
import { createJobSchema, updateJobSchema, createSnapshotSchema, updateSnapshotSchema, createW2EntrySchema, saveCalculationSchema, updateSavedCalculationSchema } from '@/lib/validation';
import type { Job, JobW2Entry, YTDSnapshot } from '@/lib/types';
import { calculationInputShape, calculationResultShape, optimizationShape } from './backup-shapes';

export type IdContext = { params: Promise<{ id: string }> };
export class ApiError extends Error { constructor(message: string, readonly status = 400) { super(message); } }
export async function api(work: () => unknown | Promise<unknown>, status = 200) {
  try { return NextResponse.json(await work(), { status }); }
  catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Validation failed', errors: Object.fromEntries(error.issues.map(issue => [issue.path.join('.'), issue.message])) }, { status: 400 });
    if (error instanceof ApiError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    if (error instanceof RangeError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof Error && /constraint failed/i.test(error.message)) return NextResponse.json({ error: 'Invalid data or relationship' }, { status: 400 });
    console.error('Local API failed:', error);
    return NextResponse.json({ error: 'Local database operation failed. Your saved data has been preserved.' }, { status: 500 });
  }
}
export function required<T>(value: T | undefined): T { if (value === undefined) throw new ApiError('Not found', 404); return value; }
export function camelRow(data: Row) {
  const names: Record<string, string> = { employer_hsa_contribution: 'employerHSAContribution' };
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [names[key] || key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()), value]));
}
export function snakeFields(data: Row) {
  const names: Record<string, string> = { employerHSAContribution: 'employer_hsa_contribution' };
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [names[key] || key.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`), value]));
}

export const jobsGET = (request?: Request) => api(() => rows("SELECT * FROM jobs WHERE (? = 1 OR employment_status != 'deleted') ORDER BY created_at, id", request && new URL(request.url).searchParams.get('include_archived') === 'true' ? 1 : 0));
export const jobsPOST = (request: Request) => api(async () => insert('jobs', createJobSchema.parse(await request.json())), 201);
export const jobPUT = (request: Request, context: IdContext) => api(async () => {
  const { id } = await context.params;
  const fields = updateJobSchema.parse(await request.json());
  const current = required(row<Job>('SELECT * FROM jobs WHERE id = ?', id));
  if ((fields.started_this_year ?? current.started_this_year) && !(fields.start_month ?? current.start_month)) throw new ApiError('Start month is required when job started this year');
  return required(update('jobs', id, { ...fields, ...(fields.employment_status ? { is_active: fields.employment_status !== 'deleted' } : {}) }));
});
export const jobDELETE = (request: Request, context: IdContext) => api(async () => {
  const { id } = await context.params;
  const permanent = new URL(request.url).searchParams.get('permanent') === 'true';
  required(update('jobs', id, { employment_status: permanent ? 'deleted' : 'former', is_active: !permanent }));
  return { success: true };
});
export const snapshotsGET = (request: Request) => api(() => {
  const id = new URL(request.url).searchParams.get('job_id');
  return rows('SELECT * FROM ytd_snapshots WHERE (? IS NULL OR job_id = ?) ORDER BY paycheck_date DESC, created_at DESC, id', id, id);
});
export const snapshotsPOST = (request: Request) => api(async () => {
  const fields = createSnapshotSchema.extend({ paycheck_date: z.iso.date() }).parse(await request.json());
  required(row("SELECT id FROM jobs WHERE id = ? AND employment_status != 'deleted'", fields.job_id));
  const year = new Date(fields.paycheck_date).getUTCFullYear();
  const date = new Date(fields.paycheck_date).toISOString().slice(0, 10);
  const latest = row<YTDSnapshot>('SELECT * FROM ytd_snapshots WHERE job_id = ? AND paycheck_date >= ? AND paycheck_date < ? ORDER BY paycheck_date DESC, created_at DESC LIMIT 1', fields.job_id, `${year}-01-01`, `${year + 1}-01-01`);
  const warning = latest && fields.ytd_gross < latest.ytd_gross ? `YTD gross (${fields.ytd_gross}) is lower than previous snapshot (${latest.ytd_gross}). This may indicate an error.` : undefined;
  return { ...insert<Row>('ytd_snapshots', { ...fields, paycheck_date: date }), warning };
}, 201);
export const snapshotPUT = (request: Request, context: IdContext) => api(async () => {
  const { id } = await context.params;
  const fields = updateSnapshotSchema.extend({ paycheck_date: z.iso.date() }).parse(await request.json());
  return required(update('ytd_snapshots', id, { ...fields, paycheck_date: new Date(fields.paycheck_date).toISOString().slice(0, 10) }));
});
export const snapshotDELETE = (request: Request, context: IdContext) => api(async () => { remove('ytd_snapshots', (await context.params).id); return { deleted: true }; });
export const w2GET = (request: Request) => api(() => {
  const id = new URL(request.url).searchParams.get('job_id');
  return rows('SELECT * FROM job_w2_entries WHERE (? IS NULL OR job_id = ?) ORDER BY tax_year DESC, updated_at DESC, id', id, id);
});
const w2Schema = createW2EntrySchema.extend({ box3_ss_wages: z.number().nonnegative().nullable().optional(), box5_medicare_wages: z.number().nonnegative().nullable().optional() });
export async function w2POST(request: Request) {
  let created = false;
  const response = await api(async () => {
    const fields = w2Schema.parse(await request.json());
    required(row("SELECT id FROM jobs WHERE id = ? AND employment_status != 'deleted'", fields.job_id));
    return transaction(() => {
      const current = row<JobW2Entry>('SELECT * FROM job_w2_entries WHERE job_id = ? AND tax_year = ?', fields.job_id, fields.tax_year);
      if (current) {
        if (current.version > 1 && !fields.correction_note?.trim()) throw new ApiError('correction_note is required when updating a completed W2 entry');
        return update('job_w2_entries', current.id, { ...fields, correction_note: fields.correction_note || null, version: current.version + 1 });
      }
      created = true;
      return insert('job_w2_entries', { ...fields, correction_note: null, version: 1 });
    });
  });
  if (created && response.ok) return new NextResponse(response.body, { status: 201, headers: response.headers });
  return response;
}
export const w2DELETE = (request: Request, context: IdContext) => api(async () => { remove('job_w2_entries', (await context.params).id); return { success: true }; });

export const savedGET = () => api(() => rows('SELECT * FROM saved_calculations ORDER BY updated_at DESC, id'));
export const savedPOST = (request: Request) => api(async () => {
  const fields = saveCalculationSchema.parse(await request.json());
  calculationInputShape.parse(fields.input);
  if (fields.result != null) calculationResultShape.parse(fields.result);
  const metadata = fields.result?.metadata;
  return insert('saved_calculations', { name: fields.name, input_data: fields.input, result_data: fields.result, is_draft: fields.isDraft, source: fields.source,
    job_ids: metadata?.jobIds ?? [], w2_entry_ids: metadata?.w2EntryIds ?? [], snapshot_ids: metadata?.snapshotIds ?? [], calculation_basis: metadata?.calculationBasis ?? 'manual', data_freshness_date: metadata?.dataFreshnessDate?.slice(0, 10) ?? null });
}, 201);
export const savedOneGET = (request: Request, context: IdContext) => api(async () => required(row('SELECT * FROM saved_calculations WHERE id = ?', (await context.params).id)));
export const savedPUT = (request: Request, context: IdContext) => api(async () => {
  const fields = updateSavedCalculationSchema.parse(await request.json());
  if (fields.result != null) calculationResultShape.parse(fields.result);
  return required(update('saved_calculations', (await context.params).id, { name: fields.name, result_data: fields.result, is_draft: fields.isDraft }));
});
export const savedDELETE = (request: Request, context: IdContext) => api(async () => { remove('saved_calculations', (await context.params).id); return { success: true }; });

const taxFieldsSchema = z.object({ filing_status: z.enum(['single','married_filing_jointly','married_filing_separately','head_of_household']).nullable().optional(),
  dependents: z.number().int().nonnegative().optional(), child_tax_credit_eligible: z.number().int().nonnegative().optional(), use_standard_deduction: z.boolean().optional(),
  itemized_deduction_amount: z.number().nonnegative().optional(), estimated_payment_q1: z.number().nonnegative().optional(), estimated_payment_q2: z.number().nonnegative().optional(),
  estimated_payment_q3: z.number().nonnegative().optional(), estimated_payment_q4: z.number().nonnegative().optional() });
const yearSchema = z.number().int().min(1900).max(2200);
const profileSchema = taxFieldsSchema.extend({ display_name: z.string().max(100).nullable().optional(), email: z.string().max(320).optional(), theme_preference: z.enum(['system','light','dark']).optional(),
  workflow_card_order: z.array(z.string()).nullable().optional(), hidden_workflow_cards: z.array(z.string()).nullable().optional(), last_optimization_result: optimizationShape.nullable().optional(),
  notify_stale_data: z.boolean().optional(), notify_quarterly_reminders: z.boolean().optional(), notify_product_updates: z.boolean().optional(), notify_tax_law_changes: z.boolean().optional(), notify_quarterly_estimator: z.boolean().optional() }).strict();
export const profileGET = () => api(() => ({ profile: profile() }));
export const profilePATCH = (request: Request) => api(async () => ({ profile: update('profiles', profileId(), profileSchema.parse(await request.json())) }));
export const taxProfileGET = (request: Request) => api(() => ({ data: row('SELECT * FROM tax_profiles WHERE tax_year = ?', yearSchema.parse(Number(new URL(request.url).searchParams.get('year')))) ?? null }));
export const taxProfilePOST = (request: Request) => api(async () => {
  const body = await request.json();
  let year: number;
  let fields: Row;
  if (body.action === 'import') {
    const from = yearSchema.parse(body.fromYear); year = yearSchema.parse(body.toYear);
    if (from === year) throw new ApiError('Choose a different source year');
    const source = required(row('SELECT * FROM tax_profiles WHERE tax_year = ?', from));
    fields = { ...taxFieldsSchema.parse(source), estimated_payment_q1: 0, estimated_payment_q2: 0, estimated_payment_q3: 0, estimated_payment_q4: 0, imported_from_year: from };
  } else { year = yearSchema.parse(body.tax_year); fields = taxFieldsSchema.parse(body); }
  const current = row<{ id: string }>('SELECT id FROM tax_profiles WHERE tax_year = ?', year);
  return { data: current ? update('tax_profiles', current.id, fields) : insert('tax_profiles', { tax_year: year, ...fields }) };
});

const dependentSchema = z.object({ firstName: z.string().min(1).max(100), relationship: z.enum(['child','stepchild','foster_child','sibling','parent','other']), dateOfBirth: z.iso.date(), isFullTimeStudent: z.boolean().default(false), isDisabled: z.boolean().default(false) });
export const dependentsGET = () => api(() => ({ data: rows('SELECT * FROM dependents ORDER BY created_at, id').map(camelRow) }));
export const dependentsPOST = (request: Request) => api(async () => ({ data: camelRow(insert('dependents', snakeFields(dependentSchema.parse(await request.json())))) }), 201);
export const dependentsPATCH = (request: Request) => api(async () => {
  const { id, ...fields } = dependentSchema.partial().extend({ id: z.uuid() }).parse(await request.json());
  return { data: camelRow(required(update('dependents', id, snakeFields(fields)))) };
});
export const dependentsDELETE = (request: Request) => api(() => { remove('dependents', z.uuid().parse(new URL(request.url).searchParams.get('id'))); return { data: { deleted: true } }; });

const benefitSchema = z.object({ jobId: z.uuid(), jobName: z.string().min(1), matchType: z.enum(['percentage','dollar']), matchPercent: z.number().nonnegative().default(0), matchCapPercent: z.number().nonnegative().default(0), matchCapDollar: z.number().nonnegative().default(0), employerHSAContribution: z.number().nonnegative().default(0), hasMegaBackdoorRoth: z.boolean().default(false), vestingSchedule: z.string().optional(), healthPremiumMonthly: z.number().nonnegative().default(0), dentalPremiumMonthly: z.number().nonnegative().default(0), visionPremiumMonthly: z.number().nonnegative().default(0), notes: z.string().optional() });
export const benefitsGET = (request: Request) => api(() => {
  const params = new URL(request.url).searchParams; const id = params.get('jobId');
  return { data: rows('SELECT * FROM employer_benefits WHERE (? = 0 OR is_active = 1) AND (? IS NULL OR job_id = ?) ORDER BY created_at DESC, id', params.get('active') !== 'false' ? 1 : 0, id, id).map(camelRow) };
});
export const benefitsPOST = (request: Request) => api(async () => ({ data: camelRow(insert('employer_benefits', snakeFields(benefitSchema.parse(await request.json())))) }), 201);
export const benefitsPATCH = (request: Request) => api(async () => {
  const { id, deactivate, reactivate, ...fields } = benefitSchema.partial().extend({ id: z.uuid(), deactivate: z.boolean().optional(), reactivate: z.boolean().optional() }).parse(await request.json());
  return { data: camelRow(required(update('employer_benefits', id, { ...snakeFields(fields), ...(deactivate ? { is_active: false, deactivated_at: new Date().toISOString() } : reactivate ? { is_active: true, deactivated_at: null } : {}) }))) };
});
export const benefitsDELETE = (request: Request) => api(() => { remove('employer_benefits', z.uuid().parse(new URL(request.url).searchParams.get('id'))); return { data: { deleted: true } }; });

export const documentsPOST = (request: Request) => api(async () => {
  const fields = z.object({ taxYear: yearSchema, documentType: z.string().min(1), documentName: z.string().min(1), employerName: z.string().optional(), notes: z.string().optional() }).parse(await request.json());
  return { data: insert('tax_prep_documents', snakeFields(fields)) };
}, 201);
export const documentPATCH = (request: Request, context: IdContext) => api(async () => {
  const fields = z.object({ status: z.enum(['needed','received','verified']).optional(), receivedDate: z.iso.date().nullable().optional(), amount: z.number().optional(), notes: z.string().optional() }).parse(await request.json());
  if (!Object.keys(fields).length) throw new ApiError('No fields to update');
  return { data: required(update('tax_prep_documents', (await context.params).id, snakeFields(fields))) };
});
export const documentDELETE = (request: Request, context: IdContext) => api(async () => { remove('tax_prep_documents', (await context.params).id); return { data: { deleted: true } }; });
export const scenarioDELETE = (request: Request, context: IdContext) => api(async () => { remove('tax_scenarios', (await context.params).id); return { success: true }; });
export const scannerDELETE = (request: Request, context: IdContext) => api(async () => { remove('job_postings', (await context.params).id); return { success: true }; });
function scanDimensions(value: unknown) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  return Object.values(value).map((dimension: Row) => ({ name: dimension.dimension, score: dimension.score,
    rating: Number(dimension.score) >= 80 ? 'excellent' : Number(dimension.score) >= 60 ? 'good' : Number(dimension.score) >= 40 ? 'fair' : 'poor',
    summary: dimension.reasoning, details: [...(dimension.positiveKeywords as string[] ?? []), ...(dimension.negativeKeywords as string[] ?? [])] }));
}
export const scannerGET = () => api(() => ({ data: rows('SELECT * FROM job_postings ORDER BY created_at DESC, id').map(record => ({
  id: record.id, jobTitle: record.job_title, company: record.company_name ?? '', estimatedSalary: record.estimated_salary ?? null, location: null,
  dimensions: scanDimensions(record.dimension_scores), overallScore: record.overall_score ?? 0, overallRating: record.recommendation === 'marginal' ? 'fair' : record.recommendation ?? 'fair',
  recommendation: (record.tax_impact as Row | null)?.recommendation ?? '', taxImpact: record.tax_impact ?? {}, webEnriched: Boolean((record.tax_impact as Row | null)?.webEnriched), createdAt: record.created_at,
})), credits: { used: 0, limit: null, webEnrichment: false }, enabled: false }));
export const scannerPOST = () => api(() => { throw new ApiError('AI scanning is disabled. Use the offline scenario modeler to compare prospective jobs.', 409); });

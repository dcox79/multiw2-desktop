// @vitest-environment node
import { test, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { closeDatabase, database, exportBackup, insert, profile, resetLocalData, restoreBackup, row, rows, update } from '../src/lib/local/db';
import { jobsGET, jobsPOST, jobDELETE, snapshotsGET, snapshotsPOST, w2POST, w2GET, savedGET, savedPOST, profilePATCH, profileGET, taxProfilePOST, dependentsPOST, benefitsPOST, benefitsGET, benefitsPATCH, scannerGET, scannerPOST, documentsPOST, documentPATCH, documentDELETE } from '../src/lib/local/api';
import { assembleCalculation, calculatePOST, scenariosGET, scenariosPOST, optimizePOST, taxPrepGET } from '../src/lib/local/calculations';
import { TABLES } from '../src/lib/local/schema';
import type { Job, CalculationResult, ScenarioModification, TaxPrepDocument } from '../src/lib/types';

function request(body?: unknown, url = 'http://127.0.0.1/api/test') { return new Request(url, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
async function ok(response: Promise<Response>) { const result = await response; const data = await result.json(); expect(result.ok, JSON.stringify(data)).toBe(true); return data; }

test('local workflows round-trip all 11 tables, enforce corrections and years, reject invalid imports atomically, and reopen', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'multiw2-storage-'));
  const previous = process.env.MULTIW2_DATA_DIR;
  process.env.MULTIW2_DATA_DIR = directory;
  try {
    const initialProfile = profile<{ id: string }>();
    expect(database().prepare('PRAGMA foreign_keys').get()?.foreign_keys).toBe(1);
    expect(row<{ version: number }>('SELECT version FROM schema_migrations')?.version).toBe(1);
    await ok(profilePATCH(request({ display_name: 'Offline owner', theme_preference: 'dark', workflow_card_order: ['w2','jobs'] })));
    await ok(taxProfilePOST(request({ tax_year: 2026, filing_status: 'single', estimated_payment_q1: 123.45, itemized_deduction_amount: 4321.09 })));
    await ok(taxProfilePOST(request({ tax_year: 2025, filing_status: 'single', estimated_payment_q1: 88888.88 })));
    const job = await ok(jobsPOST(request({ name: 'Employer A', annual_salary: 123456.78, income_source: 'paystub', pay_frequency: 'biweekly' }))) as Job;
    const second = await ok(jobsPOST(request({ name: 'Employer B', annual_salary: 60000.01, income_source: 'paystub', pay_frequency: 'monthly' }))) as Job;
    await ok(dependentsPOST(request({ firstName: 'Child', relationship: 'child', dateOfBirth: '2015-03-12' })));
    const snapshot = await ok(snapshotsPOST(request({ job_id: second.id, paycheck_date: '2026-06-30', ytd_gross: 30000.01, ytd_federal_withheld: 4321.09, ytd_ss_withheld: 1860, ytd_medicare_withheld: 435 })));
    await ok(snapshotsPOST(request({ job_id: second.id, paycheck_date: '2025-12-31', ytd_gross: 999999, ytd_federal_withheld: 999999, ytd_ss_withheld: 9999, ytd_medicare_withheld: 9999 })));
    const w2Fields = { job_id: job.id, tax_year: 2026, box1_wages: 110000.23, box2_federal_withheld: 15000.12, box3_ss_wages: 123456.78, box4_ss_withheld: 7654.32, box5_medicare_wages: 123456.78, box6_medicare_withheld: 1790.12 };
    const w2 = await ok(w2POST(request(w2Fields)));
    expect((await ok(w2POST(request(w2Fields)))).version).toBe(2);
    expect((await w2POST(request(w2Fields))).status).toBe(400);
    expect((await ok(w2POST(request({ ...w2Fields, correction_note: 'Corrected withholding', box2_federal_withheld: 15001.13 })))).version).toBe(3);
    const result = await ok(calculatePOST(request({ jobIds: [job.id, second.id], taxYear: 2026 }))) as CalculationResult;
    expect(result.isApproximate).toBe(true);
    expect(result.modelVersion).toBe(2);
    expect(result.input.childTaxCreditEligible).toBe(0);
    expect(result.input.otherDependentsEligible).toBe(0);
    expect(assembleCalculation({ jobIds: [job.id], childTaxCreditEligible: 1, otherDependentsEligible: 1 }).input.childTaxCreditEligible).toBe(1);
    expect(result.input.estimatedPaymentsYTD).toBe(123.45);
    expect(result.metadata?.snapshotIds).toEqual([snapshot.id]);
    expect(result.metadata?.w2EntryIds).toEqual([w2.id]);
    expect(result.input.jobs.find(entry => entry.id === second.id)?.federalWithholdingYTD).toBe(4321.09);
    expect((await calculatePOST(request({ jobIds: [job.id], taxYear: 2025 }))).status).toBe(400);
    const plan = (await ok(benefitsPOST(request({ jobId: job.id, jobName: job.name, matchType: 'percentage', matchPercent: 100, matchCapPercent: 4, employerHSAContribution: 123.45 })))).data;
    expect(plan.employerHSAContribution).toBe(123.45);
    expect(plan.jobId).toBe(job.id);
    const plan2 = (await ok(benefitsPOST(request({ jobId: second.id, jobName: second.name, matchType: 'dollar', matchPercent: 50, matchCapDollar: 2000 })))).data;
    await ok(benefitsPATCH(request({ id: plan2.id, deactivate: true })));
    expect((await ok(benefitsGET(request()))).data.map((entry: { id: string }) => entry.id)).toEqual([plan.id]);
    expect((await ok(benefitsGET(request(undefined, 'http://127.0.0.1/api/benefits?active=false')))).data).toHaveLength(2);
    const optimized = (await ok(optimizePOST(request({ salaries: { [job.id]: job.annual_salary, [second.id]: second.annual_salary } })))).data;
    expect(optimized.allocations.map((allocation: { jobId: string }) => allocation.jobId)).toEqual([job.id]);
    expect(optimized.totalEmployerMatch).toBeGreaterThan(0);
    expect((await ok(profileGET())).profile.last_optimization_result).toEqual(optimized);
    const adjusted = { ...optimized, _customTarget: optimized.total401kContributions, _jobWeights: { [job.id]: 1 } };
    await ok(profilePATCH(request({ last_optimization_result: adjusted })));
    expect((await ok(profileGET())).profile.last_optimization_result).toEqual(adjusted);
    await ok(benefitsPATCH(request({ id: plan2.id, reactivate: true, employerHSAContribution: 100 })));
    const bothPlans = (await ok(optimizePOST(request({ salaries: { [job.id]: job.annual_salary, [second.id]: second.annual_salary } })))).data;
    expect(bothPlans.allocations).toHaveLength(2);
    expect(bothPlans.total401kContributions).toBeLessThanOrEqual(24500);
    expect((await optimizePOST(request({ salaries: { [job.id]: -1 } }))).status).toBe(400);
    expect((await optimizePOST(request({ salaries: { [job.id]: 100000 }, taxYear: 2025 }))).status).toBe(400);

    const scenarios: Array<{ modifications: ScenarioModification; expectedIncomeChange: number }> = [
      { modifications: { type: 'quit_job', jobIdToRemove: second.id }, expectedIncomeChange: -second.annual_salary },
      { modifications: { type: 'quit_job', jobIdToRemove: second.id, quitMonth: 12 }, expectedIncomeChange: 0 },
      { modifications: { type: 'add_job', jobToAdd: { name: 'Prospect', annualSalary: 80000 }, startMonth: 10 }, expectedIncomeChange: 20000 },
      { modifications: { type: 'salary_change', jobIdForRaise: second.id, newSalary: 100000.01 }, expectedIncomeChange: 40000 },
      { modifications: { type: 'filing_status_change', newFilingStatus: 'married_filing_jointly' }, expectedIncomeChange: 0 },
      { modifications: { type: 'add_1099', income1099: 24000, startMonth: 7 }, expectedIncomeChange: 12000 },
    ];
    for (const { modifications, expectedIncomeChange } of scenarios) {
      const scenario = (await ok(scenariosPOST(request({ name: modifications.type, modificationType: modifications.type, modifications })))).data;
      expect(scenario.userId).toBe(initialProfile.id);
      expect(scenario.modificationType).toBe(modifications.type);
      expect(scenario.resultData.baseResult.input.taxYear).toBe(2026);
      expect(scenario.resultData.deltas.totalIncome).toBeCloseTo(expectedIncomeChange, 2);
      expect(scenario.taxImpact).toBeCloseTo(scenario.resultData.deltas.federalTax + scenario.resultData.deltas.selfEmploymentTax, 2);
      if (modifications.type === 'add_1099') expect(scenario.resultData.deltas.selfEmploymentTax).toBeGreaterThan(0);
      if (modifications.type === 'filing_status_change') expect(scenario.resultData.modifiedResult.input.filingStatus).toBe('married_filing_jointly');
    }
    expect((await ok(scenariosGET())).data).toHaveLength(6);
    for (const type of ['custom', 'saved_calculation']) {
      expect((await scenariosPOST(request({ name: type, modificationType: type, modifications: { type } }))).status).toBe(409);
    }
    expect((await scenariosPOST(request({ name: 'Invalid parent', modificationType: 'quit_job', modifications: { type: 'quit_job', jobIdToRemove: randomUUID() } }))).status).toBe(400);
    expect((await scenariosPOST(request({ name: 'Wrong year', modificationType: 'add_job', modifications: { type: 'add_job', jobToAdd: { name: 'Prospect', annualSalary: 1 } }, taxYear: 2025 }))).status).toBe(400);
    const doc = await ok(documentsPOST(request({ taxYear: 2026, documentType: 'custom', documentName: 'Tax statement' })));
    await ok(documentPATCH(request({ status: 'received', receivedDate: '2026-09-01' }), { params: Promise.resolve({ id: doc.data.id }) }));
    const currentKit = await ok(taxPrepGET(request(undefined, 'http://127.0.0.1/api/tax-prep?year=2026')));
    expect(currentKit.documents.find((entry: TaxPrepDocument) => entry.id === doc.data.id)).toMatchObject({ status: 'received', receivedDate: '2026-09-01', documentName: 'Tax statement' });
    const generatedW2 = currentKit.documents.find((entry: TaxPrepDocument) => entry.documentType === 'w2' && entry.employerName === job.name);
    expect(generatedW2.status).toBe('received');
    await ok(documentPATCH(request({ status: 'verified', amount: 110000.23, notes: 'Checked against return' }), { params: Promise.resolve({ id: generatedW2.id }) }));
    const regenerated = await ok(taxPrepGET(request(undefined, 'http://127.0.0.1/api/tax-prep?year=2026')));
    expect(regenerated.documents.map((entry: TaxPrepDocument) => entry.id)).toEqual(currentKit.documents.map((entry: TaxPrepDocument) => entry.id));
    expect(regenerated.documents.find((entry: TaxPrepDocument) => entry.id === generatedW2.id)).toMatchObject({ status: 'verified', amount: 110000.23, notes: 'Checked against return' });
    expect(rows('SELECT * FROM tax_prep_documents WHERE tax_year = 2026')).toHaveLength(currentKit.documents.length);
    const temporaryDoc = (await ok(documentsPOST(request({ taxYear: 2026, documentType: 'custom', documentName: 'Remove this' })))).data;
    await ok(documentDELETE(request(), { params: Promise.resolve({ id: temporaryDoc.id }) }));
    expect((await ok(taxPrepGET(request(undefined, 'http://127.0.0.1/api/tax-prep?year=2026')))).documents.some((entry: TaxPrepDocument) => entry.id === temporaryDoc.id)).toBe(false);
    const kit = await ok(taxPrepGET(request(undefined, 'http://127.0.0.1/api/tax-prep?year=2025')));
    expect(kit.filingStrategy).toBeNull();
    expect(kit.safeHarborStatus).toBeNull();
    expect(kit.documents.some((entry: TaxPrepDocument) => entry.id === doc.data.id)).toBe(false);
    insert('job_postings', { job_title: 'Imported scan', posting_text: 'Original posting', dimension_scores: { meetingCulture: { dimension: 'Meeting culture', score: 80, weight: 1, reasoning: 'Async', positiveKeywords: ['async'], negativeKeywords: [] } }, tax_impact: { recommendation: 'Compare manually' } });
    expect((await ok(scannerGET())).data[0].dimensions).toHaveLength(1);
    expect((await scannerPOST()).status).toBe(409);
    insert('job_postings', { job_title: 'New-format history', posting_text: 'Saved offline', estimated_salary: 0, recommendation: 'good', dimension_scores: [{ name: 'Remote work', score: 75, rating: 'good', summary: 'Remote role', details: ['Written updates'] }], tax_impact: { recommendation: 'Existing recommendation', newProjectedFederalTax: 12345.67 } });
    const scannerHistory = (await ok(scannerGET())).data;
    expect(scannerHistory.find((entry: { jobTitle: string }) => entry.jobTitle === 'New-format history').estimatedSalary).toBe(0);
    const saved = await ok(savedPOST(request({ name: 'Retained result', input: result.input, result })));
    for (let i = 0; i < 50; i++) insert('saved_calculations', { name: `History ${i}`, input_data: result.input, result_data: null });
    expect((await ok(savedGET())).length).toBe(51);
    await ok(jobDELETE(request(undefined, `http://127.0.0.1/api/jobs/${second.id}?permanent=true`), { params: Promise.resolve({ id: second.id }) }));
    expect((await ok(snapshotsGET(request()))).length).toBe(2);
    await ok(jobDELETE(request(undefined, `http://127.0.0.1/api/jobs/${job.id}?permanent=true`), { params: Promise.resolve({ id: job.id }) }));
    expect((await ok(w2GET(request()))).length).toBe(1);
    expect(await ok(jobsGET())).toEqual([]);
    expect((await ok(jobsGET(request(undefined, 'http://127.0.0.1/api/jobs?include_archived=true')))).map((entry: Job) => entry.id)).toEqual([job.id, second.id]);

    const backup = exportBackup();
    expect(TABLES.every(table => backup.counts[table] > 0)).toBe(true);
    update('profiles', initialProfile.id, { display_name: 'Changed' });
    const restored = restoreBackup(structuredClone(backup));
    expect(JSON.parse(readFileSync(restored.backupPath, 'utf8')).tables.profiles[0].display_name).toBe('Changed');
    expect(exportBackup().tables).toEqual(backup.tables);
    closeDatabase();
    expect(exportBackup().tables).toEqual(backup.tables);
    expect(assembleCalculation({ jobIds: [job.id, second.id], taxYear: 2026 }).input).toEqual(result.input);

    const corruptions: Array<(data: ReturnType<typeof exportBackup>) => void> = [
      data => { data.version = 99; },
      data => { delete (data.tables as Partial<typeof data.tables>).dependents; },
      data => { data.counts.jobs = 1; },
      data => { data.tables.ytd_snapshots[0].job_id = randomUUID(); },
      data => { data.tables.ytd_snapshots[0].paycheck_date = '2026-02-31'; },
      data => { data.tables.dependents[0].user_id = randomUUID(); },
      data => { data.tables.saved_calculations.find(item => item.id === saved.id)!.input_data = { jobs: [{}] }; },
      data => { data.tables.saved_calculations.find(item => item.id === saved.id)!.result_data = { federal: [] }; },
      data => { data.tables.profiles[0].last_optimization_result = []; },
      data => { data.tables.jobs[0].annual_salary = '123.45'; },
      data => { data.tables.job_w2_entries.push({ ...data.tables.job_w2_entries[0], id: randomUUID() }); data.counts.job_w2_entries++; },
    ];
    for (const corrupt of corruptions) {
      const invalid = structuredClone(backup); corrupt(invalid);
      expect(() => restoreBackup(invalid)).toThrow();
      expect(exportBackup().tables).toEqual(backup.tables);
    }
    const cloud = structuredClone(backup);
    cloud.format = 'multiw2-cloud-export';
    cloud.tables.profiles[0].subscription_status = 'pro_annual';
    cloud.tables.saved_calculations[0].share_token = 'old-hosted-token';
    const legacyScenario = { ...cloud.tables.tax_scenarios[0], id: randomUUID(), name: 'Imported saved comparison', modification_type: 'saved_calculation', modifications: { type: 'saved_calculation' }, result_data: { baseResult: result, modifiedResult: result } };
    cloud.tables.tax_scenarios.push(legacyScenario);
    cloud.counts.tax_scenarios++;
    restoreBackup(cloud);
    expect((await ok(scannerGET())).data).toEqual(scannerHistory);
    expect((await ok(scenariosGET())).data.find((scenario: { id: string }) => scenario.id === legacyScenario.id)).toMatchObject({ name: 'Imported saved comparison', modificationType: 'saved_calculation' });
    expect((await ok(savedGET()))).toHaveLength(51);
    restoreBackup(structuredClone(backup));
    expect(exportBackup().tables).toEqual(backup.tables);
    const reset = resetLocalData();
    expect(JSON.parse(readFileSync(reset.backupPath, 'utf8')).tables).toEqual(backup.tables);
    expect(rows('SELECT * FROM jobs')).toEqual([]);
    expect(profile<{ id: string }>().id).not.toBe(initialProfile.id);
    restoreBackup(backup);
    expect(exportBackup().tables).toEqual(backup.tables);
  } finally {
    closeDatabase();
    if (previous === undefined) delete process.env.MULTIW2_DATA_DIR; else process.env.MULTIW2_DATA_DIR = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});

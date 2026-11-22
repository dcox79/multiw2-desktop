import { test, expect } from '@playwright/test';

test('local workflows, persistence, complete backup and fail-closed session', async ({ page, request, playwright }) => {
  const external: string[] = [];
  await page.route('**/*', (route) => {
    if (!route.request().url().startsWith('http://127.0.0.1:45821/')) { external.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const jobResponse = await request.post('/api/jobs', { data: { name: 'Offline employer', annual_salary: 120000, income_source: 'paystub', pay_frequency: 'biweekly', started_this_year: false, start_month: 1 } });
  expect(jobResponse.status()).toBe(201);
  const job = await jobResponse.json();
  const snap = await request.post('/api/ytd-snapshots', { data: { job_id: job.id, paycheck_date: '2026-09-01', ytd_gross: 80000, ytd_federal_withheld: 14000, ytd_ss_withheld: 4960, ytd_medicare_withheld: 1160, ytd_traditional_401k: 5000, ytd_roth_401k: 0, ytd_hsa: 1000 } });
  expect(snap.ok()).toBeTruthy();
  const resultResponse = await request.post('/api/calculate', { data: { jobIds: [job.id], taxYear: 2026 } });
  expect(resultResponse.ok()).toBeTruthy();
  const result = await resultResponse.json();
  expect(result.isApproximate).toBe(true);
  expect(result.modelVersion).toBe(2);
  expect(result.federal.totalFederalTax).toBeGreaterThan(0);
  expect((await request.post('/api/calculate', { data: { jobIds: [job.id], taxYear: 2025 } })).status()).toBe(400);
  const savedResponse = await request.post('/api/saved-calculations', { data: { name: 'Offline result', input: result.input, result } });
  expect(savedResponse.ok()).toBeTruthy();
  await page.goto('/dashboard');
  await expect(page.getByText('Offline employer', { exact: true }).first()).toBeVisible();
  for (const path of ['/dashboard/tracker', '/dashboard/benefits', '/dashboard/scenarios', '/dashboard/tax-prep', '/dashboard/history', '/dashboard/scanner', '/account']) {
    await page.goto(path);
    await expect(page.locator('body')).not.toContainText('Application error');
    await expect(page.locator('body')).not.toContainText('Unlock with Pro');
  }
  const backupResponse = await request.get('/api/backup');
  expect(backupResponse.ok()).toBeTruthy();
  const backup = await backupResponse.json();
  expect(Object.keys(backup.tables)).toHaveLength(11);
  expect(backup.tables.jobs.some((row: {id: string}) => row.id === job.id)).toBe(true);
  const invalid = await request.post('/api/backup', { data: { confirmation: 'RESTORE', backup: { ...backup, version: 999 } } });
  expect(invalid.status()).toBe(400);
  expect((await (await request.get('/api/jobs')).json()).some((row: {id: string}) => row.id === job.id)).toBe(true);
  expect((await request.delete('/api/account/delete', { data: { confirmation: 'DELETE' } })).ok()).toBeTruthy();
  expect(await (await request.get('/api/jobs')).json()).toEqual([]);
  const restored = await request.post('/api/backup', { data: { confirmation: 'RESTORE', backup } });
  expect(restored.ok()).toBeTruthy();
  const afterRestore = await (await request.get('/api/backup')).json();
  expect(afterRestore.tables).toEqual(backup.tables);
  expect(afterRestore.counts).toEqual(backup.counts);
  const recalculated = await (await request.post('/api/calculate', { data: { jobIds: [job.id], taxYear: 2026 } })).json();
  expect(recalculated.federal).toEqual(result.federal);
  const unauthenticated = await playwright.request.newContext({ storageState: { cookies: [], origins: [] }, extraHTTPHeaders: {} });
  expect((await unauthenticated.get('http://127.0.0.1:45821/api/jobs')).status()).toBe(401);
  await unauthenticated.dispose();
  expect((await request.post('/api/jobs', { headers: { Origin: 'https://evil.test' }, data: {} })).status()).toBe(403);
  expect((await request.get('/api/jobs', { headers: { Host: 'evil.test:45821' } })).status()).toBe(403);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

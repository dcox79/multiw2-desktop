const { _electron: electron } = require('@playwright/test');
const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, writeFileSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawn } = require('node:child_process');
const net = require('node:net');
let activeApplication;

async function main() {
  const dataDir = process.env.MULTIW2_TEST_DATA_DIR || mkdtempSync(join(tmpdir(), 'multiw2-desktop-'));
  const executablePath = process.env.MULTIW2_TEST_EXE || require('electron');
  const packaged = !!process.env.MULTIW2_TEST_EXE;
  const env = { ...process.env, MULTIW2_DATA_DIR: dataDir };
  delete env.ELECTRON_RUN_AS_NODE;
  const launch = async () => activeApplication = await electron.launch({ executablePath, args: packaged ? [] : ['.'], env, timeout: 60_000 });
  // Startup must work even while the conventional web-server port is occupied.
  const occupied = net.createServer();
  await new Promise((resolve, reject) => {
    occupied.once('error', (error) => error.code === 'EADDRINUSE' ? resolve() : reject(error));
    occupied.listen(3000, '127.0.0.1', resolve);
  });
  occupied.unref();
  let application = await launch();
  if (occupied.listening) occupied.close();
  let page = await application.firstWindow();
  await page.waitForURL('**/dashboard');
  await page.locator('main').waitFor({ timeout: 30_000 });
  const firstOrigin = new URL(page.url()).origin;
  const prefs = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences());
  assert.equal(prefs.nodeIntegration, false);
  assert.equal(prefs.contextIsolation, true);
  assert.equal(prefs.sandbox, true);
  if (process.env.MULTIW2_EXPECT_EXISTING === '1') {
    const existing = await page.evaluate(() => fetch('/api/jobs').then((r) => r.json()));
    assert(existing.some((row) => row.name === 'Restart persistence check' && row.annual_salary === 123456.78), 'Application update lost existing records');
  }
  const job = await page.evaluate(async () => {
    const response = await fetch('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Restart persistence check', annual_salary: 123456.78, income_source: 'paystub', pay_frequency: 'biweekly', started_this_year: false, start_month: 1 }) });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  });
  assert.equal(job.annual_salary, 123456.78);
  await page.reload();
  await page.getByText('Restart persistence check', { exact: true }).first().waitFor();
  // A second launch focuses this instance and exits without a second backend.
  const second = spawn(executablePath, packaged ? [] : ['.'], { env, windowsHide: true, stdio: 'ignore' });
  const secondExit = await Promise.race([new Promise((resolve) => second.once('exit', resolve)), new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Second instance did not exit')), 15000); timer.unref(); })]);
  assert.equal(secondExit, 0);
  const externalBlocked = await page.evaluate(() => fetch('https://example.com').then(() => false, () => true));
  assert.equal(externalBlocked, true);
  await page.screenshot({ path: join(dataDir, 'desktop.png'), fullPage: true });
  const report = await page.evaluate(async (jobId) => {
    const post = async (url, body) => {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    };
    const result = await post('/api/calculate', { jobIds: [jobId], taxYear: 2026 });
    return post('/api/saved-calculations', { name: 'Installed report check', input: result.input, result });
  }, job.id);
  await page.goto(`${firstOrigin}/dashboard/reports/${report.id}`);
  await page.getByRole('button', { name: /Print/ }).waitFor();
  const pdf = Buffer.from(await application.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.printToPDF({ printBackground: true })).toString('base64')), 'base64');
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  assert(pdf.length > 1000);
  writeFileSync(join(dataDir, 'report.pdf'), pdf);
  await application.close();
  await assert.rejects(fetch(`${firstOrigin}/api/health`));
  application = await launch();
  page = await application.firstWindow();
  await page.waitForURL('**/dashboard');
  const jobs = await page.evaluate(() => fetch('/api/jobs').then((r) => r.json()));
  assert(jobs.some((row) => row.id === job.id && row.annual_salary === 123456.78));
  await application.close();
  assert(existsSync(join(dataDir, 'runtime-check.sqlite')));
  assert.match(readFileSync(join(dataDir, 'desktop.log'), 'utf8'), /read\/write\/reopen passed/);
  console.log(JSON.stringify({ passed: true, packaged, dataDir, upgradePreserved: process.env.MULTIW2_EXPECT_EXISTING === '1', checks: ['SQLite packaged runtime', 'occupied conventional port', 'renderer isolation', 'external traffic blocked', 'second instance', 'native report PDF', 'close stops backend', 'restart persistence'] }, null, 2));
}
main().catch((error) => { console.error(error); activeApplication?.process().kill(); process.exitCode = 1; });

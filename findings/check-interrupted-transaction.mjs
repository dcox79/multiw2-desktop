// Evidence probe only; imports the actual application schema into a disposable DB.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SCHEMA_SQL, SCHEMA_VERSION, TABLES } from '../src/lib/local/schema.ts';

const directory = mkdtempSync(join(tmpdir(), 'multiw2-interrupted-transaction-'));
const path = join(directory, 'multiw2.sqlite');
const owner = randomUUID(), job = randomUUID(), snapshot = randomUUID();
let db = new DatabaseSync(path);
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
db.exec(SCHEMA_SQL);
db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
db.prepare('INSERT INTO profiles(id,display_name) VALUES (?,?)').run(owner, 'Interruption probe');
db.prepare('INSERT INTO jobs(id,user_id,name,annual_salary,income_source,pay_frequency) VALUES (?,?,?,?,?,?)').run(job, owner, 'Original job', 123456.78, 'paystub', 'biweekly');
db.prepare('INSERT INTO ytd_snapshots(id,user_id,job_id,paycheck_date,ytd_gross,ytd_federal_withheld,ytd_ss_withheld,ytd_medicare_withheld) VALUES (?,?,?,?,?,?,?,?)').run(snapshot, owner, job, '2026-09-01', 100000.23, 15001.13, 6200.01, 1450.02);
const readAll = () => Object.fromEntries(TABLES.map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()]));
const before = readAll();
db.close();

const childCode = `
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(process.argv[1]);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; BEGIN IMMEDIATE');
  db.prepare('UPDATE profiles SET display_name = ?').run('Uncommitted owner');
  db.prepare('UPDATE jobs SET annual_salary = ?').run(999999.99);
  db.exec('DELETE FROM ytd_snapshots');
  console.log(JSON.stringify({ ready: true, salary: db.prepare('SELECT annual_salary FROM jobs').get().annual_salary, snapshots: db.prepare('SELECT COUNT(*) AS count FROM ytd_snapshots').get().count }));
  setInterval(() => {}, 1000);
`;
let observed;
let childErrors = '';
const child = spawn(process.execPath, ['-e', childCode, path], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
const termination = await new Promise((resolve, reject) => {
  let output = '';
  const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Child did not reach its uncommitted write')); }, 10000);
  child.once('error', reject);
  child.stderr.on('data', data => { childErrors += data; });
  child.stdout.on('data', data => {
    output += data;
    if (!output.includes('\n') || observed) return;
    observed = JSON.parse(output.trim());
    child.kill('SIGKILL');
  });
  child.once('exit', (code, signal) => { clearTimeout(timeout); resolve({ code, signal }); });
});
assert.equal(observed?.ready, true, childErrors);
assert.equal(observed.salary, 999999.99);
assert.equal(observed.snapshots, 0);
assert.equal(termination.signal, 'SIGKILL');
db = new DatabaseSync(path);
db.exec('PRAGMA foreign_keys = ON');
assert.deepEqual(readAll(), before);
assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
db.close();
const evidence = { checkedAt: new Date().toISOString(), passed: true, node: process.version, sqlite: process.versions.sqlite, schemaVersion: SCHEMA_VERSION, tablesCompared: TABLES.length, disposableDatabase: path, observedBeforeTermination: observed, termination, unchangedAfterReopen: true, integrityCheck: 'ok', foreignKeyViolations: 0 };
writeFileSync(new URL('./local-interrupted-transaction.json', import.meta.url), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));

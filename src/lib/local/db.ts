import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, existsSync, writeFileSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { BOOLEAN_COLUMNS, JSON_COLUMNS, SCHEMA_SQL, SCHEMA_VERSION, TABLES, type Table } from './schema';
import { validateJsonFields } from './backup-shapes';

export type Row = Record<string, unknown>;
type Column = { name: string; type: string; notnull: number; dflt_value: unknown };
let connection: DatabaseSync | undefined;
let connectionPath: string | undefined;

export function dataDirectory() {
  return process.env.MULTIW2_DATA_DIR || join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'MultiW2');
}

export function database() {
  const directory = dataDirectory();
  const path = join(directory, 'multiw2.sqlite');
  if (connection && connectionPath === path) return connection;
  connection?.close();
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const existed = existsSync(path);
  const db = new DatabaseSync(path);
  try {
    db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    const version = Number(db.prepare('PRAGMA user_version').get()?.user_version ?? 0);
    if (version > SCHEMA_VERSION) throw new Error('This database was created by a newer MultiW2 version. Update the app before opening it.');
    if (version < SCHEMA_VERSION) {
      if (existed) {
        const backupPath = join(directory, `before-upgrade-${Date.now()}-${randomUUID()}.sqlite`);
        db.prepare('VACUUM INTO ?').run(backupPath);
      }
      db.exec('BEGIN IMMEDIATE');
      try {
        db.exec(SCHEMA_SQL);
        db.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
        db.prepare('INSERT INTO schema_migrations VALUES (?,?)').run(SCHEMA_VERSION, new Date().toISOString());
        db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}; COMMIT`);
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    }
    db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
    if (!db.prepare('SELECT id FROM profiles').get()) {
      db.prepare('INSERT INTO profiles (id, display_name) VALUES (?,?)').run(randomUUID(), 'Local profile');
    }
    connection = db;
    connectionPath = path;
    return db;
  } catch (error) { db.close(); throw error; }
}

export function closeDatabase() { connection?.close(); connection = undefined; connectionPath = undefined; }
function decode<T>(raw: Row): T {
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key,
    value != null && JSON_COLUMNS.has(key) && typeof value === 'string' ? JSON.parse(value)
      : BOOLEAN_COLUMNS.has(key) && value != null ? Boolean(value) : value])) as T;
}
export function rows<T = Row>(sql: string, ...params: SQLInputValue[]): T[] {
  return database().prepare(sql).all(...params).map(row => decode<T>(row));
}
export function row<T = Row>(sql: string, ...params: SQLInputValue[]): T | undefined {
  const found = database().prepare(sql).get(...params);
  return found ? decode<T>(found) : undefined;
}
export function profile<T = Row>(): T { return row<T>('SELECT * FROM profiles')!; }
export function profileId(): string { return profile<{ id: string }>().id; }
function columns(table: Table): Column[] { return database().prepare(`PRAGMA table_info(${table})`).all() as unknown as Column[]; }
function encoded(table: Table, data: Row): [string, SQLInputValue][] {
  if (!TABLES.includes(table)) throw new Error('Unknown table');
  const allowed = new Map(columns(table).map(column => [column.name, column]));
  return Object.entries(data).filter(([, value]) => value !== undefined).map(([key, value]) => {
    if (!allowed.has(key)) throw new Error(`Unknown field ${table}.${key}`);
    if (JSON_COLUMNS.has(key) && !(table === 'tax_scenarios' && key === 'tax_impact')) {
      return [key, value == null ? null : JSON.stringify(value)];
    }
    if (BOOLEAN_COLUMNS.has(key)) {
      if (typeof value !== 'boolean') throw new Error(`Expected boolean for ${key}`);
      return [key, Number(value)];
    }
    if (value != null && typeof value !== 'string' && typeof value !== 'number') throw new Error(`Invalid value for ${key}`);
    const column = allowed.get(key)!;
    if (value != null && column.type === 'TEXT' && typeof value !== 'string') throw new Error(`Expected text for ${key}`);
    if (value != null && ['REAL', 'INTEGER'].includes(column.type) && (typeof value !== 'number' || !Number.isFinite(value) || (column.type === 'INTEGER' && !Number.isSafeInteger(value)))) throw new Error(`Expected finite ${column.type.toLowerCase()} for ${key}`);
    return [key, value as SQLInputValue];
  });
}
export function insert<T = Row>(table: Table, fields: Row): T {
  const data = { id: randomUUID(), ...(table === 'profiles' ? {} : { user_id: profileId() }), ...fields };
  const values = encoded(table, data);
  const sql = `INSERT INTO ${table} (${values.map(([key]) => key).join(',')}) VALUES (${values.map(() => '?').join(',')}) RETURNING *`;
  return decode<T>(database().prepare(sql).get(...values.map(([, value]) => value))!);
}
export function update<T = Row>(table: Table, id: string, fields: Row): T | undefined {
  const data = { ...fields, ...(columns(table).some(c => c.name === 'updated_at') ? { updated_at: new Date().toISOString() } : {}) };
  const values = encoded(table, data);
  if (!values.length) return row<T>(`SELECT * FROM ${table} WHERE id = ?`, id);
  return row<T>(`UPDATE ${table} SET ${values.map(([key]) => `${key} = ?`).join(',')} WHERE id = ? RETURNING *`, ...values.map(([, value]) => value), id);
}
export function remove(table: Table, id: string) { database().prepare(`DELETE FROM ${table} WHERE id = ?`).run(id); }
export function transaction<T>(work: () => T): T {
  const db = database(); db.exec('BEGIN IMMEDIATE');
  try { const result = work(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function exportBackup() {
  return transaction(() => {
    const tables = Object.fromEntries(TABLES.map(table => [table, rows(`SELECT * FROM ${table} ORDER BY id`)])) as Record<Table, Row[]>;
    return { format: 'multiw2-local-backup', version: 1, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(),
      counts: Object.fromEntries(TABLES.map(table => [table, tables[table].length])), tables };
  });
}
export function safetyBackup(reason: string) {
  const directory = join(dataDirectory(), 'backups'); mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, `${reason}-${Date.now()}-${randomUUID()}.json`);
  const temp = `${path}.tmp`;
  writeFileSync(temp, JSON.stringify(exportBackup(), null, 2), { flag: 'wx', mode: 0o600, flush: true });
  renameSync(temp, path);
  return path;
}

const removedCloudFields: Record<string, string[]> = { profiles: ['subscription_status', 'subscription_id', 'subscription_current_period_end'], saved_calculations: ['share_token', 'share_expires_at'] };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dateFields = new Set(['paycheck_date', 'date_of_birth', 'received_date', 'data_freshness_date']);
export function restoreBackup(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected a complete MultiW2 backup object.');
  const backup = input as Row;
  const cloud = backup.format === 'multiw2-cloud-export';
  if ((!cloud && backup.format !== 'multiw2-local-backup') || backup.version !== 1 || backup.schemaVersion !== SCHEMA_VERSION) {
    throw new Error('Unsupported or incomplete backup. Use a version 1 full 11-table MultiW2 export; the old four-table account export cannot be restored.');
  }
  const tables = backup.tables as Record<Table, Row[]>;
  const counts = backup.counts as Record<Table, number>;
  if (!tables || !counts || Object.keys(tables).length !== TABLES.length || Object.keys(counts).length !== TABLES.length) throw new Error('Backup must contain all 11 tables and their counts.');
  for (const table of TABLES) {
    if (!Array.isArray(tables[table]) || !Number.isSafeInteger(counts[table]) || counts[table] !== tables[table].length) throw new Error(`Missing table or count mismatch: ${table}`);
    const info = columns(table);
    tables[table] = tables[table].map(record => {
      if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error(`Invalid ${table} record`);
      const data = { ...record };
      if (cloud) for (const field of removedCloudFields[table] || []) delete data[field];
      for (const column of info) {
        if (!(column.name in data) && (!cloud || column.notnull && column.dflt_value == null)) throw new Error(`Missing ${table}.${column.name}`);
      }
      for (const [key, value] of Object.entries(data)) {
        if (['id', 'user_id', 'job_id'].includes(key) && (typeof value !== 'string' || !uuid.test(value))) throw new Error(`Invalid ID: ${table}.${key}`);
        if (value != null && (key.endsWith('_at') || dateFields.has(key)) && (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))) throw new Error(`Invalid date: ${table}.${key}`);
        if (key.endsWith('_at') && value != null && (!/^\d{4}-\d{2}-\d{2}T/.test(String(value)) || new Date(String(value).slice(0, 10)).toISOString().slice(0, 10) !== String(value).slice(0, 10))) throw new Error(`Invalid timestamp: ${table}.${key}`);
        if (dateFields.has(key) && value != null && (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)) || new Date(String(value)).toISOString().slice(0, 10) !== value)) throw new Error(`Expected valid YYYY-MM-DD: ${table}.${key}`);
        if (JSON_COLUMNS.has(key) && value != null && !(table === 'tax_scenarios' && key === 'tax_impact') && typeof value !== 'object') throw new Error(`Invalid JSON data: ${table}.${key}`);
        if (['tags','job_ids','w2_entry_ids','snapshot_ids','workflow_card_order','hidden_workflow_cards','positive_signals','negative_signals'].includes(key) && value != null && (!Array.isArray(value) || value.some(item => typeof item !== 'string'))) throw new Error(`Invalid list: ${table}.${key}`);
        if (['job_ids','w2_entry_ids','snapshot_ids'].includes(key) && Array.isArray(value) && value.some(item => typeof item !== 'string' || !uuid.test(item))) throw new Error(`Invalid historical ID: ${table}.${key}`);
      }
      validateJsonFields(table, data);
      encoded(table, data);
      return data;
    });
  }
  if (tables.profiles.length !== 1) throw new Error('A local backup must contain exactly one profile.');
  const owner = tables.profiles[0].id;
  for (const table of TABLES.filter(table => table !== 'profiles')) {
    if (tables[table].some(record => record.user_id !== owner)) throw new Error(`Profile relationship mismatch in ${table}`);
  }
  const backupPath = safetyBackup('before-restore');
  transaction(() => {
    for (const table of [...TABLES].reverse()) database().exec(`DELETE FROM ${table}`);
    for (const table of TABLES) for (const record of tables[table]) insert(table, record);
    if (database().prepare('PRAGMA foreign_key_check').all().length) throw new Error('Backup has invalid relationships.');
    for (const table of TABLES) if (Number(row<{ count: number }>(`SELECT count(*) AS count FROM ${table}`)!.count) !== counts[table]) throw new Error(`Restore count mismatch: ${table}`);
  });
  return { success: true, counts, backupPath };
}

export function resetLocalData() {
  const backupPath = safetyBackup('before-reset');
  transaction(() => {
    for (const table of [...TABLES].reverse()) database().exec(`DELETE FROM ${table}`);
    insert('profiles', { display_name: 'Local profile' });
  });
  return { success: true, backupPath };
}

# Local data transfer

Use Settings → Backup to download every retained table. Settings → Restore accepts that JSON file after typing RESTORE. A successful restore replaces the local profile and records, preserving original IDs. It never changes the source cloud account.

Before every restore/reset, a complete JSON backup is written under `%LOCALAPPDATA%\\MultiW2\\backups` (or `MULTIW2_DATA_DIR\\backups` for a custom data directory). Database schema upgrades make a separate SQLite copy before changing the schema. Do not delete these files until your restored data is verified. Store backup files securely: they contain personal and financial data.

## Format

The version 1 envelope contains `format`, `version: 1`, `schemaVersion: 1`, `exportedAt`, `counts`, and `tables`. Each table name occurs exactly once in both `counts` and `tables`; each table is an array of snake_case database records. Empty tables are empty arrays with count 0. The required tables are:

- `profiles`
- `tax_profiles`
- `dependents`
- `jobs`
- `ytd_snapshots`
- `job_w2_entries`
- `saved_calculations`
- `employer_benefits`
- `tax_scenarios`
- `tax_prep_documents`
- `job_postings`

Local exports use `format: "multiw2-local-backup"`. One-time full cloud exports use `format: "multiw2-cloud-export"`. A backup must have exactly one profile. All `user_id` values must match that profile; child job foreign keys and unique job/year and profile/year constraints must hold. Records, dates, JSON shapes, and table counts are validated; malformed or unsupported files roll back without replacing existing data. Monetary values round-trip as JSON numbers without integer truncation or forced rounding. Settings, nullable values, JSON, timestamps, W-2 correction versions, and job soft-deletion status are preserved.

Saved-calculation lineage arrays (`job_ids`, `snapshot_ids`, `w2_entry_ids`) remain historical references: they may contain IDs previously deleted in the source account. They are retained rather than rejected or silently removed. SQL child foreign keys must still point to retained job rows. Scanner history accepts both old dimension objects and newer dimension arrays; its display maps the older format.

## Copy existing cloud data once

The old Account export contains only four tables. It is incomplete and is rejected; use the following read-only SQL in your existing project's SQL editor. Replace the placeholder with your own profile UUID. Copy the single `backup` JSON value into a UTF-8 `.json` file (not the SQL-editor CSV wrapper), then select it in local Settings → Restore. This desktop app never connects to Supabase or requests its credentials.

Cloud-only subscription fields on profiles and hosted share-token fields on saved calculations are intentionally omitted during import. Billing, admin, webhook, and cloud token tables are not part of this format. Missing optional new Box 3/5 fields default to null. Unknown fields otherwise fail validation instead of being silently discarded.

```sql
-- Replace the UUID with your own profile ID. This query only reads data.
WITH owner AS (SELECT 'REPLACE-WITH-YOUR-PROFILE-UUID'::uuid AS id),
exported AS (
  SELECT jsonb_build_object(
    'profiles', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.profiles t WHERE t.id = (SELECT id FROM owner)), '[]'::jsonb),
    'tax_profiles', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.tax_profiles t WHERE t.user_id = (SELECT id FROM owner)), '[]'::jsonb),
    'dependents', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.dependents t WHERE t.user_id = (SELECT id FROM owner)), '[]'::jsonb),
    'jobs', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.jobs t WHERE t.user_id = (SELECT id FROM owner)), '[]'::jsonb),
    'ytd_snapshots', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.ytd_snapshots t WHERE t.user_id = (SELECT id FROM owner)), '[]'::jsonb),
    'job_w2_entries', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.job_w2_entries t WHERE t.user_id = (SELECT id FROM owner)), '[]'::jsonb),
    'saved_calculations', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.saved_calculations t WHERE t.user_id = (SELECT id FROM owner)), '[]'::jsonb),
    'employer_benefits', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.employer_benefits t WHERE t.user_id = (SELECT id FROM owner)), '[]'::jsonb),
    'tax_scenarios', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.tax_scenarios t WHERE t.user_id = (SELECT id FROM owner)), '[]'::jsonb),
    'tax_prep_documents', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.tax_prep_documents t WHERE t.user_id = (SELECT id FROM owner)), '[]'::jsonb),
    'job_postings', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.job_postings t WHERE t.user_id = (SELECT id FROM owner)), '[]'::jsonb)
  ) AS tables
)
SELECT jsonb_build_object(
  'format', 'multiw2-cloud-export', 'version', 1, 'schemaVersion', 1,
  'exportedAt', now(), 'tables', tables,
  'counts', (SELECT jsonb_object_agg(key, jsonb_array_length(value)) FROM jsonb_each(tables))
) AS backup
FROM exported;
```

For automated local API clients, `GET /api/backup` returns the envelope directly. `POST /api/backup` accepts `{ "confirmation": "RESTORE", "backup": <envelope> }` and returns `{ success, counts, backupPath }`. `DELETE /api/account/delete` accepts `{ "confirmation": "DELETE" }` and resets to one fresh local profile only after writing a safety backup. All API access requires the desktop session and local Host/Origin checks.

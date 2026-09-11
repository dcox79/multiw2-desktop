export const TABLES = ['profiles', 'tax_profiles', 'dependents', 'jobs', 'ytd_snapshots', 'job_w2_entries', 'saved_calculations', 'employer_benefits', 'tax_scenarios', 'tax_prep_documents', 'job_postings'] as const;
export type Table = typeof TABLES[number];
export const BOOLEAN_COLUMNS = new Set(['use_standard_deduction', 'notify_stale_data', 'notify_quarterly_reminders', 'notify_product_updates', 'notify_tax_law_changes', 'notify_quarterly_estimator', 'is_full_time_student', 'is_disabled', 'started_this_year', 'is_active', 'is_draft', 'has_mega_backdoor_roth', 'is_baseline']);
export const JSON_COLUMNS = new Set(['workflow_card_order', 'hidden_workflow_cards', 'last_optimization_result', 'input_data', 'result_data', 'tags', 'job_ids', 'w2_entry_ids', 'snapshot_ids', 'base_input', 'modifications', 'dimension_scores', 'positive_signals', 'negative_signals', 'tax_impact']);
const timestamps = "created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))";
const owner = 'user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE';
const taxFields = `filing_status TEXT CHECK(filing_status IN ('single','married_filing_jointly','married_filing_separately','head_of_household')),
 dependents INTEGER NOT NULL DEFAULT 0 CHECK(dependents >= 0), child_tax_credit_eligible INTEGER NOT NULL DEFAULT 0 CHECK(child_tax_credit_eligible >= 0),
 use_standard_deduction INTEGER NOT NULL DEFAULT 1 CHECK(use_standard_deduction IN (0,1)), itemized_deduction_amount REAL NOT NULL DEFAULT 0 CHECK(itemized_deduction_amount >= 0),
 estimated_payment_q1 REAL NOT NULL DEFAULT 0 CHECK(estimated_payment_q1 >= 0), estimated_payment_q2 REAL NOT NULL DEFAULT 0 CHECK(estimated_payment_q2 >= 0),
 estimated_payment_q3 REAL NOT NULL DEFAULT 0 CHECK(estimated_payment_q3 >= 0), estimated_payment_q4 REAL NOT NULL DEFAULT 0 CHECK(estimated_payment_q4 >= 0)`;

export const SCHEMA_VERSION = 1;
export const SCHEMA_SQL = `
CREATE TABLE profiles (id TEXT PRIMARY KEY NOT NULL, email TEXT NOT NULL DEFAULT '', display_name TEXT, ${taxFields},
 workflow_card_order TEXT, hidden_workflow_cards TEXT, last_optimization_result TEXT,
 theme_preference TEXT NOT NULL DEFAULT 'system' CHECK(theme_preference IN ('system','light','dark')),
 notify_stale_data INTEGER NOT NULL DEFAULT 1 CHECK(notify_stale_data IN (0,1)),
 notify_quarterly_reminders INTEGER NOT NULL DEFAULT 1 CHECK(notify_quarterly_reminders IN (0,1)),
 notify_product_updates INTEGER NOT NULL DEFAULT 0 CHECK(notify_product_updates IN (0,1)),
 notify_tax_law_changes INTEGER NOT NULL DEFAULT 1 CHECK(notify_tax_law_changes IN (0,1)),
 notify_quarterly_estimator INTEGER NOT NULL DEFAULT 1 CHECK(notify_quarterly_estimator IN (0,1)), last_stale_alert_at TEXT, ${timestamps});
CREATE UNIQUE INDEX one_local_profile ON profiles ((1));
CREATE TABLE tax_profiles (id TEXT PRIMARY KEY NOT NULL, ${owner}, tax_year INTEGER NOT NULL CHECK(tax_year BETWEEN 1900 AND 2200), ${taxFields}, imported_from_year INTEGER, ${timestamps}, UNIQUE(user_id,tax_year));
CREATE TABLE dependents (id TEXT PRIMARY KEY NOT NULL, ${owner}, first_name TEXT NOT NULL,
 relationship TEXT NOT NULL CHECK(relationship IN ('child','stepchild','foster_child','sibling','parent','other')), date_of_birth TEXT NOT NULL,
 is_full_time_student INTEGER NOT NULL DEFAULT 0 CHECK(is_full_time_student IN (0,1)), is_disabled INTEGER NOT NULL DEFAULT 0 CHECK(is_disabled IN (0,1)), ${timestamps});
CREATE TABLE jobs (id TEXT PRIMARY KEY NOT NULL, ${owner}, name TEXT NOT NULL, annual_salary REAL NOT NULL CHECK(annual_salary >= 0),
 income_source TEXT NOT NULL CHECK(income_source IN ('w2','paystub')), pay_frequency TEXT NOT NULL CHECK(pay_frequency IN ('weekly','biweekly','semimonthly','monthly')),
 start_month INTEGER CHECK(start_month BETWEEN 1 AND 12), started_this_year INTEGER NOT NULL DEFAULT 0 CHECK(started_this_year IN (0,1)),
 is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)), is_draft INTEGER NOT NULL DEFAULT 0 CHECK(is_draft IN (0,1)),
 employment_status TEXT NOT NULL DEFAULT 'active' CHECK(employment_status IN ('active','former','deleted')),
 extra_withholding_per_paycheck REAL NOT NULL DEFAULT 0 CHECK(extra_withholding_per_paycheck >= 0), ${timestamps});
CREATE TABLE ytd_snapshots (id TEXT PRIMARY KEY NOT NULL, ${owner}, job_id TEXT NOT NULL REFERENCES jobs(id), paycheck_date TEXT NOT NULL,
 ytd_gross REAL NOT NULL CHECK(ytd_gross >= 0), ytd_federal_withheld REAL NOT NULL CHECK(ytd_federal_withheld >= 0),
 ytd_ss_withheld REAL NOT NULL CHECK(ytd_ss_withheld >= 0), ytd_medicare_withheld REAL NOT NULL CHECK(ytd_medicare_withheld >= 0),
 ytd_traditional_401k REAL CHECK(ytd_traditional_401k >= 0), ytd_roth_401k REAL CHECK(ytd_roth_401k >= 0), ytd_hsa REAL CHECK(ytd_hsa >= 0),
 notes TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE INDEX snapshots_date ON ytd_snapshots(paycheck_date DESC, created_at DESC);
CREATE TABLE job_w2_entries (id TEXT PRIMARY KEY NOT NULL, ${owner}, job_id TEXT NOT NULL REFERENCES jobs(id), tax_year INTEGER NOT NULL CHECK(tax_year BETWEEN 1900 AND 2200),
 box1_wages REAL NOT NULL CHECK(box1_wages >= 0), box2_federal_withheld REAL NOT NULL CHECK(box2_federal_withheld >= 0),
 box3_ss_wages REAL CHECK(box3_ss_wages >= 0), box4_ss_withheld REAL NOT NULL CHECK(box4_ss_withheld >= 0), box5_medicare_wages REAL CHECK(box5_medicare_wages >= 0), box6_medicare_withheld REAL NOT NULL CHECK(box6_medicare_withheld >= 0),
 box12_code_d REAL CHECK(box12_code_d >= 0), box12_code_aa REAL CHECK(box12_code_aa >= 0), box12_code_w REAL CHECK(box12_code_w >= 0),
 box12_code_c REAL CHECK(box12_code_c >= 0), box12_code_dd REAL CHECK(box12_code_dd >= 0), box12_code_v REAL CHECK(box12_code_v >= 0),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1), correction_note TEXT, ${timestamps}, UNIQUE(job_id,tax_year));
CREATE TABLE saved_calculations (id TEXT PRIMARY KEY NOT NULL, ${owner}, name TEXT NOT NULL, input_data TEXT NOT NULL CHECK(json_valid(input_data)), result_data TEXT CHECK(result_data IS NULL OR json_valid(result_data)),
 is_draft INTEGER NOT NULL DEFAULT 0 CHECK(is_draft IN (0,1)), source TEXT NOT NULL DEFAULT 'calculator' CHECK(source IN ('calculator','scenario','import')),
 tags TEXT NOT NULL DEFAULT '[]', job_ids TEXT, w2_entry_ids TEXT, snapshot_ids TEXT,
 calculation_basis TEXT CHECK(calculation_basis IN ('manual','ytd_only','w2_and_ytd')), data_freshness_date TEXT, ${timestamps});
CREATE TABLE employer_benefits (id TEXT PRIMARY KEY NOT NULL, ${owner}, job_id TEXT NOT NULL REFERENCES jobs(id), job_name TEXT NOT NULL,
 match_type TEXT NOT NULL CHECK(match_type IN ('percentage','dollar')), match_percent REAL NOT NULL DEFAULT 0 CHECK(match_percent >= 0),
 match_cap_percent REAL NOT NULL DEFAULT 0 CHECK(match_cap_percent >= 0), match_cap_dollar REAL NOT NULL DEFAULT 0 CHECK(match_cap_dollar >= 0),
 employer_hsa_contribution REAL NOT NULL DEFAULT 0 CHECK(employer_hsa_contribution >= 0), has_mega_backdoor_roth INTEGER NOT NULL DEFAULT 0 CHECK(has_mega_backdoor_roth IN (0,1)),
 vesting_schedule TEXT, health_premium_monthly REAL NOT NULL DEFAULT 0 CHECK(health_premium_monthly >= 0),
 dental_premium_monthly REAL NOT NULL DEFAULT 0 CHECK(dental_premium_monthly >= 0), vision_premium_monthly REAL NOT NULL DEFAULT 0 CHECK(vision_premium_monthly >= 0),
 is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)), deactivated_at TEXT, notes TEXT, ${timestamps});
CREATE TABLE tax_scenarios (id TEXT PRIMARY KEY NOT NULL, ${owner}, name TEXT NOT NULL, is_baseline INTEGER NOT NULL DEFAULT 0 CHECK(is_baseline IN (0,1)),
 base_input TEXT NOT NULL CHECK(json_valid(base_input)), modification_type TEXT NOT NULL CHECK(modification_type IN ('quit_job','add_job','salary_change','filing_status_change','add_1099','custom','saved_calculation')),
 modifications TEXT NOT NULL CHECK(json_valid(modifications)), result_data TEXT CHECK(result_data IS NULL OR json_valid(result_data)), tax_impact REAL, ${timestamps});
CREATE TABLE tax_prep_documents (id TEXT PRIMARY KEY NOT NULL, ${owner}, tax_year INTEGER NOT NULL CHECK(tax_year BETWEEN 1900 AND 2200), document_type TEXT NOT NULL, document_name TEXT NOT NULL,
 employer_name TEXT, status TEXT NOT NULL DEFAULT 'needed' CHECK(status IN ('needed','received','verified')), received_date TEXT, amount REAL, notes TEXT, ${timestamps});
CREATE TABLE job_postings (id TEXT PRIMARY KEY NOT NULL, ${owner}, job_title TEXT NOT NULL, company_name TEXT, posting_url TEXT, posting_text TEXT NOT NULL,
 estimated_salary REAL, overall_score INTEGER, recommendation TEXT CHECK(recommendation IN ('excellent','good','fair','marginal','poor')),
 dimension_scores TEXT, positive_signals TEXT, negative_signals TEXT, tax_impact TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
`;

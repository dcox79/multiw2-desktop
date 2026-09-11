// ============================================
// INPUT TYPES
// ============================================

export type FilingStatus = 'single' | 'married_filing_jointly' | 'married_filing_separately' | 'head_of_household';

export interface JobInput {
  id: string;
  name: string;
  incomeSource: 'w2' | 'paystub';
  annualSalary: number;
  socialSecurityWages?: number;
  medicareWages?: number;
  federalWithholdingYTD: number;
  socialSecurityWithholdingYTD: number;
  medicareWithholdingYTD: number;
  traditional401k?: number;
  roth401k?: number;
  hsaContributions?: number;
  groupTermLife?: number;
  employerHealthCoverage?: number;
  stockOptionIncome?: number;
  payFrequency: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';
  startMonth: number;
  extraWithholdingPerPaycheck?: number;
}

export interface CalculationInput {
  taxYear?: number; // Legacy saved inputs without a year use the reviewed 2026 tables.
  selfEmploymentDeduction?: number;
  jobs: JobInput[];
  filingStatus: FilingStatus;
  standardDeduction: boolean;
  itemizedDeductions?: number;
  estimatedPaymentsYTD: number;
  dependents: number;
  childTaxCreditEligible: number;
  otherDependentsEligible: number;
}

// ============================================
// DEPENDENT TYPES
// ============================================

export interface Dependent {
  id: string;
  userId: string;
  firstName: string;
  relationship: 'child' | 'stepchild' | 'foster_child' | 'sibling' | 'parent' | 'other';
  dateOfBirth: string;
  isFullTimeStudent: boolean;
  isDisabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// DATABASE ENTITY TYPES (v2)
// ============================================

export type EmploymentStatus = 'active' | 'former' | 'deleted';

export interface Job {
  id: string;
  user_id: string;
  name: string;
  annual_salary: number;
  income_source: 'w2' | 'paystub';
  pay_frequency: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';
  start_month: number | null;
  started_this_year: boolean;
  is_active: boolean;
  is_draft: boolean;
  employment_status: EmploymentStatus;
  extra_withholding_per_paycheck: number;
  created_at: string;
  updated_at: string;
}

export interface YTDSnapshot {
  id: string;
  user_id: string;
  job_id: string;
  paycheck_date: string;
  ytd_gross: number;
  ytd_federal_withheld: number;
  ytd_ss_withheld: number;
  ytd_medicare_withheld: number;
  ytd_traditional_401k: number | null;
  ytd_roth_401k: number | null;
  ytd_hsa: number | null;
  notes: string | null;
  created_at: string;
}

export interface JobW2Entry {
  id: string;
  user_id: string;
  job_id: string;
  tax_year: number;
  box1_wages: number;
  box2_federal_withheld: number;
  box3_ss_wages?: number | null;
  box5_medicare_wages?: number | null;
  box4_ss_withheld: number;
  box6_medicare_withheld: number;
  box12_code_d: number | null;
  box12_code_aa: number | null;
  box12_code_w: number | null;
  box12_code_c: number | null;
  box12_code_dd: number | null;
  box12_code_v: number | null;
  version: number;
  correction_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  filing_status: FilingStatus | null;
  dependents: number;
  child_tax_credit_eligible: number;
  use_standard_deduction: boolean;
  itemized_deduction_amount: number;
  estimated_payment_q1: number;
  estimated_payment_q2: number;
  estimated_payment_q3: number;
  estimated_payment_q4: number;
  workflow_card_order: string[] | null;
  hidden_workflow_cards: string[] | null;
  last_optimization_result: BenefitsOptimizationResult & { _customTarget?: number; _jobWeights?: Record<string, number> } | null;
  theme_preference: 'system' | 'light' | 'dark';
  created_at: string;
  updated_at: string;
}

// ============================================
// TAX PROFILES (year-specific)
// ============================================

export interface TaxProfile {
  id: string;
  user_id: string;
  tax_year: number;
  filing_status: FilingStatus | null;
  dependents: number;
  child_tax_credit_eligible: number;
  use_standard_deduction: boolean;
  itemized_deduction_amount: number;
  estimated_payment_q1: number;
  estimated_payment_q2: number;
  estimated_payment_q3: number;
  estimated_payment_q4: number;
  imported_from_year: number | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// CALCULATE API (v2 — server-side assembly)
// ============================================

export interface CalculateRequest {
  jobIds: string[];
  filingStatus?: FilingStatus;
  dependents?: number;
  childTaxCreditEligible?: number;
  otherDependentsEligible?: number;
  useStandardDeduction?: boolean;
  itemizedDeductions?: number;
  estimatedPaymentsYTD?: number;
  taxYear?: number;
}

export interface ApproximateRange {
  min: number;
  max: number;
}

// ============================================
// RESULT TYPES
// ============================================

export interface TaxBracketBreakdown {
  rate: number;
  rangeStart: number;
  rangeEnd: number;
  taxableInBracket: number;
  taxInBracket: number;
}

export interface FederalTaxResult {
  totalIncome: number;
  adjustedGrossIncome: number;
  taxableIncome: number;
  totalFederalTax: number;
  effectiveRate: number;
  marginalRate: number;
  bracketBreakdown: TaxBracketBreakdown[];
  totalWithheld: number;
  withholdingGap: number;
  childTaxCredit: number;
  otherDependentsCredit: number;
  estimatedPaymentsYTD: number;
  remainingBalance: number;
}

export interface SSOverpaymentResult {
  wageBase: number;
  ssRate: number;
  combinedWages: number;
  maxSSPerPerson: number;
  perJobSS: Array<{
    jobId: string;
    jobName: string;
    salary: number;
    ssWithheld: number;
    monthCapReached: number | null;
  }>;
  totalSSWithheld: number;
  overpayment: number;
  creditAtFiling: number;
  monthlyTimeline: Array<{
    month: number;
    cumulativeWages: number;
    cumulativeSS: number;
    overpaymentToDate: number;
  }>;
}

export interface W4Adjustment {
  jobId: string;
  jobName: string;
  currentWithholdingPerPaycheck: number;
  recommendedExtraWithholding: number;
  revisedWithholdingPerPaycheck: number;
  annualImpact: number;
  explanation: string;
}

export interface W4Result {
  adjustments: W4Adjustment[];
  totalCurrentAnnualWithholding: number;
  totalRevisedAnnualWithholding: number;
  remainingGapAfterAdjustment: number;
}

export interface MedicareTaxResult {
  regularMedicareTax: number;
  additionalMedicareTax: number;
  totalMedicareLiability: number;
  totalMedicareWithheld: number;
  medicareGap: number;
  additionalMedicareThreshold: number;
  wagesAboveThreshold: number;
  perJobMedicare: Array<{
    jobName: string;
    wages: number;
    regularWithheld: number;
    additionalWithheld: number;
  }>;
}

export interface RetirementLimitResult {
  limit401k: number;
  limitHSA: number;
  hsaCoverageType: 'individual' | 'family';
  perJob401k: Array<{
    jobId: string;
    jobName: string;
    traditional: number;
    roth: number;
    contribution: number;
  }>;
  total401kContributions: number;
  remaining401k: number;
  isOver401k: boolean;
  perJobHSA: Array<{
    jobId: string;
    jobName: string;
    contribution: number;
  }>;
  totalHSAContributions: number;
  remainingHSA: number;
  isOverHSA: boolean;
  warnings: string[];
  recommendation: string;
}

export interface QuarterlyEstimate {
  quarter: 1 | 2 | 3 | 4;
  dueDate: string;
  amount: number;
  isPast: boolean;
  paidAmount: number;
}

export interface QuarterlyEstimateResult {
  totalAnnualTax: number;
  totalWithholdingProjected: number;
  safeHarborAmount: number;
  requiredAnnualEstimate: number;
  quarterlyPayments: QuarterlyEstimate[];
  penaltyRisk: boolean;
  penaltyExplanation: string;
}

export interface CalculationResult {
  id?: string;
  timestamp: string;
  input: CalculationInput;
  federal: FederalTaxResult;
  socialSecurity: SSOverpaymentResult;
  medicare: MedicareTaxResult;
  w4: W4Result;
  retirement: RetirementLimitResult;
  quarterly: QuarterlyEstimateResult;
  isApproximate: boolean;
  liabilityRange?: ApproximateRange;
  effectiveRateRange?: ApproximateRange;
  safeHarbor?: SafeHarborResult;
  metadata?: {
    jobIds: string[];
    snapshotIds: string[];
    w2EntryIds: string[];
    calculationBasis: 'manual' | 'ytd_only' | 'w2_and_ytd';
    dataFreshnessDate: string;
  };
}

// ============================================
// DB / APP TYPES
// ============================================

export interface SavedCalculation {
  id: string;
  name: string;
  inputData: CalculationInput;
  resultData: CalculationResult | null;
  isDraft: boolean;
  source: 'calculator' | 'scenario' | 'import';
  tags: string[];
  jobIds: string[];
  w2EntryIds: string[];
  snapshotIds: string[];
  calculationBasis: 'manual' | 'ytd_only' | 'w2_and_ytd';
  dataFreshnessDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SaveCalculationRequest {
  name: string;
  input: CalculationInput;
  result: CalculationResult | null;
  isDraft?: boolean;
  source?: 'calculator' | 'scenario' | 'import';
}

// ============================================
// COMMAND CENTER TYPES
// ============================================

// --- PAY PERIOD TRACKER ---

export interface Paycheck {
  id: string;
  userId: string;
  jobId: string;
  jobName: string;
  paycheckDate: string;
  grossAmount: number;
  federalWithheld: number;
  ssWithheld: number;
  medicareWithheld: number;
  traditional401k: number;
  roth401k: number;
  hsaContribution: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PayPeriodSummary {
  jobId: string;
  jobName: string;
  paycheckCount: number;
  ytdGross: number;
  ytdFederalWithheld: number;
  ytdSSWithheld: number;
  ytdMedicareWithheld: number;
  ytd401k: number;
  ytdHSA: number;
  averageGrossPerPaycheck: number;
  projectedAnnualGross: number;
  projectedAnnualFederalWithheld: number;
}

export interface PayPeriodTrackerResult {
  perJobSummary: PayPeriodSummary[];
  totalYTDGross: number;
  totalYTDFederalWithheld: number;
  totalYTDSSWithheld: number;
  projectedAnnualIncome: number;
  projectedWithholdingGap: number;
  projectedSSOverpayment: number;
  lastPaycheckDate: string | null;
}

// --- BENEFITS OPTIMIZER ---

export interface EmployerBenefitPlan {
  id: string;
  userId: string;
  jobId: string;
  jobName: string;
  matchType: "percentage" | "dollar";
  matchPercent: number;
  matchCapPercent: number;
  matchCapDollar: number;
  employerHSAContribution: number;
  hasMegaBackdoorRoth: boolean;
  vestingSchedule?: string;
  healthPremiumMonthly: number;
  dentalPremiumMonthly: number;
  visionPremiumMonthly: number;
  isActive: boolean;
  deactivatedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BenefitsAllocation {
  jobId: string;
  jobName: string;
  recommended401kContribution: number;
  employerMatchAmount: number;
  recommendedHSAContribution: number;
  totalBenefitValue: number;
  annualSalary: number;
  matchContribution: number; // minimum contribution to max employer match (locked, non-redistributable)
}

export interface BenefitsOptimizationResult {
  allocations: BenefitsAllocation[];
  total401kContributions: number;
  totalEmployerMatch: number;
  totalHSAContributions: number;
  estimatedTaxSavings: number;
  overlapWarnings: string[];
  recommendations: string[];
  summary: string;
}

// --- TAX SCENARIO MODELER ---

export type ScenarioModificationType =
  | "quit_job"
  | "add_job"
  | "salary_change"
  | "filing_status_change"
  | "add_1099"
  | "custom"
  | "saved_calculation";

export interface ScenarioModification {
  type: ScenarioModificationType;
  jobIdToRemove?: string;
  quitMonth?: number;
  jobToAdd?: Partial<JobInput>;
  startMonth?: number;
  jobIdForRaise?: string;
  newSalary?: number;
  effectiveMonth?: number;
  newFilingStatus?: FilingStatus;
  income1099?: number;
  description?: string;
}

export interface TaxScenario {
  id: string;
  userId: string;
  name: string;
  isBaseline: boolean;
  baseInput: CalculationInput;
  modificationType: ScenarioModificationType;
  modifications: ScenarioModification;
  resultData: {
    baseResult: CalculationResult;
    modifiedResult: CalculationResult;
  } | null;
  taxImpact: number | null;
  createdAt: string;
  updatedAt: string;
}

// --- YEAR-END TAX PREP KIT ---

export interface TaxPrepDocument {
  id: string;
  userId: string;
  taxYear: number;
  documentType: string;
  documentName: string;
  employerName?: string;
  status: "needed" | "received" | "verified";
  receivedDate?: string;
  amount?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SafeHarborResult {
  isSafeHarbor: boolean;
  thresholdPercent: number;
  thresholdAmount: number;
  amountPaidToDate: number;
  shortfall: number;
  recommendation: string;
}

export interface FilingStrategyRecommendation {
  recommendedStatus: "mfj" | "mfs" | "single" | "hoh";
  taxUnderMFJ?: number;
  taxUnderMFS?: number;
  savingsAmount: number;
  summary: string;
  mfjEffectiveRate?: number;
  mfsEffectiveRate?: number;
  mfjDeduction?: number;
  mfsDeduction?: number;
}

export interface TaxPrepKit {
  id: string;
  userId: string;
  taxYear: number;
  documents: TaxPrepDocument[];
  safeHarborStatus: SafeHarborResult | null;
  filingStrategy: FilingStrategyRecommendation | null;
  estimatedRefund: number | null;
  priorYearTaxAmount: number | null;
  createdAt: string;
  updatedAt: string;
}

// --- OE JOB COMPATIBILITY SCANNER ---

export interface OEScannerInput {
  postingText: string;
  jobTitle: string;
  companyName?: string;
  postingUrl?: string;
  estimatedSalary?: number;
}

export interface OEDimensionScore {
  dimension: string;
  score: number;
  weight: number;
  reasoning: string;
  positiveKeywords: string[];
  negativeKeywords: string[];
}

export interface OECompatibilityResult {
  id: string;
  userId: string;
  overallScore: number;
  recommendation: "excellent" | "good" | "marginal" | "poor";
  dimensionScores: {
    meetingCulture: OEDimensionScore;
    workStructure: OEDimensionScore;
    companyMaturity: OEDimensionScore;
    asyncCulture: OEDimensionScore;
    roleType: OEDimensionScore;
    remotePolicy: OEDimensionScore;
  };
  positiveSignals: string[];
  negativeSignals: string[];
  jobTitle: string;
  companyName?: string;
  postingUrl?: string;
  estimatedSalary?: number;
  taxImpactEstimate?: number;
  createdAt: string;
}

// --- JOB SCANNER (v2) ---

export interface JobScanRequest {
  url?: string;
  rawText?: string;
  jobTitle?: string;
}

export interface JobScanDimension {
  name: string;
  score: number;
  rating: 'excellent' | 'good' | 'fair' | 'poor';
  summary: string;
  details: string[];
}

export interface JobScanTaxImpact {
  newProjectedFederalTax: number;
  newProjectedWithholdingGap: number;
  additionalSSOverpayment: number;
  additionalMedicareExposure: number;
  marginalRate: number;
}

export interface ScannerCredits {
  used: number;
  limit: number | null; // null = no quota
  webEnrichment: boolean;
}

export interface JobScanResult {
  id: string;
  jobTitle: string;
  company: string;
  estimatedSalary: number | null;
  location: string | null;
  dimensions: JobScanDimension[];
  overallScore: number;
  overallRating: 'excellent' | 'good' | 'fair' | 'poor';
  recommendation: string;
  taxImpact: JobScanTaxImpact;
  webEnriched?: boolean;
  createdAt: string;
}

// --- DASHBOARD WIDGET PROPS ---

export interface DashboardWidgetProps {
  className?: string;
}

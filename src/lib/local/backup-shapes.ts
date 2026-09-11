import { z } from 'zod';
import type { Table } from './schema';

const n = z.number();
const s = z.string();
const strings = z.array(s);
const filing = z.enum(['single','married_filing_jointly','married_filing_separately','head_of_household']);
const job = z.object({ id: s, name: s, incomeSource: z.enum(['w2','paystub']), annualSalary: n.nonnegative(), federalWithholdingYTD: n.nonnegative(), socialSecurityWithholdingYTD: n.nonnegative(), medicareWithholdingYTD: n.nonnegative(), payFrequency: z.enum(['weekly','biweekly','semimonthly','monthly']), startMonth: n.int().min(1).max(12), traditional401k: n.nonnegative().optional(), roth401k: n.nonnegative().optional(), hsaContributions: n.nonnegative().optional(), socialSecurityWages: n.nonnegative().optional(), medicareWages: n.nonnegative().optional() }).passthrough();
export const calculationInputShape = z.object({ jobs: z.array(job), filingStatus: filing, standardDeduction: z.boolean(), itemizedDeductions: n.nonnegative().optional(), estimatedPaymentsYTD: n.nonnegative(), dependents: n.int().nonnegative(), childTaxCreditEligible: n.int().nonnegative(), otherDependentsEligible: n.int().nonnegative(), taxYear: n.int().optional() }).passthrough();
const bracket = z.object({ rate: n, rangeStart: n, rangeEnd: n.nullable(), taxableInBracket: n, taxInBracket: n }).passthrough();
const federal = z.object({ totalIncome: n, adjustedGrossIncome: n, taxableIncome: n, totalFederalTax: n, effectiveRate: n, marginalRate: n, bracketBreakdown: z.array(bracket), totalWithheld: n, withholdingGap: n, childTaxCredit: n, otherDependentsCredit: n, estimatedPaymentsYTD: n, remainingBalance: n }).passthrough();
const socialSecurity = z.object({ wageBase: n, ssRate: n, combinedWages: n, maxSSPerPerson: n, perJobSS: z.array(z.object({ jobId: s, jobName: s, salary: n, ssWithheld: n, monthCapReached: n.nullable() }).passthrough()), totalSSWithheld: n, overpayment: n, creditAtFiling: n, monthlyTimeline: z.array(z.object({ month: n, cumulativeWages: n, cumulativeSS: n, overpaymentToDate: n }).passthrough()) }).passthrough();
const medicare = z.object({ regularMedicareTax: n, additionalMedicareTax: n, totalMedicareLiability: n, totalMedicareWithheld: n, medicareGap: n, additionalMedicareThreshold: n, wagesAboveThreshold: n, perJobMedicare: z.array(z.object({ jobName: s, wages: n, regularWithheld: n, additionalWithheld: n }).passthrough()) }).passthrough();
const w4 = z.object({ adjustments: z.array(z.object({ jobId: s, jobName: s, currentWithholdingPerPaycheck: n, recommendedExtraWithholding: n, revisedWithholdingPerPaycheck: n, annualImpact: n, explanation: s }).passthrough()), totalCurrentAnnualWithholding: n, totalRevisedAnnualWithholding: n, remainingGapAfterAdjustment: n }).passthrough();
const retirement = z.object({ limit401k: n, limitHSA: n, hsaCoverageType: z.enum(['individual','family']), perJob401k: z.array(z.object({ jobId: s, jobName: s, traditional: n, roth: n, contribution: n }).passthrough()), total401kContributions: n, remaining401k: n, isOver401k: z.boolean(), perJobHSA: z.array(z.object({ jobId: s, jobName: s, contribution: n }).passthrough()), totalHSAContributions: n, remainingHSA: n, isOverHSA: z.boolean(), warnings: strings, recommendation: s }).passthrough();
const quarterly = z.object({ totalAnnualTax: n, totalWithholdingProjected: n, safeHarborAmount: n, requiredAnnualEstimate: n, quarterlyPayments: z.array(z.object({ quarter: n.int().min(1).max(4), dueDate: s, amount: n, isPast: z.boolean(), paidAmount: n }).passthrough()), penaltyRisk: z.boolean(), penaltyExplanation: s }).passthrough();
const range = z.object({ min: n, max: n });
const safeHarbor = z.object({ isSafeHarbor: z.boolean(), thresholdPercent: n, thresholdAmount: n, amountPaidToDate: n, shortfall: n, recommendation: s }).passthrough();
export const calculationResultShape = z.object({ timestamp: s, input: calculationInputShape, federal, socialSecurity, medicare, w4, retirement, quarterly, isApproximate: z.boolean(), liabilityRange: range.optional(), effectiveRateRange: range.optional(), safeHarbor: safeHarbor.optional(), metadata: z.object({ jobIds: strings, snapshotIds: strings, w2EntryIds: strings, calculationBasis: z.enum(['manual','ytd_only','w2_and_ytd']), dataFreshnessDate: s }).passthrough().optional() }).passthrough();
const modifications = z.object({ type: z.enum(['quit_job','add_job','salary_change','filing_status_change','add_1099','custom','saved_calculation']), jobIdToRemove: s.optional(), quitMonth: n.optional(), jobToAdd: z.object({ name: s.optional(), annualSalary: n.optional(), payFrequency: s.optional() }).passthrough().optional(), startMonth: n.optional(), jobIdForRaise: s.optional(), newSalary: n.optional(), effectiveMonth: n.optional(), newFilingStatus: filing.optional(), income1099: n.optional(), description: s.optional() }).passthrough();
export const optimizationShape = z.object({ allocations: z.array(z.object({ jobId: s, jobName: s, recommended401kContribution: n, employerMatchAmount: n, recommendedHSAContribution: n, totalBenefitValue: n, annualSalary: n, matchContribution: n }).passthrough()), total401kContributions: n, totalEmployerMatch: n, totalHSAContributions: n, estimatedTaxSavings: n, overlapWarnings: strings, recommendations: strings, summary: s, _customTarget: n.optional(), _jobWeights: z.record(s, n).optional() }).passthrough();
const scanDimension = z.object({ name: s, score: n, rating: z.enum(['excellent','good','fair','poor']), summary: s, details: strings }).passthrough();
const legacyDimension = z.object({ dimension: s, score: n, weight: n, reasoning: s, positiveKeywords: strings, negativeKeywords: strings }).passthrough();
const scanImpact = z.object({ recommendation: s.optional(), webEnriched: z.boolean().optional(), newProjectedFederalTax: n.optional(), newProjectedWithholdingGap: n.optional(), additionalSSOverpayment: n.optional(), additionalMedicareExposure: n.optional(), marginalRate: n.optional() }).passthrough();

export function validateJsonFields(table: Table, record: Record<string, unknown>) {
  const check = (field: string, schema: z.ZodType) => {
    if (record[field] != null) {
      const result = schema.safeParse(record[field]);
      if (!result.success) throw new Error(`Invalid ${table}.${field}: ${result.error.issues[0].path.join('.')} ${result.error.issues[0].message}`);
    }
  };
  if (table === 'profiles') check('last_optimization_result', optimizationShape);
  if (table === 'saved_calculations') { check('input_data', calculationInputShape); check('result_data', calculationResultShape); }
  if (table === 'tax_scenarios') {
    check('base_input', calculationInputShape); check('modifications', modifications);
    check('result_data', z.object({ baseResult: calculationResultShape, modifiedResult: calculationResultShape, deltas: z.record(s, n).optional() }).passthrough());
  }
  if (table === 'job_postings') { check('dimension_scores', z.union([z.array(scanDimension), z.record(s, legacyDimension)])); check('tax_impact', scanImpact); }
}

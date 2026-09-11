import { RETIREMENT_LIMITS, TAX_YEAR } from './tax-data-2026';
import type {
  EmployerBenefitPlan,
  BenefitsOptimizationResult,
  BenefitsAllocation,
} from '@/lib/types';

/**
 * Calculate employer match dollar amount for a given employee contribution.
 */
export function calculateEmployerMatch(
  salary: number,
  plan: EmployerBenefitPlan,
  employeeContribution: number
): number {
  if (plan.matchType === 'dollar') {
    // Dollar match: employer matches dollar-for-dollar up to matchCapDollar
    const matchableContribution = Math.min(employeeContribution, plan.matchCapDollar);
    return matchableContribution * (plan.matchPercent / 100);
  }

  // Percentage match: employer matches a % of salary, capped at matchCapPercent of salary
  const maxMatchableFromSalary = salary * (plan.matchCapPercent / 100);
  const matchableContribution = Math.min(employeeContribution, maxMatchableFromSalary);
  return matchableContribution * (plan.matchPercent / 100);
}

/**
 * Detect overlap issues (e.g., over-contributing across employers).
 */
export function detectBenefitsOverlap(
  plans: EmployerBenefitPlan[],
  contributions: Record<string, number>
): string[] {
  const warnings: string[] = [];
  const activePlans = plans.filter((p) => p.isActive);

  // Check total 401k across all plans vs limit
  const total401k = activePlans.reduce(
    (sum, p) => sum + (contributions[p.jobId] ?? 0),
    0
  );
  if (total401k > RETIREMENT_LIMITS.employee401k) {
    warnings.push(
      `Total 401(k) contributions ($${total401k.toLocaleString()}) exceed the ${TAX_YEAR} employee limit of $${RETIREMENT_LIMITS.employee401k.toLocaleString()}. Reduce by $${(total401k - RETIREMENT_LIMITS.employee401k).toLocaleString()}.`
    );
  }

  // Check total HSA across all plans vs individual limit
  const totalHSA = activePlans.reduce(
    (sum, p) => sum + p.employerHSAContribution,
    0
  );
  if (totalHSA > RETIREMENT_LIMITS.hsaIndividual) {
    warnings.push(
      `Total HSA contributions ($${totalHSA.toLocaleString()}) exceed the individual limit of $${RETIREMENT_LIMITS.hsaIndividual.toLocaleString()}.`
    );
  }

  return warnings;
}

/**
 * Optimize benefits allocation across active employer plans.
 * Strategy: Max highest-match 401k first, then remaining contribution room.
 * HSA: Prefer employer with highest employer contribution.
 */
export function optimizeBenefitsAllocation(
  plans: EmployerBenefitPlan[],
  salaries: Record<string, number>,
  marginalRate: number = 0.24,
): BenefitsOptimizationResult {
  const activePlans = plans.filter((p) => p.isActive);

  if (activePlans.length === 0) {
    return {
      allocations: [],
      total401kContributions: 0,
      totalEmployerMatch: 0,
      totalHSAContributions: 0,
      estimatedTaxSavings: 0,
      overlapWarnings: [],
      recommendations: [],
      summary: 'No active benefit plans found. Add employer benefit plans to get optimization recommendations.',
    };
  }

  const employee401kLimit = RETIREMENT_LIMITS.employee401k;
  const hsaLimit = RETIREMENT_LIMITS.hsaIndividual;

  // Sort plans by effective match rate (highest match value first)
  const sortedPlans = [...activePlans].sort((a, b) => {
    const salaryA = salaries[a.jobId] ?? 0;
    const salaryB = salaries[b.jobId] ?? 0;
    const matchValueA = estimateMaxMatchValue(salaryA, a);
    const matchValueB = estimateMaxMatchValue(salaryB, b);
    return b.matchPercent - a.matchPercent || matchValueB - matchValueA;
  });

  // Allocate 401k contributions: max match from highest-match employer first
  let remaining401k = employee401kLimit;
  const allocations: BenefitsAllocation[] = [];
  const contributionMap: Record<string, number> = {};

  for (const plan of sortedPlans) {
    const salary = salaries[plan.jobId] ?? 0;

    // How much do we need to contribute to max out this employer's match?
    const contributionToMaxMatch = getContributionToMaxMatch(salary, plan);
    const contribution = Math.min(contributionToMaxMatch, remaining401k, salary);
    const matchAmount = calculateEmployerMatch(salary, plan, contribution);

    remaining401k -= contribution;
    contributionMap[plan.jobId] = contribution;

    allocations.push({
      jobId: plan.jobId,
      jobName: plan.jobName,
      recommended401kContribution: contribution,
      employerMatchAmount: matchAmount,
      recommendedHSAContribution: 0, // Set below
      totalBenefitValue: contribution + matchAmount,
      annualSalary: salary,
      matchContribution: contribution, // at this point, contribution == match portion
    });
  }

  // If there's remaining 401k room, allocate to mega-backdoor Roth plans first, then any plan
  if (remaining401k > 0) {
    const megaBackdoorPlans = sortedPlans.filter((p) => p.hasMegaBackdoorRoth);
    for (const plan of megaBackdoorPlans) {
      if (remaining401k <= 0) break;
      const alloc = allocations.find((a) => a.jobId === plan.jobId);
      if (alloc) {
        const additional = Math.min(remaining401k, Math.max(0, alloc.annualSalary - alloc.recommended401kContribution));
        alloc.recommended401kContribution += additional;
        alloc.totalBenefitValue += additional;
        contributionMap[plan.jobId] = (contributionMap[plan.jobId] ?? 0) + additional;
        remaining401k -= additional;
      }
    }
  }

  // Distribute remaining 401k to first available plan
  for (const alloc of allocations) {
    const additional = Math.min(remaining401k, Math.max(0, alloc.annualSalary - alloc.recommended401kContribution));
    alloc.recommended401kContribution += additional;
    alloc.totalBenefitValue += additional;
    contributionMap[alloc.jobId] = (contributionMap[alloc.jobId] ?? 0) + additional;
    remaining401k -= additional;
  }

  // HSA allocation: prefer employer with highest employer HSA contribution
  const hsaPlans = [...activePlans]
    .filter((p) => p.employerHSAContribution > 0)
    .sort((a, b) => b.employerHSAContribution - a.employerHSAContribution);

  // All employer HSA contributions use the same annual contribution allowance.
  let remainingHSA = Math.max(0, hsaLimit - activePlans.reduce((sum, p) => sum + p.employerHSAContribution, 0));
  for (const plan of hsaPlans) {
    if (remainingHSA <= 0) break;
    const alloc = allocations.find((a) => a.jobId === plan.jobId);
    if (alloc) {
      // Employer contribution counts toward limit
      const employerHSA = plan.employerHSAContribution;
      const employeeHSA = remainingHSA;
      alloc.recommendedHSAContribution = employeeHSA;
      alloc.totalBenefitValue += employeeHSA + employerHSA;
      remainingHSA -= employeeHSA;
    }
  }

  // Calculate totals
  const total401kContributions = allocations.reduce(
    (sum, a) => sum + a.recommended401kContribution, 0
  );
  const totalEmployerMatch = allocations.reduce(
    (sum, a) => sum + a.employerMatchAmount, 0
  );
  const totalHSAContributions = allocations.reduce(
    (sum, a) => sum + a.recommendedHSAContribution, 0
  );

  // Tax savings estimate using actual marginal rate for pre-tax contributions
  const estimatedTaxSavings = (total401kContributions + totalHSAContributions) * marginalRate;

  // Detect overlaps
  const overlapWarnings = detectBenefitsOverlap(plans, contributionMap);

  // Build recommendations
  const recommendations: string[] = [];

  for (const alloc of allocations) {
    if (alloc.employerMatchAmount > 0) {
      recommendations.push(
        `Contribute $${alloc.recommended401kContribution.toLocaleString()} to ${alloc.jobName}'s 401(k) to capture $${alloc.employerMatchAmount.toLocaleString()} in employer match.`
      );
    }
  }

  if (totalHSAContributions > 0) {
    const hsaPlan = hsaPlans[0];
    if (hsaPlan) {
      recommendations.push(
        `Use ${hsaPlan.jobName}'s HSA (highest employer contribution of $${hsaPlan.employerHSAContribution.toLocaleString()}/yr).`
      );
    }
  }

  const megaPlans = activePlans.filter((p) => p.hasMegaBackdoorRoth);
  if (megaPlans.length > 0) {
    recommendations.push(
      `${megaPlans.map((p) => p.jobName).join(', ')} offer${megaPlans.length === 1 ? 's' : ''} mega-backdoor Roth — use for additional after-tax savings.`
    );
  }

  // Summary
  const summary = allocations.length > 0
    ? `Optimize across ${allocations.length} employer${allocations.length > 1 ? 's' : ''}: $${total401kContributions.toLocaleString()} in 401(k) contributions capturing $${totalEmployerMatch.toLocaleString()}/yr in employer match. Estimated tax savings: $${Math.round(estimatedTaxSavings).toLocaleString()}/yr.`
    : 'No active benefit plans to optimize.';

  return {
    allocations,
    total401kContributions,
    totalEmployerMatch,
    totalHSAContributions,
    estimatedTaxSavings,
    overlapWarnings,
    recommendations,
    summary,
  };
}

/**
 * Estimate the maximum annual match value for a plan.
 */
function estimateMaxMatchValue(salary: number, plan: EmployerBenefitPlan): number {
  const contributionToMax = getContributionToMaxMatch(salary, plan);
  return calculateEmployerMatch(salary, plan, contributionToMax);
}

/**
 * Get the employee contribution needed to maximize employer match.
 */
function getContributionToMaxMatch(salary: number, plan: EmployerBenefitPlan): number {
  if (plan.matchType === 'dollar') {
    return plan.matchCapDollar;
  }
  // Percentage: contribute up to matchCapPercent of salary
  return salary * (plan.matchCapPercent / 100);
}

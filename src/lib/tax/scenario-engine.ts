import { runAllCalculators } from './run-calculators';
import { calculateSelfEmploymentTax } from './self-employment-tax';
import { getPayrollWages } from './w2-helpers';
import type {
  CalculationInput,
  CalculationResult,
  JobInput,
  ScenarioModification,
} from '../types';

export interface ScenarioDeltas {
  totalIncome: number;
  agi: number;
  federalTax: number;
  effectiveRate: number;
  withholdingGap: number;
  ssOverpayment: number;
  medicareLiability: number;
  selfEmploymentTax: number;
  takeHomePay: number;
}

export interface ScenarioEngineResult {
  baseResult: CalculationResult;
  modifiedResult: CalculationResult;
  deltas: ScenarioDeltas;
  taxImpact: number;
}

function applyModification(
  baseInput: CalculationInput,
  mod: ScenarioModification,
): CalculationInput {
  const modified = JSON.parse(JSON.stringify(baseInput)) as CalculationInput;

  switch (mod.type) {
    case 'quit_job': {
      if (mod.quitMonth === 12) break; // A December quit preserves the full year, including cents.
      const idx = modified.jobs.findIndex((j) => j.id === mod.jobIdToRemove);
      if (idx >= 0) {
        if (mod.quitMonth && mod.quitMonth < 12) {
          const ratio = mod.quitMonth / 12;
          modified.jobs[idx].annualSalary = Math.round(modified.jobs[idx].annualSalary * ratio);
          modified.jobs[idx].federalWithholdingYTD = Math.round(modified.jobs[idx].federalWithholdingYTD * ratio);
          modified.jobs[idx].socialSecurityWithholdingYTD = Math.round(modified.jobs[idx].socialSecurityWithholdingYTD * ratio);
          modified.jobs[idx].medicareWithholdingYTD = Math.round(modified.jobs[idx].medicareWithholdingYTD * ratio);
          // Scale pre-tax contributions so AGI deduction stays proportional to partial-year salary
          const qj = modified.jobs[idx];
          if (qj.traditional401k !== undefined) qj.traditional401k = Math.round(qj.traditional401k * ratio);
          if (qj.roth401k !== undefined) qj.roth401k = Math.round(qj.roth401k * ratio);
          if (qj.hsaContributions !== undefined) qj.hsaContributions = Math.round(qj.hsaContributions * ratio);
          if (qj.socialSecurityWages !== undefined) qj.socialSecurityWages = Math.round(qj.socialSecurityWages * ratio);
          if (qj.medicareWages !== undefined) qj.medicareWages = Math.round(qj.medicareWages * ratio);
        } else {
          modified.jobs.splice(idx, 1);
        }
      }
      break;
    }

    case 'add_job': {
      const startMonth = mod.startMonth ?? 1;
      const ratio = (13 - startMonth) / 12;
      const salary = mod.jobToAdd?.annualSalary ?? 0;
      modified.jobs.push({
        id: `scenario-new-${Date.now()}`,
        name: mod.jobToAdd?.name ?? 'New Job',
        incomeSource: 'paystub',
        annualSalary: Math.round(salary * ratio),
        federalWithholdingYTD: 0,
        socialSecurityWithholdingYTD: 0,
        medicareWithholdingYTD: 0,
        payFrequency: (mod.jobToAdd?.payFrequency as JobInput['payFrequency']) ?? 'biweekly',
        startMonth,
      });
      break;
    }

    case 'salary_change': {
      const idx = modified.jobs.findIndex((j) => j.id === mod.jobIdForRaise);
      if (idx >= 0 && mod.newSalary !== undefined) {
        const originalSalary = modified.jobs[idx].annualSalary;
        if (mod.effectiveMonth && mod.effectiveMonth > 1) {
          const oldMonths = mod.effectiveMonth - 1;
          const newMonths = 13 - mod.effectiveMonth;
          const blended = Math.round(
            (originalSalary * oldMonths + mod.newSalary * newMonths) / 12
          );
          modified.jobs[idx].annualSalary = blended;
        } else {
          modified.jobs[idx].annualSalary = mod.newSalary;
        }
        // Scale pre-tax contributions proportionally to the salary change
        if (originalSalary > 0) {
          const salaryRatio = modified.jobs[idx].annualSalary / originalSalary;
          const sj = modified.jobs[idx];
          if (sj.traditional401k !== undefined) sj.traditional401k = Math.round(sj.traditional401k * salaryRatio);
          if (sj.roth401k !== undefined) sj.roth401k = Math.round(sj.roth401k * salaryRatio);
          if (sj.hsaContributions !== undefined) sj.hsaContributions = Math.round(sj.hsaContributions * salaryRatio);
          if (sj.socialSecurityWages !== undefined) sj.socialSecurityWages = Math.round(sj.socialSecurityWages * salaryRatio);
          if (sj.medicareWages !== undefined) sj.medicareWages = Math.round(sj.medicareWages * salaryRatio);
        }
      }
      break;
    }

    case 'filing_status_change': {
      if (mod.newFilingStatus) {
        modified.filingStatus = mod.newFilingStatus;
      }
      break;
    }

    case 'add_1099': {
      const startMonth = mod.startMonth ?? 1;
      const ratio = (13 - startMonth) / 12;
      const income = mod.income1099 ?? 0;
      modified.jobs.push({
        id: `scenario-1099-${Date.now()}`,
        name: '1099 Income',
        incomeSource: 'paystub',
        annualSalary: Math.round(income * ratio),
        socialSecurityWages: 0,
        medicareWages: 0,
        federalWithholdingYTD: 0,
        socialSecurityWithholdingYTD: 0,
        medicareWithholdingYTD: 0,
        payFrequency: 'monthly',
        startMonth,
      });
      break;
    }

    case 'custom':
    case 'saved_calculation':
      // For v1, no-op — just use baseline as-is
      break;
  }

  return modified;
}

export function runScenario(
  baseInput: CalculationInput,
  modification: ScenarioModification,
): ScenarioEngineResult {
  const modifiedInput = applyModification(baseInput, modification);

  const baseResult = runAllCalculators(baseInput);
  let modifiedResult = runAllCalculators(modifiedInput);

  // Calculate SE tax for 1099 scenarios
  let selfEmploymentTax = 0;
  if (modification.type === 'add_1099' && modification.income1099) {
    const w2Wages = baseInput.jobs.reduce((sum, j) => sum + getPayrollWages(j, 'socialSecurity'), 0);
    const income1099 = modifiedInput.jobs.find(j => j.id.startsWith('scenario-1099-'))!.annualSalary;
    const seResult = calculateSelfEmploymentTax(
      income1099,
      w2Wages,
      baseInput.filingStatus,
      baseInput.jobs.reduce((sum, j) => sum + getPayrollWages(j, 'medicare'), 0),
    );
    selfEmploymentTax = seResult.totalSETax;

    // Deduct the employer-equivalent SE tax, retaining gross income.
    const adjustedInput = JSON.parse(JSON.stringify(modifiedInput)) as CalculationInput;
    adjustedInput.selfEmploymentDeduction = (baseInput.selfEmploymentDeduction ?? 0) + seResult.seDeduction;
    modifiedResult = runAllCalculators(adjustedInput);
  }

  const baseTakeHome = baseResult.federal.totalIncome - baseResult.federal.totalFederalTax
    - (baseResult.socialSecurity.totalSSWithheld - baseResult.socialSecurity.overpayment) - baseResult.medicare.totalMedicareLiability;
  const modTakeHome = modifiedResult.federal.totalIncome - modifiedResult.federal.totalFederalTax
    - (modifiedResult.socialSecurity.totalSSWithheld - modifiedResult.socialSecurity.overpayment) - modifiedResult.medicare.totalMedicareLiability
    - selfEmploymentTax;

  const deltas: ScenarioDeltas = {
    totalIncome: modifiedResult.federal.totalIncome - baseResult.federal.totalIncome,
    agi: modifiedResult.federal.adjustedGrossIncome - baseResult.federal.adjustedGrossIncome,
    federalTax: modifiedResult.federal.totalFederalTax - baseResult.federal.totalFederalTax,
    effectiveRate: modifiedResult.federal.effectiveRate - baseResult.federal.effectiveRate,
    withholdingGap: modifiedResult.federal.withholdingGap - baseResult.federal.withholdingGap,
    ssOverpayment: modifiedResult.socialSecurity.overpayment - baseResult.socialSecurity.overpayment,
    medicareLiability: modifiedResult.medicare.totalMedicareLiability - baseResult.medicare.totalMedicareLiability,
    selfEmploymentTax,
    takeHomePay: modTakeHome - baseTakeHome,
  };

  return {
    baseResult,
    modifiedResult,
    deltas,
    taxImpact: deltas.federalTax + selfEmploymentTax,
  };
}

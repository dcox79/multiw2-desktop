'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatPercentage } from '@/lib/utils';
import type {
  CalculationResult,
  CalculationInput,
  FederalTaxResult,
  SSOverpaymentResult,
  MedicareTaxResult,
  W4Result,
  QuarterlyEstimateResult,
} from '@/lib/types';

interface ShareViewProps {
  calculation: {
    name: string;
    result_data: CalculationResult | null;
    input_data: CalculationInput | null;
    created_at: string;
    updated_at: string;
  };
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-semibold border-b border-border pb-2 mb-4 mt-8 first:mt-0 print:break-before-avoid">
      {children}
    </h2>
  );
}

function Row({ label, value, className }: { label: string; value: string | React.ReactNode; className?: string }) {
  return (
    <div className={`flex justify-between py-1.5 ${className ?? ''}`}>
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="font-mono tabular-nums text-sm font-medium">{value}</span>
    </div>
  );
}

function FederalSection({ federal }: { federal: FederalTaxResult }) {
  return (
    <section>
      <SectionHeader>Federal Tax Summary</SectionHeader>
      <div className="space-y-0">
        <Row label="Total Income" value={formatCurrency(federal.totalIncome)} />
        <Row label="Adjusted Gross Income" value={formatCurrency(federal.adjustedGrossIncome)} />
        <Row label="Taxable Income" value={formatCurrency(federal.taxableIncome)} />
        <Row label="Total Federal Tax" value={formatCurrency(federal.totalFederalTax)} />
        <Row label="Effective Rate" value={formatPercentage(federal.effectiveRate)} />
        <Row label="Marginal Rate" value={formatPercentage(federal.marginalRate)} />
        {federal.childTaxCredit > 0 && (
          <Row label="Child Tax Credit" value={formatCurrency(federal.childTaxCredit)} />
        )}
        {federal.otherDependentsCredit > 0 && (
          <Row label="Other Dependents Credit" value={formatCurrency(federal.otherDependentsCredit)} />
        )}
        <div className="border-t border-border mt-2 pt-2">
          <Row label="Total Withheld" value={formatCurrency(federal.totalWithheld)} />
          {federal.estimatedPaymentsYTD > 0 && (
            <Row label="Estimated Payments YTD" value={formatCurrency(federal.estimatedPaymentsYTD)} />
          )}
          <Row
            label="Withholding Gap"
            value={
              <span className={federal.withholdingGap > 0 ? 'text-destructive' : 'text-success'}>
                {formatCurrency(Math.abs(federal.withholdingGap))} {federal.withholdingGap > 0 ? 'underpaid' : 'overpaid'}
              </span>
            }
          />
          <Row
            label="Remaining Balance"
            value={
              <span className={federal.remainingBalance > 0 ? 'text-destructive' : 'text-success'}>
                {federal.remainingBalance > 0
                  ? `${formatCurrency(federal.remainingBalance)} owed`
                  : `${formatCurrency(Math.abs(federal.remainingBalance))} refund`}
              </span>
            }
          />
        </div>
      </div>

      {federal.bracketBreakdown.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-medium mb-2">Tax Bracket Breakdown</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-1.5 font-medium">Rate</th>
                <th className="text-right py-1.5 font-medium">Range</th>
                <th className="text-right py-1.5 font-medium">Taxable</th>
                <th className="text-right py-1.5 font-medium">Tax</th>
              </tr>
            </thead>
            <tbody>
              {federal.bracketBreakdown.map((b) => (
                <tr key={b.rate} className="border-b border-border/50">
                  <td className="py-1.5">{(b.rate * 100).toFixed(0)}%</td>
                  <td className="text-right font-mono tabular-nums">
                    {formatCurrency(b.rangeStart)} — {formatCurrency(b.rangeEnd)}
                  </td>
                  <td className="text-right font-mono tabular-nums">{formatCurrency(b.taxableInBracket)}</td>
                  <td className="text-right font-mono tabular-nums">{formatCurrency(b.taxInBracket)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SocialSecuritySection({ ss }: { ss: SSOverpaymentResult }) {
  return (
    <section>
      <SectionHeader>Social Security</SectionHeader>
      <Row label="Combined Wages" value={formatCurrency(ss.combinedWages)} />
      <Row label="Wage Base" value={formatCurrency(ss.wageBase)} />
      <Row label="Total SS Withheld" value={formatCurrency(ss.totalSSWithheld)} />
      <Row label="Maximum Required" value={formatCurrency(ss.maxSSPerPerson)} />
      {ss.overpayment > 0 && (
        <Row
          label="Overpayment (Credit at Filing)"
          value={<span className="text-success">{formatCurrency(ss.overpayment)}</span>}
        />
      )}
      {ss.perJobSS.length > 1 && (
        <div className="mt-4">
          <h3 className="text-sm font-medium mb-2">Per-Job SS Breakdown</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-1.5 font-medium">Job</th>
                <th className="text-right py-1.5 font-medium">Wages</th>
                <th className="text-right py-1.5 font-medium">SS Withheld</th>
              </tr>
            </thead>
            <tbody>
              {ss.perJobSS.map((job) => (
                <tr key={job.jobId} className="border-b border-border/50">
                  <td className="py-1.5">{job.jobName}</td>
                  <td className="text-right font-mono tabular-nums">{formatCurrency(job.salary)}</td>
                  <td className="text-right font-mono tabular-nums">{formatCurrency(job.ssWithheld)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function MedicareSection({ medicare }: { medicare: MedicareTaxResult }) {
  return (
    <section>
      <SectionHeader>Medicare Tax</SectionHeader>
      <Row label="Total Wages" value={formatCurrency(medicare.totalMedicareWithheld > 0 ? medicare.perJobMedicare.reduce((s, j) => s + j.wages, 0) : 0)} />
      <Row label="Regular Medicare Tax" value={formatCurrency(medicare.regularMedicareTax)} />
      {medicare.additionalMedicareTax > 0 && (
        <>
          <Row label="Additional Medicare Tax (0.9%)" value={formatCurrency(medicare.additionalMedicareTax)} />
          <Row label="Wages Above Threshold" value={formatCurrency(medicare.wagesAboveThreshold)} />
        </>
      )}
      <Row label="Total Liability" value={formatCurrency(medicare.totalMedicareLiability)} />
      <Row label="Total Withheld" value={formatCurrency(medicare.totalMedicareWithheld)} />
      <Row
        label="Medicare Gap"
        value={
          <span className={medicare.medicareGap > 0 ? 'text-destructive' : 'text-success'}>
            {formatCurrency(Math.abs(medicare.medicareGap))} {medicare.medicareGap > 0 ? 'underpaid' : 'overpaid'}
          </span>
        }
      />
    </section>
  );
}

function W4Section({ w4 }: { w4: W4Result }) {
  if (w4.adjustments.length === 0) return null;
  return (
    <section>
      <SectionHeader>W-4 Recommendations</SectionHeader>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="text-left py-1.5 font-medium">Job</th>
            <th className="text-right py-1.5 font-medium">Current/Paycheck</th>
            <th className="text-right py-1.5 font-medium">Extra/Paycheck</th>
            <th className="text-right py-1.5 font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {w4.adjustments.map((adj) => (
            <tr key={adj.jobId} className="border-b border-border/50">
              <td className="py-1.5">{adj.jobName}</td>
              <td className="text-right font-mono tabular-nums">{formatCurrency(adj.currentWithholdingPerPaycheck)}</td>
              <td className="text-right font-mono tabular-nums">
                {adj.recommendedExtraWithholding > 0
                  ? `+${formatCurrency(adj.recommendedExtraWithholding)}`
                  : formatCurrency(0)}
              </td>
              <td className="text-right text-xs max-w-xs">{adj.explanation}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 border-t border-border pt-2">
        <Row label="Total Current Annual Withholding" value={formatCurrency(w4.totalCurrentAnnualWithholding)} />
        <Row label="Total Revised Annual Withholding" value={formatCurrency(w4.totalRevisedAnnualWithholding)} />
        <Row label="Remaining Gap After Adjustment" value={formatCurrency(w4.remainingGapAfterAdjustment)} />
      </div>
    </section>
  );
}

function QuarterlySection({ quarterly }: { quarterly: QuarterlyEstimateResult }) {
  return (
    <section>
      <SectionHeader>Quarterly Estimated Payments</SectionHeader>
      <Row label="Total Annual Tax" value={formatCurrency(quarterly.totalAnnualTax)} />
      <Row label="Projected Withholding" value={formatCurrency(quarterly.totalWithholdingProjected)} />
      <Row label="90% of estimated current-year income tax" value={formatCurrency(quarterly.safeHarborAmount)} />
      {quarterly.penaltyRisk && (
        <div className="mt-2 text-sm text-destructive bg-destructive/10 rounded px-3 py-2">
          {quarterly.penaltyExplanation}
        </div>
      )}
      <div className="mt-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="text-left py-1.5 font-medium">Quarter</th>
              <th className="text-left py-1.5 font-medium">Due Date</th>
              <th className="text-right py-1.5 font-medium">Amount</th>
              <th className="text-right py-1.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {quarterly.quarterlyPayments.map((q) => (
              <tr key={q.quarter} className="border-b border-border/50">
                <td className="py-1.5">Q{q.quarter}</td>
                <td className="py-1.5">{q.dueDate}</td>
                <td className="text-right font-mono tabular-nums">{formatCurrency(q.amount)}</td>
                <td className="text-right">
                  {q.paidAmount > 0 ? (
                    <span className="text-success text-xs">Paid {formatCurrency(q.paidAmount)}</span>
                  ) : q.isPast ? (
                    <span className="text-muted-foreground text-xs">Past date</span>
                  ) : (
                    <span className="text-muted-foreground text-xs">Upcoming</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function InputSummary({ input }: { input: CalculationInput }) {
  const statusLabels: Record<string, string> = {
    single: 'Single',
    married_filing_jointly: 'Married Filing Jointly',
    married_filing_separately: 'Married Filing Separately',
    head_of_household: 'Head of Household',
  };

  return (
    <section>
      <SectionHeader>Calculation Parameters</SectionHeader>
      <Row label="Filing Status" value={statusLabels[input.filingStatus] ?? input.filingStatus} />
      <Row label="Number of Jobs" value={String(input.jobs.length)} />
      <Row label="Dependents" value={String(input.dependents)} />
      {input.childTaxCreditEligible > 0 && (
        <Row label="Child Tax Credit Eligible" value={String(input.childTaxCreditEligible)} />
      )}
      {(input.otherDependentsEligible ?? 0) > 0 && (
        <Row label="Other Dependents Eligible" value={String(input.otherDependentsEligible)} />
      )}
      <Row label="Deduction" value={input.standardDeduction ? 'Standard' : `Itemized (${formatCurrency(input.itemizedDeductions ?? 0)})`} />
      {input.estimatedPaymentsYTD > 0 && (
        <Row label="Estimated Payments YTD" value={formatCurrency(input.estimatedPaymentsYTD)} />
      )}
      {input.jobs.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-medium mb-2">Jobs Included</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-1.5 font-medium">Job</th>
                <th className="text-right py-1.5 font-medium">Annual Salary</th>
                <th className="text-right py-1.5 font-medium">Data Source</th>
              </tr>
            </thead>
            <tbody>
              {input.jobs.map((job) => (
                <tr key={job.id} className="border-b border-border/50">
                  <td className="py-1.5">{job.name}</td>
                  <td className="text-right font-mono tabular-nums">{formatCurrency(job.annualSalary)}</td>
                  <td className="text-right text-xs text-muted-foreground uppercase">{job.incomeSource}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function ShareView({ calculation }: ShareViewProps) {
  const result = calculation.result_data;
  const input = calculation.input_data;

  if (!result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md px-6">
          <h1 className="text-2xl font-bold mb-2">No Results Available</h1>
          <p className="text-muted-foreground">This calculation is still a draft and has no results to display.</p>
        </div>
      </div>
    );
  }

  const createdDate = new Date(calculation.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="min-h-screen bg-white dark:bg-background print:bg-white">
      {/* Print-friendly wrapper */}
      <div className="max-w-3xl mx-auto px-6 py-8 print:px-0 print:py-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">{calculation.name}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Calculated on {createdDate}
            </p>
            {result.isApproximate && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                Values shown are approximate estimates (±15%)
              </p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="no-print print:hidden"
          >
            <Printer className="size-3.5 mr-1.5" />
            Print / Save PDF
          </Button>
        </div>

        <p className="mb-6 text-sm text-muted-foreground">Saved estimates use the entered income, withholding, filing status, and deduction assumptions. Projections assume the entered pay pattern continues. This report does not revalidate historical tax tables or include AMT, QBI, or refundable credits. Prior-year liability is required for a complete safe-harbor assessment.</p>
        {/* Content sections */}
        <div className="space-y-2">
          {input && <InputSummary input={input} />}
          <FederalSection federal={result.federal} />
          <SocialSecuritySection ss={result.socialSecurity} />
          <MedicareSection medicare={result.medicare} />
          <W4Section w4={result.w4} />
          <QuarterlySection quarterly={result.quarterly} />
        </div>

        {/* Footer */}
        <footer className="mt-12 pt-4 border-t border-border text-center text-xs text-muted-foreground">
          <p>Generated by MultiW2 Local</p>
          <p className="mt-1">
            This document is for informational purposes only and does not constitute tax advice.
            Consult a qualified tax professional for guidance specific to your situation.
          </p>
        </footer>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          .no-print, .print\\:hidden { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          * { color: #000 !important; border-color: #ccc !important; }
          .text-destructive, [class*="text-destructive"] { color: #dc2626 !important; }
          .text-success, [class*="text-success"] { color: #16a34a !important; }
        }
      `}</style>
    </div>
  );
}

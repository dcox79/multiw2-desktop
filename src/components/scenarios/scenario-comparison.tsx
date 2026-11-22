'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { TaxScenario } from '@/lib/types';
import type { ScenarioDeltas } from '@/lib/tax/scenario-engine';

interface ScenarioComparisonProps {
  scenario: TaxScenario;
}

function DeltaCell({ value, isPercent, invert }: { value: number; isPercent?: boolean; invert?: boolean }) {
  const isPositive = invert ? value < 0 : value > 0;
  const isNegative = invert ? value > 0 : value < 0;
  const color = Math.abs(value) < 1 ? 'text-muted-foreground' : isPositive ? 'text-destructive' : isNegative ? 'text-success' : 'text-muted-foreground';
  const arrow = value > 0 ? '↑' : value < 0 ? '↓' : '';
  const formatted = isPercent
    ? `${arrow} ${Math.abs(value * 100).toFixed(1)} pp`
    : `${arrow} ${formatCurrency(Math.abs(value))}`;

  return <span className={cn('font-mono tabular-nums font-medium', color)}>{formatted}</span>;
}

export function ScenarioComparison({ scenario }: ScenarioComparisonProps) {
  const result = scenario.resultData;
  if (!result) return null;

  const { baseResult, modifiedResult, deltas } = result as {
    baseResult: TaxScenario['resultData'] extends { baseResult: infer R } ? R : never;
    modifiedResult: TaxScenario['resultData'] extends { modifiedResult: infer R } ? R : never;
    deltas: ScenarioDeltas;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const base = baseResult as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = modifiedResult as any;

  if (!base?.federal || !mod?.federal || !deltas) return <p className="text-sm text-muted-foreground p-4">This historical scenario has no complete comparison data. Create a new scenario to calculate with the reviewed 2026 tables.</p>;

  const rows = [
    { label: 'Total Income', base: base.federal.totalIncome, mod: mod.federal.totalIncome, delta: deltas.totalIncome, invert: false },
    { label: 'AGI', base: base.federal.adjustedGrossIncome, mod: mod.federal.adjustedGrossIncome, delta: deltas.agi, invert: false },
    { label: 'Federal Tax', base: base.federal.totalFederalTax, mod: mod.federal.totalFederalTax, delta: deltas.federalTax, invert: false },
    { label: 'Effective Rate', base: base.federal.effectiveRate, mod: mod.federal.effectiveRate, delta: deltas.effectiveRate, isPercent: true, invert: false },
    { label: 'Withholding Gap', base: base.federal.withholdingGap, mod: mod.federal.withholdingGap, delta: deltas.withholdingGap, invert: false },
    { label: 'SS Overpayment', base: base.socialSecurity?.overpayment ?? 0, mod: mod.socialSecurity?.overpayment ?? 0, delta: deltas.ssOverpayment, invert: true },
    { label: 'Medicare Liability', base: base.medicare?.totalMedicareLiability ?? 0, mod: mod.medicare?.totalMedicareLiability ?? 0, delta: deltas.medicareLiability, invert: false },
    ...(deltas.selfEmploymentTax > 0 ? [{ label: 'Self-Employment Tax', base: 0, mod: deltas.selfEmploymentTax, delta: deltas.selfEmploymentTax, invert: false }] : []),
    { label: 'Est. Take-Home', base: base.federal.totalIncome - base.federal.totalFederalTax, mod: mod.federal.totalIncome - mod.federal.totalFederalTax, delta: deltas.takeHomePay, invert: true },
  ];

  const taxImpact = deltas.federalTax + (deltas.selfEmploymentTax ?? 0);

  return (
    <div className="space-y-4">
      {/* Impact summary */}
      <Card className={cn('border-l-4', taxImpact > 0 ? 'border-l-red-500' : taxImpact < 0 ? 'border-l-emerald-500' : 'border-l-violet-500')}>
        <CardContent className="py-4 px-5">
          <p className={cn('font-semibold', taxImpact > 0 ? 'text-destructive' : taxImpact < 0 ? 'text-success' : '')}>
            The model estimates a {taxImpact > 0 ? 'rise' : taxImpact < 0 ? 'drop' : 'change'} in {(deltas.selfEmploymentTax ?? 0) !== 0 ? 'regular federal income and self-employment taxes' : 'regular federal income tax'} of{' '}
            <span className="font-mono tabular-nums">{formatCurrency(Math.abs(taxImpact))}</span>
          </p>
        </CardContent>
      </Card>

      {/* Comparison table */}
      <Card className="overflow-x-auto">
        <CardHeader>
          <CardTitle className="text-base">Side-by-Side Comparison</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground w-[160px]">Metric</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Baseline</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Scenario</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Change</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 font-medium text-muted-foreground">{row.label}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {row.isPercent ? `${(row.base * 100).toFixed(1)}%` : formatCurrency(row.base)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {row.isPercent ? `${(row.mod * 100).toFixed(1)}%` : formatCurrency(row.mod)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <DeltaCell value={row.delta} isPercent={row.isPercent} invert={row.invert} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

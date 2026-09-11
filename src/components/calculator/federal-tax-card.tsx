'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatPercentage } from '@/lib/utils';
import type { FederalTaxResult, ApproximateRange } from '@/lib/types';
import { cn } from '@/lib/utils';

interface FederalTaxCardProps {
  result: FederalTaxResult;
  isApproximate: boolean;
  liabilityRange?: ApproximateRange;
  effectiveRateRange?: ApproximateRange;
}

export function FederalTaxCard({ result, isApproximate, liabilityRange, effectiveRateRange }: FederalTaxCardProps) {
  const gapColor = result.withholdingGap > 0 ? 'text-destructive' : 'text-success';
  const gapLabel = result.withholdingGap > 0 ? 'underpaid' : 'overpaid';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Federal Tax Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Key metrics */}
        <div className="grid grid-cols-2 gap-4">
          <Metric label="Total income" value={formatCurrency(result.totalIncome)} />
          <Metric label="AGI" value={formatCurrency(result.adjustedGrossIncome)} />
          <Metric label="Taxable income" value={formatCurrency(result.taxableIncome)} />
          <Metric
            label="Federal tax"
            value={
              isApproximate && liabilityRange
                ? `${formatCurrency(liabilityRange.min)} – ${formatCurrency(liabilityRange.max)}`
                : formatCurrency(result.totalFederalTax)
            }
            approximate={isApproximate}
          />
          <Metric
            label="Effective rate"
            value={
              isApproximate && effectiveRateRange
                ? `${formatPercentage(effectiveRateRange.min)} – ${formatPercentage(effectiveRateRange.max)}`
                : formatPercentage(result.effectiveRate)
            }
          />
          <Metric label="Marginal rate" value={formatPercentage(result.marginalRate)} />
        </div>

        {/* Withholding gap */}
        <div className="border-t border-border pt-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">Withholding gap</span>
            <span className={cn('font-mono tabular-nums text-lg font-semibold', gapColor)}>
              {formatCurrency(Math.abs(result.withholdingGap))} {gapLabel}
            </span>
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>Total withheld: {formatCurrency(result.totalWithheld)}</span>
            <span>Est. payments: {formatCurrency(result.estimatedPaymentsYTD)}</span>
          </div>
        </div>

        {/* Bracket breakdown (shown when not approximate) */}
        {!isApproximate && result.bracketBreakdown.length > 0 && (
          <div className="border-t border-border pt-4">
            <h4 className="text-sm font-medium mb-2">Bracket breakdown</h4>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="text-left py-1">Rate</th>
                  <th className="text-right py-1">Range</th>
                  <th className="text-right py-1">Taxable</th>
                  <th className="text-right py-1">Tax</th>
                </tr>
              </thead>
              <tbody>
                {result.bracketBreakdown.map((b, i) => (
                  <tr key={i} className="border-t border-border/50">
                    <td className="py-1 font-mono tabular-nums">{(b.rate * 100).toFixed(0)}%</td>
                    <td className="text-right py-1 font-mono tabular-nums">
                      {formatCurrency(b.rangeStart)} – {formatCurrency(b.rangeEnd)}
                    </td>
                    <td className="text-right py-1 font-mono tabular-nums">{formatCurrency(b.taxableInBracket)}</td>
                    <td className="text-right py-1 font-mono tabular-nums">{formatCurrency(b.taxInBracket)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  approximate,
}: {
  label: string;
  value: string;
  approximate?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-mono tabular-nums text-sm font-medium">
        {value}
        {approximate && <span className="text-xs text-muted-foreground ml-1">~</span>}
      </p>
    </div>
  );
}

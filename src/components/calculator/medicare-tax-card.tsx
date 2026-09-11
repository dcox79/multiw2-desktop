'use client';

import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import type { MedicareTaxResult, ApproximateRange } from '@/lib/types';

interface MedicareTaxCardProps {
  result: MedicareTaxResult;
  isApproximate: boolean;
  gapRange?: ApproximateRange;
}

function applyRange(value: number): ApproximateRange {
  const margin = Math.abs(value) * 0.15;
  return { min: value - margin, max: value + margin };
}

export function MedicareTaxCard({ result, isApproximate, gapRange }: MedicareTaxCardProps) {
  const range = isApproximate ? (gapRange ?? applyRange(result.medicareGap)) : null;

  // Detect the multi-W2 trap: combined wages exceed threshold but no single employer triggered additional withholding
  const noEmployerWithheldAdditional = result.perJobMedicare.every((j) => j.additionalWithheld === 0);
  const showMultiW2Trap = result.additionalMedicareTax > 0 && noEmployerWithheldAdditional;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Medicare Tax</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Headline metric */}
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">Medicare gap</span>
          <span className={`font-mono tabular-nums text-lg font-semibold ${
            result.medicareGap > 0 ? 'text-destructive' : 'text-success'
          }`}>
            {isApproximate && range
              ? `${formatCurrency(range.min)} – ${formatCurrency(range.max)}`
              : formatCurrency(result.medicareGap)}
            {result.medicareGap > 0 ? ' owed' : result.medicareGap < 0 ? ' overpaid' : ''}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <span className="text-muted-foreground">Regular Medicare (1.45%)</span>
            <p className="font-mono tabular-nums">{formatCurrency(result.regularMedicareTax)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Additional Medicare (0.9%)</span>
            <p className="font-mono tabular-nums">{formatCurrency(result.additionalMedicareTax)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Total liability</span>
            <p className="font-mono tabular-nums">{formatCurrency(result.totalMedicareLiability)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Total withheld</span>
            <p className="font-mono tabular-nums">{formatCurrency(result.totalMedicareWithheld)}</p>
          </div>
        </div>

        {/* Additional Medicare Tax details */}
        {result.additionalMedicareTax > 0 && (
          <div className="border-t border-border pt-3 text-xs">
            <p className="text-muted-foreground">
              Wages above {formatCurrency(result.additionalMedicareThreshold)} threshold:{' '}
              <span className="font-mono tabular-nums text-foreground">
                {formatCurrency(result.wagesAboveThreshold)}
              </span>
            </p>
          </div>
        )}

        {/* Multi-W2 trap warning — shown to all users */}
        {showMultiW2Trap && (
          <div className="flex gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20">
            <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">
              No single employer triggered Additional Medicare Tax withholding, but your combined wages
              exceed the {formatCurrency(result.additionalMedicareThreshold)} threshold.
              {isApproximate
                ? ` You likely owe ${formatCurrency(applyRange(result.additionalMedicareTax).min)} – ${formatCurrency(applyRange(result.additionalMedicareTax).max)} in Additional Medicare Tax at filing.`
                : ` You owe ${formatCurrency(result.additionalMedicareTax)} in Additional Medicare Tax at filing.`}
            </p>
          </div>
        )}

        {/* Per-employer breakdown */}
        {!isApproximate && result.perJobMedicare.length > 0 && (
          <div className="border-t border-border pt-3">
            <h4 className="text-xs font-medium mb-2 text-muted-foreground">Per employer</h4>
            <div className="space-y-2">
              {result.perJobMedicare.map((job, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="truncate">{job.jobName}</span>
                  <span className="font-mono tabular-nums shrink-0 ml-2">
                    {formatCurrency(job.regularWithheld + job.additionalWithheld)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import type { W4Result } from '@/lib/types';

interface W4RecommendationCardProps {
  result: W4Result;
  isDemo?: boolean;
}

export function W4RecommendationCard({ result }: W4RecommendationCardProps) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>W-4 Recommendations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {result.recommendationStatus !== 'projected' && (
            <p className="text-sm text-muted-foreground">A W-4 amount requires projected withholding and the actual number of remaining paychecks. Use the IRS withholding estimator for midyear changes.</p>
          )}
          {result.recommendationStatus === 'projected' && result.adjustments.map((adj) => (
            <div key={adj.jobId} className="border-b border-border pb-3 last:border-0 last:pb-0">
              <div className="flex justify-between items-baseline mb-1">
                <span className="font-medium text-sm">{adj.jobName}</span>
                <span className="font-mono tabular-nums text-sm">
                  +{formatCurrency(adj.recommendedExtraWithholding)}/paycheck
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <span>Current: {formatCurrency(adj.currentWithholdingPerPaycheck)}/paycheck</span>
                <span>Revised: {formatCurrency(adj.revisedWithholdingPerPaycheck)}/paycheck</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{adj.explanation}</p>
            </div>
          ))}

          {result.recommendationStatus === 'projected' && <div className="border-t border-border pt-3 flex justify-between text-sm">
            <span className="text-muted-foreground">Remaining gap after adjustments</span>
            <span className="font-mono tabular-nums font-medium">
              {formatCurrency(result.remainingGapAfterAdjustment)}
            </span>
          </div>}
        </CardContent>
      </Card>
    </>
  );
}

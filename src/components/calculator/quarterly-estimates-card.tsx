'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import type { QuarterlyEstimateResult } from '@/lib/types';

interface QuarterlyEstimatesCardProps {
  result: QuarterlyEstimateResult;
  isDemo?: boolean;
}

export function QuarterlyEstimatesCard({ result }: QuarterlyEstimatesCardProps) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Quarterly Estimates
            {result.penaltyRisk && (
              <Badge variant="destructive">Penalty risk</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-xs text-muted-foreground">90% of estimated current-year income tax</span>
              <p className="font-mono tabular-nums">{formatCurrency(result.safeHarborAmount)}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Required annual estimate</span>
              <p className="font-mono tabular-nums">{formatCurrency(result.requiredAnnualEstimate)}</p>
            </div>
          </div>

          {/* Payment schedule */}
          <div className="border-t border-border pt-3">
            <h4 className="text-xs font-medium mb-2 text-muted-foreground">Payment schedule</h4>
            <div className="space-y-2">
              {result.quarterlyPayments.map((q) => (
                <div key={q.quarter} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-mono tabular-nums w-6">Q{q.quarter}</span>
                    <span className="text-xs text-muted-foreground">{q.dueDate}</span>
                    {q.isPast && (
                      <Badge variant="secondary" className="text-xs">Past</Badge>
                    )}
                  </div>
                  <span className="font-mono tabular-nums font-medium">
                    {formatCurrency(q.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {result.penaltyExplanation && (
            <p className="text-xs text-muted-foreground border-t border-border pt-3">
              {result.penaltyExplanation}
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}

'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import type { SSOverpaymentResult } from '@/lib/types';

interface SSOverpaymentCardProps {
  result: SSOverpaymentResult;
  isApproximate: boolean;
  isDemo?: boolean;
}

export function SSOverpaymentCard({ result, isApproximate, isDemo }: SSOverpaymentCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Social Security Overpayment</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Headline metric */}
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">Overpayment</span>
          <span className="font-mono tabular-nums text-lg font-semibold">
            {result.overpayment > 0
              ? formatCurrency(result.overpayment)
              : 'None'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <span className="text-muted-foreground">Combined wages</span>
            <p className="font-mono tabular-nums">{formatCurrency(result.combinedWages)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">SS wage base</span>
            <p className="font-mono tabular-nums">{formatCurrency(result.wageBase)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Total SS withheld</span>
            <p className="font-mono tabular-nums">{formatCurrency(result.totalSSWithheld)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Credit at filing</span>
            <p className="font-mono tabular-nums">{formatCurrency(result.creditAtFiling)}</p>
          </div>
        </div>

        {/* Per-employer breakdown */}
        {!isApproximate && result.perJobSS.length > 0 && (
          <div className="border-t border-border pt-3">
            <h4 className="text-xs font-medium mb-2 text-muted-foreground">Per employer</h4>
            <div className="space-y-2">
              {result.perJobSS.map((job) => (
                <div key={job.jobId} className="flex items-center justify-between text-sm">
                  <span className="truncate">{job.jobName}</span>
                  <span className="font-mono tabular-nums shrink-0 ml-2">
                    {formatCurrency(job.ssWithheld)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Monthly timeline placeholder */}
        {!isApproximate && !isDemo && result.monthlyTimeline.length > 0 && (
          <>
            <div className="border-t border-border pt-3">
              <p className="text-xs text-muted-foreground">
                Monthly timeline chart will render here with Recharts.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

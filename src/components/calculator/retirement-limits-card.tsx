'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import type { RetirementLimitResult } from '@/lib/types';

interface RetirementLimitsCardProps {
  result: RetirementLimitResult;
  isDemo?: boolean;
}

export function RetirementLimitsCard({ result }: RetirementLimitsCardProps) {
  const pct401k = Math.min((result.total401kContributions / result.limit401k) * 100, 100);
  const pctHSA = Math.min((result.totalHSAContributions / result.limitHSA) * 100, 100);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Retirement Limits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 401(k) */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>401(k) contributions</span>
              <span className="font-mono tabular-nums">
                {formatCurrency(result.total401kContributions)} / {formatCurrency(result.limit401k)}
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${result.isOver401k ? 'bg-destructive' : 'bg-primary'}`}
                style={{ width: `${pct401k}%` }}
              />
            </div>
            {result.isOver401k && (
              <p className="text-xs text-destructive mt-1">
                Over limit by {formatCurrency(result.total401kContributions - result.limit401k)}
              </p>
            )}
          </div>

          {/* HSA */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>HSA contributions ({result.hsaCoverageType})</span>
              <span className="font-mono tabular-nums">
                {formatCurrency(result.totalHSAContributions)} / {formatCurrency(result.limitHSA)}
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${result.isOverHSA ? 'bg-destructive' : 'bg-primary'}`}
                style={{ width: `${pctHSA}%` }}
              />
            </div>
            {result.isOverHSA && (
              <p className="text-xs text-destructive mt-1">
                Over limit by {formatCurrency(result.totalHSAContributions - result.limitHSA)}
              </p>
            )}
          </div>

          {/* Per-job breakdown */}
          {result.perJob401k.length > 1 && (
            <div className="border-t border-border pt-3">
              <h4 className="text-xs font-medium mb-2 text-muted-foreground">Per employer 401(k)</h4>
              {result.perJob401k.map((job) => (
                <div key={job.jobId} className="flex justify-between text-sm py-1">
                  <span className="truncate">{job.jobName}</span>
                  <span className="font-mono tabular-nums shrink-0 ml-2">
                    {formatCurrency(job.contribution)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {result.recommendation && (
            <p className="text-xs text-muted-foreground border-t border-border pt-3">
              {result.recommendation}
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}

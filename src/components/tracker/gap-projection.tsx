'use client';

import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import type { Job, YTDSnapshot, CalculationResult } from '@/lib/types';

interface GapProjectionProps {
  job: Job;
  snapshots: YTDSnapshot[]; // sorted descending
  latestCalculation?: CalculationResult;
}

interface Projection {
  projectedGross: number;
  projectedFederalWithheld: number;
  estimatedLiability: number | null;
  estimatedGap: number | null;
  fractionElapsed: number;
  status: 'on-track' | 'may-owe' | 'likely-refund' | 'insufficient-data';
}

function computeProjection(
  job: Job,
  snapshots: YTDSnapshot[],
  latestCalc?: CalculationResult
): Projection {
  if (snapshots.length === 0) {
    return { projectedGross: 0, projectedFederalWithheld: 0, estimatedLiability: null, estimatedGap: null, fractionElapsed: 0, status: 'insufficient-data' };
  }

  const latest = snapshots[0];
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearEnd = new Date(now.getFullYear(), 11, 31);
  const totalDays = (yearEnd.getTime() - yearStart.getTime()) / 86_400_000;
  const elapsedDays = (now.getTime() - yearStart.getTime()) / 86_400_000;
  const fractionElapsed = Math.max(0.01, Math.min(1, elapsedDays / totalDays));

  const ytdGross = Number(latest.ytd_gross);
  const ytdFed = Number(latest.ytd_federal_withheld);

  // Simple linear extrapolation
  const projectedGross = Math.round(ytdGross / fractionElapsed);
  const projectedFederalWithheld = Math.round(ytdFed / fractionElapsed);

  // Compare to latest calculation if available
  let estimatedLiability: number | null = null;
  let estimatedGap: number | null = null;
  let status: Projection['status'] = 'insufficient-data';

  if (latestCalc && !latestCalc.isApproximate) {
    estimatedLiability = latestCalc.federal.totalFederalTax;
    estimatedGap = estimatedLiability - projectedFederalWithheld;

    if (Math.abs(estimatedGap) < 500) {
      status = 'on-track';
    } else if (estimatedGap > 0) {
      status = 'may-owe';
    } else {
      status = 'likely-refund';
    }
  } else if (snapshots.length >= 2) {
    // Without a calculation, we can still extrapolate but can't determine status
    status = 'insufficient-data';
  }

  return { projectedGross, projectedFederalWithheld, estimatedLiability, estimatedGap, fractionElapsed, status };
}

const statusConfig = {
  'on-track': { label: 'On track', color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-50 dark:bg-emerald-950/30', icon: Minus },
  'may-owe': { label: 'May owe at filing', color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-50 dark:bg-amber-950/30', icon: TrendingDown },
  'likely-refund': { label: 'Likely refund', color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-50 dark:bg-emerald-950/30', icon: TrendingUp },
  'insufficient-data': { label: 'Not enough data to project', color: 'text-muted-foreground', bgColor: 'bg-muted/50', icon: Minus },
};

export function GapProjection({ job, snapshots, latestCalculation }: GapProjectionProps) {
  const projection = useMemo(
    () => computeProjection(job, snapshots, latestCalculation),
    [job, snapshots, latestCalculation]
  );

  const config = statusConfig[projection.status];
  const StatusIcon = config.icon;

  if (projection.status === 'insufficient-data' && !latestCalculation) {
    return (
      <div className="text-sm text-muted-foreground">
        Run a tax calculation to see gap projections for this job.
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-medium text-muted-foreground mb-3">Year-end projection</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Projected gross</p>
          <p className="font-mono tabular-nums font-semibold">
            {formatCurrency(projection.projectedGross)}
          </p>
          <p className="text-xs text-muted-foreground">
            based on {Math.round(projection.fractionElapsed * 100)}% of year
          </p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground">Projected withheld</p>
          <p className="font-mono tabular-nums font-semibold">
            {formatCurrency(projection.projectedFederalWithheld)}
          </p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground">Estimated gap</p>
          {projection.estimatedGap !== null ? (
            <p className={cn('font-mono tabular-nums font-semibold', config.color)}>
              {projection.estimatedGap > 0
                ? formatCurrency(projection.estimatedGap) + ' underpaid'
                : formatCurrency(Math.abs(projection.estimatedGap)) + ' overpaid'}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
        </div>
      </div>

      {projection.status !== 'insufficient-data' && (
        <div className={cn('flex items-center gap-2 mt-3 px-3 py-2 rounded-md text-sm', config.bgColor, config.color)}>
          <StatusIcon className="size-4 shrink-0" />
          {config.label}
          {projection.estimatedGap !== null && projection.status === 'may-owe' && (
            <span className="font-mono tabular-nums">— {formatCurrency(Math.abs(projection.estimatedGap))}</span>
          )}
        </div>
      )}
    </div>
  );
}

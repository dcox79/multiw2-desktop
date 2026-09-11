'use client';

import { Shield, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatPercentage } from '@/lib/utils';
import type { SafeHarborResult } from '@/lib/types';
import { cn } from '@/lib/utils';

interface SafeHarborCardProps {
  result: SafeHarborResult;
  isDemo?: boolean;
}

export function SafeHarborCard({ result }: SafeHarborCardProps) {
  const met = result.isSafeHarbor;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {met ? (
              <Shield className="size-4 text-success" />
            ) : (
              <AlertTriangle className="size-4 text-warning" />
            )}
            Safe Harbor
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">
              Threshold ({formatPercentage(result.thresholdPercent / 100)})
            </span>
            <span className="font-mono tabular-nums font-medium">
              {formatCurrency(result.thresholdAmount)}
            </span>
          </div>

          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">Paid to date</span>
            <span className="font-mono tabular-nums font-medium">
              {formatCurrency(result.amountPaidToDate)}
            </span>
          </div>

          <div className={cn(
            'flex items-baseline justify-between border-t border-border pt-3',
            met ? 'text-success' : 'text-warning'
          )}>
            <span className="text-sm font-medium">
              {met ? 'Safe harbor met' : 'Shortfall'}
            </span>
            <span className="font-mono tabular-nums font-semibold">
              {met
                ? formatCurrency(result.amountPaidToDate - result.thresholdAmount) + ' surplus'
                : formatCurrency(result.shortfall) + ' short'}
            </span>
          </div>

          {result.recommendation && (
            <p className="text-xs text-muted-foreground">{result.recommendation}</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}

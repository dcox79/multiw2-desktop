'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { JobScanDimension } from '@/lib/types';

const ratingColors: Record<string, string> = {
  excellent: 'text-emerald-600 dark:text-emerald-400',
  good: 'text-blue-600 dark:text-blue-400',
  fair: 'text-amber-600 dark:text-amber-400',
  poor: 'text-destructive',
};

const barColors: Record<string, string> = {
  excellent: 'bg-emerald-500',
  good: 'bg-blue-500',
  fair: 'bg-amber-500',
  poor: 'bg-red-500',
};

export function DimensionCard({ dimension }: { dimension: JobScanDimension }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="p-4">
      <button onClick={() => setExpanded(!expanded)} className="w-full text-left">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-medium text-sm">{dimension.name}</h4>
          <div className="flex items-center gap-2">
            <span className={cn('font-mono tabular-nums text-sm font-semibold', ratingColors[dimension.rating])}>
              {dimension.score}
            </span>
            {expanded ? <ChevronDown className="size-3.5 text-muted-foreground" /> : <ChevronRight className="size-3.5 text-muted-foreground" />}
          </div>
        </div>

        {/* Score bar */}
        <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-2">
          <div
            className={cn('h-full rounded-full transition-all', barColors[dimension.rating])}
            style={{ width: `${dimension.score}%` }}
          />
        </div>

        <p className="text-xs text-muted-foreground">{dimension.summary}</p>
      </button>

      {expanded && dimension.details.length > 0 && (
        <ul className="mt-2 space-y-1 pl-3 border-l-2 border-border">
          {dimension.details.map((d, i) => (
            <li key={i} className="text-xs text-muted-foreground">{d}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

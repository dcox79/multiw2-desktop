'use client';

import { Trash2, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { JobScanResult } from '@/lib/types';

const ratingColors: Record<string, string> = {
  excellent: 'text-emerald-600 dark:text-emerald-400',
  good: 'text-blue-600 dark:text-blue-400',
  fair: 'text-amber-600 dark:text-amber-400',
  poor: 'text-destructive',
};

interface ScanHistoryProps {
  scans: JobScanResult[];
  onSelect: (scan: JobScanResult) => void;
  onDelete: (id: string) => void;
}

export function ScanHistory({ scans, onSelect, onDelete }: ScanHistoryProps) {
  if (scans.length === 0) return null;

  return (
    <div className="space-y-2">
      {scans.map((scan) => (
        <Card key={scan.id} className="p-0 overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <button onClick={() => onSelect(scan)} className="flex-1 text-left min-w-0">
              <div className="flex items-center gap-3">
                <span className={cn('font-mono tabular-nums text-lg font-bold', ratingColors[scan.overallRating])}>
                  {scan.overallScore}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm truncate">{scan.jobTitle}</p>
                    {scan.webEnriched && (
                      <Badge variant="secondary" className="text-xs gap-1 shrink-0">
                        <Globe className="size-3" />
                        Web
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {scan.company && `${scan.company} · `}
                    {new Date(scan.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive shrink-0"
              onClick={() => onDelete(scan.id)}
              aria-label={`Delete ${scan.jobTitle} scan`}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

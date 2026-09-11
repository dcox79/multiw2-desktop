'use client';

import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/shared/status-badge';
import { cn } from '@/lib/utils';

interface WorkflowCardProps {
  title: string;
  icon: LucideIcon;
  accentColor: string;
  status: 'not-started' | 'in-progress' | 'complete' | 'stale';
  statusText: string;
  children: React.ReactNode;
  primaryAction: { label: string; onClick: () => void; disabled?: boolean };
  secondaryAction?: { label: string; onClick: () => void } | null;
  isLoading?: boolean;
}

export function WorkflowCard({
  title,
  icon: Icon,
  accentColor,
  status,
  statusText,
  children,
  primaryAction,
  secondaryAction,
  isLoading,
}: WorkflowCardProps) {

  if (isLoading) {
    return (
      <div className="border border-border rounded-lg p-5">
        <Skeleton className="h-5 w-32 mb-3" />
        <Skeleton className="h-4 w-48 mb-4" />
        <Skeleton className="h-20 w-full mb-3" />
        <Skeleton className="h-8 w-28" />
      </div>
    );
  }




  return (
    <div className={cn('border border-border rounded-lg p-5', accentColor, 'border-l-4')}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <Icon className={cn('size-5 shrink-0', getIconColor(accentColor))} />
          <h3 className="font-semibold">{title}</h3>
        </div>
        <StatusBadge status={status} text={statusText} className="text-xs shrink-0" />
      </div>

      {/* Content */}
      <div className="mb-4 text-sm text-muted-foreground">
        {children}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={status === 'not-started' ? 'outline' : 'default'}
          onClick={primaryAction.onClick}
          disabled={primaryAction.disabled}
        >
          {primaryAction.label}
        </Button>
        {secondaryAction && (
          <Button size="sm" variant="ghost" onClick={secondaryAction.onClick}>
            {secondaryAction.label}
          </Button>
        )}
      </div>
    </div>
  );
}

function getIconColor(accentColor: string): string {
  if (accentColor.includes('blue')) return 'text-blue-500';
  if (accentColor.includes('emerald')) return 'text-emerald-500';
  if (accentColor.includes('violet')) return 'text-violet-500';
  if (accentColor.includes('amber')) return 'text-amber-500';
  if (accentColor.includes('cyan')) return 'text-cyan-500';
  if (accentColor.includes('pink')) return 'text-pink-500';
  return 'text-muted-foreground';
}

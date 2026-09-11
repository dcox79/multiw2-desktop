import { Check, Clock, Circle, AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type StatusType = 'complete' | 'in-progress' | 'not-started' | 'stale' | 'error';

interface StatusBadgeProps {
  status: StatusType;
  text: string;
  className?: string;
}

const statusConfig: Record<StatusType, { icon: typeof Check; colorClass: string }> = {
  'complete': { icon: Check, colorClass: 'text-success' },
  'in-progress': { icon: Clock, colorClass: 'text-warning' },
  'not-started': { icon: Circle, colorClass: 'text-muted-foreground' },
  'stale': { icon: AlertTriangle, colorClass: 'text-warning' },
  'error': { icon: XCircle, colorClass: 'text-destructive' },
};

export function StatusBadge({ status, text, className }: StatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm', config.colorClass, className)}>
      <Icon className="size-4 shrink-0" />
      <span>{text}</span>
    </span>
  );
}

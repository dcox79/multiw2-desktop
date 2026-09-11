import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md';
  className?: string;
}

export function LoadingSpinner({ size = 'md', className }: LoadingSpinnerProps) {
  return (
    <Loader2
      className={cn(
        'animate-spin text-muted-foreground',
        size === 'sm' ? 'size-4' : 'size-8',
        className
      )}
    />
  );
}

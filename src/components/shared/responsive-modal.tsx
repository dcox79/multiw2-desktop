'use client';

import { Dialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ResponsiveModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function ResponsiveModal({ open, onOpenChange, title, children, className }: ResponsiveModalProps) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50" />
      <Dialog.Popup className={cn('fixed bottom-0 left-1/2 z-50 -translate-x-1/2 sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2 w-full max-w-md max-h-[90vh] sm:max-h-[85vh] overflow-y-auto rounded-t-xl sm:rounded-lg border border-border bg-card text-foreground shadow-lg', className)}>
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between z-10">
          <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
          <Dialog.Close render={<Button variant="ghost" size="icon" aria-label="Close" />}><X className="size-4" /></Dialog.Close>
        </div>
        <div className="px-6 py-4">{children}</div>
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
}

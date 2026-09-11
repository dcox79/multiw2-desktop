'use client';

import { useState, useRef, useEffect } from 'react';
import { Pencil, Trash2, MoreVertical } from 'lucide-react';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { useYTDSnapshots } from '@/hooks/use-ytd-snapshots';
import { SnapshotForm } from './snapshot-form';
import type { YTDSnapshot } from '@/lib/types';

interface SnapshotHistoryTableProps {
  snapshots: YTDSnapshot[]; // already sorted by date descending
  jobId: string;
  jobName: string;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function delta(current: number, prior: number | undefined): string {
  if (prior === undefined) return '—';
  const diff = current - prior;
  if (diff === 0) return '$0';
  return (diff > 0 ? '+' : '') + formatCurrency(diff);
}

function KebabMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <Button variant="ghost" size="icon" className="size-8" onClick={() => setOpen((v) => !v)}>
        <MoreVertical className="size-4" />
        <span className="sr-only">Actions</span>
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[120px] rounded-md border border-border bg-card shadow-md py-1">
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted transition-colors"
            onClick={() => { setOpen(false); onEdit(); }}
          >
            <Pencil className="size-3.5" /> Edit
          </button>
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-destructive hover:bg-muted transition-colors"
            onClick={() => { setOpen(false); onDelete(); }}
          >
            <Trash2 className="size-3.5" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

function DeleteConfirmation({ date, onConfirm, onCancel, isPending }: {
  date: string;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Delete snapshot from {date}?</span>
      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onCancel} disabled={isPending}>
        Cancel
      </Button>
      <Button variant="destructive" size="sm" className="h-7 px-2 text-xs" onClick={onConfirm} disabled={isPending}>
        {isPending ? 'Deleting...' : 'Delete'}
      </Button>
    </div>
  );
}

export function SnapshotHistoryTable({ snapshots, jobId, jobName }: SnapshotHistoryTableProps) {
  const [showRetirement, setShowRetirement] = useState(false);
  const [editingSnapshot, setEditingSnapshot] = useState<YTDSnapshot | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { remove } = useYTDSnapshots(jobId);

  const hasRetirement = snapshots.some(
    (s) => (s.ytd_traditional_401k ?? 0) > 0 || (s.ytd_roth_401k ?? 0) > 0 || (s.ytd_hsa ?? 0) > 0
  );

  const handleDelete = async (id: string) => {
    try {
      await remove.mutateAsync(id);
      toast.success('Snapshot deleted');
      setDeletingId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete snapshot');
    }
  };

  // Find the prior snapshot for the one being edited (the one chronologically before it)
  const editPriorSnapshot = editingSnapshot
    ? (() => {
        const idx = snapshots.findIndex((s) => s.id === editingSnapshot.id);
        return idx >= 0 && idx < snapshots.length - 1 ? snapshots[idx + 1] : undefined;
      })()
    : undefined;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-muted-foreground">Snapshot history</h3>
        {hasRetirement && (
          <button
            onClick={() => setShowRetirement((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showRetirement ? 'Hide retirement' : 'Show retirement'}
          </button>
        )}
      </div>

      <div className="overflow-x-auto -mx-5 px-5">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">Date</TableHead>
              <TableHead className="text-right whitespace-nowrap">YTD Gross</TableHead>
              <TableHead className="text-right whitespace-nowrap">YTD Federal</TableHead>
              <TableHead className="text-right whitespace-nowrap">YTD SS</TableHead>
              <TableHead className="text-right whitespace-nowrap">YTD Medicare</TableHead>
              <TableHead className="text-right whitespace-nowrap">Increment</TableHead>
              {showRetirement && (
                <>
                  <TableHead className="text-right whitespace-nowrap">401(k)</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Roth</TableHead>
                  <TableHead className="text-right whitespace-nowrap">HSA</TableHead>
                </>
              )}
              <TableHead className="w-[80px]"><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {snapshots.map((snap, idx) => {
              const prior = idx < snapshots.length - 1 ? snapshots[idx + 1] : undefined;
              const grossDelta = prior ? Number(snap.ytd_gross) - Number(prior.ytd_gross) : undefined;
              const isDeleting = deletingId === snap.id;

              return (
                <TableRow key={snap.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatDate(snap.paycheck_date)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-sm">
                    {formatCurrency(Number(snap.ytd_gross))}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-sm">
                    {formatCurrency(Number(snap.ytd_federal_withheld))}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-sm">
                    {formatCurrency(Number(snap.ytd_ss_withheld))}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-sm">
                    {formatCurrency(Number(snap.ytd_medicare_withheld))}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-sm text-muted-foreground">
                    {grossDelta !== undefined
                      ? delta(Number(snap.ytd_gross), Number(prior!.ytd_gross))
                      : '—'}
                  </TableCell>
                  {showRetirement && (
                    <>
                      <TableCell className="text-right font-mono tabular-nums text-sm">
                        {snap.ytd_traditional_401k ? formatCurrency(Number(snap.ytd_traditional_401k)) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-sm">
                        {snap.ytd_roth_401k ? formatCurrency(Number(snap.ytd_roth_401k)) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-sm">
                        {snap.ytd_hsa ? formatCurrency(Number(snap.ytd_hsa)) : '—'}
                      </TableCell>
                    </>
                  )}
                  <TableCell>
                    {isDeleting ? (
                      <DeleteConfirmation
                        date={formatDate(snap.paycheck_date)}
                        onConfirm={() => handleDelete(snap.id)}
                        onCancel={() => setDeletingId(null)}
                        isPending={remove.isPending}
                      />
                    ) : (
                      <>
                        {/* Desktop: inline buttons */}
                        <div className="hidden sm:flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => setEditingSnapshot(snap)}
                          >
                            <Pencil className="size-4" />
                            <span className="sr-only">Edit</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive hover:text-destructive"
                            onClick={() => setDeletingId(snap.id)}
                          >
                            <Trash2 className="size-4" />
                            <span className="sr-only">Delete</span>
                          </Button>
                        </div>
                        {/* Mobile: kebab menu */}
                        <div className="sm:hidden">
                          <KebabMenu
                            onEdit={() => setEditingSnapshot(snap)}
                            onDelete={() => setDeletingId(snap.id)}
                          />
                        </div>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Edit modal */}
      {editingSnapshot && (
        <SnapshotForm
          open={!!editingSnapshot}
          onOpenChange={(open) => { if (!open) setEditingSnapshot(null); }}
          jobId={jobId}
          jobName={jobName}
          existingSnapshot={editingSnapshot}
          priorSnapshot={editPriorSnapshot}
        />
      )}
    </div>
  );
}

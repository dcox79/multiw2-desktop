'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreVertical, Pencil, Trash2, Plus, ExternalLink, RotateCcw, Briefcase, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/shared/status-badge';
import { formatCurrencyRounded } from '@/lib/utils';
import type { Job, YTDSnapshot } from '@/lib/types';

interface JobCardProps {
  job: Job;
  latestSnapshot: YTDSnapshot | null;
  isStale: boolean;
  hasW2: boolean;
  onAddSnapshot: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onEnterW2?: () => void;
  onSetExtraWithholding?: () => void;
  onReactivate?: () => void;
  onPermanentDelete?: () => void;
}

const frequencyLabels: Record<string, string> = {
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  semimonthly: 'Semi-monthly',
  monthly: 'Monthly',
};

type JobStatus = 'new' | 'ready' | 'stale' | 'w2-only';

function getJobStatus(snapshot: YTDSnapshot | null, isStale: boolean, hasW2: boolean): JobStatus {
  if (!snapshot && hasW2) return 'w2-only';
  if (!snapshot) return 'new';
  if (isStale) return 'stale';
  return 'ready';
}

function getStatusBadgeProps(status: JobStatus) {
  switch (status) {
    case 'new':
      return { status: 'not-started' as const, text: 'New — add YTD to get started' };
    case 'w2-only':
      return { status: 'complete' as const, text: 'W2 data entered' };
    case 'ready':
      return { status: 'complete' as const, text: 'Ready for calculation' };
    case 'stale':
      return { status: 'stale' as const, text: 'Data may be outdated' };
  }
}

function getRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Updated today';
  if (days === 1) return 'Updated yesterday';
  if (days < 30) return `Updated ${days} days ago`;
  const months = Math.floor(days / 30);
  return `Updated ${months}mo ago`;
}

export function JobCard({
  job,
  latestSnapshot,
  isStale,
  hasW2,
  onAddSnapshot,
  onEdit,
  onDelete,
  onSetExtraWithholding,
  onEnterW2,
  onReactivate,
  onPermanentDelete,
}: JobCardProps) {
  const router = useRouter();
  const [kebabOpen, setKebabOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isFormer = job.employment_status === 'former';
  const status = getJobStatus(latestSnapshot, isStale, hasW2);
  const badgeProps = getStatusBadgeProps(status);

  const primaryAction = isFormer
    ? { label: 'Enter/Edit W2', icon: Briefcase, onClick: onEnterW2 ?? (() => {}) }
    : {
        new: { label: 'Add YTD snapshot', icon: Plus, onClick: onAddSnapshot },
        'w2-only': { label: 'View job details', icon: ExternalLink, onClick: () => router.push(`/dashboard/jobs/${job.id}`) },
        ready: { label: 'View job details', icon: ExternalLink, onClick: () => router.push(`/dashboard/jobs/${job.id}`) },
        stale: { label: 'Update YTD', icon: Plus, onClick: onAddSnapshot },
      }[status];

  return (
    <div className={`relative border border-border rounded-lg bg-card p-4 flex flex-col gap-3 min-w-[260px] ${isFormer ? 'opacity-60' : ''}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-lg truncate">{job.name}</h3>
            {isFormer && <Badge variant="secondary" className="text-xs text-muted-foreground shrink-0">Former</Badge>}
          </div>
          <p className="font-mono tabular-nums text-muted-foreground text-sm">
            {formatCurrencyRounded(job.annual_salary)}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Badge variant="outline" className="text-xs">
            {frequencyLabels[job.pay_frequency] ?? job.pay_frequency}
          </Badge>

          {/* Kebab menu — visible on mobile, hover on desktop */}
          <div className="relative">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setKebabOpen((v) => !v)}
              aria-label="More actions"
              className="md:opacity-0 md:group-hover/jobcard:opacity-100 transition-opacity"
            >
              <MoreVertical className="size-4" />
            </Button>
            {kebabOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setKebabOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-md shadow-sm py-1 min-w-[180px]">
                  {!isFormer && status === 'ready' && (
                    <KebabItem icon={Plus} label="Add YTD snapshot" onClick={() => { onAddSnapshot(); setKebabOpen(false); }} />
                  )}
                  {onEnterW2 && (
                    <KebabItem icon={Briefcase} label={hasW2 ? 'Edit W2' : 'Enter W2'} onClick={() => { onEnterW2(); setKebabOpen(false); }} />
                  )}
                  {!isFormer && (
                    <>
                      <KebabItem icon={Pencil} label="Edit job" onClick={() => { onEdit(); setKebabOpen(false); }} />
                      <KebabItem icon={DollarSign} label="Extra W-4" onClick={() => { onSetExtraWithholding?.(); setKebabOpen(false); }} />
                      <KebabItem icon={Trash2} label="Mark as former" onClick={() => { onDelete(); setKebabOpen(false); }} />
                    </>
                  )}
                  {isFormer && onReactivate && (
                    <KebabItem icon={RotateCcw} label="Reactivate" onClick={() => { onReactivate(); setKebabOpen(false); }} />
                  )}
                  {isFormer && onPermanentDelete && (
                    <KebabItem icon={Trash2} label="Archive job" onClick={() => { setConfirmDelete(true); setKebabOpen(false); }} destructive />
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Withholding summary */}
      {latestSnapshot && (
        <div className="grid grid-cols-4 gap-3 text-xs">
          <WithholdingItem label="YTD Gross" value={latestSnapshot.ytd_gross} />
          <WithholdingItem label="Fed W/H" value={latestSnapshot.ytd_federal_withheld} />
          <WithholdingItem label="SS W/H" value={latestSnapshot.ytd_ss_withheld} />
          <WithholdingItem label="Med W/H" value={latestSnapshot.ytd_medicare_withheld} />
        </div>
      )}

      {/* Status + timestamp */}
      <div className="flex items-center justify-between gap-2 min-h-[2.5rem]">
        <StatusBadge {...badgeProps} className="text-xs" />
        {latestSnapshot && (
          <span className="text-xs text-muted-foreground">
            {getRelativeTime(latestSnapshot.paycheck_date)}
          </span>
        )}
      </div>

      {/* Primary CTA */}
      <Button
        size="sm"
        variant={!isFormer && status === 'ready' ? 'default' : 'outline'}
        className="w-full mt-auto min-h-[44px] md:min-h-0"
        onClick={primaryAction.onClick}
      >
        <primaryAction.icon className="size-3.5" />
        {primaryAction.label}
      </Button>

      {/* Permanent delete confirmation */}
      {confirmDelete && (
        <div className="absolute inset-0 bg-card/95 backdrop-blur-sm rounded-lg flex flex-col items-center justify-center p-4 z-50">
          <p className="text-sm text-center mb-3">
            Archive <strong>{job.name}</strong>? W-2 and snapshot history remains available from Settings.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" onClick={() => { onPermanentDelete?.(); setConfirmDelete(false); }}>
              Archive job
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function WithholdingItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col">
      <span className="text-muted-foreground text-[10px] leading-tight">{label}</span>
      <span className="font-mono tabular-nums font-medium">{formatCurrencyRounded(value)}</span>
    </div>
  );
}

function KebabItem({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: typeof Pencil;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 text-sm min-h-[44px] transition-colors ${
        destructive
          ? 'text-destructive hover:bg-destructive/10'
          : 'text-foreground hover:bg-accent'
      }`}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}

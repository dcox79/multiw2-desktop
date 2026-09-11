'use client';

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { JobCard } from './job-card';
import type { Job, YTDSnapshot } from '@/lib/types';

interface JobManagementSectionProps {
  jobs: Job[];
  latestSnapshots: Map<string, YTDSnapshot>;
  staleJobIds: Set<string>;
  w2JobIds: Set<string>;
  onAddJob: () => void;
  onAddSnapshot: (jobId: string) => void;
  onEditJob: (job: Job) => void;
  onDeleteJob: (jobId: string) => void;
  onEnterW2: (jobId: string) => void;
  onSetExtraWithholding?: (job: Job) => void;
  onReactivateJob?: (jobId: string) => void;
  onPermanentDeleteJob?: (jobId: string) => void;
  onQuickAddSnapshot?: () => void;
}

export function JobManagementSection({
  jobs,
  latestSnapshots,
  staleJobIds,
  w2JobIds,
  onAddJob,
  onAddSnapshot,
  onEditJob,
  onDeleteJob,
  onEnterW2,
  onSetExtraWithholding,
  onReactivateJob,
  onPermanentDeleteJob,
  onQuickAddSnapshot,
}: JobManagementSectionProps) {
  const activeCount = jobs.filter((j) => j.employment_status === 'active' && !j.is_draft).length;

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Your jobs</h2>
        <div className="flex items-center gap-3">
          {onQuickAddSnapshot && (
            <Button variant="outline" size="sm" onClick={onQuickAddSnapshot}>
              <Plus className="size-3.5 mr-1.5" />
              Add YTD data
            </Button>
          )}
          <span className="text-sm text-muted-foreground">
            <span className="font-mono tabular-nums">{activeCount}</span> active jobs
          </span>
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible">
        {jobs.map((job) => (
          <div key={job.id} className="shrink-0 w-[280px] sm:w-auto sm:flex-1 sm:min-w-[260px] sm:max-w-[400px] group/jobcard">
            <JobCard
              job={job}
              latestSnapshot={latestSnapshots.get(job.id) ?? null}
              isStale={staleJobIds.has(job.id)}
              hasW2={w2JobIds.has(job.id)}
              onAddSnapshot={() => onAddSnapshot(job.id)}
              onEdit={() => onEditJob(job)}
              onDelete={() => onDeleteJob(job.id)}
              onEnterW2={() => onEnterW2(job.id)}
              onSetExtraWithholding={onSetExtraWithholding ? () => onSetExtraWithholding(job) : undefined}
              onReactivate={onReactivateJob ? () => onReactivateJob(job.id) : undefined}
              onPermanentDelete={onPermanentDeleteJob ? () => onPermanentDeleteJob(job.id) : undefined}
            />
          </div>
        ))}

        {/* Add job button */}
        <button
          onClick={onAddJob}
          className="shrink-0 w-[280px] sm:w-auto sm:min-w-[260px] sm:max-w-[400px] sm:flex-1 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2 p-6 text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors min-h-[180px]"
        >
          <Plus className="size-6" />
          <span className="text-sm font-medium">
            Add another job
          </span>
        </button>
      </div>
    </section>
  );
}

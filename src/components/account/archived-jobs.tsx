'use client';

import Link from 'next/link';
import { toast } from 'sonner';
import { useJobs } from '@/hooks/use-jobs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function ArchivedJobs() {
  const { jobs, updateJob, error } = useJobs(true);
  const archived = jobs.filter(job => job.employment_status === 'deleted');
  if (!archived.length && !error) return null;
  return <Card><CardHeader><CardTitle>Archived jobs</CardTitle></CardHeader><CardContent className="space-y-3">
    {error && <p role="alert">Could not load archived jobs.</p>}
    {archived.map(job => <div key={job.id} className="flex justify-between gap-3 items-center">
      <Link className="text-sm underline" href={`/dashboard/jobs/${job.id}`}>{job.name} — view W-2 and snapshot history</Link>
      <Button size="sm" variant="outline" disabled={updateJob.isPending} onClick={async () => {
        try { await updateJob.mutateAsync({ id: job.id, employment_status: 'former' }); toast.success('Job restored as former'); }
        catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to restore job'); }
      }}>Restore job</Button>
    </div>)}
  </CardContent></Card>;
}

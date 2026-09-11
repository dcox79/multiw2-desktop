import { JobDetailContent } from '@/components/dashboard/job-detail-content';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <JobDetailContent jobId={id} />;
}

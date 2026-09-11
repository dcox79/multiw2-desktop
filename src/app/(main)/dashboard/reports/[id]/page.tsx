import { ReportContent } from '@/components/dashboard/report-content';

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReportContent id={id} />;
}

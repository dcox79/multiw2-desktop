'use client';

import Link from 'next/link';
import { useSavedCalculations } from '@/hooks/use-saved-calculations';
import { ShareView } from '@/components/shared/share-view';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { ErrorState } from '@/components/shared/error-state';

export function ReportContent({ id }: { id: string }) {
  const { calculations, isLoading, error } = useSavedCalculations();
  if (isLoading) return <div className="p-8"><LoadingSpinner /></div>;
  if (error) return <div className="p-8"><ErrorState onRetry={() => window.location.reload()} /></div>;
  const calculation = calculations.find(c => c.id === id);
  return <div>
    <div className="max-w-3xl mx-auto px-6 pt-6 print:hidden"><Link href="/dashboard/history" className="text-sm underline">← Calculation history</Link></div>
    {calculation ? <ShareView calculation={{ name: calculation.name, input_data: calculation.inputData, result_data: calculation.resultData, created_at: calculation.createdAt, updated_at: calculation.updatedAt }} /> : <p className="p-8">This saved calculation was not found.</p>}
  </div>;
}

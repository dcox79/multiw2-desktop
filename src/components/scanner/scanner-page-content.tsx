'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useScanner } from '@/hooks/use-scanner';
import { ScanHistory } from './scan-history';
import { DimensionCard } from './dimension-card';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { ErrorState } from '@/components/shared/error-state';
import { Card } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import type { JobScanResult } from '@/lib/types';

export function ScannerPageContent() {
  const { history, isLoading, error, deleteScan } = useScanner();
  const [selected, setSelected] = useState<JobScanResult | null>(null);
  return <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
    <h1 className="text-2xl font-bold">Scanner history</h1>
    <Card className="p-5 space-y-2">
      <h2 className="font-semibold">AI scanning is disabled</h2>
      <p className="text-sm text-muted-foreground">Imported scans remain available below. No job postings or financial data are sent to an AI service.</p>
      <Link href="/dashboard/scenarios" className="text-sm underline">Compare a prospective job offline in Scenarios →</Link>
    </Card>
    {isLoading ? <LoadingSpinner /> : error ? <ErrorState onRetry={() => window.location.reload()} /> : history.length === 0 ? <p className="text-muted-foreground">No imported scans yet.</p> : <ScanHistory scans={history} onSelect={setSelected} onDelete={id => { if (selected?.id === id) setSelected(null); deleteScan.mutate(id); }} />}
    {selected && <section className="space-y-4">
      <h2 className="text-xl font-semibold">{selected.jobTitle} {selected.company && '· ' + selected.company}</h2>
      <p className="text-sm text-muted-foreground">Historical scan from {new Date(selected.createdAt).toLocaleDateString()}. Its scores and tax assumptions have not been revalidated.</p>
      <p>{selected.recommendation}</p>
      {selected.estimatedSalary != null && <p>Estimated salary: {formatCurrency(selected.estimatedSalary)}</p>}
      <div className="grid gap-3 sm:grid-cols-2">{selected.dimensions.map(d => <DimensionCard key={d.name} dimension={d} />)}</div>
      <details className="rounded border p-4"><summary className="cursor-pointer font-medium">Complete saved scan</summary><pre className="whitespace-pre-wrap break-words text-xs mt-3">{JSON.stringify(selected, null, 2)}</pre></details>
    </section>}
  </div>;
}

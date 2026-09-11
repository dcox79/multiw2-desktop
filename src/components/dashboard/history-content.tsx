'use client';

import { useRouter } from 'next/navigation';
import { FileText, Trash2, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/shared/empty-state';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { ErrorState } from '@/components/shared/error-state';
import { useSavedCalculations } from '@/hooks/use-saved-calculations';
import { formatCurrency } from '@/lib/utils';

const basisLabels: Record<string, string> = {
  manual: 'Manual',
  ytd_only: 'YTD',
  w2_and_ytd: 'W2 + YTD',
};

export function HistoryContent() {
  const router = useRouter();
  const { calculations, isLoading, error, deleteCalc } = useSavedCalculations();

  const handleDelete = async (id: string) => {
    try {
      await deleteCalc.mutateAsync(id);
      toast.success('Calculation deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ErrorState onRetry={() => window.location.reload()} />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Calculation History</h1>
        <Button variant="outline" size="sm" onClick={() => router.push('/dashboard')}>
          Back to dashboard
        </Button>
      </div>

      {calculations.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No calculations yet"
          description="Run your first calculation from the dashboard to see results here."
          action={{ label: 'Go to dashboard', onClick: () => router.push('/dashboard') }}
        />
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Jobs</TableHead>
                <TableHead>Basis</TableHead>
                <TableHead className="text-right">Federal Tax</TableHead>
                <TableHead className="text-right">Owed at Filing</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calculations.map((calc) => {
                const balance = calc.resultData?.federal?.remainingBalance;
                return (
                  <TableRow key={calc.id}>
                    <TableCell className="font-medium">{calc.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(calc.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {calc.jobIds?.length ?? 0} job{(calc.jobIds?.length ?? 0) !== 1 ? 's' : ''}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {basisLabels[calc.calculationBasis] ?? calc.calculationBasis ?? 'Manual'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {calc.resultData?.federal?.totalFederalTax !== undefined
                        ? formatCurrency(calc.resultData.federal.totalFederalTax)
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {balance !== undefined ? (
                        <span className={balance > 0 ? 'text-destructive' : 'text-success'}>
                          {formatCurrency(Math.abs(balance))} {balance > 0 ? 'owed' : 'refund'}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Draft</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {calc.resultData && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => router.push(`/dashboard/reports/${calc.id}`)}
                            aria-label="Preview and print calculation"
                          >
                            <Printer className="size-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleDelete(calc.id)}
                          aria-label="Delete calculation"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}


    </div>
  );
}

'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Shield,
  CheckCircle2,
  Circle,
  CircleDot,
  Plus,
  Trash2,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { useTaxPrep } from '@/hooks/use-tax-prep';
import { getDocumentCategory } from '@/lib/tax/tax-prep';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { QUARTERLY_DUE_DATES, STANDARD_DEDUCTION } from '@/lib/tax/tax-data-2026';
import type { TaxPrepDocument } from '@/lib/types';

type StatusValue = TaxPrepDocument['status'];

const STATUS_ORDER: StatusValue[] = ['needed', 'received', 'verified'];

function nextStatus(current: StatusValue): StatusValue {
  const idx = STATUS_ORDER.indexOf(current);
  return STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
}

function StatusIcon({ status }: { status: StatusValue }) {
  if (status === 'verified') return <CheckCircle2 className="size-4 text-emerald-500" />;
  if (status === 'received') return <CircleDot className="size-4 text-amber-500" />;
  return <Circle className="size-4 text-muted-foreground" />;
}

function StatusBadge({ status }: { status: StatusValue }) {
  const colors: Record<StatusValue, string> = {
    needed: 'bg-muted text-muted-foreground',
    received: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    verified: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  };
  return (
    <span className={cn('px-2 py-0.5 rounded text-xs font-medium capitalize', colors[status])}>
      {status}
    </span>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  employment: 'Employment',
  income: 'Income',
  deductions: 'Deductions',
  reference: 'Reference',
};

export function TaxPrepPageContent() {
  const router = useRouter();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(2026);
  const { taxPrepKit, isLoading, updateDocument, removeDocument, addDocument } = useTaxPrep(selectedYear);

  const [addingDoc, setAddingDoc] = useState(false);
  const [newDocName, setNewDocName] = useState('');

  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = currentYear; y >= currentYear - 5; y--) years.push(y);
    return years;
  }, [currentYear]);

  // Group documents by category
  const groupedDocs = useMemo(() => {
    if (!taxPrepKit?.documents) return new Map<string, TaxPrepDocument[]>();
    const map = new Map<string, TaxPrepDocument[]>();
    for (const doc of taxPrepKit.documents) {
      const cat = getDocumentCategory(doc.documentType);
      const list = map.get(cat) ?? [];
      list.push(doc);
      map.set(cat, list);
    }
    return map;
  }, [taxPrepKit]);

  // Progress
  const totalDocs = taxPrepKit?.documents.length ?? 0;
  const collectedDocs = taxPrepKit?.documents.filter((d) => d.status !== 'needed').length ?? 0;
  const progressPct = totalDocs > 0 ? Math.round((collectedDocs / totalDocs) * 100) : 0;

  const handleCycleStatus = (doc: TaxPrepDocument) => {
    const next = nextStatus(doc.status);
    updateDocument.mutate({
      id: doc.id,
      status: next,
      receivedDate: next === 'received' ? new Date().toISOString().split('T')[0] : undefined,
    });
  };

  const handleAddCustomDoc = () => {
    if (!newDocName.trim()) return;
    addDocument.mutate({
      taxYear: selectedYear,
      documentType: 'custom',
      documentName: newDocName.trim(),
    });
    setNewDocName('');
    setAddingDoc(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <LoadingSpinner />
      </div>
    );
  }



  const safeHarbor = taxPrepKit?.safeHarborStatus;
  const filingStrategy = taxPrepKit?.filingStrategy;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <button
          onClick={() => router.push('/dashboard')}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Back to Dashboard"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-2xl font-bold">Tax Prep Kit</h1>
      </div>

      {/* Year selector */}
      <div className="flex items-center gap-3">
        <Label className="text-sm text-muted-foreground">Tax year</Label>
        <Select value={String(selectedYear)} onValueChange={(v) => { if (v) setSelectedYear(parseInt(v)); }}>
          <SelectTrigger className="w-[100px] h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {yearOptions.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Section 1: Document Checklist */}
      <Card className="border-l-4 border-l-cyan-500">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-5" />
            Document Checklist
          </CardTitle>
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{collectedDocs} of {totalDocs} documents collected</span>
              <span>{progressPct}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-500 rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {totalDocs === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Add jobs and W2 data to generate your document checklist.
            </p>
          ) : (
            <div className="space-y-4">
              {(['employment', 'income', 'deductions', 'reference'] as const).map((cat) => {
                const docs = groupedDocs.get(cat);
                if (!docs || docs.length === 0) return null;
                return (
                  <div key={cat}>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                      {CATEGORY_LABELS[cat]}
                    </h4>
                    <div className="space-y-0.5">
                      {docs.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center gap-3 py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors group"
                        >
                          <button
                            onClick={() => handleCycleStatus(doc)}
                            className="shrink-0"
                            aria-label={`Change status of ${doc.documentName}`}
                          >
                            <StatusIcon status={doc.status} />
                          </button>
                          <div className="flex-1 min-w-0">
                            <span className={cn(
                              'text-sm',
                              doc.status === 'verified' && 'line-through text-muted-foreground',
                            )}>
                              {doc.documentName}
                            </span>
                            {doc.employerName && doc.documentType !== 'w2' && (
                              <span className="text-xs text-muted-foreground ml-1">({doc.employerName})</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleCycleStatus(doc)}
                              className="hidden sm:block"
                            >
                              <StatusBadge status={doc.status} />
                            </button>
                            {doc.documentType === 'custom' && <button
                              onClick={() => removeDocument.mutate(doc.id)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-1"
                              aria-label={`Remove ${doc.documentName}`}
                            >
                              <Trash2 className="size-3.5" />
                            </button>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Add custom document */}
              <div className="pt-2 border-t border-border">
                {!addingDoc ? (
                  <button
                    onClick={() => setAddingDoc(true)}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Plus className="size-3.5" />
                    Add custom document
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <Input
                      value={newDocName}
                      onChange={(e) => setNewDocName(e.target.value)}
                      placeholder="Document name..."
                      className="h-8 text-sm flex-1"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddCustomDoc(); }}
                      autoFocus
                    />
                    <Button size="sm" className="h-8" onClick={handleAddCustomDoc} disabled={!newDocName.trim()}>
                      Add
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => { setAddingDoc(false); setNewDocName(''); }}>
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 2: Safe Harbor Analysis */}
      <Card className={cn('border-l-4', safeHarbor?.isSafeHarbor ? 'border-l-emerald-500' : safeHarbor ? 'border-l-amber-500' : 'border-l-muted')}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="size-5" />
            Safe Harbor Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          {safeHarbor ? (
            <div className="space-y-4">
              {/* Status */}
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    'px-3 py-1',
                    safeHarbor.isSafeHarbor
                      ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                      : 'border-amber-500 text-amber-600 dark:text-amber-400',
                  )}
                >
                  {safeHarbor.isSafeHarbor ? 'Safe Harbor Met' : 'Safe Harbor Not Met'}
                </Badge>
              </div>

              {/* Details */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Threshold ({safeHarbor.thresholdPercent}%)</p>
                  <p className="font-mono tabular-nums font-medium">{formatCurrency(safeHarbor.thresholdAmount)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Amount paid to date</p>
                  <p className="font-mono tabular-nums font-medium">{formatCurrency(safeHarbor.amountPaidToDate)}</p>
                </div>
                {safeHarbor.shortfall > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground">Shortfall</p>
                    <p className="font-mono tabular-nums font-medium text-destructive">{formatCurrency(safeHarbor.shortfall)}</p>
                  </div>
                )}
              </div>

              <p className="text-sm text-muted-foreground">{safeHarbor.recommendation}</p>

              {/* Quarterly due dates */}
              <div className="border-t border-border pt-3">
                <h4 className="text-xs font-medium text-muted-foreground mb-2">Quarterly Payment Schedule</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {QUARTERLY_DUE_DATES.map((q) => {
                    const isPast = new Date(q.isoDate) < new Date();
                    return (
                      <div key={q.quarter} className="text-sm">
                        <p className={cn(
                          'text-xs text-muted-foreground',
                          isPast && 'line-through',
                        )}>
                          Q{q.quarter}
                        </p>
                        <p className={cn(
                          'font-mono tabular-nums',
                          isPast ? 'text-muted-foreground line-through' : 'font-medium',
                        )}>
                          {q.dueDate}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Prior-year safe harbor is unavailable: it requires total tax from your prior return and payment timing. A W-2 alone is insufficient.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Filing Strategy (only for married filers) */}
      {filingStrategy && (
        <Card className="border-l-4 border-l-cyan-500">
          <CardHeader>
            <CardTitle className="text-base">Filing Strategy</CardTitle>
            <p className="text-sm font-medium mt-1">
              {filingStrategy.summary}
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-4"></th>
                    <th className="text-right py-2 px-4">Filing Jointly</th>
                    <th className="text-right py-2 pl-4">Filing Separately</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border">
                    <td className="py-2.5 pr-4 text-muted-foreground">Federal Tax</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-medium">
                      {filingStrategy.taxUnderMFJ != null ? formatCurrency(filingStrategy.taxUnderMFJ) : '—'}
                      {filingStrategy.recommendedStatus === 'mfj' && <span className="ml-1 text-emerald-500">*</span>}
                    </td>
                    <td className="py-2.5 pl-4 text-right font-mono tabular-nums font-medium">
                      {filingStrategy.taxUnderMFS != null ? formatCurrency(filingStrategy.taxUnderMFS) : '—'}
                      {filingStrategy.recommendedStatus === 'mfs' && <span className="ml-1 text-emerald-500">*</span>}
                    </td>
                  </tr>
                  {filingStrategy.mfjEffectiveRate != null && filingStrategy.mfsEffectiveRate != null && (
                    <tr className="border-b border-border">
                      <td className="py-2.5 pr-4 text-muted-foreground">Effective Rate</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        {(filingStrategy.mfjEffectiveRate * 100).toFixed(1)}%
                      </td>
                      <td className="py-2.5 pl-4 text-right font-mono tabular-nums">
                        {(filingStrategy.mfsEffectiveRate * 100).toFixed(1)}%
                      </td>
                    </tr>
                  )}
                  <tr className="border-b border-border">
                    <td className="py-2.5 pr-4 text-muted-foreground">Standard Deduction</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                      {formatCurrency(filingStrategy.mfjDeduction ?? STANDARD_DEDUCTION['married_filing_jointly'])}
                    </td>
                    <td className="py-2.5 pl-4 text-right font-mono tabular-nums">
                      {formatCurrency(filingStrategy.mfsDeduction ?? STANDARD_DEDUCTION['married_filing_separately'])}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 text-muted-foreground">Recommendation</td>
                    <td className="py-2.5 px-4 text-right">
                      {filingStrategy.recommendedStatus === 'mfj'
                        ? <span className="text-emerald-500 font-medium">Recommended</span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-2.5 pl-4 text-right">
                      {filingStrategy.recommendedStatus === 'mfs'
                        ? <span className="text-emerald-500 font-medium">Recommended</span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {filingStrategy.savingsAmount > 0 && (
              <p className="text-xs text-muted-foreground mt-3">
                * Saves {formatCurrency(filingStrategy.savingsAmount)} in federal taxes
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

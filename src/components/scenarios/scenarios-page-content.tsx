'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Target, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { ScenarioBuilder } from './scenario-builder';
import { ScenarioComparison } from './scenario-comparison';
import { useJobs } from '@/hooks/use-jobs';
import { useScenarios } from '@/hooks/use-scenarios';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { TaxScenario } from '@/lib/types';

const typeLabels: Record<string, string> = {
  quit_job: 'Quit Job',
  add_job: 'Add Job',
  salary_change: 'Salary Change',
  filing_status_change: 'Filing Status',
  add_1099: '1099 Income',
  custom: 'Custom',
  saved_calculation: 'Saved Calc',
};

export function ScenariosPageContent() {
  const router = useRouter();
  const { activeJobs: jobs, isLoading: jobsLoading } = useJobs();
  const { scenarios, isLoading: scenariosLoading, createScenario, deleteScenario } = useScenarios();

  const [builderOpen, setBuilderOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const isLoading = jobsLoading || scenariosLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <LoadingSpinner />
      </div>
    );
  }



  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <button
          onClick={() => router.push('/dashboard')}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Back to Dashboard"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-2xl font-bold">Tax Scenarios</h1>
      </div>
      <p className="text-muted-foreground mb-6 ml-8">
        Model what-if scenarios before making career or tax decisions
      </p>

      {/* Create button */}
      <div className="flex justify-end mb-6">
        <Button onClick={() => setBuilderOpen(true)}>
          <Plus className="size-4 mr-1" />
          New scenario
        </Button>
      </div>

      {/* Scenario list */}
      {scenarios.length === 0 ? (
        <Card className="border-dashed p-8 text-center">
          <Target className="size-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium mb-1">No scenarios yet</p>
          <p className="text-sm text-muted-foreground mb-4">
            Model the tax impact of quitting a job, adding income, getting a raise, or changing your filing status.
          </p>
          <Button variant="outline" onClick={() => setBuilderOpen(true)}>
            <Plus className="size-4 mr-1" />
            Create your first scenario
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {scenarios.map((scenario: TaxScenario) => {
            const isExpanded = expandedId === scenario.id;
            const impact = scenario.taxImpact ? Number(scenario.taxImpact) : 0;

            return (
              <div key={scenario.id}>
                <Card className="border-l-4 border-l-violet-500 p-0 overflow-hidden">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : scenario.id)}
                    className="w-full text-left"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold truncate">{scenario.name}</h3>
                          <Badge variant="secondary" className="text-xs shrink-0">
                            {typeLabels[scenario.modificationType] ?? scenario.modificationType}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {new Date(scenario.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className={cn(
                          'font-mono tabular-nums font-semibold',
                          impact > 0 ? 'text-destructive' : impact < 0 ? 'text-success' : 'text-muted-foreground'
                        )}>
                          {impact > 0 ? '+' : ''}{formatCurrency(impact)}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); deleteScenario.mutate(scenario.id); }}
                          aria-label={`Delete ${scenario.name}`}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </button>
                </Card>

                {isExpanded && (
                  <div className="mt-2 ml-2">
                    <ScenarioComparison scenario={scenario} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Builder modal */}
      <ScenarioBuilder
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        jobs={jobs}
        onSubmit={async (data) => {
          await createScenario.mutateAsync(data);
        }}
        isSubmitting={createScenario.isPending}
      />
    </div>
  );
}

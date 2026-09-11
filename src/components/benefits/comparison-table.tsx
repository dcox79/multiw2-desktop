'use client';

import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { EmployerBenefitPlan } from '@/lib/types';

interface ComparisonTableProps {
  plans: EmployerBenefitPlan[];
  salaries: Record<string, number>;
}

export function ComparisonTable({ plans, salaries }: ComparisonTableProps) {
  if (plans.length < 2) return null;

  // Compute derived values for comparison
  const planData = plans.map((p) => {
    const salary = salaries[p.jobId] ?? 0;
    const maxMatch = p.matchType === 'percentage'
      ? (salary * p.matchCapPercent / 100) * (p.matchPercent / 100)
      : p.matchCapDollar * (p.matchPercent / 100);
    const totalMonthlyPremiums = p.healthPremiumMonthly + p.dentalPremiumMonthly + p.visionPremiumMonthly;
    const totalAnnualPremiums = totalMonthlyPremiums * 12;

    return { plan: p, salary, maxMatch, totalMonthlyPremiums, totalAnnualPremiums };
  });

  // Find best values
  const bestMatch = Math.max(...planData.map((d) => d.maxMatch));
  const bestHSA = Math.max(...planData.map((d) => d.plan.employerHSAContribution));
  const lowestPremiums = Math.min(...planData.map((d) => d.totalAnnualPremiums));

  type Row = { label: string; values: Array<{ text: string; isBest: boolean; isMono: boolean }> };

  const rows: Row[] = [
    {
      label: 'Match Formula',
      values: planData.map((d) => ({
        text: d.plan.matchType === 'percentage'
          ? `${d.plan.matchPercent}% up to ${d.plan.matchCapPercent}%`
          : `${d.plan.matchPercent}% up to ${formatCurrency(d.plan.matchCapDollar)}`,
        isBest: false,
        isMono: false,
      })),
    },
    {
      label: 'Max Annual Match',
      values: planData.map((d) => ({
        text: formatCurrency(d.maxMatch),
        isBest: d.maxMatch === bestMatch && bestMatch > 0,
        isMono: true,
      })),
    },
    {
      label: 'Employer HSA',
      values: planData.map((d) => ({
        text: d.plan.employerHSAContribution > 0 ? `${formatCurrency(d.plan.employerHSAContribution)}/yr` : '--',
        isBest: d.plan.employerHSAContribution === bestHSA && bestHSA > 0,
        isMono: true,
      })),
    },
    {
      label: 'Monthly Premiums',
      values: planData.map((d) => ({
        text: d.totalMonthlyPremiums > 0 ? `${formatCurrency(d.totalMonthlyPremiums)}/mo` : '--',
        isBest: d.totalAnnualPremiums === lowestPremiums && lowestPremiums > 0,
        isMono: true,
      })),
    },
    {
      label: 'Annual Premiums',
      values: planData.map((d) => ({
        text: d.totalAnnualPremiums > 0 ? formatCurrency(d.totalAnnualPremiums) : '--',
        isBest: d.totalAnnualPremiums === lowestPremiums && lowestPremiums > 0,
        isMono: true,
      })),
    },
    {
      label: 'Mega Backdoor Roth',
      values: planData.map((d) => ({
        text: d.plan.hasMegaBackdoorRoth ? 'Yes' : 'No',
        isBest: d.plan.hasMegaBackdoorRoth,
        isMono: false,
      })),
    },
    {
      label: 'Vesting',
      values: planData.map((d) => ({
        text: d.plan.vestingSchedule || 'N/A',
        isBest: false,
        isMono: false,
      })),
    },
  ];

  return (
    <Card className="overflow-x-auto">
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground w-[160px]">Benefit</th>
              {planData.map((d) => (
                <th key={d.plan.id} className="text-left px-4 py-3 font-semibold">
                  {d.plan.jobName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-border last:border-0">
                <td className="px-4 py-2.5 font-medium text-muted-foreground">{row.label}</td>
                {row.values.map((v, i) => (
                  <td
                    key={planData[i].plan.id}
                    className={cn(
                      'px-4 py-2.5',
                      v.isMono && 'font-mono tabular-nums',
                      v.isBest && 'text-emerald-600 dark:text-emerald-400 font-medium'
                    )}
                  >
                    {v.text}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

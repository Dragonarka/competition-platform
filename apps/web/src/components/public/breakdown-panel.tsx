'use client';

import { useTranslations } from 'next-intl';
import type { CriterionBreakdownPublic, GroupBreakdownPublic } from '@competition-platform/shared';

interface BreakdownPanelProps {
  criteriaBreakdown?: CriterionBreakdownPublic[];
  groupBreakdown?: GroupBreakdownPublic[];
}

export function BreakdownPanel({ criteriaBreakdown, groupBreakdown }: BreakdownPanelProps) {
  const t = useTranslations('PublicStandings');
  const hasCriteria = (criteriaBreakdown?.length ?? 0) > 0;
  const hasGroups = (groupBreakdown?.length ?? 0) > 0;
  if (!hasCriteria && !hasGroups) return null;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {hasCriteria && (
        <section data-testid="breakdown-criteria">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            {t('perCriterion')}
          </h4>
          <ul className="space-y-1">
            {criteriaBreakdown!.map((c) => (
              <li key={c.criterionId} className="flex items-center justify-between text-sm">
                <span>{c.criterionName}</span>
                <span className="text-muted-foreground tabular-nums">
                  <span className="font-mono font-semibold text-foreground">{c.total}</span>{' '}
                  <span className="text-xs">(×{c.judgeCount})</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {hasGroups && (
        <section data-testid="breakdown-groups">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            {t('perJudgeGroup')}
          </h4>
          <ul className="space-y-1">
            {groupBreakdown!.map((g) => (
              <li
                key={`${g.groupIndex}-${g.groupLabel}`}
                className="flex items-center justify-between text-sm"
              >
                <span>{g.groupLabel}</span>
                <span className="text-muted-foreground tabular-nums">
                  <span className="font-mono font-semibold text-foreground">{g.total}</span>{' '}
                  <span className="text-xs">(×{g.judgeCount})</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

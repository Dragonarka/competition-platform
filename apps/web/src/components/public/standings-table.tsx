'use client';

import { useState } from 'react';
import type { StandingsEntry } from '@competition-platform/shared';
import { BreakdownPanel } from './breakdown-panel';

export interface NextMatchupHint {
  competitorId: string;
  matchupId: string;
  roundNumber: number;
  bracketPosition: number;
  opponentCompetitorId: string | null;
  opponentName: string | null;
}

interface StandingsTableProps {
  standings: StandingsEntry[];
  nextByCompetitorId: Map<string, NextMatchupHint>;
}

export function StandingsTable({ standings, nextByCompetitorId }: StandingsTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (standings.length === 0) {
    return (
      <div className="text-muted-foreground py-8 text-center" data-testid="standings-empty">
        <span
          className="mb-3 inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse"
          aria-hidden="true"
        />
        <p>Standings will appear as judges score.</p>
      </div>
    );
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-border">
          <th className="text-left py-3 pr-4 font-semibold text-muted-foreground w-10">#</th>
          <th className="text-left py-3 pr-4 font-semibold text-muted-foreground">Name</th>
          <th className="text-left py-3 pr-4 font-semibold text-muted-foreground hidden sm:table-cell">
            ID
          </th>
          <th className="text-right py-3 pr-4 font-semibold text-muted-foreground">Score</th>
          <th className="text-right py-3 font-semibold text-muted-foreground hidden sm:table-cell">
            Judges
          </th>
        </tr>
      </thead>
      <tbody>
        {standings.map((entry) => {
          const isOpen = expandedId === entry.competitorId;
          const nextHint = nextByCompetitorId.get(entry.competitorId);
          return (
            <Row
              key={entry.competitorId}
              entry={entry}
              isOpen={isOpen}
              onToggle={() => setExpandedId(isOpen ? null : entry.competitorId)}
              nextHint={nextHint}
            />
          );
        })}
      </tbody>
    </table>
  );
}

function Row({
  entry,
  isOpen,
  onToggle,
  nextHint,
}: {
  entry: StandingsEntry;
  isOpen: boolean;
  onToggle: () => void;
  nextHint: NextMatchupHint | undefined;
}) {
  return (
    <>
      <tr
        className="border-b border-border last:border-0 cursor-pointer hover:bg-muted/30"
        onClick={onToggle}
        data-testid={`standings-row-${entry.competitorId}`}
        data-expanded={isOpen ? 'true' : 'false'}
      >
        <td className="py-4 pr-4 font-bold text-xl tabular-nums align-top">{entry.rank}</td>
        <td className="py-4 pr-4 font-medium align-top">
          <div className="flex flex-col gap-1">
            <span>{entry.competitorName}</span>
            {nextHint && (
              <span
                className="inline-flex items-center gap-1 self-start rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-900 dark:bg-blue-950/40 dark:text-blue-200"
                data-testid={`next-hint-${entry.competitorId}`}
              >
                Next: vs. {nextHint.opponentName ?? 'TBD'} · R{nextHint.roundNumber}
              </span>
            )}
          </div>
        </td>
        <td className="py-4 pr-4 text-muted-foreground hidden sm:table-cell align-top">
          {entry.participantId}
        </td>
        <td className="py-4 pr-4 text-right font-mono font-bold text-lg tabular-nums align-top">
          {entry.totalScore}
        </td>
        <td className="py-4 text-right text-muted-foreground hidden sm:table-cell align-top">
          {entry.judgeCount}
        </td>
      </tr>
      {isOpen && (
        <tr data-testid={`standings-breakdown-${entry.competitorId}`}>
          <td colSpan={5} className="bg-muted/20 px-4 py-3">
            <BreakdownPanel
              criteriaBreakdown={entry.criteriaBreakdown}
              groupBreakdown={entry.groupBreakdown}
            />
          </td>
        </tr>
      )}
    </>
  );
}

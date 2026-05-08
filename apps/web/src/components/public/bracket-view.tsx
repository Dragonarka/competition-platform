'use client';

import type {
  PublicBracketData,
  PublicBracketMatchup,
  PublicBracketCompetitor,
} from '@competition-platform/shared';
import { roundLabel } from '@/lib/bracket-utils';

interface BracketViewProps {
  bracket: PublicBracketData;
}

function CompetitorSlot({
  competitor,
  seed,
  isWinner,
  isBye,
  isChampionPath,
}: {
  competitor: PublicBracketCompetitor | null;
  seed: number | null;
  isWinner: boolean;
  isBye: boolean;
  isChampionPath: boolean;
}) {
  if (!competitor && isBye) {
    return (
      <div className="flex items-center justify-between rounded border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
        <span>BYE</span>
      </div>
    );
  }
  if (!competitor) {
    return (
      <div className="flex items-center justify-between rounded border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
        <span>TBD</span>
      </div>
    );
  }
  const winnerClass = isWinner
    ? 'border-green-500 bg-green-50 dark:bg-green-950/20 font-semibold'
    : 'border-border';
  const championClass = isChampionPath && isWinner ? 'ring-1 ring-green-500/50' : '';
  return (
    <div
      className={`flex items-center justify-between rounded border ${winnerClass} ${championClass} px-3 py-2 text-sm`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {seed !== null && (
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold tabular-nums">
            {seed}
          </span>
        )}
        <span className="truncate">{competitor.name}</span>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0 ml-2">
        <span>{competitor.participantId}</span>
        {isWinner && <span className="text-green-700 dark:text-green-400">Winner</span>}
        {isBye && !isWinner && <span className="text-blue-700 dark:text-blue-400">Bye</span>}
      </div>
    </div>
  );
}

function MatchupCard({
  matchup,
  index,
  championCompetitorId,
}: {
  matchup: PublicBracketMatchup;
  index: number;
  championCompetitorId: string | null;
}) {
  const aIsWinner =
    matchup.winnerCompetitorId !== null && matchup.winnerCompetitorId === matchup.competitorAId;
  const bIsWinner =
    matchup.winnerCompetitorId !== null && matchup.winnerCompetitorId === matchup.competitorBId;
  const isChampionPath =
    championCompetitorId !== null && matchup.winnerCompetitorId === championCompetitorId;

  return (
    <div
      data-testid={`bracket-matchup-${matchup.id}`}
      className={`rounded-md border bg-card p-3 space-y-2 ${
        isChampionPath ? 'border-green-500 dark:border-green-600' : 'border-border'
      }`}
    >
      <p className="text-xs font-medium text-muted-foreground">Match {index + 1}</p>
      <CompetitorSlot
        competitor={matchup.competitorA}
        seed={matchup.seedA}
        isWinner={aIsWinner}
        isBye={matchup.isBye}
        isChampionPath={isChampionPath}
      />
      <CompetitorSlot
        competitor={matchup.competitorB}
        seed={matchup.seedB}
        isWinner={bIsWinner}
        isBye={matchup.isBye}
        isChampionPath={isChampionPath}
      />
    </div>
  );
}

function VerticalBracket({
  orderedRounds,
  totalRounds,
  championCompetitorId,
}: {
  orderedRounds: [number, PublicBracketMatchup[]][];
  totalRounds: number;
  championCompetitorId: string | null;
}) {
  return (
    <div className="space-y-6" data-testid="bracket-vertical">
      {orderedRounds.map(([roundNumber, roundMatchups]) => (
        <section key={roundNumber} className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {roundLabel(roundNumber, totalRounds)}
          </h3>
          <div className="space-y-3">
            {roundMatchups.map((m, idx) => (
              <MatchupCard
                key={m.id}
                matchup={m}
                index={idx}
                championCompetitorId={championCompetitorId}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function HorizontalBracket({
  orderedRounds,
  totalRounds,
  championCompetitorId,
}: {
  orderedRounds: [number, PublicBracketMatchup[]][];
  totalRounds: number;
  championCompetitorId: string | null;
}) {
  return (
    <div className="flex overflow-x-auto pb-4" data-testid="bracket-horizontal">
      {orderedRounds.map(([roundNumber, roundMatchups], roundIdx) => {
        const flexGrow = 2 ** roundIdx;
        const isLast = roundIdx === orderedRounds.length - 1;
        return (
          <div key={roundNumber} className="flex shrink-0">
            <div className="flex flex-col min-w-[220px]">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3 text-center">
                {roundLabel(roundNumber, totalRounds)}
              </h3>
              <div className="flex flex-col flex-1">
                {roundMatchups.map((m, idx) => (
                  <div key={m.id} style={{ flex: flexGrow }} className="flex items-center py-1">
                    <div className="w-full">
                      <MatchupCard
                        matchup={m}
                        index={idx}
                        championCompetitorId={championCompetitorId}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {!isLast && (
              <div className="flex flex-col w-8 shrink-0">
                <div className="text-sm font-semibold mb-3 invisible" aria-hidden="true">
                  &nbsp;
                </div>
                <div className="flex flex-col flex-1">
                  {Array.from({ length: Math.ceil(roundMatchups.length / 2) }, (_, i) => (
                    <div key={i} style={{ flex: flexGrow * 2 }} className="flex flex-col">
                      <div className="flex-1 border-t border-r border-border" />
                      <div className="flex-1 border-b border-r border-border" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function BracketView({ bracket }: BracketViewProps) {
  if (bracket.matchups.length === 0) {
    return (
      <div className="text-muted-foreground py-8 text-center" data-testid="bracket-empty">
        <span
          className="mb-3 inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse"
          aria-hidden="true"
        />
        <p>Bracket will appear when the Battles phase begins.</p>
      </div>
    );
  }

  const rounds = new Map<number, PublicBracketMatchup[]>();
  for (const m of bracket.matchups) {
    const list = rounds.get(m.roundNumber) ?? [];
    list.push(m);
    rounds.set(m.roundNumber, list);
  }
  const orderedRounds = [...rounds.entries()].sort((a, b) => a[0] - b[0]);
  const round1Count = rounds.get(1)?.length ?? 0;
  const totalRounds = round1Count > 0 ? Math.log2(round1Count) + 1 : orderedRounds.length;

  let championName: string | null = null;
  let championSeed: number | null = null;
  if (bracket.championCompetitorId) {
    for (const m of bracket.matchups) {
      if (m.competitorAId === bracket.championCompetitorId && m.competitorA) {
        championName = m.competitorA.name;
        championSeed = m.seedA;
        break;
      }
      if (m.competitorBId === bracket.championCompetitorId && m.competitorB) {
        championName = m.competitorB.name;
        championSeed = m.seedB;
        break;
      }
    }
  }

  return (
    <div role="region" aria-label="Tournament bracket">
      {bracket.championCompetitorId && (
        <div
          data-testid="bracket-champion"
          className="rounded-md border border-yellow-500/40 bg-yellow-50 px-4 py-3 text-sm font-semibold text-yellow-900 dark:bg-yellow-950/20 dark:text-yellow-200 mb-6"
        >
          Champion: {championName ?? bracket.championCompetitorId}
          {championSeed !== null && ` (Seed ${championSeed})`}
        </div>
      )}

      {bracket.currentRoundNumber !== null && (
        <p className="text-xs text-muted-foreground mb-4">
          Current round: {roundLabel(bracket.currentRoundNumber, totalRounds)}
        </p>
      )}

      {/* Desktop: horizontal bracket, Mobile: vertical stacked */}
      <div className="hidden lg:block">
        <HorizontalBracket
          orderedRounds={orderedRounds}
          totalRounds={totalRounds}
          championCompetitorId={bracket.championCompetitorId}
        />
      </div>
      <div className="lg:hidden">
        <VerticalBracket
          orderedRounds={orderedRounds}
          totalRounds={totalRounds}
          championCompetitorId={bracket.championCompetitorId}
        />
      </div>
    </div>
  );
}

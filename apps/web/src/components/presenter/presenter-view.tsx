'use client';

import type { StandingsEntry } from '@competition-platform/shared';

type CurrentPhase = 'configuration' | 'cypher' | 'cypher-review' | 'battles' | 'completed';

interface MatchupInfo {
  competitorA: string;
  competitorB: string;
  roundLabel: string;
}

export interface PresenterViewProps {
  competitionName: string;
  currentPhase: CurrentPhase;
  totalScoresSubmitted: number;
  totalScoresExpected: number;
  topStandings: StandingsEntry[];
  currentMatchup: MatchupInfo | null;
  nextMatchup: MatchupInfo | null;
  champion: { name: string; seed: number } | null;
}

const PHASE_BADGES: Record<string, { label: string; className: string }> = {
  configuration: { label: 'SETUP', className: 'bg-zinc-700 text-zinc-200' },
  cypher: { label: 'CYPHER SCORING', className: 'bg-blue-600 text-blue-50' },
  'cypher-review': { label: 'REVIEW IN PROGRESS', className: 'bg-yellow-600 text-yellow-50' },
  battles: { label: 'BATTLES', className: 'bg-green-600 text-green-50' },
  completed: { label: 'COMPLETED', className: 'bg-amber-500 text-amber-950' },
};

const DEFAULT_BADGE = { label: 'UNKNOWN', className: 'bg-zinc-700 text-zinc-200' };

export function PresenterView({
  competitionName,
  currentPhase,
  totalScoresSubmitted,
  totalScoresExpected,
  topStandings,
  currentMatchup,
  nextMatchup,
  champion,
}: PresenterViewProps) {
  const badge = PHASE_BADGES[currentPhase] ?? DEFAULT_BADGE;

  return (
    <div data-testid="presenter-view" className="flex flex-col items-center px-8 py-8 min-h-screen">
      <h1 className="text-3xl font-bold text-center mb-4">{competitionName}</h1>

      <span
        className={`inline-block rounded-full px-4 py-1 text-sm font-bold uppercase tracking-wider mb-8 ${badge.className}`}
      >
        {badge.label}
      </span>

      {currentPhase === 'configuration' && (
        <p className="text-lg text-zinc-400 text-center" data-testid="presenter-setup">
          Competition is being set up. Scoring has not started yet.
        </p>
      )}

      {currentPhase === 'cypher' && (
        <CypherDisplay
          totalScoresSubmitted={totalScoresSubmitted}
          totalScoresExpected={totalScoresExpected}
          topStandings={topStandings}
        />
      )}

      {currentPhase === 'cypher-review' && (
        <div className="w-full max-w-lg text-center" data-testid="presenter-review">
          <StandingsList standings={topStandings} />
          <p className="text-lg text-yellow-400 mt-6">Awaiting advancement confirmation.</p>
        </div>
      )}

      {currentPhase === 'battles' && (
        <BattlesDisplay currentMatchup={currentMatchup} nextMatchup={nextMatchup} />
      )}

      {currentPhase === 'completed' &&
        (champion ? (
          <ChampionDisplay name={champion.name} seed={champion.seed} />
        ) : (
          <p className="text-lg text-zinc-400" data-testid="presenter-champion-loading">
            Loading champion results...
          </p>
        ))}
    </div>
  );
}

function CypherDisplay({
  totalScoresSubmitted,
  totalScoresExpected,
  topStandings,
}: {
  totalScoresSubmitted: number;
  totalScoresExpected: number;
  topStandings: StandingsEntry[];
}) {
  const progress =
    totalScoresExpected > 0 ? Math.round((totalScoresSubmitted / totalScoresExpected) * 100) : 0;

  return (
    <div className="w-full max-w-lg text-center" data-testid="presenter-cypher">
      <div className="mb-6">
        <p className="text-lg text-zinc-300 mb-2">
          {totalScoresSubmitted} / {totalScoresExpected} scores submitted
        </p>
        <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
            data-testid="presenter-progress"
          />
        </div>
      </div>
      <StandingsList standings={topStandings} />
    </div>
  );
}

function StandingsList({ standings }: { standings: StandingsEntry[] }) {
  if (standings.length === 0) {
    return (
      <p className="text-lg text-zinc-500" data-testid="presenter-no-scores">
        Waiting for scores...
      </p>
    );
  }

  return (
    <div className="space-y-3" data-testid="presenter-standings">
      {standings.map((entry) => (
        <div
          key={entry.competitorId}
          className="flex items-center justify-between px-4 py-2 rounded-lg bg-zinc-900"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold text-zinc-400 tabular-nums w-8">{entry.rank}</span>
            <span className="text-xl font-semibold">{entry.competitorName}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function BattlesDisplay({
  currentMatchup,
  nextMatchup,
}: {
  currentMatchup: MatchupInfo | null;
  nextMatchup: MatchupInfo | null;
}) {
  return (
    <div className="w-full max-w-lg text-center" data-testid="presenter-battles">
      {currentMatchup ? (
        <div className="mb-12">
          <p className="text-xl font-bold text-green-400 uppercase tracking-wider mb-6">
            Now Battling
          </p>
          <p className="text-5xl lg:text-[64px] font-bold leading-tight mb-2">
            {currentMatchup.competitorA}
          </p>
          <p className="text-2xl text-zinc-500 font-bold my-2">vs</p>
          <p className="text-5xl lg:text-[64px] font-bold leading-tight mb-4">
            {currentMatchup.competitorB}
          </p>
          <p className="text-lg text-zinc-400">{currentMatchup.roundLabel}</p>
        </div>
      ) : (
        <p className="text-xl text-zinc-400 mb-8" data-testid="presenter-awaiting">
          Awaiting next round...
        </p>
      )}

      {nextMatchup && (
        <div data-testid="presenter-next">
          <p className="text-lg font-bold text-zinc-500 uppercase tracking-wider mb-3">Up Next</p>
          <p className="text-2xl font-semibold">
            {nextMatchup.competitorA} <span className="text-zinc-500">vs</span>{' '}
            {nextMatchup.competitorB}
          </p>
          <p className="text-sm text-zinc-500 mt-1">{nextMatchup.roundLabel}</p>
        </div>
      )}
    </div>
  );
}

function ChampionDisplay({ name, seed }: { name: string; seed: number }) {
  return (
    <div className="text-center" data-testid="presenter-champion">
      <p className="text-2xl font-bold text-yellow-400 uppercase tracking-widest mb-4">Champion</p>
      <div
        className="relative rounded-2xl border-2 border-yellow-500/40 px-8 py-6"
        style={{ animation: 'champion-glow 2s ease-in-out infinite' }}
      >
        <style>{`
          @keyframes champion-glow {
            0%, 100% { box-shadow: 0 0 8px rgba(234, 179, 8, 0.2); border-color: rgba(234, 179, 8, 0.4); }
            50% { box-shadow: 0 0 24px rgba(234, 179, 8, 0.5); border-color: rgba(234, 179, 8, 0.7); }
          }
        `}</style>
        <p className="text-5xl lg:text-[64px] font-bold text-yellow-300 leading-tight">{name}</p>
      </div>
      <p className="text-xl text-zinc-400 mt-4">Seed #{seed}</p>
    </div>
  );
}

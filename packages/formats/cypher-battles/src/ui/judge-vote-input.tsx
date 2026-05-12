'use client';
import { useState } from 'react';

export interface JudgeVoteInputLabels {
  /** Prefix for the seed indicator above each player name. `Seed {seed}` */
  seed: (seed: number) => string;
  /** Text inside the in-flight vote button. */
  submitting: string;
  /** Button text to vote for player 1. The host typically pre-fills the name. */
  voteForPlayer1: string;
  /** Button text to vote for player 2. */
  voteForPlayer2: string;
  /** Button text for the tie option. */
  voteTie: string;
}

const DEFAULT_LABELS: JudgeVoteInputLabels = {
  seed: (seed) => `Seed ${seed}`,
  submitting: 'Submitting...',
  voteForPlayer1: 'Vote Player 1',
  voteForPlayer2: 'Vote Player 2',
  voteTie: 'Tie',
};

export interface JudgeVoteInputProps {
  matchupId: string;
  player1Id: string;
  player1Name: string;
  player1Seed: number | null;
  player2Id: string;
  player2Name: string;
  player2Seed: number | null;
  onVote: (vote: 'player1' | 'player2' | 'tie') => void | Promise<void>;
  disabled?: boolean;
  /**
   * User-facing strings supplied by the host application. Optional so that
   * existing consumers and tests can render without wiring i18n; the defaults
   * are English-language placeholders. Production hosts pass translated
   * strings (see apps/web/src/components/admin/battles-voting-panel.tsx).
   */
  labels?: Partial<JudgeVoteInputLabels>;
}

export function JudgeVoteInput({
  player1Name,
  player1Seed,
  player2Name,
  player2Seed,
  onVote,
  disabled = false,
  labels,
}: JudgeVoteInputProps) {
  const [submitting, setSubmitting] = useState<null | 'player1' | 'player2' | 'tie'>(null);
  const l = { ...DEFAULT_LABELS, ...labels };

  async function handleVote(choice: 'player1' | 'player2' | 'tie') {
    if (disabled || submitting) return;
    setSubmitting(choice);
    try {
      await onVote(choice);
    } finally {
      setSubmitting(null);
    }
  }

  const lockButtons = disabled || submitting !== null;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="text-center">
          {player1Seed !== null && (
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {l.seed(player1Seed)}
            </p>
          )}
          <p className="text-2xl font-bold break-words">{player1Name}</p>
        </div>
        <div className="text-center">
          {player2Seed !== null && (
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {l.seed(player2Seed)}
            </p>
          )}
          <p className="text-2xl font-bold break-words">{player2Name}</p>
        </div>
      </div>

      <button
        type="button"
        disabled={lockButtons}
        onClick={() => handleVote('player1')}
        className="min-h-[64px] w-full rounded-md bg-primary text-primary-foreground font-bold text-lg disabled:opacity-50 active:scale-[0.99] transition"
      >
        {submitting === 'player1' ? l.submitting : l.voteForPlayer1}
      </button>
      <button
        type="button"
        disabled={lockButtons}
        onClick={() => handleVote('player2')}
        className="min-h-[64px] w-full rounded-md bg-secondary text-secondary-foreground font-bold text-lg border border-border disabled:opacity-50 active:scale-[0.99] transition"
      >
        {submitting === 'player2' ? l.submitting : l.voteForPlayer2}
      </button>
      <button
        type="button"
        disabled={lockButtons}
        onClick={() => handleVote('tie')}
        className="min-h-[64px] w-full rounded-md bg-muted text-foreground font-bold text-lg border-2 border-dashed border-border disabled:opacity-50 active:scale-[0.99] transition"
      >
        {submitting === 'tie' ? l.submitting : l.voteTie}
      </button>
    </div>
  );
}

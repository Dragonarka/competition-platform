'use client';
import { useState } from 'react';

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
}

export function JudgeVoteInput({
  player1Name,
  player1Seed,
  player2Name,
  player2Seed,
  onVote,
  disabled = false,
}: JudgeVoteInputProps) {
  const [submitting, setSubmitting] = useState<null | 'player1' | 'player2' | 'tie'>(null);

  async function handleVote(choice: 'player1' | 'player2' | 'tie') {
    if (disabled || submitting) return;
    setSubmitting(choice);
    try {
      await onVote(choice);
    } finally {
      // Parent advances to next matchup on success. Reset for safety in case
      // the parent decides to keep this matchup mounted (e.g. error retry).
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
              Seed {player1Seed}
            </p>
          )}
          <p className="text-2xl font-bold break-words">{player1Name}</p>
        </div>
        <div className="text-center">
          {player2Seed !== null && (
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Seed {player2Seed}
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
        {submitting === 'player1' ? 'Submitting...' : `Vote ${player1Name}`}
      </button>
      <button
        type="button"
        disabled={lockButtons}
        onClick={() => handleVote('player2')}
        className="min-h-[64px] w-full rounded-md bg-secondary text-secondary-foreground font-bold text-lg border border-border disabled:opacity-50 active:scale-[0.99] transition"
      >
        {submitting === 'player2' ? 'Submitting...' : `Vote ${player2Name}`}
      </button>
      <button
        type="button"
        disabled={lockButtons}
        onClick={() => handleVote('tie')}
        className="min-h-[64px] w-full rounded-md bg-muted text-foreground font-bold text-lg border-2 border-dashed border-border disabled:opacity-50 active:scale-[0.99] transition"
      >
        {submitting === 'tie' ? 'Submitting...' : 'Tie'}
      </button>
    </div>
  );
}

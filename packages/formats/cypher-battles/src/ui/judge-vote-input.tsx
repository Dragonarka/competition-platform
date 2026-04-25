// Full implementation: Story 5.2

export interface JudgeVoteInputProps {
  player1Id: string;
  player1Name: string;
  player2Id: string;
  player2Name: string;
  onVote: (vote: 'player1' | 'player2' | 'tie') => void;
}

export function JudgeVoteInput({ player1Name, player2Name }: JudgeVoteInputProps) {
  return (
    <div>
      Vote: {player1Name} vs {player2Name} — full UI in Story 5.2
    </div>
  );
}

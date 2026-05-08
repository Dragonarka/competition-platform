export function roundLabel(roundNumber: number, totalRounds: number): string {
  if (totalRounds <= 0) return `Round ${roundNumber}`;
  const fromFinal = totalRounds - roundNumber;
  if (fromFinal === 0) return 'Final';
  if (fromFinal === 1) return 'Semifinals';
  if (fromFinal === 2) return 'Quarterfinals';
  const matchupsAtRound = 2 ** (fromFinal + 1);
  return `Round of ${matchupsAtRound}`;
}

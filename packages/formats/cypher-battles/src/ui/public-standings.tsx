// Full implementation: Story 6.1

export interface PublicStandingsProps {
  competitionId: string;
}

export function PublicStandings({ competitionId }: PublicStandingsProps) {
  return <div>Live standings for {competitionId} — full UI in Story 6.1</div>;
}

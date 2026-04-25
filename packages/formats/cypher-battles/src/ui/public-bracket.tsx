// Full implementation: Story 6.2

export interface PublicBracketProps {
  competitionId: string;
}

export function PublicBracket({ competitionId }: PublicBracketProps) {
  return <div>Bracket view for {competitionId} — full UI in Story 6.2</div>;
}

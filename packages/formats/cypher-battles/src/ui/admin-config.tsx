// Full implementation: Story 2.2 integration

export interface AdminConfigProps {
  competitionId: string;
  onSave: (config: Record<string, unknown>) => void;
}

export function AdminConfig({ competitionId }: AdminConfigProps) {
  return <div>Admin config for {competitionId} — full UI in Story 2.2 integration</div>;
}

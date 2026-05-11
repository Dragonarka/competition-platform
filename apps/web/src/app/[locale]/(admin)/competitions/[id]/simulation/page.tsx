import { SimulationClient } from '@/components/admin/simulation-client';

export default async function SimulationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SimulationClient competitionId={id} />;
}

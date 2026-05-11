export interface SimulationResetPayload {
  competitionId: string;
  resetAt: string;
  scoresDeleted: number;
  votesDeleted: number;
  matchupsDeleted: number;
  groupAssignmentsDeleted: number;
}

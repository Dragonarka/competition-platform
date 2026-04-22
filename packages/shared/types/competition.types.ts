export type CompetitionStatus = 'draft' | 'active' | 'completed' | 'archived';

export interface Competition {
  id: string;
  name: string;
  description: string | null;
  date: string | null; // ISO 8601 — tRPC serializes timestamps as strings
  status: CompetitionStatus;
  createdAt: string; // ISO 8601
}

export type ParticipantFormat = 'individual' | 'pairs';

export interface Participant {
  id: string;
  competitionId: string;
  participantId: string;
  name: string;
  createdAt: Date;
}

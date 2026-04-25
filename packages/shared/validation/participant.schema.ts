import { z } from 'zod';

export const addParticipantSchema = z.object({
  competitionId: z.string().min(1),
  participantId: z
    .string()
    .trim()
    .min(1, 'Participant ID is required')
    .max(50, 'ID must be 50 characters or fewer'),
  name: z
    .string()
    .trim()
    .min(1, 'Participant name is required')
    .max(100, 'Name must be 100 characters or fewer'),
});

export type AddParticipantInput = z.infer<typeof addParticipantSchema>;

export const setParticipantFormatSchema = z.object({
  competitionId: z.string().min(1),
  format: z.enum(['individual', 'pairs']),
});

export type SetParticipantFormatInput = z.infer<typeof setParticipantFormatSchema>;

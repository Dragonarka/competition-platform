import { z } from 'zod';

const participantIdField = z
  .string()
  .trim()
  .min(1, 'Participant ID is required')
  .max(50, 'ID must be 50 characters or fewer');

const participantNameField = z
  .string()
  .trim()
  .min(1, 'Participant name is required')
  .max(100, 'Name must be 100 characters or fewer');

const participantPersonSchema = z.object({
  participantId: participantIdField,
  name: participantNameField,
});

export const addParticipantSchema = z.object({
  competitionId: z.string().min(1),
  // Optional — when omitted or empty, the server auto-generates the next
  // sequential ID (P-001, P-002, …) scoped to the competition.
  participantId: participantIdField.optional(),
  name: participantNameField,
});

export type AddParticipantInput = z.infer<typeof addParticipantSchema>;

export const addPairSchema = z.object({
  competitionId: z.string().min(1),
  leader: participantPersonSchema,
  follower: participantPersonSchema,
});

export type AddPairInput = z.infer<typeof addPairSchema>;

export const bulkAddParticipantsSchema = z.object({
  competitionId: z.string().min(1),
  rows: z.array(participantPersonSchema).min(1).max(200),
});

export type BulkAddParticipantsInput = z.infer<typeof bulkAddParticipantsSchema>;

export const bulkAddPairsSchema = z.object({
  competitionId: z.string().min(1),
  pairs: z
    .array(
      z.object({
        leader: participantPersonSchema,
        follower: participantPersonSchema,
      }),
    )
    .min(1)
    .max(100),
});

export type BulkAddPairsInput = z.infer<typeof bulkAddPairsSchema>;

export const setParticipantFormatSchema = z.object({
  competitionId: z.string().min(1),
  format: z.enum(['individual', 'pairs']),
});

export type SetParticipantFormatInput = z.infer<typeof setParticipantFormatSchema>;

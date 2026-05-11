import { z } from 'zod';

export const criterionScoreSchema = z.object({
  criterionId: z.string().min(1),
  value: z.string().regex(/^\d+\.\d{2}$/, 'Score must be formatted as X.XX (e.g. "8.75")'),
});

export const submitScoreSchema = z.object({
  token: z.string().min(1, 'Judge token is required'),
  competitorId: z.string().min(1, 'Competitor ID is required'),
  scores: z.array(criterionScoreSchema).min(1, 'At least one criterion score is required'),
  idempotencyKey: z.string().min(1, 'Idempotency key is required'),
});

export type SubmitScoreInput = z.infer<typeof submitScoreSchema>;

// .trim() runs FIRST so .min(1) sees the trimmed length — this rejects
// whitespace-only input ("   "). Reverse order would accept it.
export const overrideScoreSchema = z.object({
  scoreId: z.string().min(1, 'Score ID is required'),
  newScores: z.array(criterionScoreSchema).min(1, 'At least one criterion score is required'),
  reason: z
    .string()
    .trim()
    .min(1, 'A reason is required for all score modifications')
    .max(500, 'Reason must be 500 characters or less'),
});

export type OverrideScoreInput = z.infer<typeof overrideScoreSchema>;

export const getScoreAuditTrailSchema = z.object({
  scoreId: z.string().min(1, 'Score ID is required'),
});

export type GetScoreAuditTrailInput = z.infer<typeof getScoreAuditTrailSchema>;

export const listScoresForCompetitionSchema = z.object({
  competitionId: z.string().min(1, 'Competition ID is required'),
});

export type ListScoresForCompetitionInput = z.infer<typeof listScoresForCompetitionSchema>;

export const submitOrganizerScoreSchema = z.object({
  competitionId: z.string().min(1, 'Competition ID is required'),
  competitorId: z.string().min(1, 'Competitor ID is required'),
  scores: z.array(criterionScoreSchema).min(1, 'At least one criterion score is required'),
  idempotencyKey: z.string().min(1, 'Idempotency key is required'),
  simulatedGroupIndex: z.number().int().min(0).max(25).optional(),
  simulatedJudgeIndex: z.number().int().min(0).max(31).optional(),
});

export type SubmitOrganizerScoreInput = z.infer<typeof submitOrganizerScoreSchema>;

export const VOTE_CHOICES = ['player1', 'player2', 'tie'] as const;
export type VoteChoice = (typeof VOTE_CHOICES)[number];

export const submitVoteSchema = z.object({
  token: z.string().min(1, 'Judge token is required'),
  matchupId: z.string().min(1, 'Matchup ID is required'),
  vote: z.enum(VOTE_CHOICES),
  idempotencyKey: z.string().min(1, 'Idempotency key is required'),
});

export type SubmitVoteInput = z.infer<typeof submitVoteSchema>;

export const submitOrganizerVoteSchema = z.object({
  competitionId: z.string().min(1, 'Competition ID is required'),
  matchupId: z.string().min(1, 'Matchup ID is required'),
  vote: z.enum(VOTE_CHOICES),
  idempotencyKey: z.string().min(1, 'Idempotency key is required'),
  simulatedJudgeIndex: z.number().int().min(0).max(31).optional(),
});

export type SubmitOrganizerVoteInput = z.infer<typeof submitOrganizerVoteSchema>;

export const resolveTieSchema = z.object({
  competitionId: z.string().min(1, 'Competition ID is required'),
  matchupId: z.string().min(1, 'Matchup ID is required'),
  winnerCompetitorId: z.string().min(1, 'Winner competitor ID is required'),
  reason: z
    .string()
    .trim()
    .min(4, 'Reason must be at least 4 characters')
    .max(280, 'Reason must be 280 characters or less'),
});

export type ResolveTieInput = z.infer<typeof resolveTieSchema>;

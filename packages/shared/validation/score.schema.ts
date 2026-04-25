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

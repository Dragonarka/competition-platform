import { z } from 'zod';

const competitorActionSchema = z.object({
  competitorId: z.string().min(1, 'Competitor ID is required'),
  competitionId: z.string().min(1, 'Competition ID is required'),
  reason: z
    .string()
    .trim()
    .min(1, 'A reason is required for all competitor modifications')
    .max(500, 'Reason must be 500 characters or less'),
});

export const withdrawCompetitorSchema = competitorActionSchema;
export const rescueCompetitorSchema = competitorActionSchema;

export type WithdrawCompetitorInput = z.infer<typeof withdrawCompetitorSchema>;
export type RescueCompetitorInput = z.infer<typeof rescueCompetitorSchema>;

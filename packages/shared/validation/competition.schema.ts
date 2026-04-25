import { z } from 'zod';

export const createCompetitionSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Competition name is required')
    .max(200, 'Competition name must be 200 characters or fewer'),
  date: z.string().datetime({ offset: true }).nullable().optional(),
  description: z
    .string()
    .max(2000, 'Description must be 2000 characters or fewer')
    .nullable()
    .optional(),
});

export type CreateCompetitionInput = z.infer<typeof createCompetitionSchema>;

export const startCypherPhaseSchema = z.object({
  competitionId: z.string().min(1, 'Competition ID is required'),
});

export type StartCypherPhaseInput = z.infer<typeof startCypherPhaseSchema>;

import { z } from 'zod';

export const competitionFormatKindSchema = z.enum(['cypher_battles', 'simple_bracket']);
export type CompetitionFormatKind = z.infer<typeof competitionFormatKindSchema>;

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
  // Defaults to the original format. Simulations and live competitions both
  // accept the same set; the runtime branches on this column from then on.
  formatKind: competitionFormatKindSchema.optional(),
});

export type CreateCompetitionInput = z.infer<typeof createCompetitionSchema>;

export const createSimulationSchema = createCompetitionSchema.extend({
  mockParticipantCount: z
    .number()
    .int()
    .min(2, 'At least 2 participants required')
    .max(200, 'Maximum 200 participants')
    .optional(),
  sourceCompetitionId: z.string().min(1).optional(),
});

export type CreateSimulationInput = z.infer<typeof createSimulationSchema>;

export const startSimpleBracketSchema = z.object({
  competitionId: z.string().min(1, 'Competition ID is required'),
});

export type StartSimpleBracketInput = z.infer<typeof startSimpleBracketSchema>;

export const startCypherPhaseSchema = z.object({
  competitionId: z.string().min(1, 'Competition ID is required'),
});

export type StartCypherPhaseInput = z.infer<typeof startCypherPhaseSchema>;

export const completeCypherPhaseSchema = z.object({
  competitionId: z.string().min(1, 'Competition ID is required'),
});

export type CompleteCypherPhaseInput = z.infer<typeof completeCypherPhaseSchema>;

export const getDashboardSnapshotSchema = z.object({
  competitionId: z.string().min(1, 'Competition ID is required'),
});

export type GetDashboardSnapshotInput = z.infer<typeof getDashboardSnapshotSchema>;

export const setSoloModeSchema = z.object({
  competitionId: z.string().min(1, 'Competition ID is required'),
  soloMode: z.boolean(),
});

export type SetSoloModeInput = z.infer<typeof setSoloModeSchema>;

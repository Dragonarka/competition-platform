import { z } from 'zod';

export const resetSimulationSchema = z.object({
  competitionId: z.string().min(1, 'Competition ID is required'),
});

export type ResetSimulationInput = z.infer<typeof resetSimulationSchema>;

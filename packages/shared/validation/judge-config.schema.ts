import { z } from 'zod';

export const setJudgeConfigSchema = z
  .object({
    competitionId: z.string().min(1),
    cypherJudgeCount: z
      .number()
      .int('Must be a whole number')
      .min(1, 'Must have at least 1 judge')
      .max(100, 'Maximum 100 judges'),
    cypherGroupCount: z
      .number()
      .int('Must be a whole number')
      .min(1, 'Must have at least 1 group')
      .max(50, 'Maximum 50 groups'),
    advancementThreshold: z
      .number()
      .int('Must be a whole number')
      .min(1, 'At least 1 participant must advance'),
    battlesJudgeCount: z
      .number()
      .int('Must be a whole number')
      .min(1, 'Must have at least 1 battles judge')
      .max(100, 'Maximum 100 judges'),
    tieBreakingRule: z.enum(['re_vote', 'organizer_decision']),
  })
  .refine((d) => d.cypherGroupCount <= d.cypherJudgeCount, {
    message: 'Number of groups cannot exceed total judge count',
    path: ['cypherGroupCount'],
  });

export type SetJudgeConfigInput = z.infer<typeof setJudgeConfigSchema>;

import { z } from 'zod';

export const generateJudgeLinksSchema = z.object({
  competitionId: z.string().min(1),
  count: z
    .number()
    .int('Must be a whole number')
    .min(1, 'Must generate at least 1 link')
    .max(50, 'Maximum 50 links at once'),
});
export type GenerateJudgeLinksInput = z.infer<typeof generateJudgeLinksSchema>;

export const validateJudgeTokenSchema = z.object({
  token: z.string().min(1),
});
export type ValidateJudgeTokenInput = z.infer<typeof validateJudgeTokenSchema>;

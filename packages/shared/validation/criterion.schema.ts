import { z } from 'zod';

const decimalStringSchema = z.string().regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid decimal number');

export const addCriterionSchema = z
  .object({
    competitionId: z.string().min(1),
    name: z
      .string()
      .trim()
      .min(1, 'Criterion name is required')
      .max(100, 'Name must be 100 characters or fewer'),
    minScore: decimalStringSchema,
    maxScore: decimalStringSchema,
  })
  .refine((data) => parseFloat(data.minScore) < parseFloat(data.maxScore), {
    message: 'Minimum must be less than maximum',
    path: ['minScore'],
  });

export type AddCriterionInput = z.infer<typeof addCriterionSchema>;

export const copyCriteriaTemplateSchema = z
  .object({
    sourceCompetitionId: z.string().min(1),
    targetCompetitionId: z.string().min(1),
  })
  .refine((data) => data.sourceCompetitionId !== data.targetCompetitionId, {
    message: 'Source and target must be different competitions',
    path: ['targetCompetitionId'],
  });

export type CopyCriteriaTemplateInput = z.infer<typeof copyCriteriaTemplateSchema>;

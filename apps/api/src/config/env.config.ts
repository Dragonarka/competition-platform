import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('3001'),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  DATABASE_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).optional(),
  CLERK_SECRET_KEY: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);

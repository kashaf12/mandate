import { z } from 'zod';

export const envSchema = z.object({
  DATABASE_URL: z.string().url(),

  PORT: z.string().transform(Number).default('3000'),
  NODE_ENV: z
    .enum(['development', 'staging', 'production'])
    .default('development'),

  JWT_SECRET: z.string().min(32),
  API_KEY_SALT: z.string().min(32),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  return envSchema.parse(config);
}

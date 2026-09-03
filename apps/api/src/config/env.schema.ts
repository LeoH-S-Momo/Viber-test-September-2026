import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3333),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  /** Duracao do hold temporario de cabine (ver ADR-0009) — minutos ate um HELD expirar sozinho. */
  CABIN_HOLD_MINUTES: z.coerce.number().int().positive().default(15),

  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_REGION: z.string().optional(),
  STORAGE_ACCESS_KEY: z.string().optional(),
  STORAGE_SECRET_KEY: z.string().optional(),
  STORAGE_BUCKET: z.string().optional(),

  LOG_LEVEL: z.string().default('info'),
  SENTRY_DSN: z.string().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),

  WEB_APP_URL: z.string().url().default('http://localhost:3000'),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Usado como `validate` do ConfigModule — a aplicacao recusa subir se uma
 * variavel obrigatoria estiver ausente ou em formato invalido, em vez de
 * falhar silenciosamente mais tarde em runtime.
 */
export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const issues = result.error.flatten().fieldErrors;
    console.error('Variaveis de ambiente invalidas:', issues);
    throw new Error(
      'Variaveis de ambiente invalidas. Verifique o arquivo .env (ver .env.example).',
    );
  }

  return result.data;
}

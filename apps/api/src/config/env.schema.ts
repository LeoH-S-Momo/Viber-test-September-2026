import { z } from 'zod';

/**
 * Um segredo de assinatura JWT curto (o schema so exigia `min(1)` antes desta revisao de
 * hardening) e forcavel por brute-force offline em minutos com hardware comum — 32 caracteres
 * e o piso pratico recomendado pra HS256 (256 bits nominais; menos que isso e a "seguranca" do
 * algoritmo fica maior que a do segredo em si). Os dois segredos precisam ser DIFERENTES entre
 * si — reusar o mesmo pros dois tokens deixaria um access token vazado utilizavel pra forjar
 * refresh tokens (e vice-versa).
 */
const jwtSecret = z.string().min(32, 'Segredo JWT precisa ter pelo menos 32 caracteres.');

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(3333),

    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    /** Duracao do hold temporario de cabine (ver ADR-0009) — minutos ate um HELD expirar sozinho. */
    CABIN_HOLD_MINUTES: z.coerce.number().int().positive().default(15),

    JWT_ACCESS_SECRET: jwtSecret,
    JWT_REFRESH_SECRET: jwtSecret,
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

    /**
     * SMTP usado por NotificationEmailProcessor (ver docs/architecture/decisions/0019-events-and-notifications.md).
     * Defaults de dev apontam pro MailHog local (`mailhog.exe`, SMTP :1025, UI web :8025) — nenhuma
     * credencial real precisa existir em desenvolvimento.
     */
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().int().positive().default(1025),
    SMTP_SECURE: z.coerce.boolean().default(false),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_FROM: z.string().default('SeaPass <no-reply@seapass.com>'),
    /** Antecedencia do lembrete de embarque (ver BookingsService/NotificationsListener) — horas antes de `embarkationDate`. */
    BOARDING_REMINDER_HOURS_BEFORE: z.coerce.number().int().positive().default(24),
  })
  .refine((env) => env.JWT_ACCESS_SECRET !== env.JWT_REFRESH_SECRET, {
    message: 'JWT_ACCESS_SECRET e JWT_REFRESH_SECRET precisam ser diferentes um do outro.',
    path: ['JWT_REFRESH_SECRET'],
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.DATABASE_URL.includes('sslmode='), {
    // Nao bloqueia dev/test (bancos locais nao tem TLS configurado) — so producao, onde
    // trafegar credenciais/dados de reserva sem TLS pro Postgres seria uma exposicao real.
    message: 'Em producao, DATABASE_URL precisa especificar sslmode (ex.: ?sslmode=require).',
    path: ['DATABASE_URL'],
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

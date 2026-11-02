import { z } from "zod";

const optional = z.string().optional();

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().default("./data/grocer.db"),
  BETTER_AUTH_URL: z.url().optional(),
  BETTER_AUTH_SECRET: optional,
  // Behind a reverse proxy, key rate limits by the client address it appends to X-Forwarded-For.
  TRUST_PROXY: z.stringbool().default(false),
  TRUSTED_ORIGINS: z
    .string()
    .default("")
    .transform((s) => s.split(",").map((o) => o.trim()).filter(Boolean)),
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  APPLE_CLIENT_ID: optional,
  APPLE_CLIENT_SECRET: optional,
  APPLE_APP_BUNDLE_IDENTIFIER: z.string().default("com.grocer.app"),
  RESEND_API_KEY: z.string(),
  EMAIL_FROM: z.string().default("Grocer <no-reply@example.com>"),
  NOMINATIM_URL: z.url().default("https://nominatim.openstreetmap.org"),
  // Scheduled sync times, read as Asia/Jerusalem wall-clock time whatever the server timezone.
  SYNC_TIMES: z
    .string()
    .default("05:00,12:00,23:30")
    .transform((s) => s.split(",").map((t) => t.trim()).filter(Boolean))
    .pipe(z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM, 00:00-23:59")).min(1)),
  SYNC_TOKEN: optional, // the private trigger port starts only when set
  INTERNAL_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  INTERNAL_HOST: z.string().default("127.0.0.1"),
  SENTRY_DSN: optional, // unset: errors are only logged, nothing is sent
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(1),
});

export type Config = z.infer<typeof schema>;

/** Validates env vars. Empty values count as unset, so `.env.example` can list every var. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  return schema.parse(Object.fromEntries(Object.entries(env).filter(([, v]) => v !== "")));
}

import { z } from "zod";

const optional = z.string().optional();

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().default("./data/grocer.db"),
  BETTER_AUTH_URL: z.url().optional(),
  BETTER_AUTH_SECRET: optional,
  TRUSTED_ORIGINS: z
    .string()
    .default("")
    .transform((s) => s.split(",").map((o) => o.trim()).filter(Boolean)),
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  APPLE_CLIENT_ID: optional,
  APPLE_CLIENT_SECRET: optional,
  APPLE_APP_BUNDLE_IDENTIFIER: z.string().default("com.grocer.app"),
  NOMINATIM_URL: z.url().default("https://nominatim.openstreetmap.org"),
});

export type Config = z.infer<typeof schema>;

/** Validates env vars. Empty values count as unset, so `.env.example` can list every var. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  return schema.parse(Object.fromEntries(Object.entries(env).filter(([, v]) => v !== "")));
}

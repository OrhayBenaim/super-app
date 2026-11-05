import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3002),
  // In production only `tailscale serve`, in the same network namespace, reaches it (docker-compose.yaml).
  HOST: z.string().default("127.0.0.1"),
  // The api's private app (its INTERNAL_HOST:INTERNAL_PORT) and its SYNC_TOKEN.
  API_URL: z.url().default("http://127.0.0.1:3001"),
  SYNC_TOKEN: z.string().min(1),
});

export type Config = z.infer<typeof schema>;

/** Validates env vars. Empty values count as unset, so `.env.example` can list every var. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  return schema.parse(Object.fromEntries(Object.entries(env).filter(([, v]) => v !== "")));
}

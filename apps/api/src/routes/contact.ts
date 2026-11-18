import { Hono } from "hono";
import { z } from "zod";
import { CONTACT_TEXT_MAX, TOPICS } from "@grocer/shared/contact";
import { contactEmail } from "#/emails/contact.ts";
import { requireUser, type AppEnv } from "#/middleware.ts";

const body = z.object({
  topic: z.enum(TOPICS),
  text: z.string().trim().min(1).max(CONTACT_TEXT_MAX),
  appVersion: z.string().min(1).max(32),
  os: z.enum(["ios", "android"]),
});

/** A signed-in User's Contact message, emailed to the support inbox. Nothing is stored. */
export const contactRoutes = new Hono<AppEnv>().post("/", requireUser, async (c) => {
  const parsed = body.safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "invalid body" }, 400);
  const { deps, user } = c.var;
  try {
    await deps.mailer.send(contactEmail(deps.config.SUPPORT_EMAIL, { ...parsed.data, email: user.email }));
  } catch (error) {
    deps.errorHandler.report(error);
    return c.json({ error: "mail_failed" }, 502);
  }
  return c.body(null, 204);
});

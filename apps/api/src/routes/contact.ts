import { Hono } from "hono";
import { z } from "zod";
import { CONTACT_TEXT_MAX, TOPICS, type Topic } from "@grocer/shared/contact";
import { requireUser, type AppEnv } from "#/middleware.ts";

const TOPIC_LABELS: Record<Topic, string> = {
  general: "General",
  bug: "Bug",
  improvement: "Improvement",
  missingSupermarket: "Missing supermarket",
  missingProduct: "Missing product",
};

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
  const { topic, text, appVersion, os } = parsed.data;
  const { deps, user } = c.var;
  const preview = text.replace(/\s+/g, " ").slice(0, 60);
  try {
    await deps.mailer.send({
      to: deps.config.SUPPORT_EMAIL,
      replyTo: user.email,
      subject: `[Grocer] ${TOPIC_LABELS[topic]}: ${preview}`,
      text: `${text}\n\n--\n${user.email}\nApp version: ${appVersion}\nOS: ${os}`,
    });
  } catch (error) {
    deps.errorHandler.report(error);
    return c.json({ error: "mail_failed" }, 502);
  }
  return c.body(null, 204);
});

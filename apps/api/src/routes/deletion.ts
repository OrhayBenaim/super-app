import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  redeemToken,
  deleteAccount,
  deleteData,
  DELETION_KINDS,
  sendDeletionCode,
  verifyDeletionCode,
  type DeletionKind,
} from "#/deletion/deletion.ts";
import { codeStep, COPY, doneStep, emailStep, resendStep, warningStep } from "#/deletion/steps.ts";
import type { AppEnv } from "#/middleware.ts";

// Read once at startup. htmx is served from here, so the pages load no third-party script.
const shell = readFileSync(new URL("../pages/deletion.html", import.meta.url), "utf8");
const htmx = readFileSync(createRequire(import.meta.url).resolve("htmx.org/dist/htmx.min.js"), "utf8");
const page = (kind: DeletionKind) =>
  shell.replaceAll("{{title}}", COPY[kind].title).replace("{{intro}}", COPY[kind].intro).replace("{{step}}", String(emailStep(kind)));
const pages = { account: page("account"), data: page("data") };

const kind = z.enum(DELETION_KINDS);
const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const sendBody = z.object({ kind, email });
const verifyBody = z.object({ kind, email, code: z.string().trim().max(64) });
const confirmBody = z.object({ kind, token: z.string().max(2048) });

async function parse<T extends z.ZodType>(c: Context<AppEnv>, schema: T) {
  return schema.safeParse(await c.req.parseBody().catch(() => undefined));
}
const bad = (c: Context<AppEnv>, error: z.ZodError) => c.json({ error: error.issues[0]?.message ?? "invalid body" }, 400);

/** Public Account deletion and Data deletion pages (Google Play's Data safety links), one htmx step per POST. */
export const deletionRoutes = new Hono<AppEnv>()
  .get("/delete-account", (c) => c.html(pages.account))
  .get("/delete-data", (c) => c.html(pages.data))
  .get("/assets/htmx.min.js", (c) => c.body(htmx, 200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "public, max-age=86400" }))
  .post("/deletion/send", async (c) => {
    const body = await parse(c, sendBody);
    if (!body.success) return bad(c, body.error);
    sendDeletionCode(c.var.deps, body.data.kind, body.data.email);
    return c.html(codeStep(body.data.kind, body.data.email));
  })
  .post("/deletion/verify", async (c) => {
    const body = await parse(c, verifyBody);
    if (!body.success) return bad(c, body.error);
    const { kind, email, code } = body.data;
    const result = await verifyDeletionCode(c.var.deps, kind, email, code);
    if ("token" in result) return c.html(warningStep(kind, result.token));
    return c.html(result.error === "wrong" ? codeStep(kind, email, "wrong") : resendStep(kind, email, result.error));
  })
  .post("/deletion/confirm", async (c) => {
    const body = await parse(c, confirmBody);
    if (!body.success) return bad(c, body.error);
    const { kind, token } = body.data;
    const checked = await redeemToken(c.var.deps, kind, token);
    if ("error" in checked) return c.html(emailStep(kind, checked.error));
    (kind === "account" ? deleteAccount : deleteData)(c.var.deps, checked.email);
    return c.html(doneStep(kind));
  });

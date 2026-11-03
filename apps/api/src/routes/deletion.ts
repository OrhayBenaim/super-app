import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { APIError } from "better-auth/api";
import { Hono, type Context } from "hono";
import { csrf } from "hono/csrf";
import { z } from "zod";
import { cancelDeletion, checkDeletionCode, confirmDeletion, DELETION_KINDS, sendDeletionCode } from "#/deletion/deletion.ts";
import { chooseStep, codeStep, confirmStep, doneStep, signInStep, type StepError } from "#/deletion/steps.ts";
import { requireUser, type AppEnv } from "#/middleware.ts";

// Read once at startup. htmx is served from here, so the page loads no third-party script.
const shell = readFileSync(new URL("../pages/deletion.html", import.meta.url), "utf8");
const htmx = readFileSync(createRequire(import.meta.url).resolve("htmx.org/dist/htmx.min.js"), "utf8");

/** Where the flow starts: sign in, then choose. Google Play's Data safety links (/delete-account, /delete-data) lead here. */
const START = "/account";

const kindBody = z.object({ kind: z.enum(DELETION_KINDS) });
const codeBody = kindBody.extend({ code: z.string().trim().max(64) });
const signInBody = z.object({ email: z.string().trim().max(254), password: z.string().max(256) });

async function parse<T extends z.ZodType>(c: Context<AppEnv>, schema: T) {
  return schema.safeParse(await c.req.parseBody().catch(() => undefined));
}
const bad = (c: Context<AppEnv>, error: z.ZodError) => c.json({ error: error.issues[0]?.message ?? "invalid body" }, 400);
/** Passes better-auth's cookies (session, OAuth state, sign-out) on to the browser. */
const passCookies = (c: Context<AppEnv>, headers: Headers) => {
  for (const cookie of headers.getSetCookie()) c.header("set-cookie", cookie, { append: true });
};
const signOut = async (c: Context<AppEnv>) =>
  passCookies(c, (await c.var.deps.auth.api.signOut({ headers: c.req.raw.headers, returnHeaders: true })).headers);
const signInFor = (c: Context<AppEnv>, error?: StepError) => signInStep({ google: "google" in c.var.deps.auth.options.socialProviders, error });
const page = (step: unknown) => shell.replace("{{step}}", () => String(step));
const session = (c: Context<AppEnv>) => c.var.deps.auth.api.getSession({ headers: c.req.raw.headers });

/** The public page for Account deletion and Data deletion: sign in like the app, then one htmx step per request. */
export const deletionRoutes = new Hono<AppEnv>()
  // Every step POST carries the session cookie, so only the page's own origin may send one.
  .use("/deletion/*", csrf({ origin: (origin, c) => origin === new URL(c.var.deps.config.BETTER_AUTH_URL ?? c.req.url).origin }))
  .get("/assets/htmx.min.js", (c) => c.body(htmx, 200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "public, max-age=86400" }))
  .get(START, async (c) => {
    const signedIn = await session(c);
    if (signedIn) return c.html(page(chooseStep(signedIn.user.email)));
    // better-auth sends an OAuth failure back here as ?error=<code>; with implicit sign-up off, "no account" is signup_disabled.
    const error = c.req.query("error");
    return c.html(page(signInFor(c, error === undefined ? undefined : error === "signup_disabled" ? "noAccount" : "oauth")));
  })
  .on("GET", ["/delete-account", "/delete-data"], async (c) => {
    const signedIn = await session(c);
    return signedIn ? c.html(page(chooseStep(signedIn.user.email))) : c.redirect(START, 302);
  })
  .post("/deletion/sign-in", async (c) => {
    const body = await parse(c, signInBody);
    if (!body.success) return bad(c, body.error);
    try {
      const { headers, response } = await c.var.deps.auth.api.signInEmail({ body: body.data, headers: c.req.raw.headers, returnHeaders: true });
      passCookies(c, headers);
      return c.html(chooseStep(response.user.email));
    } catch (error) {
      if (error instanceof APIError && error.statusCode < 500) return c.html(signInFor(c, "wrongPassword"));
      throw error;
    }
  })
  .post("/deletion/sign-in/google", async (c) => {
    const { headers, response } = await c.var.deps.auth.api.signInSocial({
      body: { provider: "google", callbackURL: START, errorCallbackURL: START },
      headers: c.req.raw.headers,
      returnHeaders: true,
    });
    if (!response.url) throw new Error("deletion: Google sign-in returned no redirect URL");
    passCookies(c, headers);
    return c.redirect(response.url, 302);
  })
  .post("/deletion/sign-out", async (c) => {
    await signOut(c);
    c.header("HX-Redirect", START); // back to the start of the flow, whichever URL the page was opened at
    return c.body(null, 204);
  })
  .post("/deletion/cancel", requireUser, async (c) => {
    const body = await parse(c, kindBody);
    if (!body.success) return bad(c, body.error);
    cancelDeletion(c.var.deps, body.data.kind, c.var.user);
    return c.html(chooseStep(c.var.user.email));
  })
  .post("/deletion/code/send", requireUser, async (c) => {
    const body = await parse(c, kindBody);
    if (!body.success) return bad(c, body.error);
    sendDeletionCode(c.var.deps, body.data.kind, c.var.user);
    return c.html(codeStep(body.data.kind, c.var.user.email));
  })
  .post("/deletion/code/verify", requireUser, async (c) => {
    const body = await parse(c, codeBody);
    if (!body.success) return bad(c, body.error);
    const { kind, code } = body.data;
    const result = checkDeletionCode(c.var.deps, kind, c.var.user, code);
    return c.html(result === "ok" ? confirmStep(kind, code) : codeStep(kind, c.var.user.email, result));
  })
  .post("/deletion/code/confirm", requireUser, async (c) => {
    const body = await parse(c, codeBody);
    if (!body.success) return bad(c, body.error);
    const { kind, code } = body.data;
    const result = confirmDeletion(c.var.deps, kind, c.var.user, code);
    if (result !== "ok") return c.html(codeStep(kind, c.var.user.email, result));
    // The session row went with the User; sign-out clears the browser's cookie.
    if (kind === "account") await signOut(c);
    return c.html(doneStep(kind));
  });

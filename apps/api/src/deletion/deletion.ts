import { randomInt, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { sign, verify } from "hono/jwt";
import { z } from "zod";
import { codeStatus, RESET_CODE } from "@grocer/shared/reset-code";
import { listMembers, lists, user } from "#/db/schema.ts";
import type { Deps } from "#/deps.ts";
import { deletionCodeEmail } from "#/emails/deletion-code.ts";

/** Account deletion or Data deletion (CONTEXT.md). Fixed by the page, it travels with the Deletion code and the token. */
export const DELETION_KINDS = ["account", "data"] as const;
export type DeletionKind = (typeof DELETION_KINDS)[number];

/** How long a proven Deletion code gives to confirm. */
export const CONFIRM_MINUTES = 3;

// Its own identifier per kind and email, so a Reset code ("forget-password-otp-…") never verifies here and the reverse.
const identifier = (kind: DeletionKind, email: string) => `delete-${kind}-otp-${email}`;
const verifications = async ({ auth }: Deps) => (await auth.$context).internalAdapter;
// The secret better-auth signs with (BETTER_AUTH_SECRET, or its own fallback in development).
const secret = async ({ auth }: Deps) => (await auth.$context).secret;
const userIdOf = ({ db }: Deps, email: string) => db.select({ id: user.id }).from(user).where(eq(user.email, email)).get()?.id;

/**
 * Stores a new Deletion code for `email` (replacing any earlier one) and emails it if a User has that email. The code is
 * stored either way, so an unknown email behaves exactly like a real one at every step. Not awaited, like Password reset.
 */
export async function sendDeletionCode(deps: Deps, kind: DeletionKind, email: string) {
  const code = String(randomInt(10 ** RESET_CODE.length)).padStart(RESET_CODE.length, "0");
  const store = await verifications(deps);
  await store.deleteVerificationByIdentifier(identifier(kind, email));
  await store.createVerificationValue({
    identifier: identifier(kind, email),
    value: `${code}:0`, // "<code>:<wrong tries>"
    expiresAt: new Date(deps.clock.now().getTime() + RESET_CODE.minutes * 60_000),
  });
  if (!userIdOf(deps, email)) return;
  deps.mailer.send(deletionCodeEmail(email, code, kind)).catch((error: unknown) => {
    console.error("deletion: Deletion code email not sent", error);
    deps.errorHandler.report(error);
  });
}

export type CodeResult = { token: string } | { error: "wrong" | "tooManyTries" | "expired" };

/** Checks a Deletion code. The right one is used up and traded for a confirmation token; each wrong try counts. */
export async function verifyDeletionCode(deps: Deps, kind: DeletionKind, email: string, code: string): Promise<CodeResult> {
  const store = await verifications(deps);
  const id = identifier(kind, email);
  const row = await store.findVerificationValue(id);
  const now = deps.clock.now().getTime();
  const sentAt = (row?.expiresAt.getTime() ?? 0) - RESET_CODE.minutes * 60_000;
  // No row: never sent, used up, or killed by wrong tries; to the User it is as dead as an expired one.
  if (!row || codeStatus({ sentAt, wrongTries: 0 }, now).lock) {
    if (row) await store.deleteVerificationByIdentifier(id);
    return { error: "expired" };
  }
  const [stored = "", tries] = row.value.split(":");
  // Byte lengths: timingSafeEqual throws on unequal buffers, and a multi-byte "code" can match in characters.
  const [a, b] = [Buffer.from(stored), Buffer.from(code)];
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    const wrongTries = Number(tries) + 1;
    if (codeStatus({ sentAt, wrongTries }, now).lock === "tooManyTries") {
      await store.deleteVerificationByIdentifier(id);
      return { error: "tooManyTries" };
    }
    await store.updateVerificationByIdentifier(id, { value: `${stored}:${wrongTries}` });
    return { error: "wrong" };
  }
  await store.deleteVerificationByIdentifier(id);
  const exp = Math.floor(now / 1000) + CONFIRM_MINUTES * 60;
  return { token: await sign({ email, kind, exp }, await secret(deps), "HS256") };
}

const tokenPayload = z.object({ email: z.string(), kind: z.enum(DELETION_KINDS), exp: z.number() });

/**
 * The email a confirmation token proves, if it was issued for this kind, has not expired and was not redeemed before
 * (one deletion per token). An expired one is reported.
 */
export async function redeemToken(deps: Deps, kind: DeletionKind, token: string): Promise<{ email: string } | { error: "invalidToken" | "expiredToken" }> {
  // exp is checked below against the Clock, not by verify against the system time.
  const payload = tokenPayload.safeParse(await verify(token, await secret(deps), { alg: "HS256", exp: false }).catch(() => null));
  if (!payload.success || payload.data.kind !== kind) return { error: "invalidToken" };
  if (payload.data.exp * 1000 <= deps.clock.now().getTime()) {
    deps.errorHandler.report(new Error(`deletion: confirmation token expired (${CONFIRM_MINUTES} minutes)`));
    return { error: "expiredToken" };
  }
  const store = await verifications(deps);
  const used = !(await store.reserveVerificationValue({
    identifier: `deletion-token-${token.split(".")[2]}`, // the signature: unique per token
    value: kind,
    expiresAt: new Date(payload.data.exp * 1000),
  }));
  if (used) return { error: "invalidToken" };
  return { email: payload.data.email };
}

/** Account deletion: removing the User; schema cascades remove owned Lists, memberships, sessions and sign-in accounts. */
export function deleteAccount({ db }: Deps, email: string) {
  db.delete(user).where(eq(user.email, email)).run();
}

/** Data deletion: the Lists the User owns (with their items and Members) and their memberships. The User and sessions stay. */
export function deleteData(deps: Deps, email: string) {
  const userId = userIdOf(deps, email);
  if (!userId) return;
  deps.db.transaction((tx) => {
    tx.delete(lists).where(eq(lists.ownerId, userId)).run();
    tx.delete(listMembers).where(eq(listMembers.userId, userId)).run();
  });
}

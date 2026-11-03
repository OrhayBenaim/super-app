import { eq } from "drizzle-orm";
import { sign, verify } from "hono/jwt";
import { z } from "zod";
import { RESET_CODE } from "@grocer/shared/reset-code";
import { listMembers, lists, user } from "#/db/schema.ts";
import { userIdByEmail } from "#/db/users.ts";
import type { Deps } from "#/deps.ts";
import { deletionCodeEmail } from "#/emails/deletion-code.ts";
import type { OtpResult } from "#/services/otp.ts";

/** Account deletion or Data deletion (CONTEXT.md). Fixed by the page, it travels with the Deletion code and the token. */
export const DELETION_KINDS = ["account", "data"] as const;
export type DeletionKind = (typeof DELETION_KINDS)[number];

/** A Deletion code follows the same rules as a Reset code (CONTEXT.md). The OtpService enforces them; this only names them. */
export const DELETION_CODE = RESET_CODE;

/** How long a proven Deletion code gives to confirm. */
export const CONFIRM_MINUTES = 3;

const authAdapter = async ({ auth }: Deps) => (await auth.$context).internalAdapter;
// The secret better-auth signs with (BETTER_AUTH_SECRET, or its own fallback in development).
const secret = async ({ auth }: Deps) => (await auth.$context).secret;
const purpose = (kind: DeletionKind) => `delete-${kind}` as const;

/**
 * A new Deletion code for `email`, emailed if a User has that email. The code is created either way, so an unknown
 * email behaves exactly like a real one at every step.
 */
export function sendDeletionCode({ db, otp }: Deps, kind: DeletionKind, email: string) {
  const code = otp.create(purpose(kind), email);
  if (userIdByEmail(db, email)) otp.send(deletionCodeEmail(email, code, kind));
}

/** Checks a Deletion code. The right one is used up and traded for a confirmation token; each wrong try counts. */
export async function verifyDeletionCode(
  deps: Deps,
  kind: DeletionKind,
  email: string,
  code: string,
): Promise<{ token: string } | { error: Exclude<OtpResult, "ok"> }> {
  const result = deps.otp.verify(purpose(kind), email, code);
  if (result !== "ok") return { error: result };
  const exp = Math.floor(deps.clock.now().getTime() / 1000) + CONFIRM_MINUTES * 60;
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
  // reserveVerificationValue is first-writer-wins on a key derived from the identifier: a race can't redeem twice.
  const used = !(await (await authAdapter(deps)).reserveVerificationValue({
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
  const userId = userIdByEmail(deps.db, email);
  if (!userId) return;
  deps.db.transaction((tx) => {
    tx.delete(lists).where(eq(lists.ownerId, userId)).run();
    tx.delete(listMembers).where(eq(listMembers.userId, userId)).run();
  });
}

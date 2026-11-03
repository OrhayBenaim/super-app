import { eq } from "drizzle-orm";
import { listMembers, lists, user } from "#/db/schema.ts";
import type { Deps } from "#/deps.ts";
import { deletionCodeEmail } from "#/emails/deletion-code.ts";
import type { OtpResult } from "#/services/otp.ts";

/** Account deletion or Data deletion (CONTEXT.md). The Deletion code is bound to the kind it was sent for. */
export const DELETION_KINDS = ["account", "data"] as const;
export type DeletionKind = (typeof DELETION_KINDS)[number];

type SignedIn = { id: string; email: string };

const purpose = (kind: DeletionKind) => `delete-${kind}` as const;

/** A new Deletion code for this kind, emailed to the signed-in User (never to an email from the request). */
export function sendDeletionCode({ otp }: Deps, kind: DeletionKind, { email }: SignedIn) {
  otp.send(deletionCodeEmail(email, otp.create(purpose(kind), email), kind));
}

/** Checks the Deletion code; the right one commits the deletion in the same call. */
export function verifyAndDelete(deps: Deps, kind: DeletionKind, signedIn: SignedIn, code: string): OtpResult {
  const result = deps.otp.verify(purpose(kind), signedIn.email, code);
  if (result === "ok") (kind === "account" ? deleteAccount : deleteData)(deps, signedIn.id);
  return result;
}

/** Account deletion: removing the User; schema cascades remove owned Lists, memberships, sessions and sign-in accounts. */
function deleteAccount({ db }: Deps, userId: string) {
  db.delete(user).where(eq(user.id, userId)).run();
}

/** Data deletion: the Lists the User owns (with their items and Members) and their memberships. The User and sessions stay. */
function deleteData({ db }: Deps, userId: string) {
  db.transaction((tx) => {
    tx.delete(lists).where(eq(lists.ownerId, userId)).run();
    tx.delete(listMembers).where(eq(listMembers.userId, userId)).run();
  });
}

import { and, eq } from "drizzle-orm";
import type { Db } from "#/db/index.ts";
import { account, user } from "#/db/schema.ts";

/** Whether the User with this email signs in with email and password (Google- or Apple-only Users have no password). */
export function hasPassword(db: Db, email: string) {
  return !!db
    .select({ id: account.id })
    .from(account)
    .innerJoin(user, eq(user.id, account.userId))
    .where(and(eq(user.email, email), eq(account.providerId, "credential")))
    .get();
}

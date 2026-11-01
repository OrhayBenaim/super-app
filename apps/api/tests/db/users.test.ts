import { expect, it } from "vitest";
import { openDb } from "#/db/index.ts";
import { account, user } from "#/db/schema.ts";
import { hasPassword } from "#/db/users.ts";

it("is true only for a User with an email-and-password account", () => {
  const db = openDb(":memory:");
  const now = new Date();
  db.insert(user).values([
    { id: "p", name: "P", email: "p@test.dev" },
    { id: "g", name: "G", email: "g@test.dev" },
  ]).run();
  db.insert(account).values([
    { id: "a1", accountId: "p", providerId: "credential", userId: "p", password: "hash", createdAt: now, updatedAt: now },
    { id: "a2", accountId: "google-sub", providerId: "google", userId: "g", createdAt: now, updatedAt: now },
  ]).run();

  expect(hasPassword(db, "p@test.dev")).toBe(true);
  expect(hasPassword(db, "g@test.dev")).toBe(false);
  expect(hasPassword(db, "nobody@test.dev")).toBe(false);
});

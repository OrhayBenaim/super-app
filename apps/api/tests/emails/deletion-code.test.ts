import { expect, it } from "vitest";
import { deletionCodeEmail } from "#/emails/deletion-code.ts";

it.each([
  ["account", "החשבון", "account"],
  ["data", "הנתונים", "data"],
] as const)("a %s Deletion code email names what it deletes, gives the code and how long it lasts, Hebrew first", (kind, he, en) => {
  const { to, subject, text } = deletionCodeEmail("a@test.dev", "042137", kind);
  expect(to).toBe("a@test.dev");
  expect(subject).toContain(he);
  expect(text.match(/042137/g)).toHaveLength(2);
  expect(text).toContain("5 דקות");
  expect(text).toContain("5 minutes");
  expect(text).toContain(`delete your ${en}`);
  expect(text.indexOf("042137")).toBeLessThan(text.indexOf("Your"));
});

import { expect, it } from "vitest";
import { resetCodeEmail } from "#/emails/reset-code.ts";

it("gives the code, how long it lasts and that it can be ignored, Hebrew first", () => {
  const { to, text } = resetCodeEmail("a@test.dev", "042137");
  expect(to).toBe("a@test.dev");
  expect(text.match(/042137/g)).toHaveLength(2);
  expect(text).toContain("5 דקות");
  expect(text).toContain("5 minutes");
  expect(text).toMatch(/ignore/);
  expect(text.indexOf("042137")).toBeLessThan(text.indexOf("Your"));
});

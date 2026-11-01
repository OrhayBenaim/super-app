import { expect, it } from "vitest";
import { bilingualEmail } from "#/emails/layout.ts";

const email = bilingualEmail({
  to: "a@test.dev",
  subject: "נושא · Subject",
  he: ["שלום <b>", { code: "123456" }],
  en: ["Hello <b>", { code: "123456" }],
});

it("puts Hebrew first and English below, in text and HTML", () => {
  expect(email).toMatchObject({ to: "a@test.dev", subject: "נושא · Subject" });
  expect(email.text).toBe("שלום <b>\n123456\n\nHello <b>\n123456");
  expect(email.html!.indexOf('dir="rtl"')).toBeLessThan(email.html!.indexOf('dir="ltr"'));
});

it("escapes text in HTML and shows codes large", () => {
  expect(email.html).toContain("שלום &lt;b&gt;");
  expect(email.html).not.toContain("<b>");
  expect(email.html).toMatch(/<strong[^>]*>123456<\/strong>/);
});

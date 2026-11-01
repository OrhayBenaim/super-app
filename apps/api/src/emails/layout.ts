import type { Email } from "#/services/mailer.ts";

/** A paragraph of plain text, or a code shown large. */
export type Paragraph = string | { code: string };

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const html = (paragraphs: Paragraph[], dir: "rtl" | "ltr") =>
  `<div dir="${dir}">${paragraphs
    .map((p) => (typeof p === "string" ? `<p>${escape(p)}</p>` : `<p><strong style="font-size:24px;letter-spacing:4px">${escape(p.code)}</strong></p>`))
    .join("")}</div>`;

const text = (paragraphs: Paragraph[]) => paragraphs.map((p) => (typeof p === "string" ? p : p.code)).join("\n");

/** Every email is Hebrew first with English below, as plain text and minimal HTML built from the same paragraphs. */
export function bilingualEmail({ to, subject, he, en }: { to: string; subject: string; he: Paragraph[]; en: Paragraph[] }): Email {
  return { to, subject, text: `${text(he)}\n\n${text(en)}`, html: `${html(he, "rtl")}<hr>${html(en, "ltr")}` };
}

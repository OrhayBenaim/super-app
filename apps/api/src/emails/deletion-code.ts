import { OTP } from "@grocer/shared/otp";
import type { DeletionKind } from "#/deletion/deletion.ts";
import { bilingualEmail } from "#/emails/layout.ts";

const what = { account: { he: "החשבון", en: "account" }, data: { he: "הנתונים", en: "data" } } as const;

export function deletionCodeEmail(to: string, code: string, kind: DeletionKind) {
  const { minutes } = OTP;
  const { he, en } = what[kind];
  return bilingualEmail({
    to,
    subject: `קוד למחיקת ${he} · Your Grocer deletion code`,
    he: [`קוד למחיקת ${he} שלך ב-Grocer:`, { code }, `הקוד בתוקף ל-${minutes} דקות.`, `אם לא ביקשת למחוק את ${he}, אפשר להתעלם מהמייל הזה. בלי הקוד שום דבר לא יימחק.`],
    en: [`Your code to delete your Grocer ${en}:`, { code }, `It is valid for ${minutes} minutes.`, `If you didn't ask to delete your ${en}, you can ignore this email. Nothing is deleted without the code.`],
  });
}

import { RESET_CODE } from "@grocer/shared/reset-code";
import { bilingualEmail } from "#/emails/layout.ts";

export function resetCodeEmail(to: string, code: string) {
  const { minutes } = RESET_CODE;
  return bilingualEmail({
    to,
    subject: "קוד לאיפוס הסיסמה · Your Grocer reset code",
    he: ["קוד האיפוס שלך ל-Grocer:", { code }, `הקוד בתוקף ל-${minutes} דקות.`, "אם לא ביקשת לאפס את הסיסמה, אפשר להתעלם מהמייל הזה."],
    en: ["Your Grocer reset code:", { code }, `It is valid for ${minutes} minutes.`, "If you didn't ask to reset your password, you can ignore this email."],
  });
}

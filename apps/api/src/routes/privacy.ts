import { Hono } from "hono";
import type { AppEnv } from "#/middleware.ts";

const CONTACT = "privacy@otterstory.club";
const LAST_UPDATED = { he: "3 בנובמבר 2026", en: "November 3, 2026" };

/** A section of the policy: a heading and its paragraphs, both trusted static HTML. */
type Section = [heading: string, ...paragraphs: string[]];

const he: Section[] = [
  ["מדיניות פרטיות", `Grocer היא אפליקציה לרשימת קניות שמשווה כמה הרשימה שלכם עולה בסופרמרקטים הקרובים. כאן מוסבר איזה מידע אנחנו אוספים, למה, ועם מי הוא משותף. עודכן לאחרונה: ${LAST_UPDATED.he}.`],
  ["חשבון", "כדי להשתמש באפליקציה נשמרים כתובת האימייל, השם והסיסמה שלכם (מוצפנת, לעולם לא בטקסט גלוי). אם נכנסתם עם Google או Apple, נשמרים גם המזהה והאסימונים (tokens) שהשירות הזה מסר לנו. לכל התחברות נשמרים כתובת ה-IP וסוג המכשיר, לצורכי אבטחה."],
  ["רשימות ופריטים", "הרשימות והפריטים שאתם יוצרים נשמרים בשרת שלנו. כשאתם משתפים רשימה, כל חברי הרשימה רואים את התוכן שלה ואת השמות וכתובות האימייל של שאר החברים."],
  ["מיקום", "כשהאפליקציה פתוחה, היא משתמשת במיקום המדויק שלכם כדי למצוא סניפים קרובים. המיקום נשלח לשרת רק בבקשת ההשוואה עצמה, משמש לחישוב ולא נשמר.", "מיקום ברקע משמש רק אם הפעלתם את \"חנות זולה בסביבה\" בהגדרות: המכשיר מגדיר אזורים (geofences) סביב סניפים ושולח לכם התראה כשאתם עוברים ליד הסניף הזול ביותר. המיקום ברקע נבדק במכשיר בלבד ולא נשלח אלינו. אפשר לכבות את זה בכל רגע בהגדרות."],
  ["דוחות קריסה", "כשמשהו משתבש באפליקציה או בשרת, נשלח דוח שגיאה ל-Sentry כדי שנוכל לתקן את התקלה. הדוח מקושר למזהה המשתמש שלכם וכולל פרטים טכניים כמו סוג המכשיר, גרסת האפליקציה ופרטי הבקשה שנכשלה."],
  ["נתוני שימוש", "אנחנו מודדים באילו מסכים וכפתורים משתמשים, דרך PostHog (שרתים באיחוד האירופי), לפי מזהה המשתמש בלבד. האירועים לא כוללים שמות, כתובות אימייל, שמות פריטים או טקסט שהקלדתם."],
  ["אימייל", "אנחנו שולחים אימייל רק כדי למסור קוד לאיפוס סיסמה, דרך Resend."],
  ["מה אנחנו לא עושים", "אין פרסומות באפליקציה, ואנחנו לא מוכרים ולא משכירים את המידע שלכם לאף אחד."],
  ["מחיקת החשבון", "בהגדרות > מחיקת חשבון אפשר למחוק את החשבון בכל רגע. המחיקה מסירה את החשבון, את הרשימות שבבעלותכם (גם אצל מי ששיתפתם איתו) ואת החברות שלכם ברשימות של אחרים. דוחות קריסה ונתוני שימוש שכבר נשלחו ל-Sentry ול-PostHog נשמרים שם לפי תקופת השמירה של אותם שירותים."],
  ["יצירת קשר", `שאלות על פרטיות או בקשה לגבי המידע שלכם: <a href="mailto:${CONTACT}">${CONTACT}</a>.`],
];

const en: Section[] = [
  ["Privacy policy", `Grocer is a shopping list app that compares what your list costs at nearby supermarkets. This page explains what we collect, why, and who it is shared with. Last updated: ${LAST_UPDATED.en}.`],
  ["Account", "To use the app we store your email address, your name and your password (hashed, never in plain text). If you sign in with Google or Apple, we also store the identifier and sign-in tokens that service gives us. Each sign-in session stores your IP address and device type, for security."],
  ["Lists and items", "The lists and items you create are stored on our server. When you share a list, every member of that list sees its contents and the other members' names and email addresses."],
  ["Location", "While the app is open, it uses your precise location to find nearby stores. Your location reaches our server only inside the compare request itself; it is used for that calculation and not stored.", "Background location is used only if you turn on \"Cheap store nearby\" in Settings: your device sets up geofences around stores and notifies you when you pass the cheapest one for your list. Background location is checked on your device only and is not sent to us. You can turn it off in Settings at any time."],
  ["Crash reports", "When something goes wrong in the app or on our server, an error report is sent to Sentry so we can fix it. It is linked to your user id and includes technical details such as your device type, app version and the request that failed."],
  ["Usage analytics", "We measure which screens and buttons are used with PostHog (EU servers), keyed by your user id only. Events never include names, email addresses, item names or anything you typed."],
  ["Email", "We send email only to deliver password reset codes, through Resend."],
  ["What we don't do", "There are no ads in the app, and we never sell or rent your data to anyone."],
  ["Deleting your account", "Settings > Delete account deletes your account at any time. It removes your account, the lists you own (for everyone you shared them with) and your membership in other people's lists. Crash reports and usage events already sent to Sentry and PostHog are kept there for those services' retention periods."],
  ["Contact", `Questions about privacy, or a request about your data: <a href="mailto:${CONTACT}">${CONTACT}</a>.`],
];

const paragraphs = (ps: string[]) => ps.map((p) => `<p>${p}</p>`).join("");

/** The first section is the page title and intro; the rest are headed sections. */
const body = ([[title, ...intro], ...sections]: Section[]) =>
  `<h1>${title}</h1>${paragraphs(intro)}${sections.map(([heading, ...ps]) => `<h2>${heading}</h2>${paragraphs(ps)}`).join("")}`;

// Static, so built once. Hebrew first with English below, like every email (emails/layout.ts).
const page = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Grocer - מדיניות פרטיות / Privacy policy</title>
<style>body{font-family:system-ui,sans-serif;line-height:1.6;max-width:42rem;margin:0 auto;padding:1rem}h2{margin-top:1.5rem}</style>
</head>
<body>
<main>
<section>${body(he)}</section>
<hr>
<section lang="en" dir="ltr">${body(en)}</section>
</main>
</body>
</html>`;

export const privacyRoutes = new Hono<AppEnv>().get("/", (c) => c.html(page));

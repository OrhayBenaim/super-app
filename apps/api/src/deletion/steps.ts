import { html } from "hono/html";
import { RESET_CODE } from "@grocer/shared/reset-code";
import { CONFIRM_MINUTES, type DeletionKind } from "#/deletion/deletion.ts";

/** The deletion pages' steps as HTML fragments: htmx posts each form and swaps the answer into #step. Hebrew only. */

export const COPY = {
  account: {
    title: "מחיקת חשבון",
    intro: "כאן אפשר למחוק את חשבון Grocer שלכם, גם בלי האפליקציה. כדי לוודא שזה אתם, נשלח קוד לאימייל של החשבון.",
    warning: "החשבון שלכם, הרשימות שבבעלותכם (גם אצל מי ששיתפתם איתו) והחברות שלכם ברשימות של אחרים יימחקו לצמיתות. אי אפשר לבטל את זה.",
    confirm: "מחיקת החשבון",
    done: "החשבון נמחק, וכל ההתחברויות אליו הסתיימו.",
  },
  data: {
    title: "מחיקת נתונים",
    intro: "כאן אפשר למחוק את הנתונים שלכם ב-Grocer ולהשאיר את החשבון. כדי לוודא שזה אתם, נשלח קוד לאימייל של החשבון.",
    warning:
      "הרשימות שבבעלותכם (גם אצל מי ששיתפתם איתו) והחברות שלכם ברשימות של אחרים יימחקו לצמיתות. החשבון נשאר, ואפשר להמשיך להשתמש ב-Grocer. אי אפשר לבטל את זה.",
    confirm: "מחיקת הנתונים",
    done: "הנתונים נמחקו. החשבון נשאר, ואפשר להמשיך להשתמש בו.",
  },
} as const;

const ERRORS = {
  wrong: "הקוד שגוי. נסו שוב.",
  tooManyTries: `הוזן קוד שגוי ${RESET_CODE.maxTries} פעמים, ולכן הקוד בוטל.`,
  expired: "הקוד כבר לא בתוקף.",
  invalidToken: "משהו השתבש. נא להתחיל מחדש.",
  expiredToken: `עברו יותר מ-${CONFIRM_MINUTES} דקות מאז שהקוד אומת. נא להתחיל מחדש.`,
} as const;
type StepError = keyof typeof ERRORS;

const alert = (error?: StepError) => (error ? html`<p class="error" role="alert" data-error="${error}">${ERRORS[error]}</p>` : "");
const hidden = (name: string, value: string) => html`<input type="hidden" name="${name}" value="${value}">`;
const startOver = (kind: DeletionKind) => html`<a class="button secondary" href="/delete-${kind}">התחלה מחדש</a>`;

export const emailStep = (kind: DeletionKind, error?: "invalidToken" | "expiredToken") => html`<div data-step="email">
  ${alert(error)}
  <form hx-post="/deletion/send" hx-disabled-elt="find button">
    ${hidden("kind", kind)}
    <label for="email">האימייל שאיתו אתם נכנסים ל-Grocer</label>
    <p class="hint" id="email-hint">גם אם אתם נכנסים עם Google.</p>
    <input id="email" name="email" type="email" autocomplete="email" dir="ltr" required aria-describedby="email-hint">
    <button type="submit">שליחת קוד</button>
  </form>
</div>`;

export const codeStep = (kind: DeletionKind, email: string, error?: "wrong") => html`<div data-step="code">
  <p id="sent">אם <bdi dir="ltr">${email}</bdi> שייך לחשבון Grocer, שלחנו אליו קוד בן ${RESET_CODE.length} ספרות. הקוד בתוקף ל-${RESET_CODE.minutes} דקות.</p>
  ${alert(error)}
  <form hx-post="/deletion/verify" hx-disabled-elt="find button">
    ${hidden("kind", kind)} ${hidden("email", email)}
    <label for="code">הקוד מהאימייל</label>
    <input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{${RESET_CODE.length}}"
      maxlength="${RESET_CODE.length}" dir="ltr" required autofocus aria-describedby="sent">
    <button type="submit">המשך</button>
  </form>
</div>`;

/** A dead code (expired, used up, or too many wrong tries): send a new one to the same email, or start over. */
export const resendStep = (kind: DeletionKind, email: string, error: "tooManyTries" | "expired") => html`<div data-step="resend">
  ${alert(error)}
  <form hx-post="/deletion/send" hx-disabled-elt="find button">
    ${hidden("kind", kind)} ${hidden("email", email)}
    <button type="submit" autofocus>שליחת קוד חדש</button>
  </form>
  ${startOver(kind)}
</div>`;

export const warningStep = (kind: DeletionKind, token: string) => html`<div data-step="warning" class="danger-zone">
  <h2>בטוחים?</h2>
  <p id="warning">${COPY[kind].warning}</p>
  <form hx-post="/deletion/confirm" hx-disabled-elt="find button">
    ${hidden("kind", kind)} ${hidden("token", token)}
    <button type="submit" class="danger" aria-describedby="warning">${COPY[kind].confirm}</button>
  </form>
  <a class="button secondary" href="/delete-${kind}" autofocus>ביטול</a>
</div>`;

export const doneStep = (kind: DeletionKind) => html`<div data-step="done">
  <p role="status" tabindex="-1" autofocus>${COPY[kind].done}</p>
</div>`;

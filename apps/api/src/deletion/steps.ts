import { html } from "hono/html";
import { OTP } from "@grocer/shared/otp";
import type { DeletionKind } from "#/deletion/deletion.ts";

/** The deletion page's steps as HTML fragments: htmx posts each form and swaps the answer into #step. Hebrew only. */

const COPY = {
  account: {
    button: "מחיקת החשבון",
    warning: "החשבון שלכם, הרשימות שבבעלותכם (גם אצל מי ששיתפתם איתו) והחברות שלכם ברשימות של אחרים יימחקו לצמיתות. אי אפשר לבטל את זה.",
    done: "החשבון נמחק, וכל ההתחברויות אליו הסתיימו.",
  },
  data: {
    button: "מחיקת הנתונים",
    warning:
      "הרשימות שבבעלותכם (גם אצל מי ששיתפתם איתו) והחברות שלכם ברשימות של אחרים יימחקו לצמיתות. החשבון נשאר, ובפעם הבאה שתפתחו את האפליקציה תחכה לכם רשימה חדשה וריקה. אי אפשר לבטל את זה.",
    done: "הנתונים נמחקו. החשבון נשאר, ואפשר להמשיך להשתמש בו.",
  },
} as const;

const ERRORS = {
  wrongPassword: "האימייל או הסיסמה שגויים. נסו שוב.",
  noAccount: "אין חשבון Grocer לחשבון הזה. הדף הזה לא יוצר חשבונות.",
  oauth: "הכניסה לא הצליחה. נסו שוב.",
  wrong: "הקוד שגוי. נסו שוב.",
  tooManyTries: `הוזן קוד שגוי ${OTP.maxTries} פעמים, ולכן הקוד בוטל.`,
  expired: "הקוד כבר לא בתוקף.",
} as const;
export type StepError = keyof typeof ERRORS;

const alert = (error?: StepError) => (error ? html`<p class="error" role="alert" data-error="${error}">${ERRORS[error]}</p>` : "");
const hidden = (name: string, value: string) => html`<input type="hidden" name="${name}" value="${value}">`;

/** Signed out. Google is a plain form post: the browser follows better-auth's redirect, so no third-party script loads. */
export const signInStep = ({ google, error }: { google: boolean; error?: StepError }) => html`<div data-step="sign-in">
  ${alert(error)}
  <form hx-post="/deletion/sign-in" hx-disabled-elt="find button">
    <label for="email">אימייל</label>
    <input id="email" name="email" type="email" autocomplete="email" dir="ltr" required>
    <label for="password">סיסמה</label>
    <input id="password" name="password" type="password" autocomplete="current-password" dir="ltr" required>
    <button type="submit">כניסה</button>
  </form>
  ${google
    ? html`<p class="or">או</p>
  <form method="post" action="/deletion/sign-in/google">
    <button type="submit" class="secondary">כניסה עם Google</button>
  </form>`
    : ""}
  <p data-note="apple">נכנסתם לאפליקציה עם Apple? עדיין אי אפשר להיכנס איתו כאן. אפשר למחוק את החשבון באפליקציה (הגדרות &gt; מחיקת חשבון), או לכתוב לנו ל-<a href="mailto:privacy@otterstory.club">privacy@otterstory.club</a>.</p>
</div>`;

const kindButton = (kind: DeletionKind) => html`<form hx-post="/deletion/code/send" hx-disabled-elt="find button">
    ${hidden("kind", kind)}
    <button type="submit" class="danger">${COPY[kind].button}</button>
  </form>`;

/** Signed in: which account, sign out, and the two deletions. */
export const chooseStep = (email: string) => html`<div data-step="choose">
  <p>מחוברים בתור <bdi dir="ltr">${email}</bdi>.</p>
  <form hx-post="/deletion/sign-out"><button type="submit" class="link">יציאה</button></form>
  ${kindButton("data")}
  ${kindButton("account")}
</div>`;

/** Backing out kills the code and returns to the choose step. */
const cancel = (kind: DeletionKind) => html`<form hx-post="/deletion/cancel">
    ${hidden("kind", kind)}
    <button type="submit" class="secondary">ביטול</button>
  </form>`;

/** The warning and the code input. A dead code (too many tries, expired) offers "send again" instead of the input. */
export const codeStep = (kind: DeletionKind, email: string, error?: "wrong" | "tooManyTries" | "expired") => html`<div data-step="code" class="danger-zone">
  <h2>בטוחים?</h2>
  <p id="warning">${COPY[kind].warning}</p>
  ${alert(error)}
  ${error === "tooManyTries" || error === "expired"
    ? html`<form hx-post="/deletion/code/send" hx-disabled-elt="find button" data-form="send-again">
    ${hidden("kind", kind)}
    <button type="submit" autofocus>שליחת קוד חדש</button>
  </form>`
    : html`<p id="sent">שלחנו קוד בן ${OTP.length} ספרות אל <bdi dir="ltr">${email}</bdi>. הקוד בתוקף ל-${OTP.minutes} דקות.</p>
  <form hx-post="/deletion/code/verify" hx-disabled-elt="find button">
    ${hidden("kind", kind)}
    <label for="code">הקוד מהאימייל</label>
    <input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{${OTP.length}}"
      maxlength="${OTP.length}" dir="ltr" required autofocus aria-describedby="sent warning">
    <button type="submit">המשך</button>
  </form>`}
  ${cancel(kind)}
</div>`;

/** The last confirmation after a right code. The code goes along again, and only this button deletes. */
export const confirmStep = (kind: DeletionKind, code: string) => html`<div data-step="confirm" class="danger-zone">
  <h2>זה הרגע האחרון לבטל</h2>
  <p id="final">${COPY[kind].warning}</p>
  <form hx-post="/deletion/code/confirm" hx-disabled-elt="find button">
    ${hidden("kind", kind)} ${hidden("code", code)}
    <button type="submit" class="danger" aria-describedby="final">${COPY[kind].button}</button>
  </form>
  ${cancel(kind)}
</div>`;

export const doneStep = (kind: DeletionKind) => html`<div data-step="done">
  <p role="status" tabindex="-1" autofocus>${COPY[kind].done}</p>
</div>`;

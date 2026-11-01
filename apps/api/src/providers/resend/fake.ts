import type { Email, Mailer } from "#/services/mailer.ts";

export function fakeMailer() {
  const sent: Email[] = [];
  const fake = {
    sent,
    async send(email: Email) {
      sent.push(email);
    },
  };
  return fake satisfies Mailer;
}

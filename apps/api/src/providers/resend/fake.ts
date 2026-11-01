import type { Email, MailerProvider } from "#/services/mailer.ts";

/** Keeps sent emails in memory for tests. */
export class FakeMailerProvider implements MailerProvider {
  sent: Email[] = [];

  async send(email: Email): Promise<void> {
    this.sent.push(email);
  }
}

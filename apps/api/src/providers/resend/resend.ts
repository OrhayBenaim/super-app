import type { Email, MailerProvider } from "#/services/mailer.ts";

export class ResendProvider implements MailerProvider {
  #apiKey: string;
  #from: string;

  constructor(apiKey: string, from: string) {
    this.#apiKey = apiKey;
    this.#from = from;
  }

  async send({ to, subject, text, html }: Email): Promise<void> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${this.#apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: this.#from, to, subject, text, html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`resend: HTTP ${res.status} ${await res.text()}`);
  }
}

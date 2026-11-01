import type { Mailer } from "#/services/mailer.ts";

export function resendMailer(apiKey: string, from: string): Mailer {
  return {
    async send({ to, subject, text, html }) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from, to, subject, text, html }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`resend: HTTP ${res.status} ${await res.text()}`);
    },
  };
}

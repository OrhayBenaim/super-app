export type Email = { to: string; subject: string; text: string; html?: string };

/** Sends one email. Throws when the email can't be handed to the vendor. */
export interface Mailer {
  send(email: Email): Promise<void>;
}

export type Email = { to: string; subject: string; text: string; html?: string };

/** What a mail vendor implements. Throws when the email can't be handed to the vendor. */
export interface MailerProvider {
  send(email: Email): Promise<void>;
}

/** Sends email. The rest of the app depends on this, never on a provider. */
export class MailerService {
  #provider: MailerProvider;

  constructor(provider: MailerProvider) {
    this.#provider = provider;
  }

  send(email: Email): Promise<void> {
    return this.#provider.send(email);
  }
}

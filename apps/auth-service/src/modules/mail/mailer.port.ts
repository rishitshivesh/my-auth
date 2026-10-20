export const MAILER = Symbol("MAILER");

export interface OutgoingMail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Sends one rendered email. Throws when the provider fails so the queue retries. */
export interface MailerPort {
  send(mail: OutgoingMail): Promise<void>;
}

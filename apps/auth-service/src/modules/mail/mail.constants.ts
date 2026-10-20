import type { EmailName, EmailPropsByName } from "@repo/emails";

export const MAIL_QUEUE = "mail.send";
export const MAIL_MAX_ATTEMPTS = 3;
export const MAIL_BACKOFF_DELAY_MS = 5_000;
/** Finished jobs hold links with raw tokens: keep them no longer than needed. */
export const MAIL_KEEP_COMPLETED_SECONDS = 3_600;
export const MAIL_KEEP_FAILED_SECONDS = 86_400;

export interface MailJob<N extends EmailName = EmailName> {
  template: N;
  to: string;
  props: EmailPropsByName[N];
}

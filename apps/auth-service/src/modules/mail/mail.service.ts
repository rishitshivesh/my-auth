import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import type { EmailName, EmailPropsByName } from "@repo/emails";
import { logger } from "@/common/logger";
import {
  MAIL_BACKOFF_DELAY_MS,
  MAIL_KEEP_COMPLETED_SECONDS,
  MAIL_KEEP_FAILED_SECONDS,
  MAIL_MAX_ATTEMPTS,
  MAIL_QUEUE,
  type MailJob,
} from "./mail.constants";

/**
 * Enqueues transactional email. Never talks to the provider, so a slow or
 * failing provider cannot slow down or fail a request.
 */
@Injectable()
export class MailService {
  constructor(@InjectQueue(MAIL_QUEUE) private readonly queue: Queue<MailJob>) {}

  /** Returns whether the job was queued. Never throws. */
  async send<N extends EmailName>(
    template: N,
    to: string,
    props: EmailPropsByName[N],
  ): Promise<boolean> {
    try {
      const job: MailJob<N> = { template, to, props };
      await this.queue.add(template, job as MailJob, {
        attempts: MAIL_MAX_ATTEMPTS,
        backoff: { type: "exponential", delay: MAIL_BACKOFF_DELAY_MS },
        removeOnComplete: { age: MAIL_KEEP_COMPLETED_SECONDS },
        removeOnFail: { age: MAIL_KEEP_FAILED_SECONDS },
      });
      return true;
    } catch (error) {
      // Address and props hold personal data and links: log neither.
      logger.error({ err: error, template }, "Could not queue an email");
      return false;
    }
  }
}

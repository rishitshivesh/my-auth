import { Inject } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { isEmailName, renderEmail } from "@repo/emails";
import { logger } from "@/common/logger";
import { MAIL_QUEUE, type MailJob } from "./mail.constants";
import { MAILER, type MailerPort } from "./mailer.port";

@Processor(MAIL_QUEUE)
export class MailProcessor extends WorkerHost {
  constructor(@Inject(MAILER) private readonly mailer: MailerPort) {
    super();
  }

  /** Throws on failure so BullMQ retries with backoff. */
  async process(job: Job<MailJob>): Promise<void> {
    const { template, to, props } = job.data;
    if (!isEmailName(template)) {
      // An unknown template can never succeed: drop instead of retrying.
      logger.error({ jobId: job.id }, "Unknown mail template, dropping job");
      return;
    }
    try {
      const email = await renderEmail(template, props as never);
      await this.mailer.send({ to, ...email });
    } catch (error) {
      logger.warn(
        { err: error, template, jobId: job.id, attempt: job.attemptsMade + 1 },
        "Sending email failed; it will be retried",
      );
      throw error;
    }
  }
}

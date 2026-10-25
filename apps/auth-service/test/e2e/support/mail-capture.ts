import { renderEmail, isEmailName } from "@repo/emails";

export interface CapturedMail {
  template: string;
  to: string;
  props: Record<string, unknown>;
  subject: string;
  html: string;
  text: string;
  at: number;
}

/**
 * In-memory replacement for MailService: renders the real template and records it.
 * Mail appears synchronously (no BullMQ round trip).
 */
export class CapturingMailService {
  private readonly mails: CapturedMail[] = [];

  async send(template: string, to: string, props: Record<string, unknown>): Promise<boolean> {
    let subject = "";
    let html = "";
    let text = "";
    if (isEmailName(template)) {
      try {
        const rendered = await renderEmail(template, props as never);
        subject = rendered.subject;
        html = rendered.html;
        text = rendered.text;
      } catch {
        // Rendering is not what e2e specs assert on; props are always captured.
      }
    }
    this.mails.push({ template, to: to.toLowerCase(), props, subject, html, text, at: Date.now() });
    return true;
  }

  all(): CapturedMail[] {
    return [...this.mails];
  }

  /** Most recent mail to an address. Optionally restricted to a template. */
  last(to: string, template?: string): CapturedMail | undefined {
    const addr = to.toLowerCase();
    return [...this.mails].reverse().find((m) => m.to === addr && (!template || m.template === template));
  }

  allTo(to: string): CapturedMail[] {
    const addr = to.toLowerCase();
    return this.mails.filter((m) => m.to === addr);
  }

  clear(): void {
    this.mails.length = 0;
  }
}

export type MailCapture = Pick<CapturingMailService, "all" | "last" | "allTo" | "clear">;

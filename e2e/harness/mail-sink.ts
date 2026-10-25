import * as http from "node:http";
import { SMTPServer } from "smtp-server";
import { simpleParser } from "mailparser";
import { MAIL_HTTP_PORT, SMTP_PORT } from "./config";

export interface SinkMessage {
  id: number;
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Every http(s) URL found in the text part, in order. */
  links: string[];
  receivedAt: number;
}

const URL_PATTERN = /https?:\/\/[^\s"'<>)]+/g;

/**
 * Test-only SMTP sink. The auth-service is pointed at it with ordinary SMTP settings, so no
 * production code path is weakened: the real mailer, queue and templates all run.
 */
export async function startMailSink(): Promise<{ close: () => Promise<void> }> {
  const messages: SinkMessage[] = [];
  let nextId = 1;

  const smtp = new SMTPServer({
    authOptional: true,
    disabledCommands: ["STARTTLS"],
    onAuth: (_auth, _session, cb) => cb(null, { user: "e2e" }),
    onData(stream, _session, cb) {
      simpleParser(stream)
        .then((mail) => {
          const text = mail.text ?? "";
          const html = typeof mail.html === "string" ? mail.html : "";
          const recipients = Array.isArray(mail.to) ? mail.to : mail.to ? [mail.to] : [];
          for (const group of recipients) {
            for (const address of group.value) {
              messages.push({
                id: nextId++,
                to: address.address?.toLowerCase() ?? "",
                subject: mail.subject ?? "",
                text,
                html,
                links: [...new Set((text + " " + html).match(URL_PATTERN) ?? [])].map((u) => u.replace(/&amp;/g, "&")),
                receivedAt: Date.now(),
              });
            }
          }
          cb();
        })
        .catch((error: Error) => cb(error));
    },
  });
  await new Promise<void>((resolve, reject) => {
    smtp.on("error", reject);
    smtp.listen(SMTP_PORT, "127.0.0.1", resolve);
  });

  const api = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    res.setHeader("content-type", "application/json");
    if (req.method === "DELETE") {
      messages.length = 0;
      res.end('{"ok":true}');
      return;
    }
    const to = url.searchParams.get("to")?.toLowerCase();
    const after = Number(url.searchParams.get("after") ?? 0);
    const found = messages.filter((m) => m.id > after && (!to || m.to === to));
    res.end(JSON.stringify(found));
  });
  await new Promise<void>((resolve, reject) => {
    api.on("error", reject);
    api.listen(MAIL_HTTP_PORT, "127.0.0.1", resolve);
  });

  return {
    close: async () => {
      await new Promise<void>((resolve) => api.close(() => resolve()));
      await new Promise<void>((resolve) => smtp.close(() => resolve()));
    },
  };
}

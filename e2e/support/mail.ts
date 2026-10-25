import { MAIL_API, tenantOrigin } from "../harness/config";

export interface Mail {
  id: number;
  to: string;
  subject: string;
  text: string;
  html: string;
  links: string[];
}

export async function inbox(to: string, after = 0): Promise<Mail[]> {
  const res = await fetch(`${MAIL_API}/?to=${encodeURIComponent(to)}&after=${after}`);
  return (await res.json()) as Mail[];
}

/** Highest message id for an address, to ignore older mail when waiting for a new one. */
export async function mark(to: string): Promise<number> {
  const all = await inbox(to);
  return all.at(-1)?.id ?? 0;
}

export async function waitForMail(
  to: string,
  match: { after?: number; subject?: RegExp; linkContains?: string },
  timeoutMs = 30_000,
): Promise<Mail> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = (await inbox(to, match.after ?? 0)).filter(
      (m) =>
        (!match.subject || match.subject.test(m.subject)) &&
        (!match.linkContains || m.links.some((l) => l.includes(match.linkContains as string))),
    );
    if (found.length > 0) return found[found.length - 1] as Mail;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`No mail to ${to} (${match.subject ?? match.linkContains ?? "any"}) within ${timeoutMs}ms`);
}

export function linkWith(mail: Mail, fragment: string): string {
  const link = mail.links.find((l) => l.includes(fragment));
  if (!link) throw new Error(`Mail "${mail.subject}" has no link containing ${fragment}: ${mail.links.join(", ")}`);
  return link;
}

/**
 * Emailed links carry no tenant (FRONTEND_URL is one origin), so the portal would treat them as
 * the platform workspace. A real user reaches the same page through their workspace address;
 * the harness does the same by moving the link onto the tenant's host.
 */
export function onTenantHost(link: string, slug: string): string {
  const url = new URL(link);
  const target = new URL(tenantOrigin(slug));
  url.protocol = target.protocol;
  url.host = target.host;
  return url.toString();
}

export const tokenOf = (link: string): string => new URL(link).searchParams.get("token") ?? "";

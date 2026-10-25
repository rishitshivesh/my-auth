import * as net from "net";

const loopback = new net.BlockList();
loopback.addSubnet("127.0.0.0", 8, "ipv4");
loopback.addAddress("::1", "ipv6");

/**
 * Test-only escape hatch so e2e tests can deliver webhooks to a server on
 * 127.0.0.1. It requires BOTH NODE_ENV=test and WEBHOOK_ALLOW_LOOPBACK=true;
 * env validation additionally rejects the flag in every other environment, so
 * it cannot be switched on in production. Only loopback is exempted: every
 * other private, link-local or metadata range stays blocked.
 */
export function isLoopbackWebhookAllowed(): boolean {
  return (
    process.env["NODE_ENV"] === "test" &&
    process.env["WEBHOOK_ALLOW_LOOPBACK"] === "true"
  );
}

function isLoopbackIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 0) return false;
  return loopback.check(ip, family === 6 ? "ipv6" : "ipv4");
}

/** True when `ip` is blocked by `isPrivateIp` AND not exempted by the test hook. */
export function isBlockedWebhookAddress(
  ip: string,
  isPrivate: (ip: string) => boolean,
): boolean {
  if (!isPrivate(ip)) return false;
  return !(isLoopbackWebhookAllowed() && isLoopbackIp(ip));
}

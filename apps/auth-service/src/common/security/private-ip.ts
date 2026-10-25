import * as net from "net";

/**
 * Single SSRF deny-list for every server-side outbound fetch (webhooks, ...).
 * Covers loopback, RFC1918, link-local/metadata, CGNAT (100.64/10, used by some
 * cloud metadata services), "this network" 0/8, documentation, benchmarking,
 * multicast/reserved and the IPv6 equivalents.
 */
const blockList = new net.BlockList();

const V4_RANGES: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];
for (const [addr, prefix] of V4_RANGES) blockList.addSubnet(addr, prefix, "ipv4");

const V6_RANGES: ReadonlyArray<readonly [string, number]> = [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
  ["2001:db8::", 32],
];
for (const [addr, prefix] of V6_RANGES) blockList.addSubnet(addr, prefix, "ipv6");

/** Unwraps ::ffff:a.b.c.d and ::ffff:aabb:ccdd to the embedded IPv4 address. */
function unwrapMappedV4(address: string): string {
  const dotted = /^(?:::ffff:|0:0:0:0:0:ffff:)(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (dotted?.[1]) return dotted[1];
  const hex = /^(?:::ffff:|0:0:0:0:0:ffff:)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address);
  if (hex?.[1] && hex[2]) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return address;
}

/** True for any address that must not be reached from the server. Unparseable input is blocked. */
export function isPrivateIp(address: string): boolean {
  const ip = unwrapMappedV4(address.replace(/^\[|\]$/g, ""));
  const family = net.isIP(ip);
  if (family === 0) return true;
  return blockList.check(ip, family === 4 ? "ipv4" : "ipv6");
}

const loopbackMetadata = new net.BlockList();
for (const [addr, prefix] of [["0.0.0.0", 8], ["127.0.0.0", 8], ["169.254.0.0", 16]] as const) {
  loopbackMetadata.addSubnet(addr, prefix, "ipv4");
}
for (const [addr, prefix] of [["::", 128], ["::1", 128], ["fe80::", 10]] as const) {
  loopbackMetadata.addSubnet(addr, prefix, "ipv6");
}

/**
 * Narrow check for destinations that legitimately-internal integrations (LDAP
 * directories on RFC1918 space) still must never reach: loopback, "this host",
 * link-local and the cloud metadata address.
 */
export function isLoopbackOrMetadataIp(address: string): boolean {
  const ip = unwrapMappedV4(address.replace(/^\[|\]$/g, ""));
  const family = net.isIP(ip);
  if (family === 0) return false;
  return loopbackMetadata.check(ip, family === 4 ? "ipv4" : "ipv6");
}

/** Parses one "addr/prefix" CIDR; throws a descriptive Error on malformed input. */
function parseCidr(cidr: string): { address: string; prefix: number; family: "ipv4" | "ipv6" } {
  const [address, prefixRaw, ...rest] = cidr.split("/");
  const family = address ? net.isIP(address) : 0;
  if (!address || family === 0 || prefixRaw === undefined || rest.length > 0 || !/^\d{1,3}$/.test(prefixRaw)) {
    throw new Error(`"${cidr}" is not a valid CIDR (expected e.g. 10.0.0.0/8)`);
  }
  const prefix = Number(prefixRaw);
  const max = family === 4 ? 32 : 128;
  if (prefix > max) throw new Error(`"${cidr}" has a prefix longer than ${max}`);
  return { address, prefix, family: family === 4 ? "ipv4" : "ipv6" };
}

/** Parses a comma-separated CIDR list. Empty/undefined means "none". Throws on any bad entry. */
export function parseCidrList(raw: string | undefined): string[] {
  const entries = (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const entry of entries) parseCidr(entry);
  return entries;
}

/**
 * True when `address` is a public address, or a private (RFC1918/ULA/CGNAT/...) address that lies
 * inside one of `allowedCidrs`. Loopback, "this host", link-local and the cloud metadata address
 * are NEVER allowed, whatever the list says. Call it on the RESOLVED IP, not the hostname.
 */
export function isDialableAddress(address: string, allowedCidrs: readonly string[]): boolean {
  if (isLoopbackOrMetadataIp(address)) return false;
  if (!isPrivateIp(address)) return true;
  const ip = unwrapMappedV4(address.replace(/^\[|\]$/g, ""));
  const family = net.isIP(ip) === 4 ? "ipv4" : "ipv6";
  const allowed = new net.BlockList();
  for (const cidr of allowedCidrs) {
    const parsed = parseCidr(cidr);
    allowed.addSubnet(parsed.address, parsed.prefix, parsed.family);
  }
  return net.isIP(ip) !== 0 && allowed.check(ip, family);
}

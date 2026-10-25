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

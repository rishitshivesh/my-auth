import { isPrivateIp } from "./private-ip";

describe("isPrivateIp (SSRF deny-list)", () => {
  it.each([
    "127.0.0.1", "127.9.9.9", "10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.1.1",
    "169.254.169.254", "100.64.0.1", "100.100.100.200", "0.0.0.0", "0.1.2.3", "198.18.0.1",
    "224.0.0.1", "255.255.255.255", "::1", "::", "fe80::1", "fc00::1", "fd12::1",
    "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a9fe:a9fe", "[::1]", "not-an-ip",
  ])("blocks %s", (ip) => {
    expect(isPrivateIp(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.32.0.1", "100.128.0.1", "2606:4700:4700::1111"])(
    "allows public %s",
    (ip) => {
      expect(isPrivateIp(ip)).toBe(false);
    },
  );
});

import { isDialableAddress, parseCidrList } from "./private-ip";

describe("parseCidrList", () => {
  it("treats empty and undefined as no CIDRs", () => {
    expect(parseCidrList(undefined)).toEqual([]);
    expect(parseCidrList(" , ")).toEqual([]);
  });
  it("parses a comma-separated list with whitespace", () => {
    expect(parseCidrList("10.0.0.0/8, fd00::/8")).toEqual(["10.0.0.0/8", "fd00::/8"]);
  });
  it.each(["10.0.0.0", "10.0.0.0/33", "nope/8", "10.0.0.0/8/1", "fd00::/129", "10.0.0.0/-1"])("rejects %s", (bad) => {
    expect(() => parseCidrList(bad)).toThrow(/CIDR|prefix/);
  });
});

describe("isDialableAddress", () => {
  it("allows public addresses with no allow-list", () => {
    expect(isDialableAddress("8.8.8.8", [])).toBe(true);
  });
  it("denies private addresses by default", () => {
    for (const ip of ["10.1.2.3", "172.16.0.9", "192.168.1.1", "fd12::1", "100.64.0.1"]) {
      expect(isDialableAddress(ip, [])).toBe(false);
    }
  });
  it("allows a private address only inside a listed CIDR", () => {
    expect(isDialableAddress("10.20.1.5", ["10.20.0.0/16"])).toBe(true);
    expect(isDialableAddress("10.21.1.5", ["10.20.0.0/16"])).toBe(false);
    expect(isDialableAddress("fd12::1", ["fd00::/8"])).toBe(true);
  });
  it("handles IPv4-mapped IPv6 against IPv4 CIDRs", () => {
    expect(isDialableAddress("::ffff:10.20.1.5", ["10.20.0.0/16"])).toBe(true);
    expect(isDialableAddress("::ffff:10.99.1.5", ["10.20.0.0/16"])).toBe(false);
  });
  it("never allows loopback, link-local or metadata even when listed", () => {
    const everything = ["0.0.0.0/0", "::/0", "127.0.0.0/8", "169.254.0.0/16"];
    for (const ip of ["127.0.0.1", "169.254.169.254", "::1", "fe80::1", "0.0.0.0", "::ffff:127.0.0.1", "::ffff:a9fe:a9fe"]) {
      expect(isDialableAddress(ip, everything)).toBe(false);
    }
  });
  it("a broad CIDR still cannot unlock a public-looking mismatch (unparseable denied)", () => {
    expect(isDialableAddress("not-an-ip", ["0.0.0.0/0"])).toBe(false);
  });
});

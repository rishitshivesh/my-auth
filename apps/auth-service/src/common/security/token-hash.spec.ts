import { hashToken } from "./token-hash";

describe("hashToken", () => {
  it("returns the SHA-256 hex digest of the token", () => {
    expect(hashToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("is deterministic, so lookups by hash work", () => {
    expect(hashToken("same-token")).toBe(hashToken("same-token"));
  });

  it("gives different digests for different tokens and never echoes the token", () => {
    const a = hashToken("token-a");
    const b = hashToken("token-b");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain("token-a");
  });
});

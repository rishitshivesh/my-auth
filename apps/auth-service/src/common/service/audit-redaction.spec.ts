import { redactMetadata } from "./audit-redaction";

describe("redactMetadata", () => {
  it("redacts sensitive keys, including bare code, at any depth", () => {
    const out = redactMetadata({
      password: "x",
      code: "123456",
      errorCode: "E_BAD",
      nested: { refreshToken: "t", list: [{ apiKey: "k", ok: 1 }] },
    });
    expect(out).toEqual({
      password: "[redacted]",
      code: "[redacted]",
      errorCode: "E_BAD",
      nested: { refreshToken: "[redacted]", list: [{ apiKey: "[redacted]", ok: 1 }] },
    });
  });

  it("truncates long strings and arrays", () => {
    const out = redactMetadata({ s: "a".repeat(600), arr: Array(80).fill(1) });
    expect((out["s"] as string).startsWith("a".repeat(500))).toBe(true);
    expect((out["s"] as string).endsWith("…[truncated]")).toBe(true);
    expect(out["arr"] as unknown[]).toHaveLength(50);
  });

  it("caps depth at 5", () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } };
    expect(JSON.stringify(redactMetadata(deep))).toContain("[depth-limit]");
  });

  it("returns {} for non-objects and serialises dates", () => {
    expect(redactMetadata(null)).toEqual({});
    expect(redactMetadata([1])).toEqual({});
    expect(redactMetadata({ d: new Date(0) })).toEqual({ d: "1970-01-01T00:00:00.000Z" });
  });
});

import type { Request, Response } from "express";
import { SOCIAL_STATE_COOKIE, consumeSocialState, issueSocialState } from "./social-state";

function fakeRes() {
  const cookies: Record<string, string> = {};
  const cleared: string[] = [];
  const res = {
    cookie: jest.fn((name: string, value: string) => {
      cookies[name] = value;
    }),
    clearCookie: jest.fn((name: string) => {
      cleared.push(name);
    }),
  };
  return { res: res as unknown as Response, cookies, cleared };
}

const reqWith = (cookies: Record<string, string>): Request => ({ cookies }) as unknown as Request;

describe("social login state (login CSRF defence)", () => {
  beforeAll(() => {
    process.env["SESSION_SECRET"] = "s".repeat(40);
  });

  it("round-trips payload when the same browser presents the nonce cookie, and clears it", () => {
    const a = fakeRes();
    const state = issueSocialState(a.res, { tenantId: "t1", returnUrl: "https://p.test" });
    const b = fakeRes();
    const out = consumeSocialState(reqWith({ [SOCIAL_STATE_COOKIE]: a.cookies[SOCIAL_STATE_COOKIE]! }), b.res, state);
    expect(out).toEqual({ tenantId: "t1", returnUrl: "https://p.test" });
    expect(b.cleared).toContain(SOCIAL_STATE_COOKIE);
  });

  it("rejects a state minted in another browser (attacker callback URL)", () => {
    const attacker = fakeRes();
    const state = issueSocialState(attacker.res, { tenantId: "t1" });
    const victim = fakeRes();
    expect(consumeSocialState(reqWith({}), victim.res, state)).toBeNull();
    expect(consumeSocialState(reqWith({ [SOCIAL_STATE_COOKIE]: "other" }), victim.res, state)).toBeNull();
  });

  it("rejects tampered payloads and bad signatures", () => {
    const a = fakeRes();
    const state = issueSocialState(a.res, { tenantId: "t1" });
    const [body, sig] = state.split(".") as [string, string];
    const forged = Buffer.from(JSON.stringify({ tenantId: "victim", n: "x", exp: Date.now() + 1e6 })).toString("base64url");
    const req = reqWith({ [SOCIAL_STATE_COOKIE]: a.cookies[SOCIAL_STATE_COOKIE]! });
    expect(consumeSocialState(req, fakeRes().res, `${forged}.${sig}`)).toBeNull();
    expect(consumeSocialState(req, fakeRes().res, `${body}.AAAA`)).toBeNull();
    expect(consumeSocialState(req, fakeRes().res, body)).toBeNull();
    expect(consumeSocialState(req, fakeRes().res, undefined)).toBeNull();
  });

  it("rejects an expired state", () => {
    const a = fakeRes();
    const now = Date.now();
    const spy = jest.spyOn(Date, "now").mockReturnValue(now - 11 * 60 * 1000);
    const state = issueSocialState(a.res, { tenantId: "t1" });
    spy.mockRestore();
    expect(consumeSocialState(reqWith({ [SOCIAL_STATE_COOKIE]: a.cookies[SOCIAL_STATE_COOKIE]! }), fakeRes().res, state)).toBeNull();
  });
});

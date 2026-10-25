import * as crypto from "crypto";
import { ApiException } from "../http";
import { JwksService } from "../../modules/oauth/services/jwks.service";
import { JwtStrategy } from "./jwt.strategy";

type Done = (err: Error | null, key?: string | Buffer) => void;
type KeyProvider = (req: unknown, raw: string, done: Done) => Promise<void>;

const passportCtor = jest.fn();
jest.mock("@nestjs/passport", () => ({
  PassportStrategy: () =>
    class {
      constructor(opts: unknown) {
        passportCtor(opts);
      }
    },
}));

function b64(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function setup() {
  const jwks = { getVerificationKeyByKid: jest.fn() };
  const strategy = new JwtStrategy(jwks as unknown as JwksService);
  const opts = passportCtor.mock.calls[passportCtor.mock.calls.length - 1]![0] as {
    secretOrKeyProvider: KeyProvider;
    jwtFromRequest: (req: unknown) => string | null;
    algorithms: string[];
    ignoreExpiration: boolean;
  };
  return { jwks, strategy, opts };
}

function run(provider: KeyProvider, raw: string): Promise<{ err: Error | null; key?: string | Buffer }> {
  return new Promise((resolve) => {
    void provider({}, raw, (err, key) => resolve({ err, key }));
  });
}

describe("JwtStrategy", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
    passportCtor.mockClear();
  });

  describe("configuration", () => {
    it("pins RS256 and rejects expired tokens", () => {
      const { opts } = setup();
      expect(opts.algorithms).toEqual(["RS256"]);
      expect(opts.ignoreExpiration).toBe(false);
    });

    it("extracts from bearer header, then accessToken cookie", () => {
      const { opts } = setup();
      expect(opts.jwtFromRequest({ headers: { authorization: "Bearer abc" } })).toBe("abc");
      expect(opts.jwtFromRequest({ headers: {}, cookies: { accessToken: "ck" } })).toBe("ck");
      expect(opts.jwtFromRequest({ headers: {}, cookies: {} })).toBeNull();
      expect(opts.jwtFromRequest({ headers: {} })).toBeNull();
    });
  });

  describe("secretOrKeyProvider", () => {
    it("rejects tokens without three segments", async () => {
      const { opts } = setup();
      const r = await run(opts.secretOrKeyProvider, "a.b");
      expect(r.err?.message).toBe("Invalid token format");
    });

    it("rejects tokens without kid", async () => {
      const { opts } = setup();
      const r = await run(opts.secretOrKeyProvider, `${b64({ alg: "RS256" })}.x.y`);
      expect(r.err?.message).toBe("Token missing kid header");
    });

    it("rejects unknown kid", async () => {
      const { opts, jwks } = setup();
      jwks.getVerificationKeyByKid.mockResolvedValue(null);
      const r = await run(opts.secretOrKeyProvider, `${b64({ kid: "k9" })}.x.y`);
      expect(jwks.getVerificationKeyByKid).toHaveBeenCalledWith("k9");
      expect(r.err?.message).toBe("Signing key not found in JWKS");
    });

    it("returns a PEM public key for a known kid", async () => {
      const { opts, jwks } = setup();
      const { publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
      jwks.getVerificationKeyByKid.mockResolvedValue(publicKey.export({ format: "jwk" }));
      const r = await run(opts.secretOrKeyProvider, `${b64({ kid: "k1" })}.x.y`);
      expect(r.err).toBeNull();
      expect(String(r.key)).toContain("BEGIN PUBLIC KEY");
    });

    it("passes through errors (malformed header JSON, bad JWK, lookup failure)", async () => {
      const { opts, jwks } = setup();
      const bad = await run(opts.secretOrKeyProvider, "!!!.x.y");
      expect(bad.err).not.toBeNull();
      jwks.getVerificationKeyByKid.mockResolvedValue({ kty: "RSA" });
      const badJwk = await run(opts.secretOrKeyProvider, `${b64({ kid: "k" })}.x.y`);
      expect(badJwk.err).not.toBeNull();
      jwks.getVerificationKeyByKid.mockRejectedValue(new Error("db"));
      const fail = await run(opts.secretOrKeyProvider, `${b64({ kid: "k" })}.x.y`);
      expect(fail.err?.message).toBe("db");
    });
  });

  describe("validate", () => {
    it.each([{}, { sub: 5 }, { sub: "" }])("rejects invalid sub %j", async (payload) => {
      const { strategy } = setup();
      await expect(strategy.validate(payload)).rejects.toMatchObject({ code: "AUTH_TOKEN_INVALID" });
      await expect(strategy.validate(payload)).rejects.toBeInstanceOf(ApiException);
    });

    it.each([
      [{ type: "mfa_pending" }],
      [{ mode: "social" }],
      [{ purpose: "link" }],
    ])("rejects purpose-bound token claims %j (not an access token)", async (extra) => {
      const { strategy } = setup();
      await expect(strategy.validate({ sub: "u1", ...extra })).rejects.toMatchObject({ code: "AUTH_TOKEN_INVALID" });
    });

    it("maps claims and defaults roles/groups", async () => {
      const { strategy } = setup();
      const user = await strategy.validate({
        sub: "u1",
        tenantId: "t1",
        tenantSlug: "acme",
        sessionId: "s1",
        authTime: 123,
        email: "a@b.c",
      });
      expect(user).toEqual({
        sub: "u1",
        userId: "u1",
        tenantId: "t1",
        tenantSlug: "acme",
        sessionId: "s1",
        authTime: 123,
        email: "a@b.c",
        roles: [],
        groups: [],
        isSuperAdmin: false,
      });
    });

    it("ignores non-numeric authTime and non-array roles", async () => {
      const { strategy } = setup();
      const user = await strategy.validate({ sub: "u", authTime: "1", roles: "super_admin", groups: {} });
      expect(user.authTime).toBeUndefined();
      expect(user.roles).toEqual([]);
      expect(user.isSuperAdmin).toBe(false);
    });

    it.each([
      [{ groups: ["sentry-internal"] }],
      [{ roles: ["sentry-internal"] }],
      [{ groups: ["super_admin"] }],
      [{ roles: ["super_admin"] }],
    ])("grants superadmin for %j", async (extra) => {
      const { strategy } = setup();
      expect((await strategy.validate({ sub: "u", ...extra })).isSuperAdmin).toBe(true);
    });

    it("honours SENTRY_PLATFORM_SLUG for the platform role", async () => {
      process.env.SENTRY_PLATFORM_SLUG = "acme";
      const { strategy } = setup();
      expect((await strategy.validate({ sub: "u", roles: ["acme-internal"] })).isSuperAdmin).toBe(true);
      expect((await strategy.validate({ sub: "u", roles: ["admin"] })).isSuperAdmin).toBe(false);
    });
  });
});

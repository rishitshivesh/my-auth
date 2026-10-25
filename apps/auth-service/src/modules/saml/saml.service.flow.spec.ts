import * as crypto from "crypto";
import * as samlify from "samlify";
import { EncryptionService } from "@repo/security";
import { ApiException, ProtocolException } from "@/common/http";
import { SamlService } from "./saml.service";

samlify.setSchemaValidator({ validate: () => Promise.resolve("valid") });
jest.mock("@/common/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const MASTER_KEY = "flow-spec-master-key";
const ISSUER = "https://idp.example.com";

type KeyRow = {
  id: string; tenantId: string | null; publicKeyPem: string; encryptedPrivateKey: string; iv: string; authTag: string; status: string;
};

async function makeKeyRow(id: string, tenantId: string | null): Promise<KeyRow> {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const enc = await EncryptionService.encrypt(privateKey, MASTER_KEY);
  return { id, tenantId, publicKeyPem: publicKey, encryptedPrivateKey: enc.encrypted, iv: enc.iv, authTag: enc.authTag, status: "active" };
}

let defaultRows: KeyRow[] = [];
beforeAll(async () => { defaultRows = [await makeKeyRow("kp1", null)]; });

const baseSp = {
  id: "sp-1",
  tenantId: "t1",
  name: "SP",
  entityId: "https://sp.example.com/meta",
  acsUrl: "https://sp.example.com/acs",
  nameIdFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
  attributeMapping: { email: "email", fn: "firstName" },
  active: true,
  signAssertions: true,
};

const authnRequest = (issuer: string, id = "_req1") =>
  Buffer.from(
    `<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${id}" Version="2.0" IssueInstant="2026-01-01T00:00:00Z" AssertionConsumerServiceURL="${baseSp.acsUrl}"><saml:Issuer>${issuer}</saml:Issuer></samlp:AuthnRequest>`,
  ).toString("base64");

function build(keyRows: KeyRow[] = defaultRows) {
  const spRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((v: object) => ({ id: "sp-new", ...v })),
    save: jest.fn((v: object) => Promise.resolve(v)),
    softDelete: jest.fn(),
  };
  const keyPairRepo = {
    findOne: jest.fn((opts: { where: { tenantId: unknown } }) => {
      const t = opts.where.tenantId;
      const isNullQuery = typeof t === "object" && t !== null;
      return Promise.resolve(keyRows.find((k) => (isNullQuery ? k.tenantId === null : k.tenantId === t)) ?? null);
    }),
  };
  const userRepo = { findOne: jest.fn() };
  const config = {
    get: (k: string, d?: unknown) => (k === "ISSUER_BASE_URL" ? ISSUER : d),
    getOrThrow: (k: string) => {
      if (k === "KEYRING_MASTER_KEY") return MASTER_KEY;
      throw new Error("missing " + k);
    },
  };
  const tenantService = { findBySlug: jest.fn() };
  const runner = { runInTenant: jest.fn((_s: string, w: () => unknown) => w()) };
  const redis = { set: jest.fn(), get: jest.fn(), delete: jest.fn() };
  const service = new SamlService(
    spRepo as never, keyPairRepo as never, userRepo as never, config as never,
    tenantService as never, runner as never, redis as never,
  );
  return { service, spRepo, keyPairRepo, userRepo, tenantService, runner, redis, config };
}

async function pe(p: Promise<unknown> | (() => unknown)): Promise<ProtocolException> {
  const e = await (typeof p === "function" ? Promise.resolve().then(p) : p).catch((x: unknown) => x);
  expect(e).toBeInstanceOf(ProtocolException);
  return e as ProtocolException;
}

describe("SamlService tenant/session guards", () => {
  it.each(["", "Acme", "a_b", "a b", "../etc", "a".repeat(65), "acme;drop", "acme\n"])(
    "rejects malformed slug %p with 400 before any lookup",
    async (slug) => {
      const { service, tenantService } = build();
      expect((await pe(service.resolveTenant(slug))).getStatus()).toBe(400);
      expect(tenantService.findBySlug).not.toHaveBeenCalled();
    },
  );

  it("accepts a 64-char slug", async () => {
    const { service, tenantService } = build();
    tenantService.findBySlug.mockResolvedValue({ id: "t1", active: true });
    await expect(service.resolveTenant("a".repeat(64))).resolves.toMatchObject({ id: "t1" });
  });

  it("404s for unknown or inactive tenants", async () => {
    const { service, tenantService } = build();
    tenantService.findBySlug.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "t", active: false });
    expect((await pe(service.resolveTenant("acme"))).getStatus()).toBe(404);
    expect((await pe(service.resolveTenant("acme"))).getStatus()).toBe(404);
  });

  it("assertSessionTenant blocks cross-tenant and missing sessions", () => {
    const { service } = build();
    expect(() => service.assertSessionTenant("t1", "t1")).not.toThrow();
    for (const sess of ["t2", undefined, ""]) {
      let err: unknown;
      try { service.assertSessionTenant(sess, "t1"); } catch (e) { err = e; }
      expect((err as ProtocolException).getStatus()).toBe(401);
    }
  });
});

describe("SamlService metadata", () => {
  it("emits entity, SSO/SLO URLs and a parseable X.509 signing cert", async () => {
    const { service, tenantService } = build();
    tenantService.findBySlug.mockResolvedValue({ id: "t1", active: true });
    const xml = await service.getIdpMetadata("acme");
    expect(xml).toContain(`entityID="${ISSUER}/saml/metadata/acme"`);
    expect(xml).toContain(`Location="${ISSUER}/saml/sso/acme"`);
    expect(xml).toContain(`Location="${ISSUER}/saml/slo/acme"`);
    const b64 = /<ds:X509Certificate>([^<]+)</.exec(xml)![1]!;
    const cert = new crypto.X509Certificate(`-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----`);
    expect(cert.subject).toContain("sentry-saml-idp");
  });

  it("rejects bad slug and propagates missing-tenant 404", async () => {
    const { service, tenantService } = build();
    expect((await pe(service.getIdpMetadata("BAD SLUG"))).getStatus()).toBe(400);
    tenantService.findBySlug.mockResolvedValue(null);
    expect((await pe(service.getIdpMetadata("acme"))).getStatus()).toBe(404);
  });

  it("400s when no active key exists (tenant or platform)", async () => {
    const { service, tenantService } = build([]);
    tenantService.findBySlug.mockResolvedValue({ id: "t1", active: true });
    expect((await pe(service.getIdpMetadata("acme"))).body).toMatchObject({ message: "No active signing key found" });
  });

  it("prefers tenant key, falls back to platform key, and caches the cert per key id", async () => {
    const own = await makeKeyRow("own", "t1");
    const platform = await makeKeyRow("plat", null);
    const { service, tenantService, keyPairRepo } = build([own, platform]);
    tenantService.findBySlug.mockResolvedValue({ id: "t1", active: true });
    const a = await service.getIdpMetadata("acme");
    const b = await service.getIdpMetadata("acme");
    expect(a).toBe(b); // cached cert => identical output (cert generation is time-based)

    tenantService.findBySlug.mockResolvedValue({ id: "t2", active: true });
    const c = await service.getIdpMetadata("beta");
    expect(c).not.toContain(/<ds:X509Certificate>([^<]+)</.exec(a)![1]!);
    expect(keyPairRepo.findOne).toHaveBeenCalled();
  });

  it("fails when the key cannot be decrypted (wrong master key / tampered tag)", async () => {
    const row = await makeKeyRow("k", "t1");
    row.authTag = Buffer.alloc(16).toString("base64");
    const { service, tenantService } = build([row]);
    tenantService.findBySlug.mockResolvedValue({ id: "t1", active: true });
    await expect(service.getIdpMetadata("acme")).rejects.toThrow();
  });

  it("escapes XML metacharacters in issuer base URL", async () => {
    const { service, tenantService, config } = build();
    (config as { get: unknown }).get = () => 'http://x/"><evil/>';
    tenantService.findBySlug.mockResolvedValue({ id: "t1", active: true });
    const xml = await service.getIdpMetadata("acme");
    expect(xml).not.toContain("<evil/>");
    expect(xml).toContain("&quot;&gt;&lt;evil/&gt;");
  });
});

describe("SamlService SP management", () => {
  const dto = { name: "N", entityId: "e", acsUrl: "https://a/acs" } as never;

  it("registerSP applies defaults", async () => {
    const { service, spRepo } = build();
    spRepo.findOne.mockResolvedValue(null);
    const sp = await service.registerSP("t1", dto);
    expect(sp).toMatchObject({
      tenantId: "t1",
      nameIdFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
      attributeMapping: { email: "email", firstName: "firstName", lastName: "lastName" },
      signAssertions: true,
      encryptAssertions: false,
    });
  });

  it("registerSP honours explicit values", async () => {
    const { service, spRepo } = build();
    spRepo.findOne.mockResolvedValue(null);
    const sp = await service.registerSP("t1", {
      name: "N", entityId: "e", acsUrl: "u", nameIdFormat: "persistent", attributeMapping: { a: "email" },
      signAssertions: false, encryptAssertions: true,
    } as never);
    expect(sp).toMatchObject({ nameIdFormat: "persistent", attributeMapping: { a: "email" }, signAssertions: false, encryptAssertions: true });
  });

  it("registerSP 409s on duplicate entityId in tenant", async () => {
    const { service, spRepo } = build();
    spRepo.findOne.mockResolvedValue({ id: "x" });
    await expect(service.registerSP("t1", dto)).rejects.toMatchObject({ code: "RESOURCE_CONFLICT" });
    expect(spRepo.findOne).toHaveBeenCalledWith({ where: { tenantId: "t1", entityId: "e" } });
  });

  it("listSPs / updateSP / deleteSP / findSP", async () => {
    const { service, spRepo } = build();
    spRepo.find.mockResolvedValue([]);
    await service.listSPs("t1");
    expect(spRepo.find).toHaveBeenCalledWith({ where: { tenantId: "t1" }, order: { createdAt: "DESC" } });
    spRepo.findOne.mockResolvedValue({ id: "s", name: "o" });
    expect(await service.updateSP("t1", "s", { name: "n" } as never)).toMatchObject({ name: "n" });
    await service.deleteSP("t1", "s");
    expect(spRepo.softDelete).toHaveBeenCalledWith("s");
    spRepo.findOne.mockResolvedValue(null);
    const err = await service.findSP("t2", "s").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiException);
    expect((err as ApiException).code).toBe("RESOURCE_NOT_FOUND");
  });
});

describe("SamlService pending SSO request store (replay protection)", () => {
  it("stash stores a 256-bit nonce with a 10 minute TTL", async () => {
    const { service, redis } = build();
    const nonce = await service.stashPendingRequest("acme", "req", "rs");
    expect(nonce).toMatch(/^[0-9a-f]{64}$/);
    expect(redis.set).toHaveBeenCalledWith("global", "saml-sso-pending", nonce, { tenantSlug: "acme", samlRequest: "req", relayState: "rs" }, 600);
    expect(await service.stashPendingRequest("acme", "req", "rs")).not.toBe(nonce);
  });

  it("pop reads then always deletes (one-time use), even when not found", async () => {
    const { service, redis } = build();
    const order: string[] = [];
    redis.get.mockImplementation(() => { order.push("get"); return Promise.resolve({ tenantSlug: "a" }); });
    redis.delete.mockImplementation(() => { order.push("del"); return Promise.resolve(); });
    expect(await service.popPendingRequest("n")).toEqual({ tenantSlug: "a" });
    expect(order).toEqual(["get", "del"]);
    redis.get.mockResolvedValue(null);
    expect(await service.popPendingRequest("n2")).toBeNull();
    expect(redis.delete).toHaveBeenCalledTimes(2);
  });
});

describe("SamlService.parseAuthnRequest", () => {
  it("rejects a request with no Issuer", async () => {
    const { service } = build();
    const xml = Buffer.from('<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" ID="_r" Version="2.0"/>').toString("base64");
    expect((await pe(service.parseAuthnRequest("t1", "acme", xml))).body).toMatchObject({ message: "AuthnRequest is missing an Issuer" });
  });

  it("rejects an unknown issuer, querying only active SPs of this tenant", async () => {
    const { service, spRepo } = build();
    spRepo.findOne.mockResolvedValue(null);
    await pe(service.parseAuthnRequest("t1", "acme", authnRequest("https://evil.example")));
    expect(spRepo.findOne).toHaveBeenCalledWith({ where: { tenantId: "t1", entityId: "https://evil.example", active: true } });
  });

  it("accepts a well-formed request from a registered SP", async () => {
    const { service, spRepo } = build();
    spRepo.findOne.mockResolvedValue(baseSp);
    const { sp, requestInfo } = await service.parseAuthnRequest("t1", "acme", authnRequest(baseSp.entityId, "_abc"));
    expect(sp).toBe(baseSp);
    expect((requestInfo.extract.request as { id: string }).id).toBe("_abc");
  });

  it("garbage base64 / non-XML input is rejected without leaking internals", async () => {
    const { service, spRepo } = build();
    spRepo.findOne.mockResolvedValue(baseSp);
    await expect(service.parseAuthnRequest("t1", "acme", "!!!not-xml!!!")).rejects.toBeDefined();
  });

  it("wraps samlify validation failures as 400 'Invalid or tampered AuthnRequest'", async () => {
    const { service, spRepo } = build();
    spRepo.findOne.mockResolvedValue({ ...baseSp, certificate: "not-a-cert", signAssertions: true });
    samlify.setSchemaValidator({ validate: () => Promise.reject(new Error("bad schema")) });
    try {
      const e = await pe(service.parseAuthnRequest("t1", "acme", authnRequest(baseSp.entityId)));
      expect(e.getStatus()).toBe(400);
      expect(e.body).toMatchObject({ message: "Invalid or tampered AuthnRequest" });
    } finally {
      samlify.setSchemaValidator({ validate: () => Promise.resolve("valid") });
    }
  });
});

describe("SamlService.buildSignedResponse", () => {
  const reqInfo = { samlContent: "", extract: { request: { id: "_req9" } } } as never;
  const decode = (b: { samlResponse: string }) => Buffer.from(b.samlResponse, "base64").toString("utf8");

  it("404s when user does not exist in the tenant schema; runs lookup inside tenant runner", async () => {
    const { service, userRepo, runner } = build();
    userRepo.findOne.mockResolvedValue(null);
    const e = await pe(service.buildSignedResponse("t1", "acme", baseSp as never, reqInfo, "u", ""));
    expect(e.getStatus()).toBe(404);
    expect(runner.runInTenant).toHaveBeenCalledWith("acme", expect.any(Function));
  });

  it("400s when no signing key exists", async () => {
    const { service, userRepo } = build([]);
    userRepo.findOne.mockResolvedValue({ id: "u", email: "a@x" });
    expect((await pe(service.buildSignedResponse("t1", "acme", baseSp as never, reqInfo, "u", ""))).getStatus()).toBe(400);
  });

  it("binds InResponseTo, Audience, Recipient, 5-minute validity and omits empty attributes", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "setTimeout"] }).setSystemTime(new Date("2026-03-01T10:00:00Z"));
    try {
      const { service, userRepo } = build();
      userRepo.findOne.mockResolvedValue({ id: "u", email: "a@x.test", firstName: "Ann", lastName: null });
      const sp = { ...baseSp, attributeMapping: { email: "email", fn: "firstName", ln: "lastName" } };
      const out = await service.buildSignedResponse("t1", "acme", sp as never, reqInfo, "u", "");
      const xml = decode(out);
      expect(xml).toContain('InResponseTo="_req9"');
      expect(xml).toContain(`<saml:Audience>${baseSp.entityId}</saml:Audience>`);
      expect(xml).toContain(`Recipient="${baseSp.acsUrl}"`);
      expect(xml).toContain('NotOnOrAfter="2026-03-01T10:05:00.000Z"');
      expect(xml).toContain('Attribute Name="fn"');
      expect(xml).not.toContain('Attribute Name="ln"');
      expect(out.relayState).toBe("");
    } finally {
      jest.useRealTimers();
    }
  });

  it("escapes attacker-controlled user fields (no XML/attribute injection)", async () => {
    const { service, userRepo } = build();
    userRepo.findOne.mockResolvedValue({
      id: "u", email: 'a@x.test"><saml:Evil/>', firstName: "</saml:AttributeValue><saml:Evil2/>",
    });
    const sp = { ...baseSp, attributeMapping: { 'x"><Evil3/>': "firstName" } };
    const xml = decode(await service.buildSignedResponse("t1", "acme", sp as never, reqInfo, "u", "r"));
    expect(xml).not.toMatch(/<saml:Evil\/>|<saml:Evil2\/>|<Evil3\/>/);
    expect(xml).toContain("&lt;saml:Evil/&gt;");
  });

  it("does not emit secret user columns via attributeMapping", async () => {
    const { service, userRepo } = build();
    userRepo.findOne.mockResolvedValue({ id: "u", email: "a@x", passwordHash: "$argon2id$secret" });
    const sp = { ...baseSp, attributeMapping: { pw: "passwordHash" } };
    const xml = decode(await service.buildSignedResponse("t1", "acme", sp as never, reqInfo, "u", ""));
    // attributeMapping is tenant-admin controlled; only allow-listed fields may be emitted.
    expect(xml).not.toContain("$argon2id$secret");
    expect(xml).not.toContain('Attribute Name="pw"');
  });

  it.each(["passwordHash", "mfaEnabled", "magicLinkToken", "__proto__", "constructor"])(
    "registerSP/updateSP reject mapping of %s",
    async (field) => {
      const { service, spRepo } = build();
      spRepo.findOne.mockResolvedValue(null);
      await expect(service.registerSP("t1", { name: "N", entityId: "e", acsUrl: "u", attributeMapping: { x: field } } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(service.updateSP("t1", "sp1", { attributeMapping: { x: field } } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    },
  );

  it("defaults InResponseTo to empty and relayState falls back to the input", async () => {
    const { service, userRepo } = build();
    userRepo.findOne.mockResolvedValue({ id: "u", email: "a@x.test" });
    const out = await service.buildSignedResponse("t1", "acme", baseSp as never, { samlContent: "", extract: {} } as never, "u", "keep");
    expect(decode(out)).toContain('InResponseTo=""');
    expect(out.relayState).toBe("keep");
    expect(out.postUrl).toBe(baseSp.acsUrl);
  });
});

import { randomBytes } from "node:crypto";
import { DOMParser } from "@xmldom/xmldom";
import { SignedXml } from "xml-crypto";
import xpath from "xpath";
import { createTestApp, createTenant, cookiesOf, type TestApp, type TenantFixture } from "../support";

const ACS = "https://sp.example.com/acs";
const NS_SAML = "urn:oasis:names:tc:SAML:2.0:assertion";

function authnRequest(opts: { id?: string; issuer: string; acs?: string; extra?: string }): { id: string; b64: string } {
  const id = opts.id ?? `_${randomBytes(12).toString("hex")}`;
  const xml = `<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="${NS_SAML}" ID="${id}" Version="2.0" IssueInstant="${new Date().toISOString()}" AssertionConsumerServiceURL="${opts.acs ?? ACS}" ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"><saml:Issuer>${opts.issuer}</saml:Issuer>${opts.extra ?? ""}</samlp:AuthnRequest>`;
  return { id, b64: Buffer.from(xml).toString("base64") };
}

function formField(html: string, name: string): string {
  const m = html.match(new RegExp(`name="${name}" value="([^"]*)"`));
  return m ? m[1]!.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&") : "";
}

function selectOne(doc: Document, expr: string): Node | undefined {
  const sel = xpath.useNamespaces({ saml: NS_SAML, samlp: "urn:oasis:names:tc:SAML:2.0:protocol", ds: "http://www.w3.org/2000/09/xmldsig#" });
  return (sel(expr, doc) as Node[])[0];
}

function verifySignatures(xml: string, certPem: string): { valid: boolean; count: number } {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const sigs = xpath.select("//*[local-name()='Signature' and namespace-uri()='http://www.w3.org/2000/09/xmldsig#']", doc) as Node[];
  let valid = sigs.length > 0;
  for (const sigNode of sigs) {
    const sig = new SignedXml({ publicCert: certPem });
    sig.loadSignature(sigNode);
    try {
      if (!sig.checkSignature(xml)) valid = false;
    } catch {
      valid = false;
    }
  }
  return { valid, count: sigs.length };
}

describe("SAML IdP", () => {
  let t: TestApp;
  let a: TenantFixture;
  let b: TenantFixture;
  let spId: string;
  let certPem: string;
  const ENTITY = "https://sp.example.com/metadata";
  const admin = (tn: TenantFixture) => t.http({ tenant: tn.slug, bearer: tn.admin.accessToken });

  const sso = (tn: TenantFixture, b64: string, withSession = true, relay = "relay-1") =>
    t.http({ cookies: withSession ? tn.admin.cookies : [] }).post(`/saml/sso/${tn.slug}`).type("form").send({ SAMLRequest: b64, RelayState: relay });

  beforeAll(async () => {
    t = await createTestApp();
    a = await createTenant(t);
    b = await createTenant(t);
    const reg = await admin(a).post("/saml/sps").send({ name: "Test SP", entityId: ENTITY, acsUrl: ACS });
    expect(reg.status).toBe(201);
    spId = reg.body.data.id;
    const meta = await t.http().get(`/saml/metadata/${a.slug}`);
    const b64cert = meta.text.match(/<ds:X509Certificate>([^<]+)</)![1]!;
    certPem = `-----BEGIN CERTIFICATE-----\n${b64cert.match(/.{1,64}/g)!.join("\n")}\n-----END CERTIFICATE-----`;
  });
  afterAll(() => t.close());

  describe("metadata", () => {
    it("is public, unwrapped XML with entityID, SSO binding and a signing certificate", async () => {
      const res = await t.http().get(`/saml/metadata/${a.slug}`);
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/xml/);
      expect(res.text.startsWith("<?xml")).toBe(true);
      expect(res.text).toContain(`/saml/metadata/${a.slug}"`);
      expect(res.text).toContain(`/saml/sso/${a.slug}`);
      expect(res.text).toContain("HTTP-POST");
      expect(res.text).toMatch(/<ds:X509Certificate>[A-Za-z0-9+/=]+<\/ds:X509Certificate>/);
      expect(() => new DOMParser({ onError: (_l: string, m: string) => { throw new Error(m); } } as never).parseFromString(res.text, "text/xml")).not.toThrow();
    });

    it("404s for unknown tenants and 400s for malformed slugs", async () => {
      expect((await t.http().get("/saml/metadata/no-such-tenant-zz")).status).toBe(404);
      expect((await t.http().get("/saml/metadata/BAD_SLUG!")).status).toBe(400);
    });

    it("differs per tenant (tenant-specific entityID)", async () => {
      const mb = await t.http().get(`/saml/metadata/${b.slug}`);
      expect(mb.text).toContain(`/saml/metadata/${b.slug}"`);
      expect(mb.text).not.toContain(`/saml/metadata/${a.slug}"`);
    });
  });

  describe("SP-initiated SSO", () => {
    it("issues a signed assertion bound to the request, audience, recipient and a short validity", async () => {
      const req = authnRequest({ issuer: ENTITY });
      const res = await sso(a, req.b64);
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/html/);
      expect(res.text).toContain(`action="${ACS}"`);
      expect(formField(res.text, "RelayState")).toBe("relay-1");
      const xml = Buffer.from(formField(res.text, "SAMLResponse"), "base64").toString("utf8");

      const sigs = verifySignatures(xml, certPem);
      expect(sigs.count).toBeGreaterThan(0);
      expect(sigs.valid).toBe(true);

      const doc = new DOMParser().parseFromString(xml, "text/xml");
      const text = (expr: string): string | undefined => (selectOne(doc, expr) as Node | undefined)?.textContent ?? undefined;
      const attr = (expr: string): string | undefined => (selectOne(doc, expr) as Attr | undefined)?.value;
      expect(attr("/samlp:Response/@InResponseTo")).toBe(req.id);
      expect(attr("/samlp:Response/@Destination")).toBe(ACS);
      expect(text("//saml:Assertion/saml:Subject/saml:NameID")).toBe(a.admin.email);
      expect(text("//saml:Audience")).toBe(ENTITY);
      expect(attr("//saml:SubjectConfirmationData/@Recipient")).toBe(ACS);
      expect(attr("//saml:SubjectConfirmationData/@InResponseTo")).toBe(req.id);
      expect(text("//saml:Issuer")).toContain(`/saml/metadata/${a.slug}`);
      const notAfter = Date.parse(attr("//saml:Conditions/@NotOnOrAfter")!);
      const notBefore = Date.parse(attr("//saml:Conditions/@NotBefore")!);
      expect(notAfter).toBeGreaterThan(Date.now());
      expect(notAfter - Date.now()).toBeLessThanOrEqual(5 * 60 * 1000 + 5000);
      expect(notBefore).toBeLessThanOrEqual(Date.now() + 1000);
      expect(xml).toContain("urn:oasis:names:tc:SAML:2.0:status:Success");
    });

    it("a tampered response no longer verifies against the published certificate", async () => {
      const res = await sso(a, authnRequest({ issuer: ENTITY }).b64);
      const xml = Buffer.from(formField(res.text, "SAMLResponse"), "base64").toString("utf8");
      const tampered = xml.replace(a.admin.email, "attacker@evil.example.com");
      expect(tampered).not.toBe(xml);
      expect(verifySignatures(tampered, certPem).valid).toBe(false);
    });

    it("signature verifies only with this tenant's certificate flow, not a random one", async () => {
      const res = await sso(a, authnRequest({ issuer: ENTITY }).b64);
      const xml = Buffer.from(formField(res.text, "SAMLResponse"), "base64").toString("utf8");
      const otherMeta = await t.http().get(`/saml/metadata/${b.slug}`);
      const c = otherMeta.text.match(/<ds:X509Certificate>([^<]+)</)![1]!;
      const otherPem = `-----BEGIN CERTIFICATE-----\n${c.match(/.{1,64}/g)!.join("\n")}\n-----END CERTIFICATE-----`;
      // Per-tenant keys: tenant B's cert must not validate tenant A's assertion
      expect(verifySignatures(xml, otherPem).valid).toBe(false);
    });

    it("rejects missing, malformed and non-XML SAMLRequest", async () => {
      expect((await t.http({ cookies: a.admin.cookies }).post(`/saml/sso/${a.slug}`).type("form").send({})).status).toBe(400);
      expect((await sso(a, Buffer.from("this is not xml").toString("base64"))).status).toBe(400);
      expect((await sso(a, "!!!not-base64!!!")).status).toBe(400);
      expect((await sso(a, Buffer.from("<a><b></a>").toString("base64"))).status).toBe(400);
    });

    it("rejects unknown issuers and inactive service providers", async () => {
      expect((await sso(a, authnRequest({ issuer: "https://unknown.example.com" }).b64)).status).toBe(400);
      const patch = await admin(a).patch(`/saml/sps/${spId}`).send({ active: false });
      expect(patch.status).toBe(200);
      expect((await sso(a, authnRequest({ issuer: ENTITY }).b64)).status).toBe(400);
      await admin(a).patch(`/saml/sps/${spId}`).send({ active: true });
      expect((await sso(a, authnRequest({ issuer: ENTITY }).b64)).status).toBe(200);
    });

    it("rejects XXE / DTD payloads without leaking file contents or making requests", async () => {
      const evil = `<?xml version="1.0"?><!DOCTYPE r [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="${NS_SAML}" ID="_x1" Version="2.0" IssueInstant="${new Date().toISOString()}"><saml:Issuer>&xxe;</saml:Issuer></samlp:AuthnRequest>`;
      const res = await sso(a, Buffer.from(evil).toString("base64"));
      expect(res.status).toBe(400);
      expect(res.text).not.toContain("root:");
      const evil2 = evil.replace("&xxe;", ENTITY).replace("<saml:Issuer>", "<saml:Issuer>").replace(/<!DOCTYPE[^>]*\]>/, '<!DOCTYPE r [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>');
      const res2 = await sso(a, Buffer.from(evil2).toString("base64"));
      expect(res2.text).not.toContain("root:");
      expect(Buffer.from(formField(res2.text, "SAMLResponse"), "base64").toString()).not.toContain("root:");
    });

    it("billion-laughs style entity expansion is rejected quickly", async () => {
      const bomb = `<?xml version="1.0"?><!DOCTYPE l [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;"><!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;">]><samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="${NS_SAML}" ID="_x2" Version="2.0" IssueInstant="${new Date().toISOString()}"><saml:Issuer>&c;</saml:Issuer></samlp:AuthnRequest>`;
      const started = Date.now();
      const res = await sso(a, Buffer.from(bomb).toString("base64"));
      expect(res.status).toBe(400);
      expect(Date.now() - started).toBeLessThan(5000);
    });

    it("does not let a second Issuer, comment-splitting or wrapped request swap the service provider", async () => {
      // Attacker-controlled extra Issuer inside an Extensions block must not change who the response is addressed to
      const wrapped = authnRequest({
        issuer: "https://attacker.example.com",
        extra: `<samlp:Extensions xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"><saml:Issuer xmlns:saml="${NS_SAML}">${ENTITY}</saml:Issuer></samlp:Extensions>`,
      });
      expect((await sso(a, wrapped.b64)).status).toBe(400);
      const split = authnRequest({ issuer: `https://attacker.example.com<!-- -->` });
      expect((await sso(a, split.b64)).status).toBe(400);
      const ctrl = authnRequest({ issuer: `${ENTITY}\u0000x` });
      expect((await sso(a, ctrl.b64)).status).toBe(400);
    });

    it("never sends the assertion to an ACS the SP did not register (request ACS is ignored)", async () => {
      const res = await sso(a, authnRequest({ issuer: ENTITY, acs: "https://evil.example.com/steal" }).b64);
      if (res.status === 200) {
        expect(res.text).toContain(`action="${ACS}"`);
        expect(res.text).not.toContain("evil.example.com");
      } else {
        expect(res.status).toBe(400);
      }
    });

    it("escapes RelayState in the auto-post form", async () => {
      const res = await sso(a, authnRequest({ issuer: ENTITY }).b64, true, `"><script>alert(1)</script>`);
      expect(res.text).not.toContain("<script>alert(1)</script>");
    });

    it("refuses a session that belongs to another tenant", async () => {
      const res = await t.http({ cookies: b.admin.cookies }).post(`/saml/sso/${a.slug}`).type("form").send({ SAMLRequest: authnRequest({ issuer: ENTITY }).b64 });
      expect(res.status).toBe(401);
    });

    it("tenant B cannot use tenant A's registered SP", async () => {
      const res = await sso(b, authnRequest({ issuer: ENTITY }).b64);
      expect(res.status).toBe(400);
    });
  });

  describe("unauthenticated flow and continuation", () => {
    it("stashes the request, sets a browser-bound nonce cookie and redirects to login", async () => {
      const res = await sso(a, authnRequest({ issuer: ENTITY }).b64, false);
      expect(res.status).toBe(302);
      const m = res.headers.location!.match(/^\/u\/login\?saml_continue=([0-9a-f]{64})$/);
      expect(m).not.toBeNull();
      expect(cookiesOf(res).some((c) => c.includes(m![1]!))).toBe(true);
    });

    it("completes once with the matching cookie and session, and cannot be replayed", async () => {
      const req = authnRequest({ issuer: ENTITY });
      const first = await sso(a, req.b64, false);
      const nonce = first.headers.location!.split("saml_continue=")[1]!;
      const nonceCookie = cookiesOf(first).find((c) => c.includes(nonce))!;
      const done = await t.http({ cookies: [...a.admin.cookies, nonceCookie] }).get(`/saml/sso/continue/${nonce}`);
      expect(done.status).toBe(200);
      const xml = Buffer.from(formField(done.text, "SAMLResponse"), "base64").toString("utf8");
      expect(xml).toContain(`InResponseTo="${req.id}"`);
      expect(verifySignatures(xml, certPem).valid).toBe(true);
      const replay = await t.http({ cookies: [...a.admin.cookies, nonceCookie] }).get(`/saml/sso/continue/${nonce}`);
      expect(replay.status).toBe(400);
    });

    it("refuses continuation from a different browser (missing/mismatched nonce cookie)", async () => {
      const first = await sso(a, authnRequest({ issuer: ENTITY }).b64, false);
      const nonce = first.headers.location!.split("saml_continue=")[1]!;
      const noCookie = await t.http({ cookies: a.admin.cookies }).get(`/saml/sso/continue/${nonce}`);
      expect(noCookie.status).toBe(401);
      const still = await t.http({ cookies: [...a.admin.cookies, cookiesOf(first).find((c) => c.includes(nonce))!] }).get(`/saml/sso/continue/${nonce}`);
      expect(still.status).toBe(200); // victim attempt did not burn the legit user's request
    });

    it("sends sessionless continuation back to login and rejects unknown nonces", async () => {
      const anon = await t.http().get(`/saml/sso/continue/${"0".repeat(64)}`);
      expect(anon.status).toBe(302);
      const unknown = await t.http({ cookies: [...a.admin.cookies, `saml_sso_nonce=${"1".repeat(64)}`] }).get(`/saml/sso/continue/${"1".repeat(64)}`);
      expect([400, 401]).toContain(unknown.status);
    });
  });

  describe("SP management", () => {
    it("requires authentication", async () => {
      expect((await t.http({ tenant: a.slug }).get("/saml/sps")).status).toBe(401);
      expect((await t.http({ tenant: a.slug }).post("/saml/sps").send({})).status).toBe(401);
      expect((await t.http({ tenant: a.slug }).patch(`/saml/sps/${spId}`).send({})).status).toBe(401);
      expect((await t.http({ tenant: a.slug }).delete(`/saml/sps/${spId}`)).status).toBe(401);
    });

    it("lists only this tenant's providers", async () => {
      const la = await admin(a).get("/saml/sps");
      expect(la.status).toBe(200);
      expect(la.body.data.map((s: { id: string }) => s.id)).toContain(spId);
      const lb = await admin(b).get("/saml/sps");
      expect(lb.body.data.map((s: { id: string }) => s.id)).not.toContain(spId);
    });

    it("validates input and rejects duplicate entityIds with 409", async () => {
      expect((await admin(a).post("/saml/sps").send({ name: "x", entityId: "e", acsUrl: "javascript:alert(1)" })).status).toBe(422);
      expect((await admin(a).post("/saml/sps").send({ name: "dup", entityId: ENTITY, acsUrl: ACS })).status).toBe(409);
    });

    it("cannot update or delete another tenant's provider", async () => {
      expect((await admin(b).patch(`/saml/sps/${spId}`).send({ name: "hijack" })).status).toBe(404);
      expect((await admin(b).delete(`/saml/sps/${spId}`)).status).toBe(404);
    });

    it("updates and soft-deletes; deleted providers can no longer sign in", async () => {
      const reg = await admin(a).post("/saml/sps").send({ name: "temp", entityId: "https://temp.example.com/m", acsUrl: "https://temp.example.com/acs" });
      const id = reg.body.data.id as string;
      const upd = await admin(a).patch(`/saml/sps/${id}`).send({ name: "temp2" });
      expect(upd.body.data.name).toBe("temp2");
      const del = await admin(a).delete(`/saml/sps/${id}`);
      expect(del.status).toBe(204);
      expect((await sso(a, authnRequest({ issuer: "https://temp.example.com/m", acs: "https://temp.example.com/acs" }).b64)).status).toBe(400);
      expect((await admin(a).delete(`/saml/sps/${id}`)).status).toBe(404);
    });
  });
});

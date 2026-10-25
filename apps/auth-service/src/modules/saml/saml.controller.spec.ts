import { ApiException, ProtocolException } from "@/common/http";
import { SamlController } from "./saml.controller";

jest.mock("@/common/http/auth-cookies", () => ({
  SAML_SSO_NONCE_COOKIE: "saml_sso_nonce",
  setSamlSsoNonceCookie: jest.fn(),
  clearSamlSsoNonceCookie: jest.fn(),
}));
import { setSamlSsoNonceCookie, clearSamlSsoNonceCookie } from "@/common/http/auth-cookies";

function build() {
  const svc = {
    getIdpMetadata: jest.fn(),
    resolveTenant: jest.fn().mockResolvedValue({ id: "t1" }),
    stashPendingRequest: jest.fn().mockResolvedValue("nonce1"),
    assertSessionTenant: jest.fn(),
    parseAuthnRequest: jest.fn().mockResolvedValue({ sp: { id: "sp" }, requestInfo: {} }),
    buildSignedResponse: jest.fn().mockResolvedValue({ postUrl: "https://sp/acs", samlResponse: "R==", relayState: "rs" }),
    popPendingRequest: jest.fn(),
    listSPs: jest.fn(), registerSP: jest.fn(), updateSP: jest.fn(), deleteSP: jest.fn(),
  };
  const res = { redirect: jest.fn(), type: jest.fn().mockReturnThis(), send: jest.fn() };
  return { c: new SamlController(svc as never), svc, res: res as never, r: res };
}

const authed = { user: { sub: "u1", tenantId: "t1" }, cookies: {} };

describe("SamlController SSO", () => {
  it("rejects missing SAMLRequest with 400", async () => {
    const { c, res } = build();
    await expect(c.handlePostSSO("acme", "", "", authed, res)).rejects.toBeInstanceOf(ProtocolException);
  });

  it("unauthenticated: stashes request, binds nonce cookie, redirects to login", async () => {
    const { c, svc, res, r } = build();
    await c.handlePostSSO("acme", "REQ", undefined as never, {}, res);
    expect(svc.stashPendingRequest).toHaveBeenCalledWith("acme", "REQ", "");
    expect(setSamlSsoNonceCookie).toHaveBeenCalledWith(res, "nonce1");
    expect(r.redirect).toHaveBeenCalledWith("/u/login?saml_continue=nonce1");
    expect(svc.parseAuthnRequest).not.toHaveBeenCalled();
  });

  it("authenticated: enforces tenant, builds response, renders escaped auto-post form", async () => {
    const { c, svc, res, r } = build();
    svc.buildSignedResponse.mockResolvedValue({ postUrl: 'https://sp/acs"><x>', samlResponse: "A&B<", relayState: 'r"s' });
    await c.handlePostSSO("acme", "REQ", "rs", authed, res);
    expect(svc.assertSessionTenant).toHaveBeenCalledWith("t1", "t1");
    expect(svc.buildSignedResponse).toHaveBeenCalledWith("t1", "acme", { id: "sp" }, {}, "u1", "rs");
    const html = r.send.mock.calls[0]?.[0] as string;
    expect(html).toContain('action="https://sp/acs&quot;&gt;&lt;x&gt;"');
    expect(html).toContain('value="A&amp;B&lt;"');
    expect(html).toContain('name="RelayState" value="r&quot;s"');
    expect(r.type).toHaveBeenCalledWith("html");
  });

  it("omits RelayState input when empty and defaults undefined relayState to ''", async () => {
    const { c, svc, res, r } = build();
    svc.buildSignedResponse.mockResolvedValue({ postUrl: "u", samlResponse: "R", relayState: "" });
    await c.handlePostSSO("acme", "REQ", undefined as never, authed, res);
    expect(svc.buildSignedResponse.mock.calls[0]?.[5]).toBe("");
    expect(r.send.mock.calls[0]?.[0]).not.toContain("RelayState");
  });

  it("blocks cross-tenant session before parsing the request", async () => {
    const { c, svc, res } = build();
    svc.assertSessionTenant.mockImplementation(() => { throw new ProtocolException(401, {}); });
    await expect(c.handlePostSSO("acme", "REQ", "", authed, res)).rejects.toBeInstanceOf(ProtocolException);
    expect(svc.parseAuthnRequest).not.toHaveBeenCalled();
  });

  describe("continueSSO", () => {
    it("redirects to login when still unauthenticated", async () => {
      const { c, res, r } = build();
      await c.continueSSO("n1", {}, res);
      expect(r.redirect).toHaveBeenCalledWith("/u/login?saml_continue=n1");
    });

    it.each([[{}], [{ saml_sso_nonce: "other" }]])("rejects nonce/cookie mismatch %p (session fixation defence)", async (cookies) => {
      const { c, svc, res } = build();
      const err = await c.continueSSO("n1", { ...authed, cookies }, res).catch((e: unknown) => e);
      expect((err as ProtocolException).getStatus()).toBe(401);
      expect(svc.popPendingRequest).not.toHaveBeenCalled();
    });

    it("rejects expired/replayed nonce with 400 and still clears cookie", async () => {
      const { c, svc, res } = build();
      svc.popPendingRequest.mockResolvedValue(null);
      const err = await c.continueSSO("n1", { ...authed, cookies: { saml_sso_nonce: "n1" } }, res).catch((e: unknown) => e);
      expect((err as ProtocolException).getStatus()).toBe(400);
      expect(clearSamlSsoNonceCookie).toHaveBeenCalled();
    });

    it("completes the flow using the stashed tenant and relay state", async () => {
      const { c, svc, res, r } = build();
      svc.popPendingRequest.mockResolvedValue({ tenantSlug: "acme", samlRequest: "REQ", relayState: "rs" });
      await c.continueSSO("n1", { ...authed, cookies: { saml_sso_nonce: "n1" } }, res);
      expect(svc.resolveTenant).toHaveBeenCalledWith("acme");
      expect(svc.parseAuthnRequest).toHaveBeenCalledWith("t1", "acme", "REQ");
      expect(svc.buildSignedResponse).toHaveBeenCalledWith("t1", "acme", { id: "sp" }, {}, "u1", "rs");
      expect(r.send).toHaveBeenCalled();
    });

    it("rejects when the stashed tenant differs from the session tenant", async () => {
      const { c, svc, res } = build();
      svc.popPendingRequest.mockResolvedValue({ tenantSlug: "other", samlRequest: "REQ", relayState: "" });
      svc.assertSessionTenant.mockImplementation(() => { throw new ProtocolException(401, {}); });
      await expect(c.continueSSO("n1", { ...authed, cookies: { saml_sso_nonce: "n1" } }, res)).rejects.toBeInstanceOf(ProtocolException);
      expect(svc.buildSignedResponse).not.toHaveBeenCalled();
    });
  });
});

describe("SamlController management + metadata", () => {
  it("getMetadata delegates", () => {
    const { c, svc } = build();
    c.getMetadata("acme");
    expect(svc.getIdpMetadata).toHaveBeenCalledWith("acme");
  });

  it("delegates SP CRUD with tenant from request", () => {
    const { c, svc } = build();
    const req = { tenantId: "t1" };
    c.listSPs(req);
    c.registerSP(req, { name: "n" } as never);
    c.updateSP(req, "s", { name: "m" } as never);
    c.deleteSP(req, "s");
    expect(svc.listSPs).toHaveBeenCalledWith("t1");
    expect(svc.registerSP).toHaveBeenCalledWith("t1", { name: "n" });
    expect(svc.updateSP).toHaveBeenCalledWith("t1", "s", { name: "m" });
    expect(svc.deleteSP).toHaveBeenCalledWith("t1", "s");
  });

  it("fails closed with TENANT_MISMATCH when tenant context is absent", () => {
    const { c, svc } = build();
    let err: unknown;
    try { c.listSPs({}); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(ApiException);
    expect((err as ApiException).code).toBe("TENANT_MISMATCH");
    expect(svc.listSPs).not.toHaveBeenCalled();
  });
});

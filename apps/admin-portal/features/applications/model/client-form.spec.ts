import { en } from "@/i18n";
import {
  EMPTY_CREATE_DRAFT, allowedGrants, toCreateBody, toUpdateBody, toggleGrant, validateCreateDraft, withClientType,
} from "./client-form";
import { filterClients } from "./clients";
import { oidcEndpoints, samlMetadataUrl, scimBaseUrl } from "./endpoints";
import { resourceStatus } from "./resource-status";
import type { OAuthClient } from "./types";
import { parseLines, validateUriList } from "./uri";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const client: OAuthClient = {
  id: "1", clientId: "abc", name: "Atlas", clientType: "confidential", grantTypes: ["authorization_code"],
  redirectUris: ["https://a.test/cb"], isActive: true,
};

describe("create client draft", () => {
  it("requires a name, redirect URIs and a grant", () => {
    const fields = validateCreateDraft({ ...EMPTY_CREATE_DRAFT, grantTypes: [] }).map((e) => e.field);
    expect(fields).toEqual(expect.arrayContaining(["name", "grantTypes"]));
  });
  it("flags invalid, insecure and duplicate URIs", () => {
    const issues = validateUriList(["nope", "http://evil.test/cb", "http://localhost:3000/cb", "https://a.test", "https://a.test"]);
    expect(issues.map((i) => i.kind)).toEqual(["invalid", "insecure", "duplicate"]);
  });
  it("drops client_credentials when switching to public", () => {
    const draft = toggleGrant(EMPTY_CREATE_DRAFT, "client_credentials");
    expect(withClientType(draft, "public").grantTypes).not.toContain("client_credentials");
    expect(allowedGrants("public")).not.toContain("client_credentials");
  });
  it("builds a trimmed body", () => {
    const body = toCreateBody({ ...EMPTY_CREATE_DRAFT, name: " A ", redirectUris: " https://a.test/cb \n\n" });
    expect(body).toMatchObject({ name: "A", redirectUris: ["https://a.test/cb"] });
    expect(parseLines("a\r\n b ")).toEqual(["a", "b"]);
  });
  it("sends only changed fields on update", () => {
    const body = toUpdateBody(client, { name: "Atlas", description: "", redirectUris: "https://a.test/cb", logoUrl: "", isActive: false });
    expect(body).toEqual({ isActive: false });
  });
});

describe("helpers", () => {
  it("filters clients by name or id", () => {
    expect(filterClients([client], "ATL")).toHaveLength(1);
    expect(filterClients([client], "zzz")).toHaveLength(0);
  });
  it("derives protocol endpoints", () => {
    expect(oidcEndpoints("https://api.test/")[1]?.url).toBe("https://api.test/.well-known/openid-configuration");
    expect(samlMetadataUrl("https://api.test", "a b")).toBe("https://api.test/saml/metadata/a%20b");
    expect(scimBaseUrl("https://api.test")).toBe("https://api.test/scim/v2");
  });
  it("maps 403 to denied", () => {
    expect(resourceStatus({ isPending: false, isError: true, error: { status: 403 } })).toBe("denied");
    expect(resourceStatus({ isPending: false, isError: true, error: new Error("x") })).toBe("error");
    expect(resourceStatus({ isPending: true, isError: false, error: null })).toBe("loading");
  });
});

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.tsx?$/.test(name) && !/\.spec\./.test(name) ? [full] : [];
  });
}

describe("copy keys", () => {
  it("every static tenantIntegrations key used in features exists in the catalogue", () => {
    const root = join(__dirname, "../..");
    const missing: string[] = [];
    for (const dir of ["applications", "connections", "webhooks"]) {
      for (const file of sources(join(root, dir))) {
        for (const match of readFileSync(file, "utf8").matchAll(/["'`](tenantIntegrations\.[A-Za-z0-9_.*-]+)["'`]/g)) {
          const key = match[1] as string;
          const value = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en);
          if (value === undefined && !key.endsWith(".")) missing.push(`${file}: ${key}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

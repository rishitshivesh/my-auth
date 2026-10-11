import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import { BadRequestException } from "@nestjs/common";
import * as crypto from "crypto";
import * as samlify from "samlify";
import { SamlServiceProvider, KeyPair, User, Tenant } from "@repo/database";
import { SamlService } from "./saml.service";
import { TenantService } from "@/modules/tenant/tenant.service";
import { TenantJobRunner } from "@/core/database/tenant-job-runner.service";
import { RedisService } from "@/common/service/redis.service";

// Schema (XSD) validation is a separate concern from XML-DSig signature
// verification, which is what these tests exercise. Our production code
// never calls samlify's response-parsing path (we're always the IdP, never
// an SP consuming a response) — this validator only satisfies the
// "reference SP" role these tests construct to verify what a real SP would
// accept/reject.
samlify.setSchemaValidator({ validate: () => Promise.resolve("valid") });

const MASTER_KEY = "test-keyring-master-key";

function encryptPrivateKey(privateKeyPem: string): { encryptedPrivateKey: string; iv: string; authTag: string } {
  const key = Buffer.from(MASTER_KEY.padEnd(32, "0").slice(0, 32));
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(privateKeyPem, "utf8"), cipher.final()]);
  return {
    encryptedPrivateKey: encrypted.toString("hex"),
    iv: iv.toString("hex"),
    authTag: cipher.getAuthTag().toString("hex"),
  };
}

describe("SamlService — assertion signing", () => {
  let service: SamlService;
  let keyPairRepo: { findOne: jest.Mock };
  let spRepo: { findOne: jest.Mock };
  let userRepo: { findOne: jest.Mock };
  let publicKeyPem: string;
  let keyPairRow: KeyPair;
  const tenantId = "tenant-1";
  const tenantSlug = "acme";
  const user = {
    id: "user-1",
    email: "jane@acme.test",
    firstName: "Jane",
    lastName: "Doe",
  } as User;
  const sp: SamlServiceProvider = {
    id: "sp-1",
    tenantId,
    name: "Test SP",
    entityId: "https://sp.example.com/metadata",
    acsUrl: "https://sp.example.com/acs",
    sloUrl: undefined,
    certificate: undefined,
    nameIdFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
    attributeMapping: { email: "email", firstName: "firstName", lastName: "lastName" },
    active: true,
    metadataUrl: undefined,
    signAssertions: true,
    encryptAssertions: false,
  } as unknown as SamlServiceProvider;

  beforeAll(() => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    publicKeyPem = publicKey;
    const enc = encryptPrivateKey(privateKey);
    keyPairRow = {
      id: "kp-1",
      kid: "test-kid",
      tenantId: null,
      algorithm: "RS256",
      use: "sig",
      publicKeyPem,
      encryptedPrivateKey: enc.encryptedPrivateKey,
      iv: enc.iv,
      authTag: enc.authTag,
      status: "active",
      createdAt: new Date(),
    } as unknown as KeyPair;
  });

  beforeEach(async () => {
    keyPairRepo = { findOne: jest.fn().mockResolvedValue(keyPairRow) };
    spRepo = { findOne: jest.fn().mockResolvedValue(sp) };
    userRepo = { findOne: jest.fn().mockResolvedValue(user) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SamlService,
        { provide: getRepositoryToken(SamlServiceProvider), useValue: spRepo },
        { provide: getRepositoryToken(KeyPair), useValue: keyPairRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback?: unknown) =>
              key === "ISSUER_BASE_URL" ? "https://idp.example.com" : fallback,
            getOrThrow: (key: string) => (key === "KEYRING_MASTER_KEY" ? MASTER_KEY : undefined),
          },
        },
        { provide: TenantService, useValue: { findBySlug: jest.fn() } },
        { provide: TenantJobRunner, useValue: { runInTenant: (_slug: string, work: () => unknown) => work() } },
        { provide: RedisService, useValue: { set: jest.fn(), get: jest.fn(), delete: jest.fn() } },
      ],
    }).compile();

    service = module.get(SamlService);
  });

  describe("parseAuthnRequest", () => {
    it("rejects an AuthnRequest from an unregistered entityId", async () => {
      spRepo.findOne.mockResolvedValueOnce(null);
      const authnRequest = Buffer.from(
        `<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_req1" Version="2.0" IssueInstant="2026-01-01T00:00:00Z"><saml:Issuer>https://unknown-sp.example.com</saml:Issuer></samlp:AuthnRequest>`,
      ).toString("base64");

      await expect(service.parseAuthnRequest(tenantId, tenantSlug, authnRequest)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("rejects an AuthnRequest for an inactive service provider", async () => {
      spRepo.findOne.mockResolvedValueOnce(null); // active: true filter excludes it
      const authnRequest = Buffer.from(
        `<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_req1" Version="2.0" IssueInstant="2026-01-01T00:00:00Z"><saml:Issuer>${sp.entityId}</saml:Issuer></samlp:AuthnRequest>`,
      ).toString("base64");

      await expect(service.parseAuthnRequest(tenantId, tenantSlug, authnRequest)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("buildSignedResponse", () => {
    it("produces a signed assertion a reference SP accepts, and rejects a tampered copy", async () => {
      const requestInfo = { samlContent: "", extract: { request: { id: "_req1" } } } as never;

      const binding = await service.buildSignedResponse(tenantSlug, sp, requestInfo, user.id, "relay-123");

      expect(binding.postUrl).toBe(sp.acsUrl);
      expect(binding.relayState).toBe("relay-123");

      const decoded = Buffer.from(binding.samlResponse, "base64").toString("utf8");
      expect(decoded).toContain("<ds:Signature");
      expect(decoded).toContain(user.email);

      // The service wraps the raw public key in a self-signed cert for
      // signing (samlify requires a real X.509 cert, not a bare SPKI key).
      // Extract the embedded cert and confirm it carries OUR public key —
      // this closes the loop so the test isn't just trusting an arbitrary
      // self-asserted cert plucked from the message.
      const embeddedCertMatch = decoded.match(/<ds:X509Certificate>([^<]+)<\/ds:X509Certificate>/);
      expect(embeddedCertMatch).not.toBeNull();
      const embeddedCertPem = `-----BEGIN CERTIFICATE-----\n${embeddedCertMatch![1]}\n-----END CERTIFICATE-----`;
      const embeddedPublicKeyPem = new crypto.X509Certificate(embeddedCertPem).publicKey
        .export({ type: "spki", format: "pem" })
        .toString();
      expect(embeddedPublicKeyPem.trim()).toBe(publicKeyPem.trim());

      // A reference SP validates the signed response against that cert.
      const referenceIdp = samlify.IdentityProvider({
        entityID: `https://idp.example.com/saml/metadata/${tenantSlug}`,
        signingCert: embeddedCertPem,
        singleSignOnService: [
          {
            Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
            Location: `https://idp.example.com/saml/sso/${tenantSlug}`,
          },
        ],
        singleLogoutService: [
          {
            Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
            Location: `https://idp.example.com/saml/slo/${tenantSlug}`,
          },
        ],
      });
      const referenceSp = samlify.ServiceProvider({
        entityID: sp.entityId,
        assertionConsumerService: [
          { Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST", Location: sp.acsUrl, isDefault: true },
        ],
        wantAssertionsSigned: true,
      });

      const parsed = await referenceSp.parseLoginResponse(referenceIdp, "post", {
        body: { SAMLResponse: binding.samlResponse },
      });
      expect(parsed.extract.nameID).toBe(user.email);

      // Flip one base64 character inside the response body (not padding) to
      // simulate tampering, and confirm the reference SP rejects it.
      const tamperIndex = Math.floor(binding.samlResponse.length / 2);
      const original = binding.samlResponse[tamperIndex]!;
      const replacement = original === "A" ? "B" : "A";
      const tampered =
        binding.samlResponse.slice(0, tamperIndex) + replacement + binding.samlResponse.slice(tamperIndex + 1);

      await expect(
        referenceSp.parseLoginResponse(referenceIdp, "post", { body: { SAMLResponse: tampered } }),
      ).rejects.toThrow();
    });
  });
});

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import * as samlify from "samlify";
import { X509CertificateGenerator } from "@peculiar/x509";
import { SamlServiceProvider, KeyPair, User, Tenant } from "@repo/database";
import { RegisterSPDto, UpdateSPDto } from "./saml.dto";
import { logger } from "@/common/logger";
import { TenantService } from "@/modules/tenant/tenant.service";
import { TenantJobRunner } from "@/core/database/tenant-job-runner.service";
import { RedisService } from "@/common/service/redis.service";

function xmlEsc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function validateSlug(slug: string): void {
  if (!/^[a-z0-9-]{1,64}$/.test(slug)) {
    throw new BadRequestException("Invalid tenant slug format");
  }
}

const POST_BINDING = "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST";

/**
 * SSO requests always carry an authenticated user — handlePostSSO stashes an
 * unauthenticated request here and redirects to login; the hosted login page
 * calls back into GET /saml/sso/continue/:nonce once a session exists.
 *
 * Keyed by nonce alone (not per-tenant) because the request arrives before we
 * can resolve a tenant context for the Redis key namespace; the nonce's
 * 256 bits of randomness plus a short TTL are the security boundary, and
 * `tenantSlug` inside the stashed value still drives every downstream check.
 */
interface PendingSamlRequest {
  tenantSlug: string;
  samlRequest: string;
  relayState: string;
}

const PENDING_SSO_TENANT_KEY = "global";
const PENDING_SSO_TTL_SECONDS = 10 * 60;

export interface SamlPostBinding {
  postUrl: string;
  samlResponse: string;
  relayState: string;
}

/** samlify doesn't re-export FlowResult publicly; derive it structurally. */
type SamlFlowResult = Awaited<ReturnType<samlify.IdentityProviderInstance["parseLoginRequest"]>>;

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const body = pem.replace(/-----BEGIN [^-]+-----/, "").replace(/-----END [^-]+-----/, "").replace(/\s+/g, "");
  const buf = Buffer.from(body, "base64");
  // Buffer#buffer is the underlying (possibly pooled, larger) ArrayBuffer —
  // slice to the actual byte range or WebCrypto reads garbage past the end.
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

@Injectable()
export class SamlService {
  /** In-memory cache: KeyPair.id → self-signed cert PEM wrapping that key. */
  private readonly signingCertCache = new Map<string, string>();

  constructor(
    @InjectRepository(SamlServiceProvider)
    private spRepo: Repository<SamlServiceProvider>,
    @InjectRepository(KeyPair)
    private keyPairRepo: Repository<KeyPair>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private config: ConfigService,
    private tenantService: TenantService,
    private tenantJobRunner: TenantJobRunner,
    private redis: RedisService,
  ) {}

  private get issuerBaseUrl(): string {
    return this.config.get<string>("ISSUER_BASE_URL", "http://localhost:4000");
  }

  private decryptPrivateKey(keyPair: KeyPair): string {
    const masterKey = this.config.getOrThrow<string>("KEYRING_MASTER_KEY");
    const key = Buffer.from(masterKey.padEnd(32, "0").slice(0, 32));
    const iv = Buffer.from(keyPair.iv, "hex");
    const authTag = Buffer.from(keyPair.authTag, "hex");
    const encrypted = Buffer.from(keyPair.encryptedPrivateKey, "hex");

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
  }

  /**
   * SAML needs a real X.509 certificate for `<ds:X509Certificate>` and for
   * samlify's own signing pipeline (which parses the configured cert via
   * Node's `crypto.X509Certificate` to extract the key) — the `KeyPair` row
   * only stores a bare SPKI public key for JWT/JWKS purposes. Wrap it in a
   * self-signed certificate derived from the same key material, generated
   * once per active key and cached in memory (never persisted).
   */
  private async signSelfSignedCert(publicKeyPem: string, privateKeyPem: string): Promise<string> {
    const webcrypto = crypto.webcrypto as unknown as Crypto;
    const alg = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };

    const [publicKey, privateKey] = await Promise.all([
      webcrypto.subtle.importKey("spki", pemToArrayBuffer(publicKeyPem), alg, true, ["verify"]),
      webcrypto.subtle.importKey("pkcs8", pemToArrayBuffer(privateKeyPem), alg, true, ["sign"]),
    ]);

    const cert = await X509CertificateGenerator.createSelfSigned(
      {
        serialNumber: "01",
        name: "CN=sentry-saml-idp",
        notBefore: new Date(),
        notAfter: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000),
        signingAlgorithm: alg,
        keys: { publicKey, privateKey },
      },
      webcrypto,
    );

    return cert.toString("pem");
  }

  /**
   * KNOWN LIMITATION, tracked as P0-4 (not fixed here): this query has no
   * tenant filter, so every tenant's SAML IdP — and the self-signed cert
   * wrapping it — uses the exact same platform signing key. There is no
   * cryptographic separation between tenants' SAML assertions until P0-4
   * (real per-tenant signing keys) ships; this matches the existing,
   * pre-P0-3 behavior of `getIdpMetadata()` and JWT issuance, it is not a
   * regression introduced by SAML signing. Do not silently widen this
   * query's scope without also addressing key provisioning/rotation per
   * tenant — that's P0-4's job, not a one-line fix here.
   */
  private async getActiveKeyPair(): Promise<{ publicKeyPem: string; privateKeyPem: string; signingCertPem: string }> {
    const keyPair = await this.keyPairRepo.findOne({
      where: { status: "active" },
      order: { createdAt: "DESC" },
    });

    if (!keyPair) throw new BadRequestException("No active signing key found");

    const privateKeyPem = this.decryptPrivateKey(keyPair);

    let signingCertPem = this.signingCertCache.get(keyPair.id);
    if (!signingCertPem) {
      signingCertPem = await this.signSelfSignedCert(keyPair.publicKeyPem, privateKeyPem);
      this.signingCertCache.set(keyPair.id, signingCertPem);
    }

    return { publicKeyPem: keyPair.publicKeyPem, privateKeyPem, signingCertPem };
  }

  async getIdpMetadata(tenantSlug: string): Promise<string> {
    validateSlug(tenantSlug);
    const { signingCertPem } = await this.getActiveKeyPair();
    const entityId = xmlEsc(`${this.issuerBaseUrl}/saml/metadata/${tenantSlug}`);
    const ssoUrl = xmlEsc(`${this.issuerBaseUrl}/saml/sso/${tenantSlug}`);
    const sloUrl = xmlEsc(`${this.issuerBaseUrl}/saml/slo/${tenantSlug}`);

    const certBody = signingCertPem
      .replace(/-----BEGIN CERTIFICATE-----/, "")
      .replace(/-----END CERTIFICATE-----/, "")
      .replace(/\s+/g, "");

    return `<?xml version="1.0"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
    entityID="${entityId}">
  <md:IDPSSODescriptor WantAuthnRequestsSigned="false"
      protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:KeyDescriptor use="signing">
      <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        <ds:X509Data>
          <ds:X509Certificate>${certBody}</ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </md:KeyDescriptor>
    <md:SingleLogoutService
        Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
        Location="${sloUrl}"/>
    <md:SingleSignOnService
        Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
        Location="${ssoUrl}"/>
    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
  </md:IDPSSODescriptor>
</md:EntityDescriptor>`;
  }

  async registerSP(tenantId: string, dto: RegisterSPDto): Promise<SamlServiceProvider> {
    const existing = await this.spRepo.findOne({
      where: { tenantId, entityId: dto.entityId },
    });
    if (existing) throw new BadRequestException("A service provider with this entityId already exists");

    const sp = this.spRepo.create({
      tenantId,
      name: dto.name,
      entityId: dto.entityId,
      acsUrl: dto.acsUrl,
      sloUrl: dto.sloUrl,
      certificate: dto.certificate,
      nameIdFormat: dto.nameIdFormat ?? "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
      attributeMapping: dto.attributeMapping ?? {
        email: "email",
        firstName: "firstName",
        lastName: "lastName",
      },
      signAssertions: dto.signAssertions ?? true,
      encryptAssertions: dto.encryptAssertions ?? false,
      metadataUrl: dto.metadataUrl,
    });

    return this.spRepo.save(sp);
  }

  async listSPs(tenantId: string): Promise<SamlServiceProvider[]> {
    return this.spRepo.find({ where: { tenantId }, order: { createdAt: "DESC" } });
  }

  async updateSP(tenantId: string, id: string, dto: UpdateSPDto): Promise<SamlServiceProvider> {
    const sp = await this.findSP(tenantId, id);
    Object.assign(sp, dto);
    return this.spRepo.save(sp);
  }

  async deleteSP(tenantId: string, id: string): Promise<void> {
    const sp = await this.findSP(tenantId, id);
    await this.spRepo.softDelete(sp.id);
  }

  async findSP(tenantId: string, id: string): Promise<SamlServiceProvider> {
    const sp = await this.spRepo.findOne({ where: { id, tenantId } });
    if (!sp) throw new NotFoundException("Service provider not found");
    return sp;
  }

  /** Resolve `:tenantSlug` to a real tenant — SSO is reached at a shared
   * hostname, so this stands in for the header/subdomain resolution the
   * rest of the app relies on. */
  async resolveTenant(tenantSlug: string): Promise<Tenant> {
    validateSlug(tenantSlug);
    const tenant = await this.tenantService.findBySlug(tenantSlug);
    if (!tenant || !tenant.active) {
      throw new NotFoundException("Tenant not found");
    }
    return tenant;
  }

  /** Confirm the authenticated user's own session belongs to this tenant —
   * defence against a user signed into tenant A completing SSO for tenant
   * B's registered service providers. */
  assertSessionTenant(sessionTenantId: string | undefined, tenantId: string): void {
    if (sessionTenantId !== tenantId) {
      throw new UnauthorizedException("Session does not belong to this tenant");
    }
  }

  async stashPendingRequest(
    tenantSlug: string,
    samlRequest: string,
    relayState: string,
  ): Promise<string> {
    const nonce = crypto.randomBytes(32).toString("hex");
    const pending: PendingSamlRequest = { tenantSlug, samlRequest, relayState };
    await this.redis.set(PENDING_SSO_TENANT_KEY, "saml-sso-pending", nonce, pending, PENDING_SSO_TTL_SECONDS);
    return nonce;
  }

  /** One-time read: the stashed request is deleted whether or not it's found. */
  async popPendingRequest(nonce: string): Promise<PendingSamlRequest | null> {
    const pending = await this.redis.get<PendingSamlRequest>(
      PENDING_SSO_TENANT_KEY,
      "saml-sso-pending",
      nonce,
    );
    await this.redis.delete(PENDING_SSO_TENANT_KEY, "saml-sso-pending", nonce);
    return pending;
  }

  private buildIdp(tenantSlug: string, signingCertPem: string, privateKeyPem: string): samlify.IdentityProviderInstance {
    return samlify.IdentityProvider({
      entityID: `${this.issuerBaseUrl}/saml/metadata/${tenantSlug}`,
      privateKey: privateKeyPem,
      signingCert: signingCertPem,
      wantAuthnRequestsSigned: false,
      singleSignOnService: [
        { Binding: POST_BINDING, Location: `${this.issuerBaseUrl}/saml/sso/${tenantSlug}` },
      ],
      singleLogoutService: [
        { Binding: POST_BINDING, Location: `${this.issuerBaseUrl}/saml/slo/${tenantSlug}` },
      ],
      generateID: () => `_${crypto.randomBytes(16).toString("hex")}`,
    });
  }

  private buildSp(sp: SamlServiceProvider): samlify.ServiceProviderInstance {
    return samlify.ServiceProvider({
      entityID: sp.entityId,
      assertionConsumerService: [
        { Binding: POST_BINDING, Location: sp.acsUrl, isDefault: true },
      ],
      wantAssertionsSigned: sp.signAssertions,
      ...(sp.certificate ? { signingCert: sp.certificate } : {}),
    });
  }

  /**
   * Parse and validate an inbound AuthnRequest (POST binding).
   *
   * The SP that sent it is unknown until we read its `<Issuer>`, so this
   * does a cheap unauthenticated peek at the decoded XML first (just enough
   * to find the issuer), looks up a matching *active* `SamlServiceProvider`
   * row scoped to this tenant, then re-parses through samlify with that
   * trusted SP config for the real validation (issuer/signature/schema).
   * Unknown issuer, inactive SP, or a malformed/expired request all reject
   * here with 400 before any assertion is ever built.
   */
  async parseAuthnRequest(
    tenantId: string,
    tenantSlug: string,
    samlRequestB64: string,
  ): Promise<{ sp: SamlServiceProvider; requestInfo: SamlFlowResult }> {
    let decodedXml: string;
    try {
      decodedXml = Buffer.from(samlRequestB64, "base64").toString("utf8");
    } catch {
      throw new BadRequestException("Malformed SAMLRequest");
    }

    const peek = samlify.Extractor.extract(decodedXml, samlify.Extractor.loginRequestFields);
    const issuer = Array.isArray(peek.issuer) ? peek.issuer[0] : peek.issuer;
    if (!issuer) {
      throw new BadRequestException("AuthnRequest is missing an Issuer");
    }

    const sp = await this.spRepo.findOne({ where: { tenantId, entityId: issuer, active: true } });
    if (!sp) {
      throw new BadRequestException("Unknown or inactive service provider");
    }

    const { signingCertPem, privateKeyPem } = await this.getActiveKeyPair();
    const idp = this.buildIdp(tenantSlug, signingCertPem, privateKeyPem);
    const samlifySp = this.buildSp(sp);

    try {
      const requestInfo = await idp.parseLoginRequest(samlifySp, "post", {
        body: { SAMLRequest: samlRequestB64 },
      });
      return { sp, requestInfo };
    } catch (error: unknown) {
      logger.warn({ err: error, tenantId, issuer }, "Rejected invalid SAML AuthnRequest");
      throw new BadRequestException("Invalid or tampered AuthnRequest");
    }
  }

  /**
   * Build and sign the SAML Response for an already-validated AuthnRequest.
   * Runs the user lookup inside the tenant's own schema (TenantJobRunner),
   * since SSO is reached at a shared hostname with no per-request tenant
   * context already established by the usual middleware.
   */
  async buildSignedResponse(
    tenantSlug: string,
    sp: SamlServiceProvider,
    requestInfo: SamlFlowResult,
    userId: string,
    relayState: string,
  ): Promise<SamlPostBinding> {
    const user = await this.tenantJobRunner.runInTenant(tenantSlug, () =>
      this.userRepo.findOne({ where: { id: userId } }),
    );
    if (!user) throw new NotFoundException("User not found");

    const { signingCertPem, privateKeyPem } = await this.getActiveKeyPair();
    const idp = this.buildIdp(tenantSlug, signingCertPem, privateKeyPem);
    const samlifySp = this.buildSp(sp);

    const issuer = `${this.issuerBaseUrl}/saml/metadata/${tenantSlug}`;
    const now = new Date();
    const notOnOrAfter = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
    const assertionId = `_${crypto.randomBytes(16).toString("hex")}`;
    const responseId = `_${crypto.randomBytes(16).toString("hex")}`;
    const inResponseTo = (requestInfo.extract.request as { id?: string } | undefined)?.id ?? "";

    const attributes = Object.entries(sp.attributeMapping)
      .map(([samlAttr, userField]) => {
        const val = (user as unknown as Record<string, unknown>)[userField];
        if (!val) return "";
        return `<saml:Attribute Name="${xmlEsc(samlAttr)}"><saml:AttributeValue>${xmlEsc(String(val))}</saml:AttributeValue></saml:Attribute>`;
      })
      .filter(Boolean)
      .join("");

    const assertion = `<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
    ID="${xmlEsc(assertionId)}" Version="2.0" IssueInstant="${xmlEsc(now.toISOString())}">
  <saml:Issuer>${xmlEsc(issuer)}</saml:Issuer>
  <saml:Subject>
    <saml:NameID Format="${xmlEsc(sp.nameIdFormat)}">${xmlEsc(user.email)}</saml:NameID>
    <saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">
      <saml:SubjectConfirmationData NotOnOrAfter="${xmlEsc(notOnOrAfter)}" Recipient="${xmlEsc(sp.acsUrl)}" InResponseTo="${xmlEsc(inResponseTo)}"/>
    </saml:SubjectConfirmation>
  </saml:Subject>
  <saml:Conditions NotBefore="${xmlEsc(now.toISOString())}" NotOnOrAfter="${xmlEsc(notOnOrAfter)}">
    <saml:AudienceRestriction>
      <saml:Audience>${xmlEsc(sp.entityId)}</saml:Audience>
    </saml:AudienceRestriction>
  </saml:Conditions>
  <saml:AttributeStatement>${attributes}</saml:AttributeStatement>
</saml:Assertion>`;

    const response = `<?xml version="1.0"?>
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
    ID="${xmlEsc(responseId)}" Version="2.0" IssueInstant="${xmlEsc(now.toISOString())}"
    Destination="${xmlEsc(sp.acsUrl)}" InResponseTo="${xmlEsc(inResponseTo)}">
  <saml:Issuer xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">${xmlEsc(issuer)}</saml:Issuer>
  <samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>
  ${assertion}
</samlp:Response>`;

    // The customTagReplacement callback supplies the unsigned XML; samlify
    // still runs its own XML-DSig signing pipeline afterward (assertion
    // and/or message signature, per the SP's wantAssertionsSigned setting) —
    // using a custom template only replaces the unsigned-template step, not
    // the cryptographic signing itself.
    const context = await idp.createLoginResponse(
      samlifySp,
      // FlowResult (returned by parseLoginRequest) and RequestInfo (expected
      // here) are structurally the same `{ extract, ... }` shape; RequestInfo
      // just adds an index signature samlify's own FlowResult doesn't declare.
      requestInfo as unknown as { extract: SamlFlowResult["extract"] },
      "post",
      { email: user.email },
      { relayState, customTagReplacement: () => ({ context: response, id: responseId }) },
    );

    const postBinding = context as unknown as { context: string; entityEndpoint: string; relayState?: string };
    return {
      postUrl: postBinding.entityEndpoint,
      samlResponse: postBinding.context,
      relayState: postBinding.relayState ?? relayState,
    };
  }
}

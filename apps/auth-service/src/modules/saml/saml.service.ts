import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { SamlServiceProvider, KeyPair, User } from "@repo/database";
import { RegisterSPDto, UpdateSPDto } from "./saml.dto";
import { logger } from "@/common/logger";

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

@Injectable()
export class SamlService {
  constructor(
    @InjectRepository(SamlServiceProvider)
    private spRepo: Repository<SamlServiceProvider>,
    @InjectRepository(KeyPair)
    private keyPairRepo: Repository<KeyPair>,
    private config: ConfigService,
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

  private async getActiveKeyPair(): Promise<{ publicKeyPem: string; privateKeyPem: string }> {
    const keyPair = await this.keyPairRepo.findOne({
      where: { status: "active" },
      order: { createdAt: "DESC" },
    });

    if (!keyPair) throw new BadRequestException("No active signing key found");

    const privateKeyPem = this.decryptPrivateKey(keyPair);
    return { publicKeyPem: keyPair.publicKeyPem, privateKeyPem };
  }

  async getIdpMetadata(tenantSlug: string): Promise<string> {
    validateSlug(tenantSlug);
    const { publicKeyPem } = await this.getActiveKeyPair();
    const entityId = xmlEsc(`${this.issuerBaseUrl}/saml/metadata/${tenantSlug}`);
    const ssoUrl = xmlEsc(`${this.issuerBaseUrl}/saml/sso`);
    const sloUrl = xmlEsc(`${this.issuerBaseUrl}/saml/slo`);

    const certBody = publicKeyPem
      .replace(/-----BEGIN PUBLIC KEY-----/, "")
      .replace(/-----END PUBLIC KEY-----/, "")
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

  // SPRINT_N: implement full XML signing + assertion generation with xmldsig
  // This stub returns the data needed; the controller renders the POST-binding form.
  async createSamlResponse(
    spId: string,
    tenantId: string,
    tenantSlug: string,
    user: User,
    relayState?: string,
  ): Promise<{ postUrl: string; samlResponse: string; relayState: string }> {
    const sp = await this.findSP(tenantId, spId);
    if (!sp.active) throw new BadRequestException("Service provider is inactive");

    const issuer = `${this.issuerBaseUrl}/saml/metadata/${tenantSlug}`;
    const now = new Date();
    const notOnOrAfter = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
    const assertionId = `_${crypto.randomBytes(16).toString("hex")}`;
    const responseId = `_${crypto.randomBytes(16).toString("hex")}`;

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
      <saml:SubjectConfirmationData NotOnOrAfter="${xmlEsc(notOnOrAfter)}" Recipient="${xmlEsc(sp.acsUrl)}"/>
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
    Destination="${xmlEsc(sp.acsUrl)}">
  <saml:Issuer xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">${xmlEsc(issuer)}</saml:Issuer>
  <samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>
  ${assertion}
</samlp:Response>`;

    return {
      postUrl: sp.acsUrl,
      samlResponse: Buffer.from(response).toString("base64"),
      relayState: relayState ?? "",
    };
  }
}

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Header,
  HttpCode,
  HttpStatus,
  Request,
  UseGuards,
  Res,
  BadRequestException,
  UnauthorizedException,
} from "@nestjs/common";
import type { Response } from "express";
import { JwtAuthGuard, RequestUserGuard } from "@/common/guards";
import { PermissionsGuard } from "@/modules/rbac/guards/permissions.guard";
import { RequirePermissions } from "@/modules/rbac/decorators/rbac.decorator";
import { Permissions } from "@/modules/rbac/constants/permissions.catalog";
import { SamlService, SamlPostBinding } from "./saml.service";
import {
  setSamlSsoNonceCookie,
  clearSamlSsoNonceCookie,
  SAML_SSO_NONCE_COOKIE,
} from "@/common/http/auth-cookies";

interface AuthenticatedRequest {
  tenantId?: string;
  user?: { sub: string; tid?: string; tenantId?: string };
  cookies?: Record<string, string>;
}
import { RegisterSPDto, UpdateSPDto } from "./saml.dto";

@Controller("saml")
export class SamlController {
  constructor(private readonly samlService: SamlService) {}

  // ── Public IdP metadata ──────────────────────────────────────────────────────

  @Get("metadata/:tenantSlug")
  @Header("Content-Type", "application/xml")
  getMetadata(@Param("tenantSlug") tenantSlug: string) {
    return this.samlService.getIdpMetadata(tenantSlug);
  }

  // ── SP-initiated SSO — POST binding ─────────────────────────────────────────

  /**
   * Entry point for an SP-initiated SSO redirect. Reached at a shared
   * hostname — `:tenantSlug` (not a header/subdomain) identifies the tenant.
   * `RequestUserGuard` never blocks the request; it just tells us whether a
   * session cookie is already present.
   */
  @UseGuards(RequestUserGuard)
  @Post("sso/:tenantSlug")
  @HttpCode(HttpStatus.OK)
  async handlePostSSO(
    @Param("tenantSlug") tenantSlug: string,
    @Body("SAMLRequest") samlRequest: string,
    @Body("RelayState") relayState: string,
    @Request() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    if (!samlRequest) {
      throw new BadRequestException("Missing SAMLRequest");
    }

    const tenant = await this.samlService.resolveTenant(tenantSlug);

    if (!req.user?.sub) {
      const nonce = await this.samlService.stashPendingRequest(
        tenantSlug,
        samlRequest,
        relayState ?? "",
      );
      // Bind the nonce to this browser so a different browser (e.g. a
      // victim tricked into visiting a leaked continuation URL) can't
      // complete someone else's stashed SSO request — see continueSSO.
      setSamlSsoNonceCookie(res, nonce);
      return res.redirect(`/u/login?saml_continue=${nonce}`);
    }

    this.samlService.assertSessionTenant(req.user.tenantId, tenant.id);

    const { sp, requestInfo } = await this.samlService.parseAuthnRequest(
      tenant.id,
      tenantSlug,
      samlRequest,
    );
    const binding = await this.samlService.buildSignedResponse(
      tenant.id,
      tenantSlug,
      sp,
      requestInfo,
      req.user.sub,
      relayState ?? "",
    );

    res.type("html").send(this.renderPostBindingForm(binding));
  }

  /**
   * Called by the hosted login page after a session is established for a
   * request that was stashed by handlePostSSO. One-time use — the nonce is
   * consumed whether or not the request is valid.
   *
   * Requires the `saml_sso_nonce` cookie set by handlePostSSO to match the
   * `:nonce` path param — without this, anyone who learns a valid nonce
   * (not just the browser that generated it) could get a victim to complete
   * someone else's SSO request under the victim's own identity.
   */
  @UseGuards(RequestUserGuard)
  @Get("sso/continue/:nonce")
  async continueSSO(
    @Param("nonce") nonce: string,
    @Request() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    if (!req.user?.sub) {
      return res.redirect(`/u/login?saml_continue=${nonce}`);
    }

    if (req.cookies?.[SAML_SSO_NONCE_COOKIE] !== nonce) {
      throw new UnauthorizedException("SSO continuation does not match this browser session");
    }
    clearSamlSsoNonceCookie(res);

    const pending = await this.samlService.popPendingRequest(nonce);
    if (!pending) {
      throw new BadRequestException("SSO request has expired or was already used");
    }

    const tenant = await this.samlService.resolveTenant(pending.tenantSlug);
    this.samlService.assertSessionTenant(req.user.tenantId, tenant.id);

    const { sp, requestInfo } = await this.samlService.parseAuthnRequest(
      tenant.id,
      pending.tenantSlug,
      pending.samlRequest,
    );
    const binding = await this.samlService.buildSignedResponse(
      tenant.id,
      pending.tenantSlug,
      sp,
      requestInfo,
      req.user.sub,
      pending.relayState,
    );

    res.type("html").send(this.renderPostBindingForm(binding));
  }

  /** Standard SAML HTTP-POST binding relay: an auto-submitting form. */
  private renderPostBindingForm(binding: SamlPostBinding): string {
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    return `<!DOCTYPE html>
<html><head><title>Redirecting…</title></head>
<body onload="document.forms[0].submit()">
  <form method="POST" action="${esc(binding.postUrl)}">
    <input type="hidden" name="SAMLResponse" value="${esc(binding.samlResponse)}"/>
    ${binding.relayState ? `<input type="hidden" name="RelayState" value="${esc(binding.relayState)}"/>` : ""}
    <noscript><button type="submit">Continue</button></noscript>
  </form>
</body></html>`;
  }

  // ── SP Management (authenticated) ────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Get("sps")
  @RequirePermissions(Permissions.SAML_READ)
  listSPs(@Request() req: AuthenticatedRequest) {
    return this.samlService.listSPs(this.requireTenantId(req));
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Post("sps")
  @RequirePermissions(Permissions.SAML_WRITE)
  @HttpCode(HttpStatus.CREATED)
  registerSP(@Request() req: AuthenticatedRequest, @Body() dto: RegisterSPDto) {
    return this.samlService.registerSP(this.requireTenantId(req), dto);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Patch("sps/:id")
  @RequirePermissions(Permissions.SAML_WRITE)
  updateSP(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdateSPDto,
  ) {
    return this.samlService.updateSP(this.requireTenantId(req), id, dto);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Delete("sps/:id")
  @RequirePermissions(Permissions.SAML_WRITE)
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteSP(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.samlService.deleteSP(this.requireTenantId(req), id);
  }

  /**
   * TenantResolverMiddleware sets this from header/subdomain for every route
   * except the ones TenantResolverMiddleware.publicSamlRoutes exempts
   * (metadata/sso/sso-continue, handled above) — fail closed here rather
   * than pass `undefined` into a tenant-scoped repository query. Keep this
   * in sync with that exemption list: these SP-management routes must
   * never be added to it.
   */
  private requireTenantId(req: AuthenticatedRequest): string {
    if (!req.tenantId) {
      throw new UnauthorizedException("Tenant context not found");
    }
    return req.tenantId;
  }
}

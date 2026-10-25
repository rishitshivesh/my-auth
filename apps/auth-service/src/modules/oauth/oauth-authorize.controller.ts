import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiBody, ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { OAuthClient } from "@repo/database";
import { ApiException } from "@/common/http";
import { clearAuthCookies } from "@/common/http/auth-cookies";
import { RateLimit } from "@/common/decorators/rate-limit.decorator";
import { RawResponse } from "@/common/decorators/raw-response.decorator";
import { SessionService } from "@/common/service/session.service";
import { SecurityEventService } from "@/common/service/security-event.service";
import { SecurityEventType } from "@repo/database";
import { AuthorizeRequestDto, ConsentDecisionDto, EndSessionRequestDto } from "./dto";
import { buildAuthorizeContinue } from "./authorize-continue";
import { oauthError } from "./oauth-errors";
import { OAuthClientService } from "./services/oauth-client.service";
import { OAuthConsentService } from "./services/oauth-consent.service";
import { OAuthTokenService } from "./services/oauth-token.service";
import {
  OAuthBrowserSessionService,
  type BrowserSession,
} from "./services/oauth-browser-session.service";
import {
  OAuthConsentTransactionService,
  type ConsentTransaction,
} from "./services/oauth-consent-transaction.service";

const LOGIN_PATH = "/u/login";
const CONSENT_PATH = "/u/consent";
const LOGOUT_CONFIRM_PATH = "/u/logout";
const LOGGED_OUT_PATH = "/u/logged-out";
/** Without remember, a consent decision is reused for this long. */
const UNREMEMBERED_CONSENT_DAYS = 1;

type AuthorizeRequest = ConsentTransaction["request"];

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Authorization endpoint (hosted-login flow), consent decision and
 * RP-initiated logout. Split from OAuthController to keep both focused.
 */
@ApiTags("OAuth2/OIDC")
@Controller("oauth")
export class OAuthAuthorizeController {
  constructor(
    private readonly clientService: OAuthClientService,
    private readonly tokenService: OAuthTokenService,
    private readonly consentService: OAuthConsentService,
    private readonly browserSessions: OAuthBrowserSessionService,
    private readonly consentTransactions: OAuthConsentTransactionService,
    private readonly sessionService: SessionService,
    private readonly securityEvents: SecurityEventService,
    private readonly config: ConfigService,
  ) {}

  // ============================================================
  // AUTHORIZATION ENDPOINT
  // ============================================================

  @Get("authorize")
  @ApiOperation({
    summary: "OAuth2 Authorization Endpoint",
    description:
      "Authorization code flow. Resolves the user from the session cookie; anonymous requests " +
      "are redirected to the hosted login UI with a `continue` URL back to this endpoint.",
  })
  @ApiQuery({ name: "client_id", required: true })
  @ApiQuery({ name: "redirect_uri", required: true })
  @ApiQuery({ name: "response_type", required: true, enum: ["code"] })
  @ApiQuery({ name: "scope", required: true })
  @ApiQuery({ name: "state", required: false })
  @ApiQuery({ name: "nonce", required: false })
  @ApiQuery({ name: "code_challenge", required: false })
  @ApiQuery({ name: "code_challenge_method", required: false, enum: ["S256"] })
  @ApiQuery({ name: "prompt", required: false })
  @ApiQuery({ name: "max_age", required: false })
  @ApiResponse({ status: 302, description: "Redirects to redirect_uri, the login UI or the consent UI" })
  @ApiResponse({ status: 400, description: "Invalid request parameters" })
  async authorize(
    @Query() query: AuthorizeRequestDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const tenantId = req.tenantId!;

    // Client and redirect_uri are validated before anything can redirect, so an
    // invalid redirect_uri is never redirected to (RFC 6749 4.1.2.1).
    const client = await this.clientService.getClient(query.client_id).catch((error: unknown) => {
      if (error instanceof ApiException && error.code === "RESOURCE_NOT_FOUND") {
        throw oauthError("invalid_request", "Unknown client_id");
      }
      throw error;
    });
    await this.clientService.validateRedirectUri(client, query.redirect_uri);
    await this.clientService.validateGrantType(client, "authorization_code");
    const grantedScopes = await this.clientService.validateScopes(client, query.scope.split(" "));

    // PKCE: mandatory for public clients and confidential clients that opted in.
    // Only S256; an absent method would mean "plain" under RFC 7636.
    const pkceRequired = client.requirePkce || client.clientType === "public";
    if (pkceRequired && !query.code_challenge) {
      throw oauthError("invalid_request", "code_challenge required for this client");
    }
    if (query.code_challenge && query.code_challenge_method !== "S256") {
      throw oauthError("invalid_request", "code_challenge_method must be S256");
    }

    const prompts = new Set((query.prompt ?? "").split(" ").filter(Boolean));
    if (prompts.has("none") && prompts.size > 1) {
      throw oauthError("invalid_request", "prompt=none cannot be combined with other values");
    }

    const session = await this.browserSessions.resolve(req, tenantId);
    if (!session || this.needsReauthentication(session, query, prompts)) {
      if (prompts.has("none")) {
        return this.redirectError(res, query, "login_required", "Authentication is required");
      }
      return res.redirect(this.loginUrl(req, query, prompts));
    }

    const existing = await this.consentService.getConsent(tenantId, session.userId, client.id);
    const covered = existing?.isValid && existing.hasAllScopes(grantedScopes);
    const consentRequired =
      prompts.has("consent") ||
      (await this.consentService.isConsentRequired(client, covered ? existing : undefined));

    if (consentRequired) {
      if (prompts.has("none")) {
        return this.redirectError(res, query, "consent_required", "User consent is required");
      }
      const transactionId = await this.consentTransactions.create({
        tenantId,
        userId: session.userId,
        sessionId: session.sessionId,
        authTime: session.authTime,
        amr: session.amr,
        clientDbId: client.id,
        request: this.requestOf(query),
        grantedScopes,
      });
      return res.redirect(this.consentUrl(req, transactionId));
    }

    const redirectUrl = await this.issueCode({
      tenantId,
      client,
      request: this.requestOf(query),
      grantedScopes,
      userId: session.userId,
      sessionId: session.sessionId,
      authTime: session.authTime,
      amr: session.amr,
      req,
    });
    return res.redirect(redirectUrl);
  }

  // ============================================================
  // CONSENT
  // ============================================================

  @RawResponse()
  @Get("consent/:transactionId")
  @ApiOperation({
    summary: "Consent screen details",
    description: "Returns what is being requested plus the CSRF token for the decision POST.",
  })
  async consentDetails(
    @Param("transactionId") transactionId: string,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const { tenantId, session } = await this.requireSession(req);
    const tx = await this.consentTransactions.peek(
      tenantId,
      transactionId,
      session.userId,
      session.sessionId,
    );
    if (!tx) throw oauthError("invalid_request", "Unknown or expired consent transaction");

    const client = await this.clientService.getClient(tx.request.client_id);
    return {
      transaction_id: transactionId,
      csrf_token: tx.csrfToken,
      client: {
        client_id: client.clientId,
        name: client.name,
        logo_url: client.logoUrl,
        website_url: client.websiteUrl,
        privacy_policy_url: client.privacyPolicyUrl,
        terms_of_service_url: client.termsOfServiceUrl,
      },
      scopes: tx.grantedScopes,
    };
  }

  @RawResponse()
  @Post("consent")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ max: 30, windowMs: 60000, keyBy: "ip" })
  @ApiOperation({
    summary: "Submit a consent decision",
    description:
      "Requires the session cookie, the transaction id and its CSRF token. Returns the URL the " +
      "browser must navigate to (code on allow, access_denied on deny).",
  })
  @ApiBody({ type: ConsentDecisionDto })
  async decideConsent(
    @Body() body: ConsentDecisionDto,
    @Req() req: Request,
  ): Promise<{ redirect_to: string }> {
    const { tenantId, session } = await this.requireSession(req);
    const tx = await this.consentTransactions.consume(
      tenantId,
      body.transaction_id,
      session.userId,
      session.sessionId,
      body.csrf_token,
    );
    if (!tx) throw oauthError("invalid_request", "Invalid or expired consent transaction");

    const client = await this.clientService.getClient(tx.request.client_id);
    await this.clientService.validateRedirectUri(client, tx.request.redirect_uri);

    if (body.decision === "deny") {
      return {
        redirect_to: this.errorRedirectUrl(
          tx.request.redirect_uri,
          tx.request.state,
          "access_denied",
          "The user denied the request",
        ),
      };
    }

    await this.consentService.grantConsent({
      tenantId,
      clientId: client.id,
      userId: session.userId,
      grantedScopes: tx.grantedScopes,
      rememberConsent: body.remember === true,
      expiresInDays: body.remember === true ? undefined : UNREMEMBERED_CONSENT_DAYS,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    const redirectTo = await this.issueCode({
      tenantId,
      client,
      request: tx.request,
      grantedScopes: tx.grantedScopes,
      userId: session.userId,
      sessionId: session.sessionId,
      authTime: tx.authTime,
      amr: tx.amr,
      req,
    });
    return { redirect_to: redirectTo };
  }

  // ============================================================
  // RP-INITIATED LOGOUT
  // ============================================================

  @Get("end_session")
  @RateLimit({ max: 30, windowMs: 60000, keyBy: "ip" })
  @ApiOperation({ summary: "OIDC RP-Initiated Logout (GET)" })
  async endSessionGet(
    @Query() query: EndSessionRequestDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    return this.endSession(query, req, res);
  }

  @Post("end_session")
  @RateLimit({ max: 30, windowMs: 60000, keyBy: "ip" })
  @ApiOperation({ summary: "OIDC RP-Initiated Logout (POST, form-encoded)" })
  @ApiBody({ type: EndSessionRequestDto })
  async endSessionPost(
    @Body() body: EndSessionRequestDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    return this.endSession(body, req, res);
  }

  private async endSession(dto: EndSessionRequestDto, req: Request, res: Response): Promise<void> {
    const tenantId = req.tenantId!;

    if (!dto.id_token_hint) {
      // Without proof of which session to end, do nothing destructive: the UI
      // asks the user to confirm. A redirect target needs a hint to validate against.
      if (dto.post_logout_redirect_uri) {
        throw oauthError("invalid_request", "id_token_hint is required with post_logout_redirect_uri");
      }
      return res.redirect(this.frontendUrl(LOGOUT_CONFIRM_PATH, req).toString());
    }

    const hint = await this.tokenService.verifyIdTokenHint(dto.id_token_hint);
    const client = await this.clientService.getClient(hint.audience).catch(() => {
      throw oauthError("invalid_request", "id_token_hint was not issued to a known client");
    });
    if (dto.client_id && dto.client_id !== client.clientId) {
      throw oauthError("invalid_request", "client_id does not match id_token_hint");
    }
    if (
      dto.post_logout_redirect_uri &&
      !(client.postLogoutRedirectUris ?? []).includes(dto.post_logout_redirect_uri)
    ) {
      throw oauthError("invalid_request", "post_logout_redirect_uri is not registered for this client");
    }

    const sessionIds = new Set<string>();
    if (hint.sessionId) sessionIds.add(hint.sessionId);
    const browser = await this.browserSessions.resolve(req, tenantId);
    if (browser && browser.userId === hint.subject) sessionIds.add(browser.sessionId);

    for (const sessionId of sessionIds) {
      await this.revokeSessionFor(tenantId, hint.subject, sessionId, client, req);
    }
    clearAuthCookies(res);

    if (dto.post_logout_redirect_uri) {
      const target = new URL(dto.post_logout_redirect_uri);
      if (dto.state) target.searchParams.set("state", dto.state);
      return res.redirect(target.toString());
    }
    return res.redirect(this.frontendUrl(LOGGED_OUT_PATH, req).toString());
  }

  private async revokeSessionFor(
    tenantId: string,
    userId: string,
    sessionId: string,
    client: OAuthClient,
    req: Request,
  ): Promise<void> {
    // Only ever end a session that really belongs to the hinted user in this tenant.
    const live = await this.sessionService.validateSession(tenantId, sessionId);
    if (!live || live.userId !== userId) return;

    await this.sessionService.revokeSession(tenantId, sessionId, "rp_initiated_logout");
    await this.tokenService.revokeSessionTokens(tenantId, sessionId, "rp_initiated_logout");
    this.securityEvents.log({
      tenantId,
      userId,
      eventType: SecurityEventType.LOGOUT,
      severity: "info",
      ipAddress: req.ip ?? "0.0.0.0",
      userAgent: req.get("user-agent") ?? "unknown",
      resourceId: sessionId,
      resourceType: "session",
      metadata: { sessionId, via: "oidc_end_session", clientId: client.clientId },
    });
  }

  // ============================================================
  // HELPERS
  // ============================================================

  private async requireSession(
    req: Request,
  ): Promise<{ tenantId: string; session: BrowserSession }> {
    const tenantId = req.tenantId!;
    const session = await this.browserSessions.resolve(req, tenantId);
    if (!session) throw new ApiException("AUTH_TOKEN_INVALID");
    return { tenantId, session };
  }

  private needsReauthentication(
    session: BrowserSession,
    query: AuthorizeRequestDto,
    prompts: ReadonlySet<string>,
  ): boolean {
    const { auth_after: authAfter, max_age: maxAge } = query;
    if (authAfter !== undefined && session.authTime < authAfter) return true;
    // prompt=login forces a fresh login; auth_after (set on the continue URL)
    // proves one happened, which prevents a redirect loop.
    if (prompts.has("login") && authAfter === undefined) return true;
    if (maxAge !== undefined && nowSeconds() - session.authTime > maxAge) return true;
    return false;
  }

  private requestOf(query: AuthorizeRequestDto): AuthorizeRequest {
    return {
      client_id: query.client_id,
      redirect_uri: query.redirect_uri,
      scope: query.scope,
      state: query.state,
      nonce: query.nonce,
      code_challenge: query.code_challenge,
      code_challenge_method: query.code_challenge_method,
    };
  }

  private frontendUrl(path: string, req: Request): URL {
    const url = new URL(path, this.config.getOrThrow<string>("FRONTEND_URL"));
    if (req.tenant?.slug) url.searchParams.set("tenant", req.tenant.slug);
    return url;
  }

  /** Login UI URL; `continue` is rebuilt from validated params, never from req.url. */
  private loginUrl(req: Request, query: AuthorizeRequestDto, prompts: ReadonlySet<string>): string {
    const continueUrl = buildAuthorizeContinue({
      client_id: query.client_id,
      redirect_uri: query.redirect_uri,
      response_type: query.response_type,
      scope: query.scope,
      state: query.state,
      nonce: query.nonce,
      code_challenge: query.code_challenge,
      code_challenge_method: query.code_challenge_method,
      prompt: query.prompt,
      max_age: query.max_age,
      auth_after: prompts.has("login") ? (query.auth_after ?? nowSeconds()) : query.auth_after,
    });
    const url = this.frontendUrl(LOGIN_PATH, req);
    url.searchParams.set("continue", continueUrl);
    return url.toString();
  }

  private consentUrl(req: Request, transactionId: string): string {
    const url = this.frontendUrl(CONSENT_PATH, req);
    url.searchParams.set("transaction_id", transactionId);
    return url.toString();
  }

  private errorRedirectUrl(
    redirectUri: string,
    state: string | undefined,
    error: string,
    description: string,
  ): string {
    const url = new URL(redirectUri);
    url.searchParams.set("error", error);
    url.searchParams.set("error_description", description);
    if (state) url.searchParams.set("state", state);
    return url.toString();
  }

  private redirectError(
    res: Response,
    query: Pick<AuthorizeRequestDto, "redirect_uri" | "state">,
    error: string,
    description: string,
  ): void {
    res.redirect(this.errorRedirectUrl(query.redirect_uri, query.state, error, description));
  }

  private async issueCode(args: {
    tenantId: string;
    client: OAuthClient;
    request: AuthorizeRequest;
    grantedScopes: string[];
    userId: string;
    sessionId: string;
    authTime: number;
    amr: string[];
    req: Request;
  }): Promise<string> {
    const { request } = args;
    const code = await this.tokenService.createAuthorizationCode({
      tenantId: args.tenantId,
      clientId: args.client.id,
      userId: args.userId,
      redirectUri: request.redirect_uri,
      scope: args.grantedScopes.join(" "),
      state: request.state,
      nonce: request.nonce,
      codeChallenge: request.code_challenge,
      codeChallengeMethod: request.code_challenge_method,
      sessionId: args.sessionId,
      authTime: new Date(args.authTime * 1000),
      amr: args.amr,
      ipAddress: args.req.ip,
      userAgent: args.req.get("user-agent"),
    });

    const redirectUrl = new URL(request.redirect_uri);
    redirectUrl.searchParams.set("code", code);
    if (request.state) redirectUrl.searchParams.set("state", request.state);
    return redirectUrl.toString();
  }
}

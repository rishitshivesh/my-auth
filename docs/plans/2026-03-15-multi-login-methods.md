# Multi-Login Methods Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire up social login (Google/GitHub/Microsoft), magic link, and passkey end-to-end using the state-token relay pattern, plus a tenant settings UI to enable/disable methods.

**Architecture:** Social login uses a state-JWT-in-OAuth + short-lived completion token (60s) so real tokens never appear in redirect URLs. Magic link and passkey use direct POST/response flows (no relay needed). A `/dashboard/settings` page lets admins toggle methods per tenant.

**Tech Stack:** NestJS (BE), Fort Knox SDK (TypeScript), Next.js App Router (FE), React Query, `@simplewebauthn/browser` (FE passkey), passport-google-oauth20/github/microsoft (existing)

---

## Context for Implementer

### Project layout
```
my-auth/
  apps/
    auth-service/          ← NestJS backend
      src/modules/auth/    ← auth.controller.ts, auth.service.ts, auth.dto.ts
      src/modules/social-auth/ ← social-auth.controller.ts, social-auth.service.ts, strategies/
      src/modules/email/   ← email.service.ts
      src/modules/dashboard/ ← dashboard.controller.ts, dashboard.module.ts
      templates/           ← magic-link.html (already exists!)
    admin-portal/          ← Next.js frontend
      app/u/               ← auth pages (login, reset-password, etc.)
      app/dashboard/       ← dashboard pages (security, profile, etc.)
      components/auth/     ← step-based-auth-flow.tsx, credentials-step.tsx, etc.
      lib/                 ← queries.ts, types.ts
  packages/
    fortknox-sdk/src/core/ ← client.ts, types.ts
    fortknox-sdk/src/react/← index.tsx (React provider)
    database/src/entities/ ← user.entity.ts, tenant.entity.ts, etc.
    database/src/migrations/← TypeORM migrations
```

### Key patterns
- All backend responses are wrapped: `{ status: 200, data: <payload> }`. Frontend reads `res.data.data`.
- Refresh token is an httpOnly cookie named `refreshToken`. Access token is in memory (SDK state).
- `req.tenantId` is set by `TenantResolverMiddleware` from the `X-Tenant-ID` request header.
- `@Protected()` = requires JWT auth guard.
- Email templates use Handlebars: `renderTemplate("template-name", { ...vars })`.
- Migration commands run from `apps/auth-service/`: `npm run db:migrate:generate <MigrationName>` then `npm run db:migrate`.
- The `db:migrate:generate` script writes migration files to `packages/database/src/migrations/`.

### What the completion-token relay looks like (social login)
```
Browser → GET /auth/social/google/login?tenant_id=xxx&return_url=http://localhost:3000
  └─ Controller constructs: state = base64({ tenantId, returnUrl })
  └─ Redirects to: https://accounts.google.com/o/oauth2/v2/auth?...&state=base64state

Google → GET /auth/social/google/callback?code=xxx&state=base64state
  └─ Passport exchanges code → req.user = SocialProfile
  └─ Controller decodes req.query.state → tenantId, returnUrl
  └─ Calls socialAuthService.handleCallback(...) → { accessToken, refreshToken }
  └─ Sets refresh cookie (httpOnly, SameSite=strict)
  └─ completionToken = jwtService.sign({ accessToken }, { expiresIn: '60s' })
  └─ Redirects to: {returnUrl}/u/auth/callback?ct={completionToken}

Browser → POST /auth/social/claim-session { ct: completionToken }
  └─ Verifies JWT → extracts accessToken
  └─ Returns { accessToken }
  └─ SDK stores accessToken in memory → redirect to /dashboard
```

---

## Task 1: Add magic link columns to User entity + migration

**Files:**
- Modify: `packages/database/src/entities/user.entity.ts`
- Create: `packages/database/src/migrations/<timestamp>-AddMagicLinkColumns.ts` (auto-generated)

**Step 1: Add columns to user.entity.ts**

Find the "Verification Tokens" section (around line 191) and add after `passwordResetExpiresAt`:

```typescript
  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'magic_link_token',
    select: false,
    comment: 'SHA-256 hash of the magic link token',
  })
  magicLinkToken?: string;

  @Column({
    type: 'timestamp with time zone',
    nullable: true,
    name: 'magic_link_expires_at',
  })
  magicLinkExpiresAt?: Date;
```

**Step 2: Generate migration**

```bash
cd apps/auth-service
npm run db:migrate:generate AddMagicLinkColumns
```

Expected: A new file `packages/database/src/migrations/<timestamp>-AddMagicLinkColumns.ts` is created with `addColumn` for `magic_link_token` and `magic_link_expires_at`.

**Step 3: Run migration**

```bash
npm run db:migrate
```

Expected: output includes `query: ALTER TABLE "users" ADD "magic_link_token" character varying` and `ADD "magic_link_expires_at" TIMESTAMP WITH TIME ZONE`.

**Step 4: Commit**

```bash
git add packages/database/src/entities/user.entity.ts packages/database/src/migrations/
git commit -m "feat(db): add magic_link_token and magic_link_expires_at columns to users"
```

---

## Task 2: Auth service — magic link send & verify

**Files:**
- Modify: `apps/auth-service/src/modules/auth/auth.service.ts`

**Step 1: Add sendMagicLink method**

Add after `forgotPassword` method (around line 459):

```typescript
/**
 * Send magic link email (TENANT SCOPED)
 */
async sendMagicLink(tenantId: string, email: string): Promise<void> {
  const user = await this.userRepository.findOne({ where: { email, tenantId } });

  // Don't reveal if user exists
  if (!user) return;

  // Generate raw token and hash
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  await this.userRepository.update(
    { id: user.id, tenantId },
    {
      magicLinkToken: tokenHash,
      magicLinkExpiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    },
  );

  await this.emailService.sendMagicLinkEmail(user, rawToken);

  console.log('Magic link token (dev):', rawToken);
}
```

**Step 2: Add verifyMagicLink method**

Add after `sendMagicLink`:

```typescript
/**
 * Verify magic link token and create session (TENANT SCOPED)
 */
async verifyMagicLink(
  tenantId: string,
  rawToken: string,
  ip: string,
  userAgent: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const user = await this.userRepository
    .createQueryBuilder('user')
    .addSelect('user.magicLinkToken')
    .where('user.magicLinkToken = :tokenHash', { tokenHash })
    .andWhere('user.tenantId = :tenantId', { tenantId })
    .andWhere('user.magicLinkExpiresAt > :now', { now: new Date() })
    .getOne();

  if (!user) {
    throw new UnauthorizedException('Invalid or expired magic link');
  }

  // Clear the token (one-time use)
  await this.userRepository.update(
    { id: user.id, tenantId },
    { magicLinkToken: undefined, magicLinkExpiresAt: undefined },
  );

  // Create session
  const session = await this.sessionService.createSession({
    userId: user.id,
    tenantId,
    email: user.email,
    ipAddress: ip,
    userAgent,
  });

  const { token: refreshToken } = await this.oauthRefreshTokenService.createRefreshToken({
    tenantId,
    userId: user.id,
    sessionId: session.id,
    clientId: undefined,
    ipAddress: ip,
    userAgent,
    expiresInDays: 30,
  });

  const accessToken = this.jwtService.sign(
    { sub: user.id, email: user.email, tenantId, sessionId: session.id },
    { secret: this.configService.get('JWT_SECRET'), expiresIn: '15m' },
  );

  await this.logSecurityEvent({
    tenantId,
    userId: user.id,
    eventType: 'login_success',
    severity: 'info',
    ipAddress: ip,
    userAgent,
    metadata: { authMethod: 'magic_link', sessionId: session.id },
  });

  return { accessToken, refreshToken };
}
```

**Step 3: Verify the service compiles**

```bash
cd apps/auth-service
npx tsc --noEmit
```

Expected: No errors.

**Step 4: Commit**

```bash
git add apps/auth-service/src/modules/auth/auth.service.ts
git commit -m "feat(auth): add sendMagicLink and verifyMagicLink service methods"
```

---

## Task 3: Email service — sendMagicLinkEmail

**Files:**
- Modify: `apps/auth-service/src/modules/email/email.service.ts`

**Context:** The template `apps/auth-service/templates/magic-link.html` already exists. It uses `{{actionUrl}}`, `{{userName}}`, `{{tenantName}}`, `{{tenantLogo}}`, `{{expiresIn}}`, `{{currentYear}}`.

**Step 1: Add sendMagicLinkEmail method**

Find `sendPasswordResetOtpEmail` (around line 293) and add after it:

```typescript
/**
 * Send magic link sign-in email
 */
async sendMagicLinkEmail(user: User, rawToken: string): Promise<boolean> {
  const branding = await this.getTenantBranding(user.tenantId);
  const portalUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
  const actionUrl = `${portalUrl}/u/magic-link?token=${rawToken}`;

  const html = await this.renderTemplate('magic-link', {
    userName: user.firstName || user.email.split('@')[0],
    userEmail: user.email,
    actionUrl,
    expiresIn: '10 minutes',
    ...branding,
  });

  return this.sendEmail({
    to: user.email,
    subject: `Your sign-in link for ${branding.tenantName}`,
    html,
    tenantId: user.tenantId,
    userId: user.id,
    emailType: 'magic_link',
  });
}
```

**Step 2: Verify compiles**

```bash
cd apps/auth-service
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add apps/auth-service/src/modules/email/email.service.ts
git commit -m "feat(email): add sendMagicLinkEmail using existing magic-link.html template"
```

---

## Task 4: Auth controller — magic link endpoints + DTO

**Files:**
- Modify: `apps/auth-service/src/modules/auth/auth.dto.ts`
- Modify: `apps/auth-service/src/modules/auth/auth.controller.ts`

**Step 1: Add DTOs to auth.dto.ts**

Add at the end of the file:

```typescript
export class SendMagicLinkDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;
}

export class VerifyMagicLinkDto {
  @ApiProperty({ description: 'Raw magic link token from email URL' })
  @IsString()
  token!: string;
}
```

**Step 2: Add magic link imports to auth.controller.ts**

At the top, add `SendMagicLinkDto` and `VerifyMagicLinkDto` to the imports from `./auth.dto`.

**Step 3: Add endpoints to auth.controller.ts**

Add these two methods before the `loginIntent` handler (around line 640):

```typescript
/**
 * Send magic link sign-in email
 */
@Post('magic-link/send')
@HttpCode(HttpStatus.OK)
@ApiOperation({ summary: 'Send magic link sign-in email' })
@ApiResponse({ status: 200, description: 'Magic link sent (or silently ignored if user not found)' })
async sendMagicLink(
  @Req() req: Request,
  @Body() dto: SendMagicLinkDto,
) {
  const tenantId = req.tenantId!;
  await this.authService.sendMagicLink(tenantId, dto.email);
  return { message: 'If an account exists with this email, a magic link has been sent' };
}

/**
 * Verify magic link token and issue session
 */
@Post('magic-link/verify')
@HttpCode(HttpStatus.OK)
@ApiOperation({ summary: 'Verify magic link token and create session' })
@ApiResponse({ status: 200, description: 'Session created successfully' })
@ApiResponse({ status: 401, description: 'Invalid or expired magic link' })
async verifyMagicLink(
  @Req() req: Request,
  @Res({ passthrough: true }) res: Response,
  @Body() dto: VerifyMagicLinkDto,
  @Ip() ip: string,
  @Headers('user-agent') userAgent: string,
) {
  const tenantId = req.tenantId!;
  const { accessToken, refreshToken } = await this.authService.verifyMagicLink(
    tenantId,
    dto.token,
    ip,
    userAgent || 'unknown',
  );

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    domain: req.hostname,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  });

  return { accessToken };
}
```

**Step 4: Verify compiles**

```bash
cd apps/auth-service
npx tsc --noEmit
```

**Step 5: Test magic link send endpoint manually**

```bash
curl -X POST http://localhost:4000/auth/magic-link/send \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: <your-tenant-id>" \
  -d '{"email": "test@example.com"}'
```

Expected: `{ "message": "If an account exists..." }` and console logs the raw token in dev mode.

**Step 6: Commit**

```bash
git add apps/auth-service/src/modules/auth/auth.dto.ts \
        apps/auth-service/src/modules/auth/auth.controller.ts
git commit -m "feat(auth): add POST /auth/magic-link/send and /auth/magic-link/verify endpoints"
```

---

## Task 5: Social auth — state relay + completion token

**Files:**
- Modify: `apps/auth-service/src/modules/social-auth/social-auth.controller.ts`
- Modify: `apps/auth-service/src/modules/social-auth/strategies/google.strategy.ts`
- Modify: `apps/auth-service/src/modules/social-auth/strategies/github.strategy.ts`
- Modify: `apps/auth-service/src/modules/social-auth/strategies/microsoft.strategy.ts`
- Modify: `apps/auth-service/src/modules/social-auth/social-auth.module.ts`

**Step 1: Disable Passport state management in each strategy**

In `google.strategy.ts`, add `state: false` to the `super()` options:

```typescript
super({
  clientID: configService.getOrThrow<string>('INTERNAL_GOOGLE_CLIENT_ID'),
  clientSecret: configService.getOrThrow<string>('INTERNAL_GOOGLE_CLIENT_SECRET'),
  callbackURL: configService.getOrThrow<string>('INTERNAL_GOOGLE_CALLBACK_URL'),
  scope: ['openid', 'email', 'profile'],
  passReqToCallback: true,
  state: false,   // ← ADD THIS: we manage state ourselves
});
```

Do the same for `github.strategy.ts` and `microsoft.strategy.ts` — find the `super({...})` call and add `state: false`.

**Step 2: Inject JwtService and ConfigService into SocialAuthController**

Replace the controller constructor:

```typescript
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

// ...

constructor(
  private readonly socialAuthService: SocialAuthService,
  private readonly jwtService: JwtService,
  private readonly configService: ConfigService,
) {}
```

**Step 3: Replace the three login handlers with manual OAuth redirects**

Replace the existing `googleLogin`, `githubLogin`, `microsoftLogin` handlers (remove `@UseGuards` decorators from them):

```typescript
// ─── GOOGLE ───────────────────────────────────────────────────

@Get('google/login')
@ApiOperation({ summary: 'Login with Google' })
googleLogin(@Req() req: Request, @Res() res: Response) {
  const tenantId = (req.query.tenant_id as string) || req.tenantId!;
  const returnUrl = (req.query.return_url as string) || '';
  const state = Buffer.from(JSON.stringify({ tenantId, returnUrl })).toString('base64url');

  const params = new URLSearchParams({
    client_id: this.configService.getOrThrow('INTERNAL_GOOGLE_CLIENT_ID'),
    redirect_uri: this.configService.getOrThrow('INTERNAL_GOOGLE_CALLBACK_URL'),
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    state,
  });
  return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

// ─── GITHUB ───────────────────────────────────────────────────

@Get('github/login')
@ApiOperation({ summary: 'Login with GitHub' })
githubLogin(@Req() req: Request, @Res() res: Response) {
  const tenantId = (req.query.tenant_id as string) || req.tenantId!;
  const returnUrl = (req.query.return_url as string) || '';
  const state = Buffer.from(JSON.stringify({ tenantId, returnUrl })).toString('base64url');

  const params = new URLSearchParams({
    client_id: this.configService.getOrThrow('INTERNAL_GITHUB_CLIENT_ID'),
    redirect_uri: this.configService.getOrThrow('INTERNAL_GITHUB_CALLBACK_URL'),
    scope: 'user:email',
    state,
  });
  return res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
}

// ─── MICROSOFT ────────────────────────────────────────────────

@Get('microsoft/login')
@ApiOperation({ summary: 'Login with Microsoft' })
microsoftLogin(@Req() req: Request, @Res() res: Response) {
  const tenantId = (req.query.tenant_id as string) || req.tenantId!;
  const returnUrl = (req.query.return_url as string) || '';
  const state = Buffer.from(JSON.stringify({ tenantId, returnUrl })).toString('base64url');

  const params = new URLSearchParams({
    client_id: this.configService.getOrThrow('INTERNAL_MICROSOFT_CLIENT_ID'),
    redirect_uri: this.configService.getOrThrow('INTERNAL_MICROSOFT_CALLBACK_URL'),
    response_type: 'code',
    scope: 'openid email profile User.Read',
    response_mode: 'query',
    state,
  });
  return res.redirect(`https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`);
}
```

**Step 4: Replace handleSocialCallback with state-relay version**

Replace the private `handleSocialCallback` method:

```typescript
private async handleSocialCallback(req: any, res: Response) {
  const profile: SocialProfile = req.user;

  // Decode our state JWT from query param
  let tenantId: string;
  let returnUrl: string;
  try {
    const stateRaw = req.query.state as string;
    const stateObj = JSON.parse(Buffer.from(stateRaw, 'base64url').toString());
    tenantId = stateObj.tenantId;
    returnUrl = stateObj.returnUrl || '';
  } catch {
    return res.redirect('/error?message=Invalid+state+parameter');
  }

  if (!tenantId) {
    return res.redirect('/error?message=Missing+tenant+ID');
  }

  // Validate returnUrl to prevent open redirect (only allow same-origin or trusted domains)
  const allowedOrigins = [
    this.configService.get('PORTAL_URL') || 'http://localhost:3000',
    'http://localhost:3000',
    'http://localhost:3001',
  ];
  const isSafeReturn = !returnUrl || allowedOrigins.some(o => returnUrl.startsWith(o));
  const safeReturnUrl = isSafeReturn ? returnUrl : (this.configService.get('PORTAL_URL') || 'http://localhost:3000');

  try {
    const result = await this.socialAuthService.handleCallback({
      tenantId,
      profile,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] || 'unknown',
    });

    if (result.type === 'link_required') {
      return res.redirect(
        `${safeReturnUrl}/u/link-required?email=${encodeURIComponent(result.email)}&provider=${result.provider}`,
      );
    }

    // Set refresh cookie (same pattern as regular login)
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      domain: req.hostname,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    // Create short-lived completion token (60s, one-time use by the portal)
    const completionToken = this.jwtService.sign(
      { accessToken: result.accessToken, type: 'social_completion' },
      { secret: this.configService.get('JWT_SECRET'), expiresIn: '60s' },
    );

    return res.redirect(`${safeReturnUrl}/u/auth/callback?ct=${completionToken}`);
  } catch (error: any) {
    return res.redirect(`${safeReturnUrl}/u/login?error=${encodeURIComponent(error.message)}`);
  }
}
```

**Step 5: Add claim-session endpoint**

Add this endpoint to `SocialAuthController`, before the account linking section:

```typescript
/**
 * Claim social session using completion token (Approach C relay)
 *
 * POST /auth/social/claim-session { ct: completionToken }
 * Returns { accessToken } — refresh token is already in httpOnly cookie
 */
@Post('claim-session')
@HttpCode(HttpStatus.OK)
@ApiOperation({ summary: 'Claim social session using completion token' })
async claimSession(@Body() body: { ct: string }) {
  try {
    const payload = this.jwtService.verify(body.ct, {
      secret: this.configService.get('JWT_SECRET'),
    });

    if (payload.type !== 'social_completion') {
      throw new Error('Invalid token type');
    }

    return { accessToken: payload.accessToken };
  } catch {
    throw new UnauthorizedException('Invalid or expired completion token');
  }
}
```

Add `UnauthorizedException` to the imports at the top if not already there.

**Step 6: Add JwtService, ConfigService to social-auth.module.ts providers**

`JwtModule` is already imported in `social-auth.module.ts`. Add `ConfigService` to providers (it's provided by global `ConfigModule`). No changes needed to module — `JwtService` is available via `JwtModule` and `ConfigService` via global config.

Just verify `SocialAuthModule` has `JwtModule` imported (it already does).

**Step 7: Verify compiles**

```bash
cd apps/auth-service
npx tsc --noEmit
```

Expected: No errors.

**Step 8: Commit**

```bash
git add apps/auth-service/src/modules/social-auth/
git commit -m "feat(social-auth): implement state-relay completion token pattern for Approach C"
```

---

## Task 6: Fix WebAuthn finish — set refresh cookie + correct response

**Files:**
- Modify: `apps/auth-service/src/modules/auth/auth.controller.ts`
- Modify: `apps/auth-service/src/modules/auth/auth.service.ts`

**Step 1: Check finishWebAuthnLogin in auth.service.ts**

The `finishWebAuthnLogin` method (around line 958) currently returns `{ accessToken, refreshToken, user }` but uses an old refresh token generation pattern (not using `OAuthRefreshTokenService`). Update it to use the consistent session/token creation:

In `auth.service.ts`, find `finishWebAuthnLogin` and replace the session + token generation section (after `if (!verified)`) with:

```typescript
// Create session using SessionService (consistent with password login)
const session = await this.sessionService.createSession({
  userId: user.id,
  tenantId,
  email: user.email,
  ipAddress: ip,
  userAgent,
  deviceId,
});

const { token: refreshToken } = await this.oauthRefreshTokenService.createRefreshToken({
  tenantId,
  userId: user.id,
  sessionId: session.id,
  clientId: undefined,
  ipAddress: ip,
  userAgent,
  deviceId,
  expiresInDays: 30,
});

const accessToken = this.jwtService.sign(
  { sub: user.id, email: user.email, tenantId, sessionId: session.id },
  { secret: this.configService.get('JWT_SECRET'), expiresIn: '15m' },
);

await this.logSecurityEvent({
  tenantId,
  userId: user.id,
  eventType: 'login_success',
  severity: 'info',
  ipAddress: ip,
  userAgent,
  metadata: { sessionId: session.id, authMethod: 'webauthn' },
});

return { accessToken, refreshToken, user: { email: user.email, firstName: user.firstName, lastName: user.lastName, emailVerified: user.emailVerified } };
```

**Step 2: Fix finishWebAuthnLogin controller handler to set cookie**

Find the `finishWebAuthnLogin` handler in `auth.controller.ts` (around line 623) and update it:

```typescript
@Post('webauthn/login/finish')
@HttpCode(HttpStatus.OK)
@ApiOperation({ summary: 'Complete WebAuthn login' })
async finishWebAuthnLogin(
  @Req() req: Request,
  @Res({ passthrough: true }) res: Response,
  @Body() dto: { email: string; response: any },
  @Ip() ip: string,
  @Headers('user-agent') userAgent: string,
) {
  const tenantId = req.tenantId!;
  const result = await this.authService.finishWebAuthnLogin({
    tenantId,
    email: dto.email,
    webauthnResponse: dto.response,
    ip,
    userAgent,
  });

  res.cookie('refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    domain: req.hostname,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  });

  return { accessToken: result.accessToken, refreshToken: null };
}
```

**Step 3: Verify compiles**

```bash
cd apps/auth-service
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add apps/auth-service/src/modules/auth/auth.controller.ts \
        apps/auth-service/src/modules/auth/auth.service.ts
git commit -m "fix(webauthn): set refresh cookie on finishWebAuthnLogin, use OAuthRefreshTokenService"
```

---

## Task 7: Dashboard — tenant settings endpoints

**Files:**
- Modify: `apps/auth-service/src/modules/dashboard/dashboard.controller.ts`
- Modify: `apps/auth-service/src/modules/dashboard/dashboard.module.ts`

**Step 1: Update dashboard.module.ts to include new entities**

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User, Session, Tenant, TenantSocialProvider } from '@repo/database';
import { DashboardController } from './dashboard.controller';
import { MfaModule } from '@/modules/mfa/mfa.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Session, Tenant, TenantSocialProvider]),
    MfaModule,
  ],
  controllers: [DashboardController],
})
export class DashboardModule {}
```

**Step 2: Add tenant settings endpoints to dashboard.controller.ts**

Add these imports at the top:

```typescript
import { Controller, Get, Patch, Param, Body, Request } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { User, Session, Tenant, TenantSocialProvider } from '@repo/database';
```

Add the three new methods to `DashboardController` after `getOverview`:

```typescript
@Get('tenant-settings')
@ApiOperation({ summary: 'Get tenant login method settings' })
async getTenantSettings(@Request() req: any) {
  const tenantId = req.tenantId!;

  const [tenant, socialProviders] = await Promise.all([
    this.tenantRepository.findOne({ where: { id: tenantId } }),
    this.tenantSocialProviderRepository.find({ where: { tenantId } }),
  ]);

  return {
    featureFlags: tenant?.featureFlags || {},
    socialProviders: socialProviders.map((sp) => ({
      provider: sp.provider,
      enabled: sp.enabled,
      clientId: sp.clientId || null,
      hasSecret: !!sp.clientSecret,
    })),
  };
}

@Patch('tenant-settings')
@ApiOperation({ summary: 'Update tenant feature flags for login methods' })
async updateTenantSettings(
  @Request() req: any,
  @Body() body: { featureFlags: Record<string, boolean> },
) {
  const tenantId = req.tenantId!;
  const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
  if (!tenant) throw new Error('Tenant not found');

  await this.tenantRepository.update(
    { id: tenantId },
    { featureFlags: { ...(tenant.featureFlags || {}), ...body.featureFlags } },
  );

  return { message: 'Settings updated' };
}

@Patch('tenant-settings/social/:provider')
@ApiOperation({ summary: 'Enable/disable and configure a social provider for this tenant' })
async updateSocialProvider(
  @Request() req: any,
  @Param('provider') provider: string,
  @Body() body: { enabled: boolean; clientId?: string; clientSecret?: string },
) {
  const tenantId = req.tenantId!;

  const existing = await this.tenantSocialProviderRepository.findOne({
    where: { tenantId, provider: provider as any },
  });

  if (existing) {
    await this.tenantSocialProviderRepository.update(existing.id, {
      enabled: body.enabled,
      ...(body.clientId !== undefined && { clientId: body.clientId }),
      ...(body.clientSecret !== undefined && { clientSecret: body.clientSecret }),
    });
  } else {
    await this.tenantSocialProviderRepository.save({
      tenantId,
      provider: provider as any,
      enabled: body.enabled,
      clientId: body.clientId,
      clientSecret: body.clientSecret,
      useSharedApp: !body.clientId,
    });
  }

  return { message: 'Social provider updated' };
}
```

Also add `tenantRepository` and `tenantSocialProviderRepository` to the constructor:

```typescript
constructor(
  @InjectRepository(User)
  private readonly userRepository: Repository<User>,
  @InjectRepository(Session)
  private readonly sessionRepository: Repository<Session>,
  @InjectRepository(Tenant)
  private readonly tenantRepository: Repository<Tenant>,
  @InjectRepository(TenantSocialProvider)
  private readonly tenantSocialProviderRepository: Repository<TenantSocialProvider>,
  private readonly mfaService: MfaService,
) {}
```

**Step 3: Verify compiles**

```bash
cd apps/auth-service
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add apps/auth-service/src/modules/dashboard/
git commit -m "feat(dashboard): add tenant-settings endpoints (GET/PATCH featureFlags + social providers)"
```

---

## Task 8: SDK core — add new auth methods

**Files:**
- Modify: `packages/fortknox-sdk/src/core/client.ts`
- Modify: `packages/fortknox-sdk/src/core/types.ts`

**Step 1: Add new methods to FortKnoxClient (client.ts)**

Add these methods in the `PUBLIC API - AUTHENTICATION` section, after `resetPassword`:

```typescript
/**
 * Initiate social login — redirects the browser to the OAuth provider
 * return_url should be the portal origin so the callback page can receive the completion token
 */
initiateSocialLogin(provider: string): void {
  if (typeof window === 'undefined') {
    throw new Error('initiateSocialLogin is only available in browser environments');
  }
  const returnUrl = encodeURIComponent(window.location.origin);
  window.location.href = `${this.config.baseURL}/auth/social/${provider}/login?tenant_id=${this.config.tenant}&return_url=${returnUrl}`;
}

/**
 * Claim a social session using the completion token from /u/auth/callback?ct=...
 * Sets the access token in state — refresh token is already in the httpOnly cookie.
 */
async claimSocialSession(completionToken: string): Promise<void> {
  const response = await this.transport({
    url: `${this.config.baseURL}/auth/social/claim-session`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-ID': this.config.tenant,
    },
    body: { ct: completionToken },
    credentials: 'include',
  });

  if (!response.ok) {
    throw this.createError(response);
  }

  const accessToken = response.data?.data?.accessToken || response.data?.accessToken;
  if (!accessToken) {
    throw new AuthErrorClass('UNKNOWN_ERROR', 'No access token in claim-session response');
  }

  setAccessToken(this.state, accessToken);
  this.emit({ type: 'token_refreshed', accessToken });
  this.config.onTokenRefreshed(accessToken);
}

/**
 * Send a magic link sign-in email
 */
async sendMagicLink(email: string): Promise<void> {
  const response = await this.transport({
    url: `${this.config.baseURL}/auth/magic-link/send`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-ID': this.config.tenant,
    },
    body: { email },
  });

  if (!response.ok) {
    throw this.createError(response);
  }
}

/**
 * Verify a magic link token (from /u/magic-link?token=...) and establish session
 */
async verifyMagicLink(token: string): Promise<void> {
  const response = await this.transport({
    url: `${this.config.baseURL}/auth/magic-link/verify`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-ID': this.config.tenant,
    },
    body: { token },
    credentials: 'include',
  });

  if (!response.ok) {
    throw this.createError(response);
  }

  const accessToken = response.data?.data?.accessToken || response.data?.accessToken;
  if (!accessToken) {
    throw new AuthErrorClass('UNKNOWN_ERROR', 'No access token in magic-link verify response');
  }

  setAccessToken(this.state, accessToken);
  this.emit({ type: 'token_refreshed', accessToken });
  this.config.onTokenRefreshed(accessToken);
}

/**
 * Start WebAuthn (passkey) authentication — returns challenge options for the browser
 * Call this, then pass options to @simplewebauthn/browser's startAuthentication(),
 * then call finishPasskeyLogin() with the assertion.
 */
async startPasskeyLogin(email: string): Promise<any> {
  const response = await this.request({
    url: `${this.config.baseURL}/auth/webauthn/login/start`,
    method: 'POST',
    body: { email },
  });

  if (!response.ok) {
    throw this.createError(response);
  }

  return response.data?.data || response.data;
}

/**
 * Finish WebAuthn (passkey) authentication with the browser assertion
 * Establishes session: access token stored in memory, refresh token in httpOnly cookie.
 */
async finishPasskeyLogin(email: string, assertion: any): Promise<void> {
  const response = await this.request({
    url: `${this.config.baseURL}/auth/webauthn/login/finish`,
    method: 'POST',
    body: { email, response: assertion },
    credentials: 'include',
  } as any);

  if (!response.ok) {
    throw this.createError(response);
  }

  const accessToken = response.data?.data?.accessToken || response.data?.accessToken;
  if (!accessToken) {
    throw new AuthErrorClass('UNKNOWN_ERROR', 'No access token in passkey login response');
  }

  setAccessToken(this.state, accessToken);
  this.emit({ type: 'token_refreshed', accessToken });
  this.config.onTokenRefreshed(accessToken);
}
```

**Step 2: Add new method signatures to types.ts AuthContextValue**

There's no `AuthContextValue` interface in types.ts — it's defined in the React provider. Move on to Task 9 for that.

But DO add `LoginIntentResponse` type alignment. Check `LoginIntentResponse` in `packages/fortknox-sdk/src/core/types.ts` — the `preferredMethod` field should allow strings beyond just the three literals. Update:

```typescript
export interface LoginIntentResponse {
  exists: boolean;
  email: string;
  methods: {
    password: boolean;
    magicLink: boolean;
    passkey: boolean;
    mfa: boolean;
    social: string[];
  };
  preferredMethod: string;  // ← change from union type to string
  branding?: {
    logo?: string;
    primaryColor?: string;
    companyName?: string;
  };
}
```

**Step 3: Verify SDK compiles**

```bash
cd packages/fortknox-sdk
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add packages/fortknox-sdk/src/core/
git commit -m "feat(sdk): add initiateSocialLogin, claimSocialSession, sendMagicLink, verifyMagicLink, startPasskeyLogin, finishPasskeyLogin"
```

---

## Task 9: SDK React provider — expose new methods

**Files:**
- Modify: `packages/fortknox-sdk/src/react/index.tsx`

**Step 1: Add new methods to AuthContextValue interface**

Find the `interface AuthContextValue` block and add:

```typescript
interface AuthContextValue {
  // ... existing fields ...

  // New auth methods
  initiateSocialLogin: (provider: string) => void;
  claimSocialSession: (ct: string) => Promise<void>;
  sendMagicLink: (email: string) => Promise<void>;
  verifyMagicLink: (token: string) => Promise<void>;
  startPasskeyLogin: (email: string) => Promise<any>;
  finishPasskeyLogin: (email: string, assertion: any) => Promise<void>;
}
```

**Step 2: Add implementations in FortKnoxProvider**

After the existing `resetPassword` implementation, add:

```typescript
const initiateSocialLogin = (provider: string) => {
  client.initiateSocialLogin(provider);
};

const claimSocialSession = async (ct: string) => {
  try {
    setError(null);
    setIsLoading(true);
    await client.claimSocialSession(ct);
    const currentUser = await client.getCurrentUser();
    setUser(currentUser);
  } catch (err) {
    setError(err as Error);
    throw err;
  } finally {
    setIsLoading(false);
  }
};

const sendMagicLink = async (email: string) => {
  try {
    setError(null);
    await client.sendMagicLink(email);
  } catch (err) {
    setError(err as Error);
    throw err;
  }
};

const verifyMagicLink = async (token: string) => {
  try {
    setError(null);
    setIsLoading(true);
    await client.verifyMagicLink(token);
    const currentUser = await client.getCurrentUser();
    setUser(currentUser);
  } catch (err) {
    setError(err as Error);
    throw err;
  } finally {
    setIsLoading(false);
  }
};

const startPasskeyLogin = async (email: string): Promise<any> => {
  try {
    setError(null);
    return await client.startPasskeyLogin(email);
  } catch (err) {
    setError(err as Error);
    throw err;
  }
};

const finishPasskeyLogin = async (email: string, assertion: any): Promise<void> => {
  try {
    setError(null);
    setIsLoading(true);
    await client.finishPasskeyLogin(email, assertion);
    const currentUser = await client.getCurrentUser();
    setUser(currentUser);
  } catch (err) {
    setError(err as Error);
    throw err;
  } finally {
    setIsLoading(false);
  }
};
```

**Step 3: Add all new methods to the value object**

Find the `const value: AuthContextValue = { ... }` block and add:

```typescript
  initiateSocialLogin,
  claimSocialSession,
  sendMagicLink,
  verifyMagicLink,
  startPasskeyLogin,
  finishPasskeyLogin,
```

**Step 4: Verify SDK compiles**

```bash
cd packages/fortknox-sdk
npx tsc --noEmit
```

**Step 5: Commit**

```bash
git add packages/fortknox-sdk/src/react/index.tsx
git commit -m "feat(sdk): expose new auth methods in React provider context"
```

---

## Task 10: FE — wire social login in credentials-step

**Files:**
- Modify: `apps/admin-portal/components/auth/credentials-step.tsx`

**Context:** The `method.startsWith("social-")` block currently shows a dead stub. We need it to call `initiateSocialLogin` and actually redirect.

**Step 1: Import useAuth and useRouter**

Add at the top of `credentials-step.tsx`:

```typescript
import { useRouter } from 'next/navigation'
import { useAuth } from '@fortknox/sdk'
```

**Step 2: Use initiateSocialLogin inside the component**

Inside `CredentialsStep`, add:

```typescript
const router = useRouter()
const { initiateSocialLogin } = useAuth()
```

**Step 3: Replace the social stub with real redirect**

Find the `{method.startsWith("social-") && (` block and replace the `<Button onClick={() => onSubmit(email)}>` part:

```typescript
{method.startsWith('social-') && (
  <motion.div
    key="social"
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -10 }}
    transition={{ duration: 0.2 }}
    className="space-y-4"
  >
    <div className="p-4 rounded-lg bg-muted/50 border border-muted text-center">
      <p className="text-sm font-medium text-foreground mb-2">
        Continue with {method.replace('social-', '')}
      </p>
      <p className="text-xs text-muted-foreground">
        You'll be redirected to sign in securely
      </p>
    </div>
    <Button
      onClick={() => initiateSocialLogin(method.replace('social-', ''))}
      disabled={loading}
      className="w-full"
      style={primaryColor ? { backgroundColor: primaryColor } : undefined}
    >
      {loading ? 'Connecting...' : `Continue with ${method.replace('social-', '')}`}
    </Button>
  </motion.div>
)}
```

**Step 4: Commit**

```bash
git add apps/admin-portal/components/auth/credentials-step.tsx
git commit -m "feat(fe): wire social login to initiateSocialLogin (Approach C redirect)"
```

---

## Task 11: FE — /u/auth/callback page (social completion token)

**Files:**
- Create: `apps/admin-portal/app/u/auth/callback/page.tsx`

**Step 1: Create the callback page**

```typescript
"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@fortknox/sdk"

export default function AuthCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { claimSocialSession } = useAuth()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ct = searchParams.get("ct")
    const errorParam = searchParams.get("error")

    if (errorParam) {
      setError(decodeURIComponent(errorParam))
      return
    }

    if (!ct) {
      setError("Missing completion token")
      return
    }

    claimSocialSession(ct)
      .then(() => router.replace("/dashboard"))
      .catch((err) => setError(err?.message || "Authentication failed"))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-4 max-w-sm">
          <p className="text-destructive font-medium">Authentication failed</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <a href="/u/login" className="text-primary text-sm underline">
            Back to sign in
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
        <p className="text-sm text-muted-foreground">Completing sign in...</p>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add apps/admin-portal/app/u/auth/callback/
git commit -m "feat(fe): add /u/auth/callback page to claim social session completion token"
```

---

## Task 12: FE — wire magic link form + /u/magic-link page

**Files:**
- Modify: `apps/admin-portal/components/auth/credentials-step.tsx`
- Create: `apps/admin-portal/app/u/magic-link/page.tsx`

**Context:** `MagicLinkForm` already has an `onSubmit(email)` prop and a `stage` prop. The form itself already handles the "sent" confirmation state. We just need to wire `onSubmit` to call `sendMagicLink` and control the `stage`.

**Step 1: Update the magicLink branch in credentials-step.tsx**

Find the `{method === "magicLink" && (` block and replace it:

```typescript
{method === 'magicLink' && (
  <motion.div
    key="magicLink"
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -10 }}
    transition={{ duration: 0.2 }}
  >
    <MagicLinkFormWrapper email={email} primaryColor={primaryColor} />
  </motion.div>
)}
```

Add a `MagicLinkFormWrapper` component at the top of the file (still inside `credentials-step.tsx`, before `CredentialsStep`):

```typescript
function MagicLinkFormWrapper({ email, primaryColor }: { email: string; primaryColor: string }) {
  const { sendMagicLink } = useAuth()
  const [stage, setStage] = useState<'request' | 'sent' | 'expired'>('request')

  const handleSubmit = async (inputEmail: string) => {
    await sendMagicLink(inputEmail)
    setStage('sent')
  }

  const handleResend = async () => {
    await sendMagicLink(email)
  }

  return (
    <MagicLinkForm
      stage={stage}
      email={email}
      onSubmit={handleSubmit}
      onResend={handleResend}
      primaryColor={primaryColor}
    />
  )
}
```

**Step 2: Create the magic-link verification page**

Create `apps/admin-portal/app/u/magic-link/page.tsx`:

```typescript
"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@fortknox/sdk"

export default function MagicLinkPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { verifyMagicLink } = useAuth()
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying")
  const [errorMsg, setErrorMsg] = useState("")

  useEffect(() => {
    const token = searchParams.get("token")

    if (!token) {
      setStatus("error")
      setErrorMsg("Missing token in link")
      return
    }

    verifyMagicLink(token)
      .then(() => {
        setStatus("success")
        setTimeout(() => router.replace("/dashboard"), 1500)
      })
      .catch((err) => {
        setStatus("error")
        setErrorMsg(err?.message || "This magic link has expired or already been used.")
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4 max-w-sm px-4">
        {status === "verifying" && (
          <>
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
            <p className="text-sm text-muted-foreground">Signing you in...</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 mx-auto">
              <svg className="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="font-medium">Signed in successfully!</p>
            <p className="text-sm text-muted-foreground">Redirecting to your dashboard...</p>
          </>
        )}

        {status === "error" && (
          <>
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm font-medium text-destructive">Link invalid or expired</p>
              <p className="text-xs text-muted-foreground mt-1">{errorMsg}</p>
            </div>
            <a href="/u/login" className="text-primary text-sm underline block">
              Request a new magic link
            </a>
          </>
        )}
      </div>
    </div>
  )
}
```

**Step 3: Commit**

```bash
git add apps/admin-portal/components/auth/credentials-step.tsx \
        apps/admin-portal/app/u/magic-link/
git commit -m "feat(fe): wire magic link form to sendMagicLink SDK, add /u/magic-link verification page"
```

---

## Task 13: FE — wire passkey login button + install @simplewebauthn/browser

**Files:**
- Modify: `apps/admin-portal/components/auth/passkey-login-button.tsx`
- Modify: `apps/admin-portal/package.json` (dependency)
- Modify: `apps/admin-portal/components/auth/credentials-step.tsx` (pass email to PasskeyLoginButton)

**Step 1: Install @simplewebauthn/browser**

```bash
cd apps/admin-portal
npm install @simplewebauthn/browser
```

**Step 2: Update PasskeyLoginButton to accept email and use real WebAuthn**

Replace the entire contents of `passkey-login-button.tsx`:

```typescript
"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Button, Alert, AlertDescription } from "@repo/ui"
import { Key, Loader } from "lucide-react"
import { useAuth } from "@fortknox/sdk"

interface PasskeyLoginButtonProps {
  email: string
  primaryColor?: string
}

export function PasskeyLoginButton({ email, primaryColor = "#6366f1" }: PasskeyLoginButtonProps) {
  const { startPasskeyLogin, finishPasskeyLogin } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePasskeyLogin = async () => {
    setLoading(true)
    setError(null)

    try {
      if (!window.PublicKeyCredential) {
        throw new Error("Passkeys are not supported on this device or browser")
      }

      // Step 1: Get challenge from server
      const options = await startPasskeyLogin(email)

      // Step 2: Trigger browser's native passkey prompt
      const { startAuthentication } = await import("@simplewebauthn/browser")
      const assertion = await startAuthentication(options)

      // Step 3: Verify with server — sets session
      await finishPasskeyLogin(email, assertion)

      // Step 4: Redirect to dashboard (finishPasskeyLogin sets the user in context)
      window.location.href = "/dashboard"
    } catch (err: any) {
      // User cancelled the WebAuthn prompt (NotAllowedError) — don't show error
      if (err?.name === "NotAllowedError") {
        setError(null)
      } else {
        setError(err?.message || "Failed to authenticate with passkey")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <Button
          type="button"
          onClick={handlePasskeyLogin}
          disabled={loading}
          className="w-full"
          variant="outline"
          style={primaryColor ? { borderColor: primaryColor, color: primaryColor } : undefined}
        >
          {loading ? (
            <>
              <Loader className="mr-2 h-4 w-4 animate-spin" />
              Waiting for passkey...
            </>
          ) : (
            <>
              <Key className="mr-2 h-4 w-4" />
              Sign in with Passkey
            </>
          )}
        </Button>
      </motion.div>

      {error && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <Alert variant="destructive" className="bg-destructive/10 border-destructive/30">
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        </motion.div>
      )}
    </div>
  )
}
```

**Step 3: Pass email to PasskeyLoginButton in credentials-step.tsx**

Find the `<PasskeyLoginButton` usage in `credentials-step.tsx` and update:

```typescript
<PasskeyLoginButton email={email} primaryColor={primaryColor} loading={loading} />
```

Change to:

```typescript
<PasskeyLoginButton email={email} primaryColor={primaryColor} />
```

(Remove `onAuthenticate` and `loading` props — they no longer exist.)

**Step 4: Verify TypeScript**

```bash
cd apps/admin-portal
npx tsc --noEmit
```

**Step 5: Commit**

```bash
git add apps/admin-portal/components/auth/passkey-login-button.tsx \
        apps/admin-portal/components/auth/credentials-step.tsx \
        apps/admin-portal/package.json apps/admin-portal/package-lock.json
git commit -m "feat(fe): wire PasskeyLoginButton to real WebAuthn API via startPasskeyLogin/finishPasskeyLogin"
```

---

## Task 14: FE — dashboard settings page

**Files:**
- Modify: `apps/admin-portal/lib/types.ts`
- Modify: `apps/admin-portal/lib/queries.ts`
- Modify: `apps/admin-portal/components/dashboard/dashboard-sidebar.tsx`
- Create: `apps/admin-portal/app/dashboard/settings/page.tsx`

**Step 1: Add types to lib/types.ts**

Add at the end:

```typescript
export interface SocialProviderConfig {
  provider: string;
  enabled: boolean;
  clientId: string | null;
  hasSecret: boolean;
}

export interface TenantSettings {
  featureFlags: Record<string, boolean>;
  socialProviders: SocialProviderConfig[];
}
```

**Step 2: Add React Query hooks to lib/queries.ts**

```typescript
// ─── Tenant Settings ──────────────────────────────────────────

export function useTenantSettings() {
  return useQuery<TenantSettings>({
    queryKey: ["tenant", "settings"],
    queryFn: async () => {
      const res = await authClient.request({ url: apiUrl("/dashboard/tenant-settings"), method: "GET" });
      if (!res.ok) throw new Error("Failed to fetch tenant settings");
      return res.data.data;
    },
  });
}

export function useUpdateTenantSettings() {
  const qc = useQueryClient();
  return useMutation<void, Error, { featureFlags: Record<string, boolean> }>({
    mutationFn: async (body) => {
      const res = await authClient.request({
        url: apiUrl("/dashboard/tenant-settings"),
        method: "PATCH",
        body,
      });
      if (!res.ok) throw new Error("Failed to update settings");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant", "settings"] }),
  });
}

export function useUpdateSocialProvider() {
  const qc = useQueryClient();
  return useMutation<
    void,
    Error,
    { provider: string; enabled: boolean; clientId?: string; clientSecret?: string }
  >({
    mutationFn: async ({ provider, ...body }) => {
      const res = await authClient.request({
        url: apiUrl(`/dashboard/tenant-settings/social/${provider}`),
        method: "PATCH",
        body,
      });
      if (!res.ok) throw new Error("Failed to update social provider");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant", "settings"] }),
  });
}
```

Also add `TenantSettings, SocialProviderConfig` to the import from `./types` at the top of queries.ts.

**Step 3: Add Settings to dashboard-sidebar.tsx**

In the `navItems` array, add a new entry:

```typescript
import { LayoutDashboard, AppWindow, Shield, User, Settings, LogOut, ChevronRight, Lock } from "lucide-react"

const navItems = [
  { label: "Overview",      href: "/dashboard",              icon: LayoutDashboard },
  { label: "Applications",  href: "/dashboard/applications", icon: AppWindow },
  { label: "Security",      href: "/dashboard/security",     icon: Shield },
  { label: "Profile",       href: "/dashboard/profile",      icon: User },
  { label: "Settings",      href: "/dashboard/settings",     icon: Settings },
]
```

**Step 4: Create the settings page**

Create `apps/admin-portal/app/dashboard/settings/page.tsx`:

```typescript
"use client"

import { useState } from "react"
import { Button, Skeleton } from "@repo/ui"
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar"
import {
  useTenantSettings,
  useUpdateTenantSettings,
  useUpdateSocialProvider,
} from "@/lib/queries"
import { Globe, Key, Mail, Lock, ChevronDown, ChevronUp, Save } from "lucide-react"

const METHOD_FLAGS = [
  {
    key: "magicLinkEnabled",
    label: "Magic Link",
    description: "Let users sign in with a one-time link sent to their email",
    icon: Mail,
  },
  {
    key: "passkeyEnabled",
    label: "Passkey",
    description: "Let users sign in with biometrics or device PIN (WebAuthn)",
    icon: Key,
  },
]

const SOCIAL_PROVIDERS = [
  { id: "google",    label: "Google",    icon: "G" },
  { id: "github",    label: "GitHub",    icon: "GH" },
  { id: "microsoft", label: "Microsoft", icon: "M" },
]

export default function SettingsPage() {
  const { data: settings, isLoading } = useTenantSettings()
  const updateSettings = useUpdateTenantSettings()
  const updateSocial = useUpdateSocialProvider()

  const [expanded, setExpanded] = useState<string | null>(null)
  const [credentials, setCredentials] = useState<Record<string, { clientId: string; clientSecret: string }>>({})

  const toggleFlag = async (key: string, current: boolean) => {
    await updateSettings.mutateAsync({ featureFlags: { [key]: !current } })
  }

  const toggleSocial = async (provider: string, current: boolean) => {
    await updateSocial.mutateAsync({ provider, enabled: !current })
  }

  const saveSocialCredentials = async (provider: string) => {
    const creds = credentials[provider]
    if (!creds) return
    await updateSocial.mutateAsync({
      provider,
      enabled: true,
      clientId: creds.clientId,
      clientSecret: creds.clientSecret || undefined,
    })
    setExpanded(null)
  }

  if (isLoading) {
    return (
      <div className="flex h-screen">
        <DashboardSidebar />
        <main className="flex-1 overflow-y-auto p-8 space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        </main>
      </div>
    )
  }

  const flags = settings?.featureFlags || {}
  const socialProviders = settings?.socialProviders || []

  return (
    <div className="flex h-screen">
      <DashboardSidebar />
      <main className="flex-1 overflow-y-auto p-8 max-w-3xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Login Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Control which authentication methods are available to your users
          </p>
        </div>

        {/* Password — always on */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Core Methods
          </h2>
          <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                <Lock className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Password</p>
                <p className="text-xs text-muted-foreground">Always enabled — cannot be turned off</p>
              </div>
            </div>
            <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full font-medium">
              Always on
            </span>
          </div>
        </section>

        {/* Feature flag methods */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Passwordless Methods
          </h2>
          <div className="space-y-3">
            {METHOD_FLAGS.map(({ key, label, description, icon: Icon }) => {
              const enabled = flags[key] ?? false
              return (
                <div
                  key={key}
                  className="rounded-xl border border-border bg-card p-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${enabled ? "bg-primary/10" : "bg-muted"}`}>
                      <Icon className={`h-4 w-4 ${enabled ? "text-primary" : "text-muted-foreground"}`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground">{description}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleFlag(key, enabled)}
                    disabled={updateSettings.isPending}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled ? "bg-primary" : "bg-muted-foreground/30"}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-6" : "translate-x-1"}`}
                    />
                  </button>
                </div>
              )
            })}
          </div>
        </section>

        {/* Social providers */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Social Providers
          </h2>
          <div className="space-y-3">
            {SOCIAL_PROVIDERS.map(({ id, label, icon }) => {
              const providerConfig = socialProviders.find((p) => p.provider === id)
              const enabled = providerConfig?.enabled ?? false
              const isExpanded = expanded === id

              return (
                <div key={id} className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-lg font-semibold text-sm ${enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                        {icon}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground">
                          {providerConfig?.clientId ? "Custom credentials" : "Shared app"}
                          {providerConfig?.hasSecret ? " · Secret configured" : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setExpanded(isExpanded ? null : id)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => toggleSocial(id, enabled)}
                        disabled={updateSocial.isPending}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled ? "bg-primary" : "bg-muted-foreground/30"}`}
                      >
                        <span
                          className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-6" : "translate-x-1"}`}
                        />
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-border p-4 bg-muted/30 space-y-3">
                      <p className="text-xs text-muted-foreground">
                        Optional: override with your own OAuth app credentials. Leave blank to use shared Fort Knox app.
                      </p>
                      <div className="space-y-2">
                        <label className="text-xs font-medium">Client ID</label>
                        <input
                          type="text"
                          placeholder={providerConfig?.clientId || "Leave blank for shared app"}
                          defaultValue={providerConfig?.clientId || ""}
                          onChange={(e) =>
                            setCredentials((prev) => ({
                              ...prev,
                              [id]: { ...prev[id], clientId: e.target.value },
                            }))
                          }
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-medium">Client Secret</label>
                        <input
                          type="password"
                          placeholder={providerConfig?.hasSecret ? "••••••••••••" : "Leave blank for shared app"}
                          onChange={(e) =>
                            setCredentials((prev) => ({
                              ...prev,
                              [id]: { ...prev[id], clientSecret: e.target.value },
                            }))
                          }
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={() => saveSocialCredentials(id)}
                        disabled={updateSocial.isPending}
                      >
                        <Save className="h-3 w-3 mr-1" />
                        Save credentials
                      </Button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      </main>
    </div>
  )
}
```

**Step 5: Verify TypeScript**

```bash
cd apps/admin-portal
npx tsc --noEmit
```

**Step 6: Commit**

```bash
git add apps/admin-portal/lib/types.ts \
        apps/admin-portal/lib/queries.ts \
        apps/admin-portal/components/dashboard/dashboard-sidebar.tsx \
        apps/admin-portal/app/dashboard/settings/
git commit -m "feat(fe): add tenant settings page with method toggles and social provider credentials"
```

---

## Final verification

After all 14 tasks:

1. Start the backend: `cd apps/auth-service && npm run dev`
2. Start the frontend: `cd apps/admin-portal && npm run dev`
3. Test social login: Go to `/u/login`, enter an email, select Google → should redirect to Google → come back to `/u/auth/callback` → should redirect to `/dashboard`
4. Test magic link: Select "Magic Link" method → enter email → check console for the raw token → open `/u/magic-link?token=<token>` → should sign in and redirect to `/dashboard`
5. Test passkey: Select "Passkey" method → click "Sign in with Passkey" → browser WebAuthn prompt should appear
6. Test settings: Go to `/dashboard/settings` → toggle Magic Link on/off → refresh login page and verify `login-intent` reflects the change

# SCROLLOOP SENTRY — SPRINT 5: ENTERPRISE PROTOCOLS
# Branch: sprint-5
# Source: sprint-status.md Sprint 4 items (SAML, SCIM, LDAP, Webhooks)
#
# READ CLAUDE.md BEFORE TOUCHING ANY FILE.
# READ EVERY FILE BEFORE EDITING IT.
# COMMIT AFTER EACH COMPLETED ITEM.

---

## CONTEXT

All four enterprise protocol modules have scaffolded implementations:
- SAML: SP CRUD, IdP metadata, assertion generation (unsigned — critical gap)
- SCIM: Full CRUD for users/groups, bearer token service
- LDAP: Connection CRUD, sync logic (no BullMQ schedule)
- Webhook: Service + processor + SSRF protection (never called from auth events)

Five tracks run in parallel. Spawn one agent per track.

---

## IRONCLAD RULES — ALL TRACKS — NO EXCEPTIONS

1. Read every file fully before editing it.
2. Zero mock data. Zero hardcoded arrays.
3. Zero console.log in production code.
4. Zero TypeScript `any` in new or edited code.
5. Zero raw fetch() calls in frontend.
6. Use Pino logger (`logger` from `@/common/logger`).
7. Backend rule: do not touch frontend files. Frontend rule: do not touch backend files.
8. Run `npx jest --passWithNoTests` from `apps/auth-service` after every backend change.
9. Run `npx tsc --noEmit` from `apps/admin-portal` after every frontend change.

---

## TRACK 1 — SAML XML SIGNING (backend only)

**Files to read first:**
- `apps/auth-service/src/modules/saml/saml.service.ts`
- `apps/auth-service/src/modules/saml/saml.controller.ts`
- `apps/auth-service/src/modules/saml/saml.module.ts`
- `packages/database/src/entities/saml-service-provider.entity.ts`
- `packages/database/src/entities/key-pair.entity.ts`

**Goal:** The SAML assertion generator produces XML but does NOT sign it. Enterprise
IdPs reject unsigned assertions. Add XML digital signatures using `xml-crypto`.

### 1a — Install dependency

```bash
cd apps/auth-service && yarn add xml-crypto
```

Note: `xml-crypto` depends on `xmldom` which it ships internally. Do not install xmldom separately.

### 1b — Implement signing helper in SamlService

The service already has access to `KeyPair` entities. Check if `KeyPairRepository` is
injected. If not, add `@InjectRepository(KeyPair) private keyPairRepo: Repository<KeyPair>`.

Also inject `EncryptionService` from `@repo/security` to decrypt the private key.

Add a private method `signSamlAssertion`:

```typescript
private async signSamlAssertion(
  assertionXml: string,
  tenantId: string,
): Promise<string> {
  const keyPair = await this.keyPairRepo.findOne({
    where: { tenantId, status: 'active' },
    order: { createdAt: 'DESC' },
  });
  if (!keyPair) throw new InternalServerErrorException('No active signing key for tenant');

  const privateKeyPem = await EncryptionService.decrypt(
    keyPair.encryptedPrivateKey,
    keyPair.iv,
    keyPair.authTag,
    this.config.getOrThrow<string>('MASTER_ENCRYPTION_KEY'),
  );

  const { SignedXml } = await import('xml-crypto');
  const sig = new SignedXml({ privateKey: privateKeyPem });
  sig.addReference({
    xpath: '//*[local-name(.)="Assertion"]',
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/2001/10/xml-exc-c14n#',
    ],
  });
  sig.signatureAlgorithm = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
  sig.canonicalizationAlgorithm = 'http://www.w3.org/2001/10/xml-exc-c14n#';
  const certPem = keyPair.publicKeyPem
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\n/g, '');
  sig.keyInfoProvider = {
    getKeyInfo: () => `<ds:X509Data><ds:X509Certificate>${certPem}</ds:X509Certificate></ds:X509Data>`,
    getKey: () => Buffer.from(privateKeyPem),
  };
  sig.computeSignature(assertionXml);
  return sig.getSignedXml();
}
```

### 1c — Wire signing into createSamlResponse

In `createSamlResponse()`, after building the `assertion` string:
```typescript
const signedAssertion = await this.signSamlAssertion(assertion, tenantId);
// Replace the unsigned assertion in the response XML with the signed one
const response = `<?xml version="1.0"?>
<samlp:Response ...>
  ...
  ${signedAssertion}
</samlp:Response>`;
```

### 1d — Wire SP-initiated SSO controller

Update `handlePostSSO` in `saml.controller.ts`.
When the request has a valid JWT cookie (check `req.cookies?.access_token` or similar),
build and return the auto-submit HTML form. Otherwise, redirect to login as before.

```typescript
@Public()
@Post('sso/:spId')
@HttpCode(HttpStatus.OK)
async handlePostSSO(
  @Param('spId') spId: string,
  @Body('SAMLRequest') samlRequest: string,
  @Body('RelayState') relayState: string,
  @Req() req: Request,
  @Res() res: Response,
) {
  // If user is authenticated, issue assertion immediately
  if (req.user?.sub && req.tenantId) {
    const user = await this.userService.findById(req.tenantId, req.user.sub);
    const { postUrl, samlResponse, relayState: rs } = await this.samlService.createSamlResponse(
      spId, req.tenantId, req.tenant?.slug ?? '', user, relayState,
    );
    const html = `<!DOCTYPE html><html><body onload="document.forms[0].submit()">
<form method="POST" action="${postUrl}">
  <input type="hidden" name="SAMLResponse" value="${samlResponse}"/>
  <input type="hidden" name="RelayState" value="${rs}"/>
  <noscript><button type="submit">Continue</button></noscript>
</form></body></html>`;
    return res.send(html);
  }
  // Not authenticated — redirect to login
  res.redirect(`/u/login?saml_sp=${encodeURIComponent(spId)}&relay=${encodeURIComponent(relayState ?? '')}`);
}
```

### 1e — Write tests

File: `apps/auth-service/src/modules/saml/saml.service.spec.ts`

Test the following:
1. `getIdpMetadata('test-slug')` returns XML containing `EntityDescriptor` and `IDPSSODescriptor`
2. `createSamlResponse()` returns a `samlResponse` that when base64-decoded contains `<samlp:Response` and the user's email
3. `findSP()` throws `NotFoundException` when SP does not exist (mock spRepo.findOne to return null)
4. `createSamlResponse()` throws `BadRequestException` when SP is inactive (active: false)

Use `generateKeyPairSync('rsa', ...)` from `crypto` to produce test keys. Mock `EncryptionService.decrypt` to return the test private key PEM. Mock `xml-crypto` to return a signed XML stub (or use a real key and verify `<ds:Signature>` appears in output).

### 1f — Commit

```
feat(saml): implement XML signing for SAML assertions via xml-crypto
```

---

## TRACK 2 — WEBHOOK EVENT DISPATCH (backend only)

**Files to read first:**
- `apps/auth-service/src/modules/webhook/webhook.service.ts` — `emit()` method
- `apps/auth-service/src/modules/webhook/webhook.module.ts`
- `apps/auth-service/src/modules/auth/auth.service.ts`
- `apps/auth-service/src/modules/auth/auth.module.ts`
- `apps/auth-service/src/modules/user/` — find user service file
- `apps/auth-service/src/modules/mfa/mfa.service.ts` (or wherever MFA enrollment is)

**Goal:** `WebhookService.emit()` exists but nothing calls it. Wire it into auth,
user, and MFA flows so events are dispatched on real actions.

### 2a — Export WebhookService from WebhookModule

Read `webhook.module.ts`. If `WebhookService` is not in `exports`, add it.

### 2b — Inject WebhookService into AuthModule

In `auth.module.ts`, add `WebhookModule` to `imports`.
In `auth.service.ts`, add to constructor:
```typescript
private readonly webhookService: WebhookService,
```

### 2c — Emit login events in AuthService

Find the `login()` method. After successful password verification and JWT issuance:
```typescript
void this.webhookService.emit(tenantId, 'login.success', {
  userId: user.id,
  email: user.email,
  method: 'password',
  timestamp: new Date().toISOString(),
});
```

After a failed login attempt (wrong password):
```typescript
void this.webhookService.emit(tenantId, 'login.failed', {
  email: dto.email,
  reason: 'invalid_credentials',
  timestamp: new Date().toISOString(),
});
```

Use `void` — fire-and-forget. Webhook dispatch must NEVER block the login response.

### 2d — Emit user.created from UserService

Find `createUser()` or `inviteUser()` in the user module.
Add `WebhookModule` to the user module's imports.
Inject `WebhookService` into `UserService`.
After a user is persisted:
```typescript
void this.webhookService.emit(tenantId, 'user.created', {
  userId: user.id,
  email: user.email,
  timestamp: new Date().toISOString(),
});
```

### 2e — Emit user.suspended from UserService

Find the suspend method. After suspension:
```typescript
void this.webhookService.emit(tenantId, 'user.suspended', {
  userId: user.id,
  reason: suspendReason,
  timestamp: new Date().toISOString(),
});
```

### 2f — Emit mfa.enrolled from MFA service

Find the TOTP/WebAuthn verification/enrollment completion point.
After enrollment is persisted:
```typescript
void this.webhookService.emit(tenantId, 'mfa.enrolled', {
  userId: user.id,
  method: 'totp', // or 'webauthn'
  timestamp: new Date().toISOString(),
});
```

### 2g — Write webhook service tests

File: `apps/auth-service/src/modules/webhook/webhook.service.spec.ts`

Test:
1. SSRF: `create()` with `url: 'https://localhost/hook'` throws `BadRequestException`
2. SSRF: `create()` with `url: 'https://192.168.0.1/hook'` throws `BadRequestException`
3. `emit()` with two endpoints (one matching, one not) — only one BullMQ job enqueued
4. `emit()` with a wildcard endpoint — job is enqueued for any event type
5. `rotateSecret()` returns a new secret string and saves it

Mock setup for webhook tests:
```typescript
const mockEndpointRepo = { find: jest.fn(), findOne: jest.fn(), create: jest.fn(), save: jest.fn(), softDelete: jest.fn() };
const mockDeliveryRepo = { find: jest.fn(), findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
const mockQueue = { add: jest.fn().mockResolvedValue(undefined) };
```

Note: The `create()` method calls `validateWebhookUrl()` which does real DNS lookups.
Mock `dns.lookup` to control resolved IPs in tests:
```typescript
jest.mock('dns/promises', () => ({
  lookup: jest.fn(),
}));
import * as dns from 'dns/promises';
const mockDnsLookup = dns.lookup as jest.Mock;
```

For SSRF tests, `mockDnsLookup.mockResolvedValue([{ address: '192.168.0.1', family: 4 }])`.
For valid URL tests, `mockDnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])`.

### 2h — Update existing tests broken by WebhookService injection

After injecting WebhookService into AuthService, existing auth tests will fail with
"Nest can't resolve dependencies". Add a mock WebhookService to every auth test module:
```typescript
{ provide: WebhookService, useValue: { emit: jest.fn().mockResolvedValue(undefined) } }
```

Search for all auth test files:
```bash
find apps/auth-service/src/modules/auth -name "*.spec.ts"
```

### 2i — Commit

```
feat(webhook): wire event dispatch from auth/user/mfa flows
```

---

## TRACK 3 — LDAP SCHEDULED SYNC (backend only)

**Files to read first:**
- `apps/auth-service/src/modules/ldap/ldap.service.ts` (read all 268 lines)
- `apps/auth-service/src/modules/ldap/ldap.module.ts`
- `apps/auth-service/src/modules/ldap/ldap.controller.ts`
- `apps/auth-service/src/app.module.ts` — check BullMQ registration pattern

**Goal:** LDAP sync exists (`syncNow()`) but runs only via manual API trigger.
Add BullMQ repeat jobs so each active connection syncs on its configured interval.

### 3a — Add BullMQ queue to LdapModule

In `ldap.module.ts`:
```typescript
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    TypeOrmModule.forFeature([LdapConnection, User]),
    BullModule.registerQueue({ name: 'ldap-sync' }),
    GuardsModule,
  ],
  ...
})
```

Check `app.module.ts` to see how BullMQ is globally configured (BullModule.forRootAsync).
The queue registration here just declares the queue name — BullMQ handles the Redis connection globally.

### 3b — Create LDAP sync processor

Create `apps/auth-service/src/modules/ldap/ldap.processor.ts`:

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { LdapService } from './ldap.service';
import { logger } from '@/common/logger';

@Processor('ldap-sync')
export class LdapSyncProcessor extends WorkerHost {
  constructor(private readonly ldapService: LdapService) {
    super();
  }

  async process(job: Job<{ connectionId: string; tenantId: string }>): Promise<void> {
    const { connectionId, tenantId } = job.data;
    logger.info({ tenantId, connectionId }, 'LDAP sync job started');
    try {
      const result = await this.ldapService.syncNow(tenantId, connectionId);
      logger.info({ tenantId, connectionId, ...result }, 'LDAP sync complete');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ tenantId, connectionId, message }, 'LDAP sync job failed');
      throw err; // BullMQ will retry per job config
    }
  }
}
```

Add `LdapSyncProcessor` to `ldap.module.ts` providers.

### 3c — Schedule on create/update

In `LdapService`, inject the queue:
```typescript
@InjectQueue('ldap-sync') private ldapQueue: Queue,
```

Add a private helper:
```typescript
private async scheduleSync(conn: LdapConnection): Promise<void> {
  if (!conn.active || conn.syncIntervalMinutes <= 0) return;
  await this.ldapQueue.add(
    'sync',
    { connectionId: conn.id, tenantId: conn.tenantId },
    {
      repeat: { every: conn.syncIntervalMinutes * 60 * 1000 },
      jobId: `ldap-sync-${conn.id}`,
    },
  );
}

private async cancelSync(connId: string, intervalMinutes: number): Promise<void> {
  await this.ldapQueue.removeRepeatable('sync', {
    every: intervalMinutes * 60 * 1000,
    jobId: `ldap-sync-${connId}`,
  }).catch(() => {}); // best-effort
}
```

Call `await this.scheduleSync(conn)` after `create()` and `update()`.
Call `await this.cancelSync(conn.id, conn.syncIntervalMinutes)` before `delete()`.

### 3d — Write tests

File: `apps/auth-service/src/modules/ldap/ldap.service.spec.ts`

Mock setup:
```typescript
const mockConnRepo = { findOne: jest.fn(), find: jest.fn(), create: jest.fn(), save: jest.fn(), softDelete: jest.fn() };
const mockUserRepo = { findOne: jest.fn() };
const mockQueue = { add: jest.fn().mockResolvedValue(undefined), removeRepeatable: jest.fn().mockResolvedValue(undefined) };
```

Tests:
1. `syncNow()` throws `NotFoundException` when connection not found (mockConnRepo.findOne returns null)
2. `syncNow()` throws `BadRequestException` when connection is inactive
3. `create()` calls `ldapQueue.add` with correct repeat interval (mock LDAP bind to succeed)
4. `delete()` calls `ldapQueue.removeRepeatable` before removing the record

Note: `syncNow()` internally calls `ldapjs.createClient()` and `client.bind()`. Mock these:
```typescript
jest.mock('ldapjs', () => ({
  createClient: jest.fn().mockReturnValue({
    bind: jest.fn((dn, pw, cb) => cb(null)),
    search: jest.fn((base, opts, cb) => cb(null, {
      on: jest.fn((evt, handler) => {
        if (evt === 'end') setTimeout(() => handler({ status: 0 }), 0);
      }),
    })),
    unbind: jest.fn(),
  }),
}));
```

### 3e — Commit

```
feat(ldap): add BullMQ scheduled sync with per-connection interval
```

---

## TRACK 4 — SCIM TENANT ISOLATION + TESTS (backend only)

**Files to read first:**
- `apps/auth-service/src/modules/scim/scim.service.ts` (all 236 lines)
- `apps/auth-service/src/modules/scim/scim.controller.ts` (all 240 lines)
- `apps/auth-service/src/modules/scim/scim-token.service.ts` (all 54 lines)
- `apps/auth-service/src/modules/scim/scim.guard.ts` (all 28 lines)
- `packages/database/src/entities/` — find all SCIM-related entities

**Goal:** Audit SCIM for tenant isolation, then write comprehensive tests.

### 4a — Audit and fix tenant isolation

Read `scim.service.ts` completely. For every database query:
- `this.userRepo.find(...)` — must include `{ where: { tenantId } }`
- `this.userRepo.findOne(...)` — must include `{ where: { id, tenantId } }`
- `this.groupRepo.find/findOne/save` — same requirement
- `this.userGroupRepo` — must filter by group that belongs to the tenant

Check how `tenantId` flows from controller → service. The controller receives
`req.user.tid` from the SCIM auth guard. Verify every service method receives
`tenantId` as a parameter and passes it to every query.

If any query is missing the `tenantId` filter: add it.

### 4b — Write SCIM service tests

File: `apps/auth-service/src/modules/scim/scim.service.spec.ts`

Mock setup:
```typescript
const mockUserRepo = {
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  create: jest.fn().mockImplementation((v) => v),
  save: jest.fn().mockImplementation((v) => ({ id: 'new-id', ...v })),
  count: jest.fn().mockResolvedValue(0),
};
const mockGroupRepo = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue(null), create: jest.fn(), save: jest.fn() };
const mockUserGroupRepo = { find: jest.fn().mockResolvedValue([]), create: jest.fn(), save: jest.fn(), delete: jest.fn() };
```

Tests:
1. `listUsers('tenant-1', baseUrl, 1, 10)` — `userRepo.find` called with `where: { tenantId: 'tenant-1' }`
2. `listUsers` returns a `ListResponse` with correct `schemas` and `totalResults`
3. `createUser('tenant-1', baseUrl, scimUser)` — `userRepo.findOne` first (conflict check), then `save` with `tenantId: 'tenant-1'`
4. `createUser` throws `ConflictException` when user already exists
5. `getUser('tenant-1', baseUrl, 'user-id')` throws `NotFoundException` when user not found
6. `listGroups('tenant-1', baseUrl, 1, 10)` — `groupRepo.find` called with `where: { tenantId: 'tenant-1' }`

Write one SCIM guard test:
```typescript
describe('ScimAuthGuard', () => {
  it('returns false with no Authorization header', async () => {
    mockScimTokenService.validateToken = jest.fn();
    const guard = new ScimAuthGuard(mockScimTokenService);
    const ctx = { switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }) } as any;
    expect(await guard.canActivate(ctx)).toBe(false);
  });

  it('returns true with valid Bearer token and sets req.user', async () => {
    const token = { id: 't1', tenantId: 'tenant-abc' };
    mockScimTokenService.validateToken = jest.fn().mockResolvedValue(token);
    const req = { headers: { authorization: 'Bearer abc123' }, user: undefined };
    const guard = new ScimAuthGuard(mockScimTokenService);
    const ctx = { switchToHttp: () => ({ getRequest: () => req }) } as any;
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(req.user).toMatchObject({ tid: 'tenant-abc' });
  });
});
```

### 4c — Commit

```
feat(scim): tenant isolation audit and comprehensive SCIM tests
```

---

## TRACK 5 — ENTERPRISE UI (frontend only)

**Files to read first:**
- `apps/admin-portal/app/t/[slug]/settings/page.tsx`
- `apps/admin-portal/lib/queries.ts`
- `apps/admin-portal/lib/admin-client.ts` (find the actual file path first with find)
- `apps/admin-portal/app/t/[slug]/` — list all subdirectories to understand structure

**Goal:** Build settings pages for webhooks, SAML, SCIM, and LDAP. All wired to real APIs.
No mock data. Use CSS variable tokens. No hardcoded colors or spacing.

### 5a — Find admin client and add methods

Run:
```bash
find apps/admin-portal/lib apps/admin-portal/hooks -name "*.ts" | head -20
```
Find where `adminClient` methods are defined. Read that file.

Add these client methods (use same pattern as existing methods in the file):
```typescript
// Webhooks
webhooks: {
  list: (tenantSlug: string) => GET(`/api/webhooks?tenantSlug=${tenantSlug}`)
  create: (tenantSlug: string, data: CreateWebhookDto) => POST(`/api/webhooks`, data)
  update: (id: string, data: UpdateWebhookDto) => PATCH(`/api/webhooks/${id}`, data)
  delete: (id: string) => DELETE(`/api/webhooks/${id}`)
  rotateSecret: (id: string) => POST(`/api/webhooks/${id}/rotate-secret`)
  deliveries: (endpointId: string) => GET(`/api/webhooks/${endpointId}/deliveries`)
  redeliver: (endpointId: string, deliveryId: string) => POST(`/api/webhooks/${endpointId}/deliveries/${deliveryId}/redeliver`)
  sendTest: (endpointId: string) => POST(`/api/webhooks/${endpointId}/test`)
}
// SAML SPs
saml: {
  listSPs: () => GET('/api/saml/sps')
  createSP: (data: CreateSPDto) => POST('/api/saml/sps', data)
  updateSP: (id: string, data: UpdateSPDto) => PATCH(`/api/saml/sps/${id}`, data)
  deleteSP: (id: string) => DELETE(`/api/saml/sps/${id}`)
}
// SCIM tokens
scim: {
  listTokens: () => GET('/api/scim/tokens')
  createToken: (data: { name: string; expiresInDays?: number }) => POST('/api/scim/tokens', data)
  revokeToken: (id: string) => DELETE(`/api/scim/tokens/${id}`)
}
// LDAP connections
ldap: {
  list: () => GET('/api/ldap/connections')
  create: (data: CreateLdapDto) => POST('/api/ldap/connections', data)
  update: (id: string, data: UpdateLdapDto) => PATCH(`/api/ldap/connections/${id}`, data)
  delete: (id: string) => DELETE(`/api/ldap/connections/${id}`)
  test: (id: string) => POST(`/api/ldap/connections/${id}/test`)
  syncNow: (id: string) => POST(`/api/ldap/connections/${id}/sync`)
}
```

### 5b — Add React Query hooks to queries.ts

Add the hooks following the existing pattern in `queries.ts`:
```typescript
export const useWebhookEndpoints = (slug: string) =>
  useQuery({ queryKey: ['webhooks', slug], queryFn: () => adminClient.webhooks.list(slug) });

export const useCreateWebhookEndpoint = (slug: string) =>
  useMutation({ mutationFn: (data: CreateWebhookDto) => adminClient.webhooks.create(slug, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['webhooks', slug] }) });

// ... same pattern for all operations above
```

### 5c — Webhook settings page

Create `apps/admin-portal/app/t/[slug]/settings/webhooks/page.tsx`:

```
┌─────────────────────────────────────────────────────┐
│ Webhooks                         [Add Endpoint]      │
├─────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────┐ │
│ │ https://api.example.com/hooks   ● Active         │ │
│ │ Events: login.success, user.created              │ │
│ │ [View Deliveries] [Edit] [Rotate Secret] [Delete]│ │
│ └─────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────┐ │
│ │ https://hooks.zapier.com/...    ○ Inactive       │ │
│ │ Events: * (all events)                           │ │
│ │ [View Deliveries] [Edit] [Rotate Secret] [Delete]│ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

"Add Endpoint" opens a modal:
- URL field (required)
- Events multi-select checkboxes: `login.success`, `login.failed`, `user.created`,
  `user.suspended`, `mfa.enrolled`, `*` (all events)
- Submit: calls `useCreateWebhookEndpoint`
- On success: shows the secret ONCE in a highlighted box with copy button + "I've saved this secret" checkbox required before closing

"Rotate Secret" opens confirmation modal → shows new secret once.
"Delete" opens confirmation dialog (no type-to-confirm needed for webhooks).

### 5d — SAML settings page

Create `apps/admin-portal/app/t/[slug]/settings/saml/page.tsx`:

```
┌─────────────────────────────────────────────────────┐
│ IdP Metadata URL                                     │
│ https://api.sentry.scrolloop.com/saml/metadata/{slug}│
│ [Copy]                                               │
├─────────────────────────────────────────────────────┤
│ Service Providers                [Register SP]       │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Salesforce           ● Active                    │ │
│ │ Entity: https://salesforce.com                   │ │
│ │ ACS: https://salesforce.com/sso/saml             │ │
│ │ [Edit] [Delete]                                  │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

"Register SP" opens modal with: name, Entity ID, ACS URL, SLO URL (optional),
Name ID format select, attribute mapping key-value editor.

### 5e — SCIM settings page

Create `apps/admin-portal/app/t/[slug]/settings/scim/page.tsx`:

```
┌─────────────────────────────────────────────────────┐
│ SCIM Provisioning                                    │
│                                                      │
│ Base URL                                             │
│ https://api.sentry.scrolloop.com/scim/v2/ [Copy]    │
│                                                      │
│ Bearer Tokens                    [Generate Token]    │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Okta Production   Expires 2026-12-31   [Revoke] │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

"Generate Token" → modal with name + expiry (optional).
On success: show token value ONCE with copy button.

### 5f — LDAP settings page

Create `apps/admin-portal/app/t/[slug]/settings/ldap/page.tsx`:

```
┌─────────────────────────────────────────────────────┐
│ LDAP Sync                        [Add Connection]    │
├─────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────┐ │
│ │ ldap.company.com:389   ● Active                  │ │
│ │ Last sync: 2 hours ago | Every 60 min            │ │
│ │ [Sync Now] [Test] [Edit] [Delete]                │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

"Add Connection" → modal: host, port, bind DN, base DN, bind password (masked),
user filter, sync interval minutes, group→role mapping table.

"Sync Now" → calls `useTriggerLdapSync`, shows spinner on button.
"Test" → calls `useTestLdapConnection`, shows inline result.

### 5g — Wire settings navigation

Read `apps/admin-portal/app/t/[slug]/settings/page.tsx` completely.
Find where the settings tabs/nav is defined. Add tabs for:
- Webhooks → `/t/${slug}/settings/webhooks`
- SAML → `/t/${slug}/settings/saml`
- SCIM → `/t/${slug}/settings/scim`
- LDAP → `/t/${slug}/settings/ldap`

If the settings page uses a tab component, add the new tabs to it.
If it uses a sidebar nav, add nav items.

### 5h — Typecheck

```bash
npx tsc --noEmit
```

Fix all errors before committing.

### 5i — Commit

```
feat(ui): enterprise protocol settings — webhooks, SAML, SCIM, LDAP
```

---

## ORDER OF EXECUTION

All 5 tracks run in parallel. Each track is independent of the others.

**Merge order after all tracks complete (to minimize conflicts):**
1. Track 4 (SCIM tests) — touches only scim module
2. Track 3 (LDAP schedule) — touches only ldap module
3. Track 1 (SAML signing) — touches only saml module
4. Track 2 (Webhook dispatch) — touches auth + user + mfa modules (potential conflicts)
5. Track 5 (UI) — frontend only, no backend conflicts

**After all merges:**
```bash
cd apps/auth-service && npx jest --passWithNoTests
cd apps/admin-portal && npx tsc --noEmit
```

Fix any test failures. New DI injections (WebhookService in AuthService) will break
existing auth spec files — add mock provider to each.

---

## DONE WHEN

- [ ] `cd apps/auth-service && npx jest --passWithNoTests` passes with ≥119 tests
- [ ] `cd apps/admin-portal && npx tsc --noEmit` passes with zero errors
- [ ] SAML assertion XML contains `<ds:Signature>` (verified by test)
- [ ] `login.success` webhook event dispatched on password login (void, non-blocking)
- [ ] `user.created` webhook event dispatched on user creation
- [ ] `mfa.enrolled` webhook event dispatched on TOTP enrollment
- [ ] LDAP `create()` enqueues a BullMQ repeat job (verified by test)
- [ ] SCIM `listUsers` filters by `tenantId` (verified by test)
- [ ] SCIM token guard rejects missing/invalid tokens (verified by test)
- [ ] SSRF tests pass: localhost, 10.x, 192.168.x, IPv4-mapped IPv6 all rejected
- [ ] Webhook settings page renders endpoint list from real API
- [ ] SAML settings page shows SP list and renders IdP metadata URL
- [ ] SCIM settings page shows token list, generates token shown once
- [ ] LDAP settings page shows connection list with Sync Now / Test buttons
- [ ] Zero hardcoded hex colors in new components
- [ ] Zero raw fetch() in frontend components
- [ ] Zero console.log in backend
- [ ] Zero TypeScript `any` in new or changed files

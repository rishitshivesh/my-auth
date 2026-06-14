Audit everything on the repo, and ensure the signing keys, type and everything is in check, no any or bad code should be there. Once that is done, implement the following, we had moved all keys to argon, for consistency, this is the context.


Once everything is done, create a docs/<filename> as track of what you are doing, saving the plan, implementation status and other things properly. Handle this well.




```
# SCROLLOOP SENTRY — SPRINT 2
# IAM Policy Engine + Schema Migration + Rename + UI Foundation
# Read CLAUDE.md fully before touching any file.

---

## SPRINT OVERVIEW

Sprint 1 and 1b are complete. The security foundations are solid:
RS256 JWT signing, real JWKS endpoint, session secret from env,
CORS from env, Helmet, rate limiting, admin endpoints, invite flow,
audit log, schema-per-tenant groundwork.

This sprint has four tracks. Work them in dependency order as listed.

TRACK 1 → Rename (Fort Knox → Scrolloop Sentry) — 30 min, no logic changes
TRACK 2 → IAM Policy Engine — the core RBAC rewrite
TRACK 3 → Schema Migration Script — move existing data to fk_{slug} schemas
TRACK 4 → UI Foundation — Stitch MCP first, then implement

---

## TRACK 1: PROJECT RENAME

This is cosmetic only. Find-and-replace. No logic changes.

### 1a — Search and replace all references:

Find: "Fort Knox" → Replace: "Scrolloop Sentry"
Find: "FortKnox" → Replace: "ScrolloopSentry"
Find: "fortknox" → Replace: "sentry" (in package names, npm scope, env vars)
Find: "fort-knox" → Replace: "scrolloop-sentry"
Find: "FORT_KNOX" → Replace: "SENTRY" (in env var names)
Find: "@fortknox/" → Replace: "@scrolloop/"

### 1b — Files to rename:
- packages/fortknox-sdk/ → packages/sdk-typescript/
  (already may be named this — check first, don't double-rename)

### 1c — Package.json updates:
In every package.json in the monorepo:
- name: "@fortknox/..." → "@scrolloop/..."
- description: update to mention "Scrolloop Sentry"

### 1d — Env var renames in env.validation.ts:
```

FORT_KNOX_BASE_URL → SENTRY_BASE_URL FORT_KNOX_JWT_SECRET → SENTRY_JWT_SECRET (if exists)

```
Update .env.example with new names + descriptions.

### 1e — Update CLAUDE.md and GEMINI.md in repo root:
Replace with the versions from docs/ui/CLAUDE.md and docs/ui/GEMINI.md
(already provided in the docs/ui/ folder — just copy them to repo root).

### 1f — README.md:
Update product name, tagline ("Identity, engineered for trust"),
and domain (sentry.scrolloop.com).

After rename: run `grep -r "fortknox\|Fort Knox\|FortKnox" . \
  --include="*.ts" --include="*.tsx" --include="*.json" \
  --include="*.md" --exclude-path="*/node_modules/*"` 
The output must be empty.

---

## TRACK 2: IAM POLICY ENGINE

The current RBAC is roles + permissions (basic RBAC).
The target is AWS IAM-level: Policy documents with Allow/Deny,
wildcard matching, conditions, deny-overrides-allow evaluation,
permission boundaries, groups/OUs, and policy simulation.

Read these files first before writing anything:
- apps/auth-service/src/modules/rbac/
- apps/auth-service/src/common/guards/permissions.guard.ts
- apps/auth-service/src/modules/user/entities/user.entity.ts

### 2a — Policy Entity

File: apps/auth-service/src/modules/rbac/entities/policy.entity.ts

```typescript
@Entity('policies')
export class Policy {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() tenantId: string;
  @Column() name: string;
  @Column({ nullable: true }) description: string;
  @Column({ type: 'jsonb' }) document: PolicyDocument;
  @Column({ default: false }) isSystem: boolean; // immutable system policies
  @Column({ type: 'varchar', default: 'inline' })
  type: 'inline' | 'managed'; // managed = reusable, inline = attached to one thing
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
```

PolicyDocument type (define in types/policy.types.ts):
```typescript
interface PolicyDocument {
  Version: string;          // '2024-01-01'
  Statement: PolicyStatement[];
}

interface PolicyStatement {
  Sid?: string;             // optional statement ID
  Effect: 'Allow' | 'Deny';
  Principal?: string | string[] | '*';  // who this applies to
  Action: string | string[];            // e.g. 'users:read' or ['users:*', 'sessions:read']
  Resource: string | string[];          // e.g. 'sentry:tenant:*/user:*'
  Condition?: PolicyCondition;
}

interface PolicyCondition {
  IpAddress?: { 'sentry:SourceIp': string | string[] };
  DateGreaterThan?: { 'sentry:CurrentTime': string };
  DateLessThan?: { 'sentry:CurrentTime': string };
  Bool?: { 'sentry:MultiFactorAuthPresent': boolean };
  StringEquals?: Record<string, string | string[]>;
}
```

### 2b — Group / OU Entity

File: apps/auth-service/src/modules/rbac/entities/group.entity.ts

```typescript
@Entity('groups')
export class Group {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() tenantId: string;
  @Column() name: string;
  @Column({ nullable: true }) description: string;
  @Column({ nullable: true }) parentGroupId: string; // for nested OUs
  @Column({ default: '/' }) path: string;            // '/' or '/Engineering/Backend/'
  @Column({ default: false }) isSystem: boolean;
  @CreateDateColumn() createdAt: Date;
}
```

UserGroup join entity: users can belong to multiple groups.
GroupPolicy join entity: groups can have multiple policies attached.
UserPolicy join entity: users can have inline policies attached directly.
RolePolicy join entity: roles can have policies attached.

### 2c — PolicyEvaluationService

File: apps/auth-service/src/modules/rbac/policy-evaluation.service.ts

This is the core of the IAM engine. Implement it carefully.

```typescript
@Injectable()
export class PolicyEvaluationService {
  constructor(
    @InjectRepository(Policy) private policyRepo: Repository<Policy>,
    @InjectRepository(UserRole) private userRoleRepo: Repository<UserRole>,
    @InjectRepository(UserGroup) private userGroupRepo: Repository<UserGroup>,
    private cacheService: RbacCacheService,
  ) {}

  /**
   * The core evaluation method.
   * Returns true if the action is allowed, false if denied.
   *
   * Evaluation order (matches AWS IAM logic):
   * 1. If any policy has an explicit DENY → deny (always wins)
   * 2. If any policy has an explicit ALLOW → allow
   * 3. Default → deny (implicit deny)
   */
  async evaluate(request: EvaluationRequest): Promise<EvaluationResult> {
    const { userId, tenantId, action, resource, context } = request;

    // Collect all applicable policies for this user:
    // - inline user policies
    // - policies from user's roles
    // - policies from user's groups
    // - policies from group's parent groups (walk up the OU tree)
    const policies = await this.collectPolicies(userId, tenantId);

    let explicitAllow = false;
    const deniedBy: string[] = [];
    const allowedBy: string[] = [];

    for (const policy of policies) {
      for (const statement of policy.document.Statement) {
        if (!this.matchesAction(statement.Action, action)) continue;
        if (!this.matchesResource(statement.Resource, resource)) continue;
        if (!this.evaluateConditions(statement.Condition, context)) continue;

        if (statement.Effect === 'Deny') {
          deniedBy.push(`${policy.name}:${statement.Sid ?? 'unnamed'}`);
        } else {
          explicitAllow = true;
          allowedBy.push(`${policy.name}:${statement.Sid ?? 'unnamed'}`);
        }
      }
    }

    // Explicit deny always wins
    if (deniedBy.length > 0) {
      return { allowed: false, reason: 'explicit_deny', deniedBy };
    }

    if (explicitAllow) {
      return { allowed: true, reason: 'explicit_allow', allowedBy };
    }

    return { allowed: false, reason: 'implicit_deny', deniedBy: [], allowedBy: [] };
  }

  /**
   * Wildcard matching for actions and resources.
   * 'users:*' matches 'users:read', 'users:write', 'users:delete'
   * '*' matches everything
   * 'sentry:tenant:acme/user:*' matches resource patterns
   */
  private matchesAction(pattern: string | string[], action: string): boolean {
    const patterns = Array.isArray(pattern) ? pattern : [pattern];
    return patterns.some(p => this.wildcardMatch(p, action));
  }

  private matchesResource(pattern: string | string[], resource: string): boolean {
    const patterns = Array.isArray(pattern) ? pattern : [pattern];
    return patterns.some(p => p === '*' || this.wildcardMatch(p, resource));
  }

  private wildcardMatch(pattern: string, value: string): boolean {
    // Convert glob pattern to regex
    // 'users:*' → /^users:.*$/
    // 'sentry:tenant:*/user:*' → /^sentry:tenant:.*\/user:.*$/
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`).test(value);
  }

  private evaluateConditions(
    condition: PolicyCondition | undefined,
    context: EvaluationContext,
  ): boolean {
    if (!condition) return true;

    if (condition.IpAddress) {
      const allowedIps = condition.IpAddress['sentry:SourceIp'];
      const ips = Array.isArray(allowedIps) ? allowedIps : [allowedIps];
      if (!ips.some(ip => this.matchesCidr(context.ipAddress, ip))) {
        return false;
      }
    }

    if (condition.Bool?.['sentry:MultiFactorAuthPresent'] !== undefined) {
      if (condition.Bool['sentry:MultiFactorAuthPresent'] !== context.mfaVerified) {
        return false;
      }
    }

    if (condition.DateGreaterThan) {
      const threshold = new Date(condition.DateGreaterThan['sentry:CurrentTime']);
      if (new Date() <= threshold) return false;
    }

    if (condition.DateLessThan) {
      const threshold = new Date(condition.DateLessThan['sentry:CurrentTime']);
      if (new Date() >= threshold) return false;
    }

    return true;
  }

  private matchesCidr(ip: string, cidr: string): boolean {
    // Basic CIDR matching — use 'ipaddr.js' package for full support
    // For now: exact match or simple prefix match
    if (!cidr.includes('/')) return ip === cidr;
    // npm install ipaddr.js — add to package.json
    const ipaddr = require('ipaddr.js');
    try {
      const addr = ipaddr.parse(ip);
      const [range, bits] = cidr.split('/');
      return addr.match(ipaddr.parse(range), parseInt(bits));
    } catch {
      return false;
    }
  }

  /**
   * Simulation: "Can user X do action Y on resource Z?"
   * Returns full evaluation trace — useful for debugging permissions.
   */
  async simulate(request: SimulationRequest): Promise<SimulationResult> {
    const policies = await this.collectPolicies(request.userId, request.tenantId);
    const trace: TraceEntry[] = [];

    // Walk every policy, every statement, explain each match/miss
    for (const policy of policies) {
      for (const statement of policy.document.Statement) {
        const actionMatch = this.matchesAction(statement.Action, request.action);
        const resourceMatch = this.matchesResource(statement.Resource, request.resource);
        const conditionMatch = this.evaluateConditions(statement.Condition, request.context);

        trace.push({
          policyName: policy.name,
          statementSid: statement.Sid,
          effect: statement.Effect,
          actionMatch,
          resourceMatch,
          conditionMatch,
          applies: actionMatch && resourceMatch && conditionMatch,
        });
      }
    }

    const result = await this.evaluate(request);
    return { ...result, trace, policiesEvaluated: policies.length };
  }

  private async collectPolicies(userId: string, tenantId: string): Promise<Policy[]> {
    const cacheKey = `rbac:policies:${tenantId}:${userId}`;
    const cached = await this.cacheService.get<Policy[]>(cacheKey);
    if (cached) return cached;

    const policies: Policy[] = [];

    // 1. Inline user policies
    // 2. Role policies (via user's roles)
    // 3. Group policies (via user's groups + parent groups)
    // ... implementation using TypeORM joins

    await this.cacheService.set(cacheKey, policies, 300); // 5 min TTL
    return policies;
  }
}
```

### 2d — RbacCacheService

File: apps/auth-service/src/modules/rbac/rbac-cache.service.ts

- Wraps Redis with a typed get/set/invalidate
- `invalidateUser(userId, tenantId)`: clears all cached policies for a user
- `invalidateTenant(tenantId)`: clears all cached policies for a tenant
- Call `invalidateUser` whenever: role assigned/removed, group membership changes,
  policy attached/detached, policy document updated
- TTL: 300 seconds (5 min)

### 2e — Update PermissionsGuard

File: apps/auth-service/src/common/guards/permissions.guard.ts

Replace the current simple role check with PolicyEvaluationService.evaluate().

The guard now:
1. Extracts userId, tenantId, mfaVerified, ipAddress from the JWT + request
2. Gets the required action from the `@RequirePermissions()` decorator metadata
3. Constructs the resource ARN from the request path:
   `sentry:tenant:{tenantId}/{controller}/{resourceId?}`
4. Calls `PolicyEvaluationService.evaluate({ userId, tenantId, action, resource, context })`
5. Returns 403 with the deny reason if denied

### 2f — Policy Controller & Service

Create full CRUD for policies:
- `POST /rbac/policies` — create policy (validate document schema)
- `GET /rbac/policies` — list tenant policies (paginated)
- `GET /rbac/policies/:id` — get policy detail
- `PUT /rbac/policies/:id` — update policy document
- `DELETE /rbac/policies/:id` — delete (block if system policy)
- `POST /rbac/policies/simulate` — run simulation (requires admin permission)
- `POST /rbac/roles/:roleId/policies/:policyId` — attach policy to role
- `DELETE /rbac/roles/:roleId/policies/:policyId` — detach

Policy document validation: create a Zod schema or class-validator schema
that validates the PolicyDocument structure before saving.
An invalid policy document must be rejected with a 400 and clear error message.

### 2g — Groups/OUs Controller & Service

Create full CRUD for groups:
- `POST /rbac/groups` — create group (optionally under parent)
- `GET /rbac/groups` — list groups with hierarchy (tree structure)
- `GET /rbac/groups/:id` — group detail + members + policies
- `PUT /rbac/groups/:id` — update
- `DELETE /rbac/groups/:id` — delete (block if has members or children)
- `POST /rbac/groups/:id/members/:userId` — add user to group
- `DELETE /rbac/groups/:id/members/:userId` — remove user
- `POST /rbac/groups/:id/policies/:policyId` — attach policy to group
- `DELETE /rbac/groups/:id/policies/:policyId` — detach

Group path: when creating a group under a parent, compute path automatically:
parent.path + groupName + '/'
E.g. parent path '/Engineering/' + name 'Backend' → '/Engineering/Backend/'

### 2h — Permission boundary (Phase 1 — simplified)

Add `permissionBoundaryPolicyId` to the `Role` entity (nullable).
When evaluating permissions: if a role has a boundary policy, the user's
effective permissions = intersection(their policies, boundary policy).
The boundary policy is evaluated separately and its result caps what's allowed.
Implement in PolicyEvaluationService.evaluate() after the main evaluation:
```

if (boundaryPolicy) { const boundaryResult = evaluateAgainstPolicy(boundaryPolicy, action, resource); if (!boundaryResult.allowed) return { allowed: false, reason: 'boundary_deny' }; }

```

### 2i — Tests

Write tests for PolicyEvaluationService:
- Allow: single Allow statement matches action + resource
- Deny overrides Allow: both match, Deny wins
- Implicit deny: no matching statements → denied
- Wildcard action: 'users:*' allows 'users:read'
- Wildcard resource: 'sentry:tenant:*/user:*' matches specific user resource
- IP condition: deny if source IP not in CIDR
- MFA condition: deny if MFA not verified
- Simulation: trace shows all evaluated statements

---

## TRACK 3: SCHEMA MIGRATION SCRIPT

Now that TenantSchemaService exists (Sprint 1b), write the full migration
for moving existing data from the public schema into per-tenant schemas.

File: scripts/migrate-to-schema-per-tenant.ts

Requirements:
- Must be run as a standalone script (not a NestJS migration)
  `ts-node scripts/migrate-to-schema-per-tenant.ts [--dry-run] [--tenant=slug]`
- Dry run: logs every operation, touches nothing
- Single tenant: migrate only one tenant (useful for testing)
- Idempotent: safe to run multiple times (skip if already migrated)
- Transactional: each tenant migration is wrapped in a transaction.
  If any step fails, that tenant's migration rolls back. Others continue.
- Progress reporting: log each step with timestamps

### Migration steps per tenant:
```

1. Check if schema fk_{slug} exists
2. If not: call TenantSchemaService.createSchema(slug)
3. Run TypeORM migrations for that schema (create all tables)
4. For each entity type: a. SELECT count() from public.{table} WHERE tenantId = '{tenantId}' b. INSERT INTO fk_{slug}.{table} SELECT * FROM public.{table} WHERE tenantId = '{tenantId}' c. Verify: SELECT count() from fk_{slug}.{table} — must match step a
5. After ALL entities verified: mark tenant as migrated (add migrated_at column to public.tenants, or use a separate migration_log table)
6. Log success: "Tenant {slug}: migrated N rows across M tables in Xs"

```

### Tables to migrate (in order — respect foreign keys):
```

users → sessions → refresh_tokens → password_history → mfa_configs → backup_codes → webauthn_credentials → user_invites
oauth_clients → oauth_tokens roles → user_roles → role_permissions → permissions groups → user_groups → group_policies policies → role_policies → user_policies
audit_logs security_events

```

### Rollback mode:
`--rollback --tenant=slug`
- Copies data back from fk_{slug} to public schema
- Drops the fk_{slug} schema
- Clears migrated_at on the tenant record
- Only works if the public schema data hasn't been deleted

### Post-migration cleanup (separate step, run manually):
`--cleanup --tenant=slug`
- Deletes rows from public schema tables where tenantId = tenantId
- ONLY after verifying fk_{slug} data is correct
- Requires --confirm flag
- This step is irreversible

---

## TRACK 4: UI FOUNDATION (STITCH FIRST — NON-NEGOTIABLE)

### ⚠️ MANDATORY: CALL STITCH MCP BEFORE ANY UI WORK ⚠️

This is not optional. Before writing a single React component:
```

1. Use the Stitch MCP tool (configured at project startup)
2. Call: stitch.getDesignSystem({ name: "scrolloop-sentry" })
3. If that tool name is different, call: /mcp to list available Stitch tools, then call the correct one to fetch the design system
4. Extract ALL CSS variable values from the Stitch response
5. Write them into apps/admin-portal/app/globals.css
6. THEN proceed with components

```

If Stitch MCP is not connected:
```bash
# In terminal BEFORE starting this Claude Code session:
claude mcp add --transport http stitch https://mcp.stitch.design/mcp \
  --header "Authorization: Bearer YOUR_STITCH_API_KEY" \
  --scope project
```
Then restart the session and try again.
If still unavailable: skip Track 4 and report which tracks were completed.

### UI RULES (apply to every component, every file, no exceptions):

1. Zero raw hex colors — only CSS variables from Stitch tokens
2. Zero raw px for design values — only Tailwind classes mapped to tokens
3. Zero mock data — every data element from a real React Query hook
4. Zero bare useEffect for data — only React Query (useQuery, useMutation)
5. Zero console.log — surface errors in UI, don't log them
6. Every list/table must have: loading skeleton, empty state, error state
7. Both light and dark themes must work — test by toggling data-theme attribute
8. Accessibility: all buttons aria-label, all inputs have labels, tab navigation works

### 4a — globals.css

Populate with exact values from Stitch. Structure:

```css
@import url('https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,300;0,400;0,600;0,700;0,800;1,300&family=DM+Sans:wght@400;500&family=JetBrains+Mono:wght@400&display=swap');

:root {
  --font-display: 'Montserrat', sans-serif;
  --font-body: 'DM Sans', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  /* All token values from Stitch inserted here */
}

[data-theme="dark"] { /* Stitch dark overrides */ }

@keyframes sentry-fade-up {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes sentry-scale-in {
  from { opacity: 0; transform: scale(0.97); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes sentry-shimmer {
  0%   { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}

.animate-fade-up  { animation: sentry-fade-up 320ms cubic-bezier(0.4,0,0.2,1) both; }
.animate-scale-in { animation: sentry-scale-in 200ms cubic-bezier(0.4,0,0.2,1) both; }
```

### 4b — tailwind.config.ts

Map Stitch tokens to Tailwind utilities. See docs/ui/02-antigravity-ui-prompt.md
for the full mapping. Every token from globals.css must have a Tailwind class.

### 4c — ThemeProvider

Create apps/admin-portal/components/providers/ThemeProvider.tsx
Exactly as specified in docs/ui/02-antigravity-ui-prompt.md

Add to apps/admin-portal/app/layout.tsx:
- Wrap children in ThemeProvider
- Import Montserrat, DM Sans, JetBrains Mono
- Set font-family on html element
- Set default data-theme="light" on html element

### 4d — Base UI Components

Create in apps/admin-portal/components/ui/ — FETCH FROM STITCH for each:

For each component below, call stitch.getComponent({ name: "ComponentName" })
to get the exact visual spec, then implement it.

Components (in order — later ones depend on earlier):
1. GlassCard (tier prop: 1 | 2 | 3)
2. SentryButton (variant: primary | accent | ghost | destructive | icon)
3. SentryInput (with label, error, helper text)
4. StatusBadge (status: active | pending | suspended | deleted | admin | mfa | system)
5. NavItem (icon + label + active state)
6. TokenDisplay (masked value + copy + reveal)
7. Skeleton (variants: text | card | table-row | avatar)
8. EmptyState (icon + title + description + optional CTA)
9. PageHeader (title + optional subtitle + action slot)
10. ThemeToggle (sun/moon, calls useTheme)

Do NOT build DataTable or AuditTimeline yet — they're Sprint 3.

### 4e — Portal Layout

Upgrade apps/admin-portal/components/layouts/portal-layout.tsx:
- Apply GlassCard to sidebar (tier 1)
- Replace mock tenant list with real data from SDK useSession()
- Apply NavItem component to all sidebar items
- Add ThemeToggle to topbar
- Correct nav structure:
```

Platform: Dashboard / Users / RBAC Configure: Clients / API Keys / Audit Log Account: Settings

```
- Scrolloop Sentry wordmark: "Scrolloop " + <span in accent color>"Sentry"</span>
- No hardcoded mock data anywhere

### 4f — Login Page

Upgrade apps/admin-portal/app/u/login/page.tsx

Two-panel layout (60/40):
- Left (60%): GlassCard tier 2 centered, real form wired to auth service
- Right (40%): dark warm panel, shield icon, editorial quote
  "Identity,\nengineered\nfor trust." in Montserrat 300 italic

Wire form to existing login endpoint via SDK:
- Email → password → Continue button
- MFA step: render 6-digit TOTP input when auth state is 'mfa_pending'
- Error messages: display below form, red, DM Sans 13px
- Loading state: button shows spinner, inputs disabled
- Post-login redirect: to /t/{tenantSlug}/dashboard (from session)

DO NOT change the auth-service login endpoint.
DO NOT change the SDK's login method.
Only change the UI form and its wiring.

---

## ORDER OF EXECUTION
```

Day 1: Track 1 (rename) — 30 min, do first, commit Track 2a-2c (Policy entity, Group entity, PolicyEvaluationService core) — commit Track 4a-4b (globals.css from Stitch, Tailwind config) — commit
Day 2: Track 2d-2f (RbacCacheService, PermissionsGuard update, Policy controller) — commit Track 4c-4d (ThemeProvider + base UI components) — commit
Day 3: Track 2g-2h (Groups CRUD, permission boundaries) — commit Track 4e-4f (Portal layout + Login page) — commit
Day 4: Track 2i (Policy engine tests) — commit Track 3 (Schema migration script) — commit, run --dry-run, show output

```

---

## DELIVERABLES CHECKLIST

Before this sprint is complete:

Backend:
- [ ] Zero references to "Fort Knox" / "fortknox" in any source file
- [ ] Policy entity exists with PolicyDocument jsonb column
- [ ] Group entity exists with path-based OU hierarchy
- [ ] PolicyEvaluationService: explicit deny wins over allow
- [ ] PolicyEvaluationService: wildcard matching works (users:*, *)
- [ ] PolicyEvaluationService: IP condition works
- [ ] PolicyEvaluationService: MFA condition works
- [ ] PolicyEvaluationService: simulate() returns full trace
- [ ] RbacCacheService: Redis-backed, 5 min TTL, invalidation methods
- [ ] PermissionsGuard uses PolicyEvaluationService (not raw role check)
- [ ] Policy CRUD endpoints work
- [ ] Groups CRUD endpoints work
- [ ] Policy simulation endpoint returns trace
- [ ] Schema migration script runs in --dry-run with no errors
- [ ] Policy engine tests pass

Frontend (all require Stitch MCP call first):
- [ ] globals.css populated with Stitch token values
- [ ] tailwind.config.ts maps all tokens
- [ ] ThemeProvider implemented and wired into root layout
- [ ] GlassCard (3 tiers) renders correctly in light + dark
- [ ] SentryButton (all variants) renders in light + dark
- [ ] SentryInput with label, error state, focus ring
- [ ] StatusBadge all 7 variants
- [ ] NavItem active state shows mint tint
- [ ] TokenDisplay copy works
- [ ] Skeleton shimmer animates
- [ ] EmptyState renders correctly
- [ ] Portal layout uses real SDK session data (no mock)
- [ ] Login page two-panel layout implemented
- [ ] Login form wired to real auth endpoint
- [ ] MFA step renders on mfa_pending state
- [ ] Zero raw hex colors in any component file
- [ ] Dark theme works for all new components

Both:
- [ ] Zero console.log in production code
- [ ] Zero TypeScript `any` types in new code
- [ ] `tsc --noEmit` passes on both apps
- [ ] Every new service has at least 3 unit tests

---

## DO NOT

- Do not touch: helm/, docker-compose.yml, .github/, any seeder files
- Do not add new npm packages without stating why and what it replaces
- Do not change existing API endpoint URLs or response shapes
  (SDKs and existing clients depend on them)
- Do not run the schema migration with real data until --dry-run passes cleanly
- Do not skip the Stitch MCP call for UI work — if Stitch is unavailable,
  report it and skip Track 4, do not invent design values
```
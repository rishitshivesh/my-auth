# Frontend parity and Figma delivery plan

> Execution update: the owner has directed design work to assume the backend works
> and include missing product features in screen scope. The active, temporary
> [screen/UX checklist](../apps/docs/content/docs/dev/screen-ux-checklist/index.mdx) supersedes the design
> blockers and delivery sequencing below. The fresh
> [Figma Design file](https://www.figma.com/design/fRxM0xxiZ0VN7JQdISP2kb) now contains
> 222 screen/step/state frames and foundations across all 61 inventoried families.
> Full state, responsive, prototype and application implementation checks remain separate.

Based on the [source audit](audits/admin-portal.md), 2026-10-20.
The requested destination is a **fresh Figma Design file**, with native editable
screens, reusable components and connected prototypes. This document is the
original design brief; current frames and unfinished work are tracked in the canonical checklist.
The fresh Figma file is linked above; the original audit did not inspect a pre-existing design file.

## Outcome

Every supported human journey must have a discoverable entry point, a truthful
permission/tenant context, complete states, a working exit, and a named API contract.
Backend-dependent journeys receive designed proposals with explicit contract gaps.
Protocol endpoints, background jobs and infrastructure do not each need a page.
They need a screen only where a person configures, authorizes or investigates them.

The backend is the capability reference, not an assumption that every endpoint or
service is product-ready. Resolve the audit's FE-01 through FE-09 before treating
visual completeness as functional readiness.

## Product surfaces and information architecture

| Person / context                   | Surface                    | Primary navigation and responsibilities                                                                                                                                                             |
| ---------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visitor / invited user             | Hosted identity            | Sign in, join, verify email, recover access, fulfill MFA, accept invitation; preserve destination and tenant branding.                                                                              |
| Authenticated member               | My account                 | Profile, password, sign-in connections, MFA/passkeys, recovery codes, sessions, personal activity, account deletion. Explicitly separate from organization policy.                                  |
| Tenant administrator               | Organization console       | Overview; People; Access (roles, permissions, policies, groups, simulator); Applications; Integrations (social, SAML, SCIM, LDAP, webhooks); Audit; Settings (general, branding, domain, security). |
| Developer / scoped operator        | Permission-limited console | Only authorized resources/actions; applications, delivery diagnostics and integration guidance as granted. Show a useful denied state on direct links.                                              |
| Platform operator                  | Platform console           | Overview; Tenants; Platform activity; Team; Platform settings; bootstrap and maintenance operations. Cross-tenant people requires a new supported contract.                                         |
| User arriving from a relying party | Authorization / federation | OAuth sign-in/consent/return and SAML sign-in/continuation; never lose the original protocol request.                                                                                               |

Keep current URLs as design anchors where practical. Route consolidation and a
possible `/account/*` or `/superadmin/*` namespace are proposals, not approved API or
module changes. Review the redirect/alias map before implementation. Avoid calling
OAuth applications “API Keys.” Keep personal authentication factors separate from
tenant-wide authentication policy.

## Figma file structure

File name: **Scrolloop Sentry — Product Design**.

| Page                           | Contents                                                                                                                   |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `00 — Scope and contracts`     | Personas, IA, endpoint/permission legend, current versus proposed routes, scope exclusions, frame/flow coverage index.     |
| `01 — Foundations`             | Semantic variables, light/dark modes, typography, spacing, radii, glass effects, focus, motion and tenant brand overrides. |
| `02 — Components`              | Shared Sentry primitives, form/table/dialog patterns, shells and interaction states.                                       |
| `03 — Hosted identity`         | H01–H10 below; desktop and mobile, email landing variants.                                                                 |
| `04 — Account and security`    | A01–A07.                                                                                                                   |
| `05 — Organization and people` | T01–T04.                                                                                                                   |
| `06 — Access management`       | T05–T09.                                                                                                                   |
| `07 — Applications`            | T10–T12.                                                                                                                   |
| `08 — Integrations`            | T13–T19.                                                                                                                   |
| `09 — Organization settings`   | T20–T23.                                                                                                                   |
| `10 — Platform`                | P01–P07.                                                                                                                   |
| `11 — Journeys`                | Linked entry frames and test scenarios J01–J24; cross-page continuations.                                                  |
| `12 — Handoff`                 | Frame links, API/DTO mapping, responsive/keyboard specs, acceptance criteria and approved route aliases.                   |

If the destination plan limits pages, use numbered sections with this same hierarchy
across the allowed pages, or separate foundations and product files. Check actual
file/library permissions during creation; a connected account alone does not prove
that a particular file can be edited or a library published.

Each frame uses `ID / route-or-surface / step-or-dialog / state / viewport / theme`.
Examples: `H01 / u/login / password / invalid-credentials / 375 / dark` and
`T18 / webhooks / redelivery-confirm / pending / 1280 / light`.
Each screen spec records persona, permission, tenant source, entry, primary action,
method/path/DTO, response branches, exit/return path, validation and error codes.
Store IDs in frame descriptions so names can improve without losing traceability.

## Foundations and reusable UI

Start from `packages/ui/src/globals.css` and its existing Sentry components.
`apps/admin-portal/app/globals.css` imports that stylesheet. The project uses
Tailwind v4 `@theme`; a new Tailwind config is not a prerequisite. Preserve the
existing Montserrat / DM Sans / JetBrains Mono roles, semantic mint accent, neutral
surfaces and glass tiers unless a reviewed design decision changes them.

Import actual token values before layout work. Bind colors and dimensions to
variables; use text/effect styles where variables do not apply. Include readable
solid-surface fallbacks for glass and safe contrast when tenant branding is applied.
Use light/dark modes, semantic error/warning/success/info roles, focus styles, and
reduced-motion behavior. Do not replace the product typeface with an unrelated kit.

Component work:

- SentryButton, SentryInput, password field, OTP input, checkbox/switch/select,
  form label/help/error, social buttons, copy control and secret display.
- GlassCard tiers, PageHeader, NavItem, breadcrumb, tenant/context indicator,
  account menu, tab navigation, desktop and mobile auth shells.
- DataTable with server pagination, selection, filters, sorting where supported,
  bulk action bar, row actions, overflow and empty/no-results differentiation.
- StatusBadge, MFA/grace banner, timeline, event detail, JSON/policy editor,
  simulation result, skeleton, retry/denied states, toast and inline feedback.
- Accessible dialog/drawer/confirmation, destructive action pattern, unsaved-change
  prompt, one-time secret acknowledgement and recent-sign-in return pattern.

Discover existing primitives before introducing another component family. New
Figma components need named variants and token bindings; screens use instances,
auto layout and editable text/icons, not flattened page screenshots. Code Connect
mapping is a handoff task after stable component names and source exports exist.

## Screen and interaction inventory

“Partial” means some frontend exists. “New” means missing coherent surface. “Blocked”
means at least one proposed action lacks a complete backend contract. None of these
labels means runtime acceptance has passed. A row is a design family with multiple
screens, steps and dialogs; it is not a single frame estimate.

### Hosted identity: 10 families

| ID  | Current route / surface                   | Required screens, steps and dialogs                                                                                                                                                | Backend reference / gap                                                                                                                                                                                                |
| --- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H01 | `/u/login` — Partial                      | Tenant resolution; email; permitted method chooser; password; password visibility; invalid credentials; lockout; disabled provider; sign-in progress; authenticated destination.   | `/auth/providers`, `/auth/login-intent`, `/auth/login`; FE-01/05. Do not expose account-existence details beyond the agreed API policy.                                                                                |
| H02 | `/u/signup` — Partial                     | Registration enabled/disabled; profile + password rules; submit; duplicate-account safe response; verification next step.                                                          | POST `/auth/register`; tenant signup flags.                                                                                                                                                                            |
| H03 | `/u/verify-email` — Partial               | Sent; code/link entry matching contract; resend cooldown; wrong/expired/used verification; verified; continue to original destination.                                             | `/auth/verify-email`, `/auth/resend-verification`.                                                                                                                                                                     |
| H04 | `/u/reset-password` — Partial             | Request; generic email acknowledgement; email + code + new password; invalid/expired/attempt-exhausted; policy/reuse error; completion and fresh sign-in.                          | `/auth/forgot-password`, `/auth/reset-password`; code is tenant + email bound.                                                                                                                                         |
| H05 | `/u/magic-link` and login step — Partial  | Request/sent/resend; checking link; expired/used/malformed; MFA challenge; required enrollment; successful continuation.                                                           | `/auth/magic-link/send`, `/auth/magic-link/verify`; SDK must preserve all result branches.                                                                                                                             |
| H06 | `/u/mfa` and embedded challenge — Partial | Supported method chooser; TOTP; backup-code recovery; email OTP only where supported by login contract; remaining attempts; challenge expiry; restart.                             | `/auth/mfa/verify`, `/auth/mfa/verify-backup`; distinguish authenticated `/mfa/*` management from login challenges. No SMS promise.                                                                                    |
| H07 | `/mfa/enroll` — Partial/Blocked           | Required-policy explanation; supported enrollment method; QR/manual key; verification; backup-code save; finish; expired enrollment token; restart sign-in.                        | Backend issues enrollment token; establish an explicit pre-session enrollment/complete contract before implementation. Existing protected setup endpoints are not enough by themselves.                                |
| H08 | Social + passkey sign-in — Partial        | Provider redirect; cancel/error; callback; linking confirmation; unsupported browser; OS prompt in progress; cancelled/expired passkey; MFA/enrollment branch and continuation.    | `/auth/social/*`, `/auth/webauthn/login/{start,finish}`; FE-05/07. OS biometric UI is external, not recreated as app UI.                                                                                               |
| H09 | `/invite/[token]` — Partial               | Validate; organization + invited email/role; create credentials; existing account conflict; expired/used/invalid link; accepted; sign-in into invited tenant.                      | GET `/auth/invite/validate/:token`, POST `/auth/invite/accept`; invitation acceptance must not imply auto-login unless cookies are actually established. Reissue/revoke invitations needs separate backend assessment. |
| H10 | OAuth/SAML continuation — New/Blocked     | Application identity/scopes; approve/deny; invalid client/redirect; sign-in required; request expired; same-browser SAML resume; return to relying party; account/tenant mismatch. | OAuth authorize/consent FE-08; SAML `/saml/sso/:tenantSlug` + `/saml/sso/continue/:nonce`. Keep SAML's browser-bound nonce.                                                                                            |

### Account: 7 families

| ID  | Current route / surface                                  | Required screens, steps and dialogs                                                                                                                                                          | Backend reference / gap                                                                                                                                               |
| --- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01 | Existing profile/account settings — Partial              | Profile view/edit; server-supported fields; validation; pending; saved; failed; unsaved changes.                                                                                             | GET/PUT `/users/me`; no speculative avatar-upload API.                                                                                                                |
| A02 | Existing account/security pages — Partial                | Change password; current-password error; rules/reuse; recent-sign-in requirement; completion and session consequences.                                                                       | POST `/users/me/change-password`, RecentAuthGuard.                                                                                                                    |
| A03 | Social connections — Partial                             | Real linked providers; link handshake/confirmation; cancelled/expired linking; unlink confirmation; last-sign-in-method protection.                                                          | `/auth/social/connections`, `/auth/social/link/*`; repair SDK paths.                                                                                                  |
| A04 | `/t/[slug]/security/devices`, account security — Partial | One TOTP enrollment; email OTP status matching server model; real passkey list/add/remove; local nickname clearly labelled; disable-all confirmation; recovery codes reveal/regenerate/save. | `/mfa/status`, `/mfa/setup/totp`, `/mfa/verify/totp`, `/mfa/webauthn/*`, `/mfa/totp`, `/mfa/all`, `/mfa/backup-codes/regenerate`; FE-06.                              |
| A05 | Active sessions — Partial                                | Current/other sessions; device/IP/time; revoke one; revoke others/all; confirmation; current-session logout; expired/unknown location fallback.                                              | `/sessions/active`, DELETE `/sessions/:sessionId`, `/sessions/all/other`, `/sessions/all`; or supported `/users/me/sessions` family. Choose one adapter consistently. |
| A06 | Personal activity — Partial                              | Security event list; details; date/filter UI only for supported query fields; loading/no activity/failed.                                                                                    | GET `/users/me/security-events`.                                                                                                                                      |
| A07 | Account deletion + recent sign-in — New/Partial          | Consequences; credential/recent-auth check; explicit confirmation; cancel; success; session ended; cannot-complete response.                                                                 | DELETE `/users/me`; do not conflate with tenant deletion or promise GDPR export/erasure features absent from remediation.                                             |

### Organization console: 23 families

| ID  | Current route / surface                                       | Required screens, steps and dialogs                                                                                                                                                                     | Backend reference / gap                                                                                                                                                                |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T01 | `/t/[slug]/dashboard` — Partial                               | Context and permission-aware metrics; trends; activity; no activity; partial service failure; initial configuration guidance using actual integrations.                                                 | `/dashboard/tenant-metrics`, `/tenant-activity`, `/api-call-trend`, `/auth-breakdown` under `/dashboard`.                                                                              |
| T02 | `/t/[slug]/users` — Partial                                   | Search/status/verification filters supported by DTO; page-based table; invite; export; supported bulk status change; partial failure and destructive confirmation.                                      | GET `/users`, `/users/export`, POST `/users/invite`, `/users/bulk/update-status`.                                                                                                      |
| T03 | `/t/[slug]/users/[id]` — Partial                              | Profile edit; account state; lock/unlock; force reset; role assignment/revocation; effective permissions; sessions/revoke; activity; delete.                                                            | `/users/:id`, `/lock`, `/unlock`, `/force-password-reset`, `/sessions`, `/security-events`; `/rbac/users/:userId/*`. No arbitrary email action.                                        |
| T04 | Workspace selection and `/onboarding` — Partial               | Organization list; current membership; target-tenant sign-in; suspended/revoked/no membership; new-workspace details/owner; slug checking/conflict; idempotent submit; verification/sign-in completion. | `/users/orgs`, `/tenants/slug-check`, `/tenants/register`; FE-02. Country persistence is not a supported standalone flow.                                                              |
| T05 | `/t/[slug]/roles` — Partial                                   | List/detail; create/edit/delete; protected system role; permission add/remove; policy attach/detach; role assignment expiry/reason where supported.                                                     | `/rbac/roles/*`, `/rbac/users/:userId/roles`; role names versus IDs follow each DTO.                                                                                                   |
| T06 | Permission catalog — New                                      | Browse/search; resource/action; custom permission create/edit/delete; in-use/system restrictions as returned by API.                                                                                    | `/rbac/permissions/*`; distinguish API supported fields from UI grouping labels.                                                                                                       |
| T07 | `/t/[slug]/policies` — Partial                                | List/detail; managed/inline choice where supported; JSON editor with field validation; save/delete; attach/detach; explicit deny explanation.                                                           | `/rbac/policies/*`, role/group policy attachment endpoints. No policy-version history promise.                                                                                         |
| T08 | Group management — New                                        | List/create/edit/delete; hierarchy display; parent choice at creation; member add/remove; policy attach/detach; cycle/conflict/denied states.                                                           | `/rbac/groups/*`; update DTO currently has name/description only, so reparenting an existing group is blocked.                                                                         |
| T09 | Policy simulation — Partial                                   | Principal/action/resource/context input; allow/deny; matched policies/trace only where returned; invalid JSON/context; no applicable policy.                                                            | POST `/rbac/policies/simulate`; render the real result shape rather than the admin client's assumed shape.                                                                             |
| T10 | Applications/clients — Partial                                | One inventory; application type; create; client ID; one-time confidential secret; public-client PKCE guidance; cancel; no applications.                                                                 | `/oauth/clients`; current list returns active clients. Inactive-client browsing requires contract review.                                                                              |
| T11 | Application detail — New/Partial                              | General settings; redirect/logout URIs; allowed origins; grant types/lifetimes supported by DTO; edit; invalid/duplicate URI; delete confirmation.                                                      | GET/PUT/DELETE `/oauth/clients/:clientId`; no generic API-key screens.                                                                                                                 |
| T12 | Application credentials/integration — Partial                 | Copy ID; rotate secret confirmation; one-time reveal/acknowledge; SDK integration guidance; issuer/discovery endpoints.                                                                                 | POST `/oauth/clients/:clientId/rotate-secret`; JWKS/discovery are protocol outputs, not editable credentials. SDK snippets need tested contracts.                                      |
| T13 | `/connections` and social config — Partial                    | Real integration catalog; configured/unconfigured/disabled; provider credentials form where supported; enable/disable; connect/configure links.                                                         | `/dashboard/tenant-settings`, PATCH `/dashboard/tenant-settings/social/:provider`; use server redaction behavior for secrets.                                                          |
| T14 | `/connections/saml` — Partial                                 | Service-provider list/add/edit/delete; metadata or manual fields actually supported; entity ID/ACS/SLO/certificate validation; Sentry IdP metadata guidance.                                            | `/saml/sps`, PATCH/DELETE `/saml/sps/:id`, public metadata. Do not portray this as an inbound enterprise IdP connector.                                                                |
| T15 | `/connections/scim` — Partial                                 | Provisioning endpoint; token list/create/expiry; one-time token reveal; revoke; expired token; setup guidance.                                                                                          | `/scim/tokens`; `/scim/v2/*` is a machine provisioning protocol. No sync-run history/connector scheduler without new APIs.                                                             |
| T16 | `/connections/ldap` — Partial                                 | List/add/edit/delete; bind secret handling; field mapping supported by DTO; test pending/success/fail; sync pending/result/fail.                                                                        | `/ldap/connections`, PATCH/DELETE `/:id`, POST `/:id/test`, `/:id/sync`; no persistent job history assumed.                                                                            |
| T17 | `/webhooks` — Partial                                         | List/add/edit/delete; subscribed event picker; enabled state; test; rotate signing secret; one-time secret; validation and failure.                                                                     | `/webhooks`, PATCH/DELETE `/:id`, POST `/:id/test`, `/:id/rotate-secret`; source event names from actual webhook contract, not a separate invented taxonomy.                           |
| T18 | Webhook delivery diagnostics — Partial                        | Deliveries list/detail; status/attempt/error/time fields actually returned; redeliver confirmation/pending/result/failure; pagination where supported.                                                  | GET `/webhooks/:id/deliveries`, POST `/:id/deliveries/:deliveryId/redeliver`; do not display unreturned payload/response bodies.                                                       |
| T19 | `/audit` — Partial                                            | Cursor-based events; supported filters; details; sanitized metadata; export; no results; denied; export/network failure.                                                                                | GET `/audit`, `/audit/export`; separate from platform activity and personal security activity.                                                                                         |
| T20 | General settings — Partial                                    | Name/context readout; supported feature flags and allowed provider controls; save/cancel; unsupported fields read-only.                                                                                 | GET `/tenants/current`, GET/PATCH `/dashboard/tenant-settings`; no generic tenant update implied.                                                                                      |
| T21 | `/branding` — Partial                                         | Primary color, approved font/weight/background; logo upload; hosted login preview; light/dark contrast; invalid file/size/upload fail; save/reset draft.                                                | `/tenants/current/branding` + `/logo`; reset draft is local, not an assumed server reset endpoint.                                                                                     |
| T22 | Domains — New/Blocked                                         | Domain status/instructions; conflict/error; operator-controlled configure/verify; role-appropriate read-only view.                                                                                      | Existing `/tenants/:id/custom-domain` and `/verify-domain` assert superadmin. Review actual DNS verification before a verified badge; tenant self-service requires authorization work. |
| T23 | Authentication policy / organization danger — Partial/Blocked | Current configuration; MFA grace/policy explanation; password rules readout; proposed enforce/exempt/grace editors; proposed delete-organization journey.                                               | Policy CRUD and tenant self-delete absent. Do not imply featureFlags are a general policy editor. Platform tenant deletion is P03, not tenant-admin self-delete.                       |

### Platform: 7 families

| ID  | Current route / surface                                     | Required screens, steps and dialogs                                                                                                                          | Backend reference / gap                                                                                                      |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| P01 | `/setup` — Partial                                          | Setup token; initial admin fields; validation; pending; already initialized; invalid token; unavailable; success/sign-in.                                    | `/superadmin/platform-info`, `/initialized`, `/create-first-admin`. Do not place real setup secrets in Figma.                |
| P02 | `/dashboard` — Partial                                      | Tenant/user/session metrics; platform activity; no tenants; denied; API unavailable.                                                                         | GET `/admin/dashboard`, `/admin/activity`.                                                                                   |
| P03 | `/tenants`, `/tenants/new`, `/tenants/[tenantId]` — Partial | Search/filter/page; create/owner/slug; provision outcome; supported detail/settings; suspend/restore; flags/plan metadata if supported; delete confirmation. | `/admin/tenants/*`; plan metadata is not subscription billing. Separate ordinary update failures from provisioning failures. |
| P04 | `/settings` team section — Partial                          | Platform team list/add/remove; unknown email; denied; remove confirmation.                                                                                   | `/admin/team`; verify existing-user semantics before wording action as an email invitation.                                  |
| P05 | `/settings` — Partial                                       | Platform name/support/signup/maintenance settings supported by DTO; saved/failed; SMTP configuration status readout.                                         | GET/PATCH `/admin/settings`; do not add SMTP secret editing or branding upload absent APIs.                                  |
| P06 | `/audit-logs` — Partial                                     | Platform activity list/detail and supported limit/filter behavior; tenant context; denied/unavailable.                                                       | GET `/admin/activity`; full cross-tenant search/export is not assumed.                                                       |
| P07 | Maintenance and cross-tenant people — New/Blocked           | Operator token-cleanup confirmation/result; cleanup statistics; proposed global-user directory clearly marked blocked.                                       | `/admin/cleanup/tokens`, `/admin/cleanup/stats`; no global-user-list controller found.                                       |

The inventory contains **47 design families**. Frame counts are determined by
applicable states, steps and breakpoints, not by multiplying every row by a fixed
number. Count coverage by family, flow branch and state; do not claim “all screens”
from a count of happy-path frames.

## Connected journeys and acceptance scenarios

Each journey needs a clickable prototype entry, success exit and failure/cancel
exit. Link shared frames instead of duplicating inconsistent versions. These are
also the basis for future browser acceptance tests.

| Journey                     | Required path and branches                                                                                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| J01 First run               | Uninitialized platform → setup token/admin → initialized result → real session or sign-in → permitted console; invalid token, race, service unavailable.                         |
| J02 New organization        | Workspace/owner details → slug check → registration → verification/sign-in as required → correct tenant; slug taken, rate limit, retry same idempotency key.                     |
| J03 Password login          | Tenant resolve → email/method → password → verified/no-MFA destination; wrong password, locked account, disabled tenant, unverified email.                                       |
| J04 MFA login               | Password → actual supported challenge → success; backup code, invalid code, exhaustion, expired temp token, restart without a false session.                                     |
| J05 Enforced enrollment     | Password/magic link/passkey result → required enrollment → verify → save recovery → completed session or fresh login; token expires, cancel, policy mismatch. Backend-dependent. |
| J06 Passwordless            | Magic-link request → email → verification → MFA/enrollment if required → original destination; used/expired link and resend.                                                     |
| J07 Passkey                 | Start → external browser prompt → assertion → server result → correct next branch; unsupported browser, cancel, expiry/replay rejection.                                         |
| J08 Social login/link       | Provider → callback claim → real session claims → MFA/verification/destination; cancellation, provider disabled, link confirmation expiry, existing account.                     |
| J09 Password recovery       | Request → generic acknowledgement → email-bound code/new password → success → fresh login; wrong code, exhausted attempts, reuse/policy failure.                                 |
| J10 Invitation              | Admin invite → email → validate → accept → sign-in/verification → invited tenant; existing account, used/expired link, wrong active tenant.                                      |
| J11 Workspace change        | Open organization menu → target → target tenant sign-in → confirmed session → fresh scoped data; denied/revoked membership, cancel back to source.                               |
| J12 Personal security       | Add authenticator/passkey → verify → recovery; regenerate codes invalidates old codes; remove factor/disable all → recent sign-in if required → explicit reconfirmation.         |
| J13 Sessions/account        | View sessions → revoke another/others/all → truthful result; edit profile; change password; delete account → recent sign-in → confirm → session ended.                           |
| J14 People operations       | Filter/page → invite/detail → supported edit/status/lock/reset/delete → success/error → refreshed list; denied and missing user; partial bulk outcome.                           |
| J15 Role/permission         | Create role → add permission → assign with names/expiry/reason → effective permissions → revoke; system role, invalid permission, denied.                                        |
| J16 Group/policy            | Create group → add members → attach policy → simulate allow/deny → detach/delete; JSON error, hierarchy constraint, explicit-deny result.                                        |
| J17 Application integration | Create public/confidential client → credentials acknowledgement → URI/origin configuration → integration guidance → rotate/delete; public client has no client secret.           |
| J18 OAuth/SAML              | App → authorize/SSO → tenant sign-in → consent where supported → validated return; deny, expired request, wrong tenant/browser. OAuth contract blocker stays visible.            |
| J19 Provisioning            | SCIM create/copy/revoke token; LDAP create/edit → test → sync → result; failed bind, expired token, failed sync. No fabricated job monitor.                                      |
| J20 Webhooks                | Endpoint create/edit → test → delivery inspect → redeliver → outcome → rotate secret; failure/retry/denied/deletion.                                                             |
| J21 Branding/settings       | Edit draft → preview → validate → save → reload; upload failure, poor contrast guidance, unsaved navigation, unsupported policy action.                                          |
| J22 Audit investigation     | Tenant event filter → detail → export → file; no results, forbidden, server/export error; platform activity stays separately scoped.                                             |
| J23 Platform operations     | Tenant create → inspect → update/suspend/restore/delete; team add/remove; maintenance/settings; deny non-operators and prevent UI-only privilege assumptions.                    |
| J24 Context and outage      | Unknown/custom/subdomain tenant; session restored/expired/revoked; 403 direct link; backend unavailable/partial outage; return-to login then original safe destination.          |

Email transitions use the actual `packages/emails` templates: invitation,
verification, reset, magic link, link confirmation, OTP and security notices. Include
relevant email previews and link destinations in prototypes. A template such as
ownership-transfer or tenant-restored does not establish a user-facing API workflow.

## State, responsiveness and accessibility contract

For every applicable family, specify populated, loading, first-use empty,
filtered-no-results, inline validation, mutation pending, success feedback,
recoverable API failure/retry, forbidden and missing-resource states. Also include
rate-limited/cooldown, conflict, stale session, recent-sign-in-required, unsaved draft,
destructive confirmation and external-redirect states where relevant.

Authentication screens need expired/used link, wrong tenant, challenge expiry,
provider cancel, unsupported passkey and MFA-policy variants. Credential screens
need show-once/copy/acknowledge states and must use visibly fake placeholders in Figma.
Never place real tokens, QR secrets or user data in the file. No persistent loading
spinner when the server already returned a failure.

Design console defaults at 1280px, and verify dense tables at a larger desktop width.
Hosted auth, onboarding, invite, recovery, MFA and personal account flows need 375px
mobile designs and checks at 320px for reflow. Console mobile behavior must at least
specify navigation, table overflow and dialog fit; a full mobile admin redesign is
separate scope unless approved. Show long names/URIs, many roles, empty fields and
localized/expanded text. Use light/dark variables for all screens, with representative
frames checked visually and explicit frames for mode-sensitive surfaces.

Acceptance includes WCAG 2.2 AA intent: contrast, visible/non-obscured focus,
keyboard order, labelled controls/errors, status announcements, dialog focus trap
and return, OTP paste/autofill, non-color status cues and reduced motion. Actual
conformance requires implemented browser checks; a Figma frame cannot certify it.

## Delivery sequence and ownership

Effort ranges below are planning estimates in focused working days, not commitments.
They assume one product designer plus a frontend owner with backend review at gates.
API repairs and frontend implementation run as separate workstreams/commits.

| Phase                     | Work / owner                                                                                                                                            | Design exit criterion                                                                                            | Rough design effort                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 0 — Contract baseline     | FE owner + BE owner: method/path/DTO/result/permission matrix; auth result branches; tenant context; unsupported capability list; route alias proposal. | Every family labelled existing/partial/blocked with source; unresolved blockers have an owner.                   | 2–3 days, mostly engineering review |
| 1 — Foundations and IA    | Designer + FE: import tokens, component variants, three shells, navigation, context and shared states. Update UI process to Figma workflow.             | Tokens mapped to code; representative login, users table and settings form reviewed in both themes; IA accepted. | 3–5 days                            |
| 2 — Identity and account  | Designer + BE: H01–H10 and A01–A07, including email transitions, enrollment and safe continuation.                                                      | J01–J13 and J18 identity branches have prototypes; blocked OAuth/enrollment branches explicitly annotated.       | 5–8 days                            |
| 3 — Tenant daily work     | Designer + FE: overview, people, roles, permissions, groups, policies/simulator, applications.                                                          | J14–J17 fully traceable to contracts and shared interaction patterns.                                            | 5–8 days                            |
| 4 — Integrations/settings | Designer + BE: SAML/SCIM/LDAP/social, webhooks/redelivery, audit, branding/settings, domains and blocked-policy proposals.                              | J19–J22 complete; configuration direction and permissions correct; no invented diagnostics or actions.           | 4–7 days                            |
| 5 — Platform and handoff  | Designer + platform owner: platform screens, tenant lifecycle, team/settings/cleanup, state/responsive/accessibility pass.                              | J23–J24 complete; every supported action has a reviewed frame + contract + acceptance scenario.                  | 3–5 days                            |

Total directional design effort: **22–36 focused days**; blocked contracts can extend
elapsed time. Re-estimate after Phase 1 and one complete identity slice. Keep all
families inventoried up front, but review in small journey batches. Do not spend
weeks polishing screens whose behavior is still undefined.

## Engineering work that accompanies design

1. Repair/align tenant context, result unions, endpoints and DTOs; define one refresh
   owner. These are correctness changes, not visual changes. Public API/module/schema
   changes require the contributor-rule review before implementation.
2. Reconcile `@scrolloop/types` wire shapes, admin client methods, dates/pagination,
   SDK adapters/peer ranges and structured errors. The SDK currently preserves a raw
   transport response; `withErrorHandler` unwraps it in the portal. Do not accidentally
   unwrap twice when introducing typed methods. Preserve raw protocol/CSV responses.
3. Add multipart/blob support through the shared client, then remove portal raw
   network exceptions. Scoped TanStack Query keys and invalidation must follow tenant,
   principal and filters; test late responses during tenant change/logout.
4. Implement approved Figma journeys in feature-sized frontend commits, using the
   shared UI primitives. Keep backend/contract commits separate. Do not create new
   backend APIs as an incidental UI task.
5. Add contract fixtures for corrected methods, concurrent-refresh tests, auth-branch
   tests and Playwright journeys for login/MFA/reset/invite/tenant mismatch, people,
   applications and webhook redelivery. TypeScript alone cannot catch URL drift.
6. Validate each slice against Figma at agreed widths/themes and keyboard paths.
   Run required auth-service typecheck/tests; portal tsc when portal/SDK changes;
   smoke tests when auth-service runtime behavior changes. Update public API/SDK docs
   when endpoints or SDK behavior change.

## Definition of design-ready and final handoff

A family is ready to implement only when it has native editable frames, reusable
components, responsive rules, token bindings, all applicable states, complete
prototype branches, exact backend mapping, permission rules and written acceptance
criteria. If an API is missing, the proposal is designed but explicitly blocked.

The coverage index must include `family ID → route/dialog → persona → permission →
method/DTO/result → frame link → journey IDs → state coverage → dependency owner`.
Link the real Figma frames back into this plan as they are created. Record decisions
in existing engineering docs/ADRs; track delivery in commits, PRs and remediation,
not new session-status files.

The first review package should contain the IA and foundations plus three coherent
journeys: password → MFA → destination, invite → acceptance → correct tenant, and
application creation → one-time credentials → configuration. Their contracts and
reusable patterns will expose most of the problems before the rest of the file is
produced. Completing these examples alone does not complete the full inventory.

Deferred pending real contracts: subscription billing, generic API-key management,
ownership transfer, global-user management, self-service tenant deletion,
configurable password/MFA-policy CRUD, audit retention/GDPR operations, durable
provisioning job history and per-factor email removal. Security notifications or
shared types bearing those names are not evidence that the feature exists.

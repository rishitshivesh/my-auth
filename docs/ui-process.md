# Scrolloop Sentry — UI design and implementation process

Design before implementation. For the frontend parity work requested on 2026-10-20,
**Figma Design is the design destination**, replacing the previous Stitch-specific
workflow. The [frontend design plan](frontend-design-plan.md) defines the full screen
and journey inventory; the [source audit](audits/admin-portal.md) records current gaps.
This process change does not approve a redesign of backend module boundaries,
public APIs or database strategy.

## 1. Establish contracts and coverage

Before designing a feature, identify its persona, tenant context, permission,
entry/return path, backend method/path/DTO, result branches and dependencies.
Use current source, not a historical screenshot or a shared type alone, to establish
what exists. Mark missing APIs explicitly in the design brief. Do not create fake
success UI, mock operational data or unsupported management actions.

Keep hosted identity, personal account, tenant administration and platform operations
clearly separated. A route change does not change the tenant session. Navigation
checks improve UX; backend authorization enforces access.

## 2. Establish Figma foundations

Create a fresh editable Design file using the page/section structure in the design
plan. Retrieve the actual tokens from `packages/ui/src/globals.css` and inspect the
existing primitives in `packages/ui/src/components/sentry/` and `components/ui/`.
The portal stylesheet imports the shared stylesheet; Tailwind v4 uses `@theme`.
Do not invent a portal Tailwind config merely to follow the old workflow.

Create or reuse semantic variables for light/dark colors, spacing and radii, plus
text/effect styles for typography, glass tiers and shadows. Preserve the existing
Montserrat, DM Sans and JetBrains Mono roles unless the design review changes them.
Map each Figma token to its code token. Add missing tokens deliberately rather than
hardcoding design values in components.

Use existing component names: GlassCard, SentryButton, SentryInput, NavItem,
StatusBadge, TokenDisplay, AuditTimeline, PageHeader, DataTable, EmptyState,
SentrySkeleton and ThemeToggle. Reusable components need variants for applicable
interactive, disabled, pending, invalid and selected states. Build screens from
instances, auto layout and editable text/icons. Flattened screenshots are references,
not the final deliverable.

## 3. Design complete journeys

Follow the modern-flow rules in AGENTS.md. Prefer clickable email links for
verification, invitations and recovery, passkeys/passwordless sign-in where allowed,
and explicit manual-code/password fallbacks. Preserve MFA requirements and the
intended tenant/application destination. Design email previews, intentional link
confirmation, expiry/used/invalid links, wrong accounts, alternate-device completion
and resend cooldowns. A prototype demonstrates intent; it does not prove API or
frontend implementation. Track completion in
`apps/docs/content/docs/dev/screen-ux-checklist/index.mdx`.


Use the stable family/journey IDs from the plan. Name frames with
`ID / route-or-surface / step / state / viewport / theme`.
Include all applicable loading, populated, empty, no-results, validation, pending,
success, API error, denied, missing, conflict and session-expiry states. Specify
recent-auth, unsaved drafts and destructive confirmations where applicable.
Authentication also needs expired/used links, policy enrollment, challenge expiry,
provider cancellation and unsupported-passkey states.

Design at 1280px desktop; check larger dense tables. Provide 375px mobile frames
for hosted identity, onboarding, invite, recovery, MFA and personal account, and
check reflow at 320px. Specify console navigation/overflow/dialog behavior on narrow
viewports even when a full mobile console is outside scope. Support light/dark
modes and constrained tenant branding with readable contrast.

Connect prototypes from entry to real completion, including failure and cancel
paths. Include email/link transitions from `packages/emails` where applicable.
Use clearly fake credentials and data. Never place real secrets, tokens or customer
data in the design file.

Review the design and its contracts before frontend implementation. A backend-blocked
proposal can be reviewed visually but is not ready to implement as a working feature.

## 4. Implement in small slices

Use current project locations:

- `apps/admin-portal/app/`: route entry points and layouts.
- `apps/admin-portal/components/`: portal/auth/feature views and layouts.
- `apps/admin-portal/lib/` and `hooks/`: query adapters and UI behavior.
- `packages/ui/src/`: shared primitives, tokens and patterns.
- `packages/sdk-typescript` and `packages/admin-client`: typed API/session integration.

Pages compose feature views and hooks. Use TanStack Query for server state and
scope keys to tenant, principal and filters. Requests go through the SDK/admin client
and `withErrorHandler`; no raw fetch/axios in portal feature code. Preserve multipart,
blob, raw protocol and response-envelope behavior through explicit client support.

Use shared UI components, CSS variables and theme utilities. No hardcoded colors,
design spacing or font sizes. Use semantic typography roles: Montserrat for display,
headings/navigation; DM Sans for body/table content; JetBrains Mono for identifiers,
policy JSON and technical values. Glass tier 1 is for tiles/containers, tier 2 for
featured cards/dialog bodies, tier 3 for overlays/onboarding/critical panels.

Keep UI and backend changes in separate commits. SDK/query repairs required by the
parity audit are a distinct integration slice; the old blanket prohibition on
editing SDKs/hooks does not apply to explicitly authorized parity work. Backend,
schema, environment or infrastructure changes still follow AGENTS.md and require
the appropriate migration/configuration/documentation work. Confirm large structural
changes before implementation.

## 5. Validate and hand off

Each feature must have explicit loading, empty and failure rendering, labelled form
errors, keyboard navigation, visible focus and accessible dialogs with focus return.
Check contrast, screen-reader status announcements, OTP paste/autofill, non-color
status cues, reduced motion, long content and narrow-screen reflow. Target WCAG 2.2
AA; design frames alone do not establish conformance.

Compare the running UI against Figma in the agreed widths and both themes. Exercise
real response branches, tenant mismatch and permission denial. Verify one-time
secrets, cancellation, recent-sign-in return and session-ending behavior. Do not
insert artificial loading delays just to display a skeleton.

Run the contributor checks: auth-service typecheck and tests; portal tsc when portal
or SDK changes; smoke tests when auth-service runtime behavior changes. Add meaningful
contract/journey tests alongside the feature. Report existing baseline failures
separately from regressions; do not claim checks pass when they do not.

Update the design coverage index with real frame links, API/permission mappings and
acceptance scenarios. Update `docs/audits/admin-portal.md` when coverage changes and
`docs/REMEDIATION_PLAN.md` for remaining work. Public endpoint/SDK changes update
`apps/docs/content/docs/`. Keep decisions in docs/ADRs and delivery in commits/PRs,
not session logs or new status files.

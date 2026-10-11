# Scrolloop Sentry — UI Generation Process

> This document defines the mandatory process for generating, updating, or reviewing
> any frontend UI in the Scrolloop Sentry project. Every engineer and AI agent
> working on this codebase must follow this exactly.

---

## THE GOLDEN RULE

**Design before you code. Stitch before you ship.**

No frontend component is written without a Stitch design to reference.
No color is hardcoded. No spacing is guessed. No font size is invented.
Everything flows from the design system, which lives in Stitch.

---

## PROCESS OVERVIEW

```
Stitch MCP
    ↓
Design tokens exported to globals.css + tailwind.config.ts
    ↓
Screens designed in Stitch (all states: default, hover, error, loading, empty)
    ↓
Claude Code / Antigravity implements screens (UI only, no backend changes)
    ↓
Visual QA against Stitch frames
    ↓
Ship
```

---

## STEP 1 — RETRIEVE DESIGN SYSTEM FROM STITCH MCP

Before ANY frontend work, call Stitch MCP to get the current design system.

### In Claude Code:
```
Use the Stitch MCP tool to fetch the Scrolloop Sentry design system.
Get all tokens: colors, typography, spacing, radius, shadows, glass surfaces.
```

### In Antigravity / other AI agents:
```
Call stitch.getDesignSystem({ name: "scrolloop-sentry" })
Extract all CSS variable values.
Do not proceed until you have the token values.
```

### What to extract:
- [ ] All `--color-*` CSS variables (light + dark theme)
- [ ] All `--radius-*` values
- [ ] All `--shadow-*` values
- [ ] All `--font-*` family names and weights
- [ ] All `--space-*` values
- [ ] Glass surface specs (background, blur, border values)
- [ ] Animation easing curves and durations

---

## STEP 2 — UPDATE GLOBALS.CSS AND TAILWIND CONFIG

Paste extracted tokens into:

**File:** `apps/admin-portal/app/globals.css`

Structure:
```css
/* Fonts */
@import url('...');  /* Montserrat + DM Sans + JetBrains Mono from Google Fonts */

:root { /* light theme tokens */ }
[data-theme="dark"] { /* dark theme overrides */ }
/* Animation keyframes */
/* Utility classes */
```

**File:** `apps/admin-portal/tailwind.config.ts`

Map every CSS variable to a Tailwind utility.
After this, never write raw hex, raw px (for design values), or raw rgba in component files.

---

## STEP 3 — DESIGN THE SCREEN IN STITCH (if new screen)

For every NEW screen:
1. Create a new frame in Stitch named exactly as the route:
   - `u/login`, `t/[slug]/users`, `t/[slug]/users/[id]`, etc.
2. Design at 1280px desktop width
3. Design all states:
   - Default (populated with realistic data — not "Lorem ipsum", not "User 1")
   - Loading (skeleton state)
   - Empty (no data)
   - Error (API failure)
   - Mobile (375px) for user-facing screens only
4. Name every layer in Stitch using component names from the code:
   `GlassCard / SentryButton / NavItem / StatusBadge` etc.
5. Get design approved before coding begins

For EXISTING screens being upgraded:
- Retrieve the existing Stitch frame
- Apply design system updates
- Note what changed (colors, spacing, new components)
- Code only the changes, not a full rewrite

---

## STEP 4 — IMPLEMENT THE SCREEN

### Component creation rules:

**File locations:**
```
apps/admin-portal/
  app/
    u/              ← user-facing auth flows
    t/[slug]/       ← tenant portal pages
    mfa/            ← MFA flows
    invite/         ← invite accept flow
    superadmin/     ← platform admin
  components/
    ui/             ← design system components (GlassCard, SentryButton, etc.)
    layouts/        ← page layouts (portal-layout, auth-layout)
    providers/      ← ThemeProvider, QueryProvider
    [feature]/      ← feature-specific components (users/, rbac/, clients/)
```

**Every page file must:**
- Import data via React Query hooks (no bare useEffect)
- Show Skeleton while loading
- Show EmptyState when no data
- Show error message when fetch fails
- Use only components from `components/ui/`
- Use only colors/spacing from Tailwind tokens (no inline style for design values)
- Support both light and dark theme via CSS variables

**Every component file must:**
- Be typed (no `any`)
- Accept a `className` prop for extension
- Forward refs where applicable (inputs, buttons)
- Have a displayName set

### Glass card usage rules:
```
GlassCard tier={1} — stat tiles, table containers, sidebar items
GlassCard tier={2} — login card, modal body, user detail card, featured content
GlassCard tier={3} — full-screen overlays, onboarding panels, critical alerts
```

### Color usage rules:
```
Mint accent (--color-accent):
  ✓ Primary CTA button (ONE per screen)
  ✓ Active nav item background
  ✓ Focus rings on inputs
  ✓ Active status badges
  ✓ Progress bar fills
  ✓ Positive delta indicators (↑12%)
  ✗ Never as background fill on large areas
  ✗ Never used twice as a CTA on same screen

Dark button (--color-text-primary fill):
  ✓ Primary action where mint is already used
  ✓ Form submit buttons (login, settings save)

Ghost button:
  ✓ Secondary actions (Cancel, View, Export)
  ✓ Social login buttons
  ✓ Bulk action options
```

### Typography rules:
```
Montserrat 300:  hero display text, editorial quotes, stat numbers
Montserrat 400:  section headings, card titles
Montserrat 600:  nav items (active), labels, badge text, button text
Montserrat 700:  page headings, strong UI labels
Montserrat 800:  logotype only (Scrolloop Sentry wordmark)

DM Sans 400:     body copy, table cell content, descriptions
DM Sans 500:     emphasized body, interactive element labels

JetBrains Mono 400: API keys, client IDs, tenant slugs, JWT content,
                     IP addresses, policy JSON, timestamps in audit log
```

---

## STEP 5 — VISUAL QA CHECKLIST

Before marking any screen complete, verify:

**Design fidelity:**
- [ ] Colors match Stitch frame exactly (use browser color picker to verify)
- [ ] Border radius matches spec (use DevTools to verify computed values)
- [ ] Font weights are correct (Montserrat 300 looks different from 400 — check)
- [ ] Glass effect is visible (card should look frosted, not flat white)
- [ ] Spacing matches 8pt grid

**States:**
- [ ] Loading skeleton renders correctly for 2+ seconds before data
- [ ] Empty state appears when API returns empty array
- [ ] Error state appears when API returns 4xx/5xx
- [ ] Hover states work on all interactive elements
- [ ] Focus rings appear on keyboard navigation
- [ ] Active/selected states are visually distinct

**Theme:**
- [ ] Switch to dark theme — all text is readable
- [ ] Switch back to light — no flash of wrong theme
- [ ] Glass cards look different in dark mode (darker, still frosted)
- [ ] Mint accent still works in both themes

**Responsiveness (user-facing screens only):**
- [ ] Login page works at 375px mobile
- [ ] MFA screen works at 375px
- [ ] Invite accept works at 375px
- [ ] No horizontal scroll on mobile

**Accessibility:**
- [ ] All buttons have accessible labels
- [ ] All form fields have associated labels
- [ ] Color contrast passes WCAG AA (use DevTools accessibility panel)
- [ ] Tab navigation works correctly through the form

**Data:**
- [ ] Realistic data shown (not "User 1", "Email@test.com")
- [ ] Timestamps are formatted (not raw ISO strings)
- [ ] Long text is truncated appropriately (ellipsis, not overflow)
- [ ] Numbers are formatted (1,234 not 1234)

---

## STEP 6 — WHAT NOT TO TOUCH

When doing UI work, these files and directories are OFF LIMITS:

```
apps/auth-service/           ← entire NestJS backend
packages/sdk-*/              ← SDK packages (except sdk-typescript React provider UI)
packages/security/           ← security utilities
apps/admin-portal/lib/       ← utility functions (unless adding UI utils)
apps/admin-portal/hooks/     ← only add new hooks, don't modify existing
*.entity.ts                  ← TypeORM entities
*.service.ts                 ← NestJS services
*.controller.ts              ← NestJS controllers
*.module.ts                  ← NestJS modules
*.guard.ts                   ← NestJS guards
*.dto.ts                     ← NestJS DTOs
migrations/                  ← database migrations
docker-compose.yml           ← infrastructure
.env*                        ← environment files
turbo.json                   ← build config
```

---

## COMPONENT REFERENCE QUICK MAP

| Stitch Component  | File path                                    | Used in                           |
|-------------------|----------------------------------------------|-----------------------------------|
| GlassCard         | components/ui/GlassCard.tsx                  | Everywhere                        |
| SentryButton      | components/ui/SentryButton.tsx               | All CTAs                          |
| SentryInput       | components/ui/SentryInput.tsx                | All form fields                   |
| NavItem           | components/ui/NavItem.tsx                    | Sidebar                           |
| StatusBadge       | components/ui/StatusBadge.tsx                | User status, event outcomes       |
| TokenDisplay      | components/ui/TokenDisplay.tsx               | API keys, client IDs              |
| AuditTimeline     | components/ui/AuditTimeline.tsx              | User detail, audit log page       |
| PageHeader        | components/ui/PageHeader.tsx                 | All portal pages                  |
| DataTable         | components/ui/DataTable.tsx                  | Users, clients, audit log         |
| EmptyState        | components/ui/EmptyState.tsx                 | All lists/tables                  |
| Skeleton          | components/ui/Skeleton.tsx                   | All loading states                |
| ThemeToggle       | components/ui/ThemeToggle.tsx                | Topbar                            |
| PortalLayout      | components/layouts/portal-layout.tsx         | All tenant portal pages           |
| AuthLayout        | components/layouts/auth-layout.tsx           | Login, MFA, invite                |
| ThemeProvider     | components/providers/ThemeProvider.tsx       | Root layout                       |

---

## NAMING CONVENTIONS

```
Pages:          page.tsx (Next.js App Router convention)
Layouts:        layout.tsx
Components:     PascalCase.tsx — GlassCard.tsx, not glass-card.tsx
Hooks:          useCamelCase.ts — useUsers.ts, useSession.ts
Types:          types.ts or co-located with component
CSS classes:    kebab-case when custom, Tailwind utilities otherwise
Storybook:      [ComponentName].stories.tsx (add if Storybook is configured)
```

---

## ADDING A NEW SCREEN (full checklist)

- [ ] Create Stitch frame with screen name matching route
- [ ] Design all states in Stitch
- [ ] Get design reviewed
- [ ] Run `stitch.getComponent()` via MCP to get exact specs
- [ ] Create page file in correct `app/` subdirectory
- [ ] Create any new feature-specific components in `components/[feature]/`
- [ ] Add React Query hook for data fetching in `hooks/`
- [ ] Wire to existing API endpoint (DO NOT create new endpoints — that's backend work)
- [ ] Implement loading skeleton
- [ ] Implement empty state
- [ ] Implement error state
- [ ] Test light theme
- [ ] Test dark theme
- [ ] Test keyboard navigation
- [ ] Complete visual QA checklist above
- [ ] Update the screen inventory in docs/audits/admin-portal.md if needed

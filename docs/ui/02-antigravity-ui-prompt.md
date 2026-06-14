# Scrolloop Sentry — Antigravity UI Implementation Prompt

## CRITICAL RULE — READ FIRST

**You are ONLY allowed to change UI elements.**

Do NOT touch:
- Any backend service, controller, or module
- Any NestJS code whatsoever
- Any database entity, migration, or schema
- Any authentication logic, JWT handling, session management
- Any API endpoint behavior
- Any environment variable or configuration file
- Any test files
- The monorepo root `package.json` or `turbo.json`

You MAY touch:
- `apps/admin-portal/**` — all Next.js pages, layouts, components
- `packages/sdk-typescript/**` — only React hooks and provider UI helpers
- CSS variables, Tailwind config, globals.css
- Component files in `components/` and `app/` within admin-portal

If you are tempted to touch a backend file, STOP. The backend is not your concern.

---

## MANDATORY FIRST STEP — CALL STITCH MCP

Before writing a single line of frontend code, you MUST:

1. Connect to the Stitch MCP server
2. Retrieve the Scrolloop Sentry design system using:
   ```
   stitch.getDesignSystem({ name: "scrolloop-sentry" })
   ```
   OR if fetching by component:
   ```
   stitch.getComponent({ name: "GlassCard" })
   stitch.getComponent({ name: "SentryButton" })
   stitch.getComponent({ name: "NavItem" })
   stitch.getComponent({ name: "StatusBadge" })
   stitch.getComponent({ name: "TokenDisplay" })
   ```
3. Extract ALL token values: colors, spacing, radius, shadows, typography
4. Paste those exact values into `apps/admin-portal/app/globals.css`
5. THEN begin implementing screens

Do not invent colors, spacing, or font sizes. Every value comes from Stitch.
If Stitch MCP is unavailable, halt and report — do not guess at design values.

---

## SETUP TASKS (do once, before screens)

### A — globals.css

Populate with CSS variables from Stitch export. Structure:

```css
@import url('https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,300;0,400;0,600;0,700;0,800;1,300&family=DM+Sans:wght@400;500&family=JetBrains+Mono:wght@400&display=swap');

:root {
  --font-display: 'Montserrat', sans-serif;
  --font-body: 'DM Sans', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  /* Paste all tokens from Stitch here */
  /* --color-bg-base, --color-surface-1, --color-accent, etc. */
  /* --radius-sm, --radius-md, etc. */
  /* --shadow-sm, --shadow-md, etc. */
}

[data-theme="dark"] {
  /* Paste dark theme overrides from Stitch */
}
```

### B — tailwind.config.ts

Map ALL Stitch tokens to Tailwind utilities:

```ts
colors: {
  'bg-base':       'var(--color-bg-base)',
  'surface-1':     'var(--color-surface-1)',
  'surface-2':     'var(--color-surface-2)',
  'text-primary':  'var(--color-text-primary)',
  'text-secondary':'var(--color-text-secondary)',
  'text-tertiary': 'var(--color-text-tertiary)',
  'accent':        'var(--color-accent)',
  'accent-soft':   'var(--color-accent-soft)',
  'accent-dark':   'var(--color-accent-dark)',
  'danger':        'var(--color-danger)',
  'warning':       'var(--color-warning)',
  'info':          'var(--color-info)',
},
borderRadius: {
  'xs':  'var(--radius-xs)',
  'sm':  'var(--radius-sm)',
  'md':  'var(--radius-md)',
  'lg':  'var(--radius-lg)',
  'xl':  'var(--radius-xl)',
},
fontFamily: {
  display: ['Montserrat', 'sans-serif'],
  body:    ['DM Sans', 'sans-serif'],
  mono:    ['JetBrains Mono', 'monospace'],
},
boxShadow: {
  'sm':  'var(--shadow-sm)',
  'md':  'var(--shadow-md)',
  'lg':  'var(--shadow-lg)',
  'xl':  'var(--shadow-xl)',
}
```

### C — Theme Provider

Create `apps/admin-portal/components/providers/ThemeProvider.tsx`:

```tsx
'use client';
import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';
const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: 'light', toggle: () => {}
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const stored = (localStorage.getItem('sentry-theme') as Theme) ?? 'light';
    setTheme(stored);
    document.documentElement.setAttribute('data-theme', stored);
  }, []);

  const toggle = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('sentry-theme', next);
    document.documentElement.setAttribute('data-theme', next);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
```

### D — Base Component Library

Create these in `apps/admin-portal/components/ui/` — use Stitch token values for all styles.
Use shadcn/ui as the base primitive where applicable, override with Sentry tokens.

Components to create (match names exactly to Stitch components):

- `GlassCard.tsx` — 3 tiers (tier prop: 1 | 2 | 3)
- `SentryButton.tsx` — variants: primary | accent | ghost | destructive | icon
- `SentryInput.tsx` — with label, error state, helperText
- `NavItem.tsx` — icon + label + active state
- `StatusBadge.tsx` — status: active | pending | suspended | admin | mfa | system
- `TokenDisplay.tsx` — masked value + copy + reveal toggle
- `AuditTimeline.tsx` — event list with dots + connecting line
- `PageHeader.tsx` — title + subtitle + action slot
- `DataTable.tsx` — with pagination, sorting, bulk select, row actions
- `EmptyState.tsx` — icon + title + description + CTA
- `Skeleton.tsx` — shimmer animation variants
- `ThemeToggle.tsx` — sun/moon icon, calls useTheme().toggle()

---

## SCREENS TO IMPLEMENT

Work through screens in this order. Each screen: read Stitch design → implement.

### Screen 1: Login (`apps/admin-portal/app/u/login/page.tsx`)

Layout: Two-panel split, 60/40

```tsx
<div className="min-h-screen grid grid-cols-[60fr_40fr]">
  <LeftPanel>  {/* frosted glass card centered */}
  <RightPanel> {/* dark warm panel, editorial quote */}
</div>
```

Left panel requirements:
- Glass card (tier 2) centered, max-w-[400px]
- Sentry wordmark: "Scrolloop " + <span className="text-accent">Sentry</span>
- Headline: Montserrat 300 "Welcome back" — pull name from session if available
- Real form wired to existing auth API (do NOT change the API — just wire the form)
- Email input → password input → Continue button
- Forgot password link
- Social row: Google, GitHub, Microsoft icons (ghost buttons)
- Error state: display API error message below form

Right panel requirements:
- Background: warm dark gradient (#1A1916 → #0D0C0B)
- Centered shield icon in mint-tinted glass circle
- Bottom: italic Montserrat 300 quote + meta text
- This panel is purely decorative — no interactive elements

MFA screen (same route, conditional render based on auth state):
- Replace form area with 6-digit TOTP input
- Backup code link below

Wire to: existing `auth.service` login endpoint via SDK

### Screen 2: Dashboard (`apps/admin-portal/app/t/[slug]/page.tsx` or dashboard)

- Sidebar + main layout (use portal-layout.tsx)
- Replace all mock data with real React Query fetches:
  - `GET /api/tenant/:slug/stats` → stat tiles
  - `GET /api/tenant/:slug/sessions/recent` → sessions
  - `GET /api/tenant/:slug/audit?limit=5` → recent events
- 4 stat tiles (GlassCard tier 1)
- Activity chart: use recharts AreaChart, mint fill
- Recent users table (last 5, link to full users page)

### Screen 3: Users List (`apps/admin-portal/app/t/[slug]/users/page.tsx`)

- PageHeader: "Users" + InviteUser button
- Filter bar: SentryInput search + status select + date range
- DataTable with real data from `GET /api/tenant/:slug/users`
- Columns: avatar+name, email, StatusBadge, roles, MFA badge, last active, actions
- Row actions: View, Suspend, Delete (with confirmation modal)
- Bulk actions bar (slides up, glass tier 2)
- Pagination: cursor-based (use nextCursor from API response)

### Screen 4: User Detail (`apps/admin-portal/app/t/[slug]/users/[id]/page.tsx`)

CREATE THIS FILE — it doesn't exist.

- Breadcrumb: Users → [User Name]
- Two-column layout (1/3 + 2/3)
- Left: user profile GlassCard (tier 2) + danger zone card
- Right: tab navigation (Overview / Sessions / Audit Log / Permissions)
  Each tab fetches its own data independently with React Query
- Wire all admin actions (suspend, force reset, delete) to existing admin endpoints

### Screen 5: RBAC (`apps/admin-portal/app/t/[slug]/roles/page.tsx`)

CREATE THIS FILE.

- Split panel: roles sidebar + role detail
- Role list: fetch from `GET /api/tenant/:slug/roles`
- Role detail: permissions matrix + policy JSON editor
  Use a simple textarea with JetBrains Mono for JSON — no third-party editor needed
- Wire create/update/delete to existing RBAC endpoints

### Screen 6: API Clients (`apps/admin-portal/app/t/[slug]/clients/page.tsx`)

CREATE THIS FILE.

- Card grid (2 columns): fetch from `GET /api/tenant/:slug/oauth/clients`
- Client card: TokenDisplay for client ID, status toggle, last used
- Create client modal: 3 type options (SPA/M2M/Web) as glass cards

### Screen 7: Settings (`apps/admin-portal/app/t/[slug]/settings/page.tsx`)

If exists, upgrade UI. If not, create.

- Tab navigation: General / Branding / Security / Email / Danger Zone
- All settings wire to existing tenant config endpoints
- Password policy section: sliders + toggles
- Danger zone: glass card with danger tint, delete confirmation modal

### Screen 8: MFA Enrollment (`apps/admin-portal/app/mfa/enroll/page.tsx`)

CREATE THIS FILE — user-facing.

- Step wizard: Method select → Setup → Backup Codes → Success
- Wire to existing MFA endpoints
- Step indicator at top: 4 dots, active = mint filled, completed = mint with check

### Screen 9: Invite Accept (`apps/admin-portal/app/invite/[token]/page.tsx`)

CREATE THIS FILE — user-facing.

- Centered glass card
- Validate token on mount via `GET /api/auth/invite/validate/:token`
- Set name + password form
- Wire to `POST /api/auth/invite/accept`
- Auto-redirect to dashboard on success

### Screen 10: Audit Log (`apps/admin-portal/app/t/[slug]/audit/page.tsx`)

CREATE THIS FILE.

- AuditTimeline component for recent events
- Full filterable table below
- Export button (triggers download of filtered log)

---

## RULES FOR EVERY SCREEN

1. **No raw hex colors** — only CSS variables or Tailwind tokens from Stitch
2. **No raw font-size numbers** — only Tailwind text scale mapped to tokens
3. **No mock data** — every piece of data comes from a real API call
4. **React Query for all data** — no bare useEffect fetching
5. **Loading states** — every data fetch shows Skeleton while loading
6. **Error states** — every data fetch handles errors visibly
7. **Empty states** — every list/table has an EmptyState component
8. **Responsive** — user-facing screens (login, MFA, invite) are mobile-first
   Admin portal screens are desktop-first with tablet breakpoint minimum
9. **Accessibility** — all buttons have aria-label, all images have alt,
   all form fields have associated labels
10. **No console.log** — use the logger or remove

---

## PORTAL LAYOUT (`apps/admin-portal/components/layouts/portal-layout.tsx`)

Upgrade this file:
- Replace hardcoded mock tenant list with real data from SDK `useSession()`
- Implement real tenant switcher (calls SDK to re-authenticate per tenant)
- Add ThemeToggle in topbar
- Add notification bell (placeholder for now, badge with count)
- Wire avatar dropdown: Profile / Settings / Sign out

Sidebar nav items (in order):
```
Platform:  Dashboard / Users / RBAC
Configure: Clients / API Keys / Audit Log
Account:   Settings / [Sign Out]
```

---

## ANIMATION IMPLEMENTATION

Add to globals.css:

```css
@keyframes sentry-fade-up {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes sentry-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes sentry-scale-in {
  from { opacity: 0; transform: scale(0.97); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes sentry-shimmer {
  0%   { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}

.animate-fade-up   { animation: sentry-fade-up 320ms cubic-bezier(0.4,0,0.2,1) forwards; }
.animate-fade-in   { animation: sentry-fade-in 240ms cubic-bezier(0.4,0,0.2,1) forwards; }
.animate-scale-in  { animation: sentry-scale-in 200ms cubic-bezier(0.4,0,0.2,1) forwards; }
```

Apply `animate-fade-up` to page content wrappers.
Apply `animate-scale-in` to modals and cards that appear on interaction.
Apply stagger delays (40ms per item) to list items using inline style.

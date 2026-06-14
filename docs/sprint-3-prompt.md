# SCROLLOOP SENTRY — SPRINT 3
# Complete UI Implementation (Stitch-driven, all screens)
# Read CLAUDE.md fully before touching any file.

---

## SPRINT OVERVIEW

Sprint 2 completed the IAM policy engine, project rename, and schema
migration script. Track 4 (UI foundation) was skipped because Stitch
MCP was unavailable.

This sprint is EXCLUSIVELY frontend. Zero backend changes.
Every screen. All components. Fully wired to real data.
Stitch MCP must be connected before this sprint starts.

---

## ABSOLUTE RULES FOR THIS ENTIRE SPRINT

These apply to EVERY file, EVERY component, EVERY line of JSX.
No exceptions. If you catch yourself breaking one, stop and fix it.

1. CALL STITCH MCP FIRST — before writing any component
   Use: stitch.get_screen_code() or stitch.get_screen_image()
   If /mcp shows stitch is not connected: STOP. Do not invent design values.
   Report "Stitch MCP not connected" and halt.

2. ZERO raw hex colors
   Wrong:  style={{ color: '#2ABF6C' }}
   Wrong:  className="text-[#2ABF6C]"
   Correct: className="text-accent"  (Tailwind token)
   Correct: style={{ color: 'var(--color-accent)' }}  (CSS variable)

3. ZERO raw design px values
   Wrong:  style={{ borderRadius: '16px' }}
   Wrong:  className="rounded-[16px]"
   Correct: className="rounded-md"  (mapped Tailwind token)

4. ZERO mock/hardcoded data
   Wrong:  const users = [{ name: 'Arjun Rao', email: '...' }]
   Correct: const { data: users } = useQuery({ queryKey: ['users'], queryFn: fetchUsers })

5. ZERO bare useEffect for data fetching
   Wrong:  useEffect(() => { fetch('/api/users').then(...) }, [])
   Correct: useQuery / useMutation from @tanstack/react-query

6. ZERO console.log
   Surface errors in UI. Use error boundaries or inline error states.

7. EVERY data list needs THREE states
    - Loading: <Skeleton /> matching the layout
    - Empty: <EmptyState /> with appropriate message and CTA
    - Error: visible error message with retry option

8. BOTH themes must work
   After implementing any component: toggle data-theme="dark" on <html>
   and verify everything is readable and correct.

9. DO NOT TOUCH backend files
   No auth-service files. No entity files. No service files. No guards.
   Not even to "fix a small thing." Backend is frozen for this sprint.

---

## STEP 0 — STITCH MCP CONNECTION CHECK

Before ANY other work, run this inside your Claude Code session:

/mcp

Confirm stitch appears in the list with connected status and tool count.

Then fetch the Scrolloop Sentry design system:
- Call the appropriate Stitch tool to get your project's design system
- If you have a Stitch project named "scrolloop-sentry", fetch it
- Extract ALL token values: colors, fonts, spacing, radius, shadows, glass specs
- If no Stitch project exists yet, use the prompt in docs/ui/01-stitch-prompt.md
  to generate one in Stitch first, THEN fetch it

---

## STEP 1 — GLOBALS.CSS + TAILWIND CONFIG

File: apps/admin-portal/app/globals.css

Replace with the complete version using exact values from Stitch:

```css
@import url('https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,300;0,400;0,600;0,700;0,800;1,300&family=DM+Sans:wght@400;500&family=JetBrains+Mono:wght@400&display=swap');

:root {
  --font-display: 'Montserrat', sans-serif;
  --font-body: 'DM Sans', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  /* INSERT ALL STITCH TOKEN VALUES HERE */
  /* colors, spacing, radius, shadows, glass specs */
}

[data-theme="dark"] {
  /* INSERT STITCH DARK THEME OVERRIDES */
}

/* Animations */
@keyframes sentry-fade-up {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes sentry-scale-in {
  from { opacity: 0; transform: scale(0.97); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes sentry-shimmer {
  from { background-position: -400px 0; }
  to   { background-position: 400px 0; }
}
.animate-fade-up  { animation: sentry-fade-up  320ms cubic-bezier(0.4,0,0.2,1) both; }
.animate-scale-in { animation: sentry-scale-in 200ms cubic-bezier(0.4,0,0.2,1) both; }
.animate-shimmer  {
  background: linear-gradient(90deg, var(--color-bg-subtle) 25%, var(--color-bg-overlay) 50%, var(--color-bg-subtle) 75%);
  background-size: 800px 100%;
  animation: sentry-shimmer 1.5s linear infinite;
}
```

File: apps/admin-portal/tailwind.config.ts

Map EVERY token from globals.css to a Tailwind class. Structure:

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-base':       'var(--color-bg-base)',
        'bg-surface':    'var(--color-bg-surface)',
        'bg-subtle':     'var(--color-bg-subtle)',
        'bg-overlay':    'var(--color-bg-overlay)',
        'text-primary':  'var(--color-text-primary)',
        'text-secondary':'var(--color-text-secondary)',
        'text-tertiary': 'var(--color-text-tertiary)',
        'accent':        'var(--color-accent)',
        'accent-soft':   'var(--color-accent-soft)',
        'accent-dark':   'var(--color-accent-dark)',
        'border-default':'var(--color-border-default)',
        'border-strong': 'var(--color-border-strong)',
        'border-accent': 'var(--color-border-accent)',
        'danger':        'var(--color-danger)',
        'danger-soft':   'var(--color-danger-soft)',
        'warning':       'var(--color-warning)',
        'warning-soft':  'var(--color-warning-soft)',
        'info':          'var(--color-info)',
        'info-soft':     'var(--color-info-soft)',
      },
      borderRadius: {
        'xs': 'var(--radius-xs)',
        'sm': 'var(--radius-sm)',
        'md': 'var(--radius-md)',
        'lg': 'var(--radius-lg)',
        'xl': 'var(--radius-xl)',
      },
      fontFamily: {
        display: ['Montserrat', 'sans-serif'],
        body:    ['DM Sans', 'sans-serif'],
        mono:    ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'sm': 'var(--shadow-sm)',
        'md': 'var(--shadow-md)',
        'lg': 'var(--shadow-lg)',
        'xl': 'var(--shadow-xl)',
      },
    },
  },
};

export default config;
```

---

## STEP 2 — PROVIDERS AND ROOT LAYOUT

### ThemeProvider
File: apps/admin-portal/components/providers/ThemeProvider.tsx

```tsx
'use client';
import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';
const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({
  theme: 'light', toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const stored = (localStorage.getItem('sentry-theme') as Theme) ?? 'light';
    setTheme(stored);
    document.documentElement.setAttribute('data-theme', stored);
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('sentry-theme', next);
    document.documentElement.setAttribute('data-theme', next);
  };

  return <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
```

### Root layout
File: apps/admin-portal/app/layout.tsx

- Wrap everything in <ThemeProvider> and React Query <QueryClientProvider>
- Set font-family on <html> to var(--font-body)
- Default data-theme="light" on <html> (ThemeProvider overrides from localStorage)
- Import globals.css
- Remove the hardcoded Google AdSense script that currently exists (line ~51-55)
- Remove the hardcoded SDK tenant UUID — read from env:
  NEXT_PUBLIC_SENTRY_TENANT_SLUG

---

## STEP 3 — BASE COMPONENT LIBRARY

Create ALL of these in apps/admin-portal/components/ui/
Fetch from Stitch for each using: stitch.get_screen_code({ screen: 'ComponentName' })
or equivalent tool. Use the exact visual spec from Stitch.

### 3a — GlassCard.tsx
```tsx
interface GlassCardProps {
  tier?: 1 | 2 | 3;
  className?: string;
  children: React.ReactNode;
  padding?: 'sm' | 'md' | 'lg' | 'none';
}
```
Three tiers = three levels of frosted glass (opacity + blur + border).
Tier 1: stat tiles, sidebar. Tier 2: login card, modals. Tier 3: overlays.
All padding variants. animate-fade-up on mount.

### 3b — SentryButton.tsx
```tsx
interface SentryButtonProps {
  variant?: 'primary' | 'accent' | 'ghost' | 'destructive' | 'icon';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  className?: string;
  children: React.ReactNode;
}
```
Loading state: spinner replaces content, same width (no layout shift).
Primary = dark fill. Accent = mint fill. Ghost = subtle bg + border.
Destructive = danger color. Icon = square, 36px, ghost style.
NEVER rounded-full on any variant.

### 3c — SentryInput.tsx
```tsx
interface SentryInputProps {
  label?: string;
  error?: string;
  helperText?: string;
  type?: string;
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  rightElement?: React.ReactNode;  // for password toggle, copy button etc
}
```
Label: Montserrat 700, 10px, uppercase, tracking-wider — like a security panel.
Focus ring: accent color (mint), 2px.
Error: danger border + red helper text below.

### 3d — StatusBadge.tsx
```tsx
type BadgeStatus = 'active' | 'pending' | 'suspended' | 'deleted' |
                   'admin' | 'mfa-enabled' | 'system' | 'inactive';

interface StatusBadgeProps {
  status: BadgeStatus;
  size?: 'sm' | 'md';
  showDot?: boolean;
}
```
Radius: rounded-xs (NOT pill). Each status has its own color family.
Active = mint. Admin = info. Suspended = warning. Deleted = danger.

### 3e — NavItem.tsx
```tsx
interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  href: string;
  active?: boolean;
  badge?: number;  // notification count
}
```
Active: accent-soft background, accent-dark text, no left border stripe.
Hover: bg-overlay, text-primary.
Font: Montserrat 600, 12px.

### 3f — TokenDisplay.tsx
```tsx
interface TokenDisplayProps {
  value: string;
  label?: string;
  masked?: boolean;  // default true
  allowReveal?: boolean;  // default true
  onCopy?: () => void;
}
```
Monospace font. Masked: shows ••••••••a3f9 (last 4 visible).
Copy icon → checkmark for 1.5s. Eye icon to reveal full value.
Background: bg-subtle. Border: border-default.

### 3g — Skeleton.tsx
```tsx
interface SkeletonProps {
  variant?: 'text' | 'card' | 'table-row' | 'avatar' | 'button';
  lines?: number;  // for 'text' variant
  className?: string;
}
```
All variants use animate-shimmer class.
Card: matches GlassCard tier 1 dimensions.
Table-row: 48px height, full width.
Avatar: circle, 34px.

### 3h — EmptyState.tsx
```tsx
interface EmptyStateProps {
  icon?: React.ReactNode;  // Tabler icon, 40px
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: 'accent' | 'ghost';
  };
}
```
Centered layout. Never use character illustrations — geometric icons only.

### 3i — PageHeader.tsx
```tsx
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;  // Button slot
  breadcrumb?: { label: string; href?: string }[];
}
```
Title: Montserrat 600, 20px. Breadcrumb: Montserrat 500, 12px, text-tertiary.
Action slots top-right.

### 3j — DataTable.tsx
```tsx
interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  keyField: keyof T;
  onRowClick?: (row: T) => void;
  selectable?: boolean;
  onSelectionChange?: (selected: T[]) => void;
  emptyState?: React.ReactNode;
  pagination?: {
    hasNext: boolean;
    onNext: () => void;
    hasPrev: boolean;
    onPrev: () => void;
  };
}
```
Header: Montserrat 700, 10px, uppercase, tracking-wide, text-tertiary.
Row height: 48px. Hover: bg-overlay.
Borders: horizontal only (no vertical grid lines).
Row actions: right-aligned, visible only on hover (opacity-0 → opacity-100 on row hover).
Checkbox column when selectable=true.
Loading: show 5 Skeleton table-row components.

### 3k — ThemeToggle.tsx
Simple icon button. Sun icon in light mode, moon in dark mode.
Calls useTheme().toggle(). Size: 36×36px, icon variant of SentryButton.

### 3l — AuditTimeline.tsx
```tsx
interface AuditEvent {
  id: string;
  action: string;
  actor: string;
  outcome: 'success' | 'failure';
  timestamp: string;
  metadata?: Record<string, string>;
}

interface AuditTimelineProps {
  events: AuditEvent[];
  loading?: boolean;
}
```
Vertical line connecting dots.
Dot color: mint for success, danger for failure.
Action text: Montserrat 500 13px.
Timestamp: JetBrains Mono 11px, text-tertiary.
Actor: DM Sans 12px, text-secondary.

---

## STEP 4 — PORTAL LAYOUT

File: apps/admin-portal/components/layouts/portal-layout.tsx

Complete rewrite using the component library. Requirements:

Sidebar (240px, GlassCard tier 1):
- Wordmark: "Scrolloop " + <span className="text-accent font-display font-700">Sentry</span>
- Nav sections: Platform / Configure / Account
- Items: Dashboard, Users, RBAC, Clients, API Keys, Audit Log, Settings
- Use NavItem component for each
- Active state driven by current pathname (use usePathname())
- Real tenant name in sidebar header from useSession() hook

Topbar (height 56px, border-bottom):
- Left: current page title (from PageHeader or route)
- Center: search input (ghost style, 280px, placeholder "Search...")
- Right: ThemeToggle + notification bell (ti-bell icon) + user avatar dropdown
  Avatar dropdown: Profile / Settings / Sign out (sign out calls SDK logout)

Mobile: sidebar collapses to 64px icon-only.
Tablet (768px): sidebar collapses by default, hamburger to expand.

Wire real data:
- Tenant info: from useSession() SDK hook
- User avatar: from useUser() SDK hook
- Remove ALL hardcoded mock data

---

## STEP 5 — SCREENS

Work through in order. For each screen:
1. Call stitch.get_screen_code({ screen: 'screen-name' }) or equivalent
2. Study the Stitch output
3. Implement using the component library
4. Test light + dark theme
5. Check all three states (loading / empty / error)

### Screen 1: Login
File: apps/admin-portal/app/u/login/page.tsx

Two-panel layout (60/40), no sidebar:

```tsx
<main className="min-h-screen grid grid-cols-[60fr_40fr]">
  <LeftPanel />   {/* frosted glass form */}
  <RightPanel />  {/* dark editorial panel */}
</main>
```

Left panel:
- GlassCard tier 2, centered, max-w-[400px], animate-scale-in
- Wordmark at top
- Headline: "Welcome back" — Montserrat 300, not bold
- Subheadline: "Sign in to [tenant] workspace" — DM Sans 13px, text-tertiary
- SentryInput for email, SentryInput type="password"
- "Forgot password?" — right-aligned, DM Sans 11px, text-tertiary
- SentryButton variant="primary" fullWidth "Continue"
- Divider "or" with lines
- Social row: 3 SentryButton variant="ghost" icon-only (Google, GitHub, Microsoft)
- Error state: red text below password field

Right panel:
- Background: linear-gradient(145deg, #1A1916, #0D0C0B)
- Centered: ti-shield-lock icon (48px) inside mint-tinted glass circle
- Bottom editorial text: Montserrat 300 italic "Identity,\nengineered\nfor trust."
- Meta: Montserrat 700 10px uppercase "Scrolloop Sentry · Enterprise Auth"

MFA step (same page, conditional on auth state 'mfa_pending'):
- Replace form content with 6 individual SentryInput boxes (1 char each)
- Auto-advance focus on input
- Paste support (split pasted string across boxes)
- "Use a backup code instead" link below
- Mint focus ring on active box

Wire to SDK:
- On submit: call sdk.login({ email, password })
- If response.status === 'mfa_pending': show MFA step
- If MFA: call sdk.verifyMfa({ code })
- On success: redirect to /t/${tenantSlug}/dashboard
- Display API error messages

### Screen 2: Dashboard
File: apps/admin-portal/app/t/[slug]/page.tsx  (or dashboard/page.tsx)

```tsx
// Data hooks
const { data: stats }  = useQuery({ queryKey: ['stats', slug], queryFn: () => fetchStats(slug) })
const { data: events } = useQuery({ queryKey: ['events', slug], queryFn: () => fetchRecentEvents(slug) })
const { data: users }  = useQuery({ queryKey: ['users-recent', slug], queryFn: () => fetchRecentUsers(slug) })
```

Layout:
- Stats row: 4 GlassCard tier 1 tiles
  Total Users (with ↑12% delta), Active Sessions, API Calls 30d, MFA Adoption %
- Chart card: GlassCard tier 1, recharts AreaChart, mint fill at 20% opacity
  14-day login activity. X-axis: dates. Y-axis: login count.
- Recent users: GlassCard tier 1 with DataTable (5 rows, no pagination)
  Columns: avatar+name, email, StatusBadge, last active
  "View all users" link at bottom right

Loading: Skeleton for each section independently.
Stats loading: 4 Skeleton cards. Chart loading: tall Skeleton card.

### Screen 3: Users List
File: apps/admin-portal/app/t/[slug]/users/page.tsx

```tsx
const [cursor, setCursor] = useState<string | null>(null);
const [search, setSearch] = useState('');
const [statusFilter, setStatusFilter] = useState<string>('');

const { data, isLoading, error } = useQuery({
  queryKey: ['users', slug, cursor, search, statusFilter],
  queryFn: () => fetchUsers(slug, { cursor, search, status: statusFilter }),
});
```

Layout:
- PageHeader title="Users" action=<SentryButton variant="accent" onClick={openInviteModal}>Invite user</SentryButton>
- Filter bar: SentryInput search (with ti-search icon), status select, date range
- DataTable with columns:
    - Avatar (34px circle with initials) + name (Montserrat 500) + email (DM Sans 12px text-tertiary)
    - StatusBadge
    - Roles (comma-separated small chips)
    - MFA StatusBadge (mfa-enabled or none)
    - Last active (relative time: "2 hours ago")
    - Actions (hidden until row hover): View, Suspend, Delete
- Bulk action bar: slides up from bottom when rows selected
  "N selected" + Suspend selected / Delete selected / Export
- Pagination using nextCursor from API
- Invite user modal: SentryInput email, role select, Send Invite button
  Wire to: POST /api/tenant/:slug/users/invite endpoint

### Screen 4: User Detail
File: apps/admin-portal/app/t/[slug]/users/[id]/page.tsx  (CREATE)

```tsx
const { data: user } = useQuery({ queryKey: ['user', id], queryFn: () => fetchUser(slug, id) })
```

Two-column layout (1/3 + 2/3):

Left column:
- GlassCard tier 2: large avatar (52px), name Montserrat 600 18px, email DM Sans 13px
  StatusBadge, joined date, last active (all using JetBrains Mono for dates)
  MFA status chip
- Danger zone GlassCard (danger-soft background, danger border):
  "Danger Zone" label in danger color
  Three rows: Suspend account / Force password reset / Delete account
  Each row: description text + SentryButton variant="destructive"
  Delete: opens confirmation modal with type-to-confirm pattern

Right column — tabs (Montserrat 600 12px, sliding underline indicator):

Tab: Overview
- Editable profile fields (click to edit, inline save)
  Fields: Display name, Email, Phone, Metadata JSON editor
- Assigned roles: list with remove button per role, add role dropdown

Tab: Sessions
- DataTable: device/browser, IP (JetBrains Mono), location, started, last active, actions
- Row action: Revoke session (calls DELETE /sessions/:sessionId)
- "Revoke all sessions" button at top right (danger ghost)

Tab: Audit Log
- AuditTimeline component
- Filter by date range
- Load more button (cursor pagination)

Tab: Permissions
- Expandable tree grouped by resource namespace
  Format: users:read ✓ / users:write ✓ / sessions:* ✓
  Source shown per permission: "via Role: Admin" or "via Group: Engineering"
  Denied permissions shown in danger color with ✗

### Screen 5: RBAC
File: apps/admin-portal/app/t/[slug]/roles/page.tsx  (CREATE)

Split layout:

Left panel (280px, scrollable):
- "Roles & Policies" header + "New Role" accent button
- List of role cards (GlassCard tier 1):
  Each: role name (Montserrat 600), user count, system badge if isSystem
  Active role: accent border + accent-soft bg
- Below roles: "Groups & OUs" section header
  List of group cards similarly

Right panel (flex-1):
Shows either a role or group detail depending on selection.

Role detail:
- Name (editable if not system), description, type badges
- Permissions matrix: grouped by namespace
  Toggle per permission. Namespace headers collapsible.
- Policy documents section:
  List of attached policies (name + type badge + detach button)
  "Attach policy" dropdown
  Each policy expandable to show JSON document with JetBrains Mono syntax tinting
  Allow statements: accent-soft bg. Deny statements: danger-soft bg.
- Attached users: avatar stack + count

Group detail:
- Name, path (breadcrumb style), description
- Members table (name, email, joined group)
- Add member search
- Attached policies (same as role)
- Sub-groups (nested list)

### Screen 6: API Clients
File: apps/admin-portal/app/t/[slug]/clients/page.tsx  (CREATE)

```tsx
const { data: clients } = useQuery({ queryKey: ['clients', slug], queryFn: () => fetchClients(slug) })
```

Card grid (2 columns, gap-4):
Each GlassCard tier 1:
- Client name Montserrat 600 16px + type badge (SPA / M2M / Web)
- Client ID: TokenDisplay (masked)
- Created: DM Sans 12px text-tertiary
- Last used: relative time
- Status toggle: active/inactive (calls PATCH /clients/:id)

"New Client" accent button top-right → modal:
- 3 type option cards (GlassCard tier 1, selectable):
  SPA: ti-browser icon + "Single Page App" + description
  M2M: ti-server icon + "Machine to Machine" + description
  Web: ti-world icon + "Web Application" + description
- Name input
- Create button
- On success: show client secret ONCE in a modal (ti-alert icon, "Copy now — won't show again")

### Screen 7: Settings
File: apps/admin-portal/app/t/[slug]/settings/page.tsx

Tab navigation:

Tab: General
- Tenant name (editable SentryInput + save button)
- Tenant slug (TokenDisplay, read-only)
- Plan badge
- Logo upload (drag-and-drop zone, 400×200px preview)

Tab: Security
- MFA enforcement: toggle + description "Require MFA for all users"
- Session lifetime: slider (1h to 30d, labeled)
- Brute force protection: toggle + failed attempts threshold input
- Allowed callback URLs: tag-input (type URL, press Enter to add, × to remove)
- Password policy configurator:
  GlassCard tier 1 with 5 toggles: require uppercase, lowercase, numbers,
  special chars, breach detection
  Plus min-length slider (8–32)
  Plus max-age select (never / 30d / 60d / 90d / 180d)

Tab: Email
- SMTP configuration fields (host, port, username, password)
- From address
- "Send test email" button

Tab: Danger Zone
- GlassCard with danger-soft background and danger border
- "Delete Tenant" section:
  Warning text about irreversibility
  SentryButton variant="destructive" "Delete this tenant"
  Opens confirmation modal: type tenant slug to confirm

### Screen 8: Audit Log
File: apps/admin-portal/app/t/[slug]/audit/page.tsx  (CREATE)

```tsx
const { data, fetchNextPage } = useInfiniteQuery({
  queryKey: ['audit', slug, filters],
  queryFn: ({ pageParam }) => fetchAuditLog(slug, { cursor: pageParam, ...filters }),
  getNextPageParam: (last) => last.nextCursor,
})
```

Layout:
- PageHeader title="Audit Log" action=<Export button>
- Filter bar: search, action type filter (login/logout/user/rbac/mfa), outcome filter, date range
- Toggle: Timeline view / Table view

Timeline view: AuditTimeline component
Table view: DataTable with columns: action, actor, IP (mono), outcome badge, timestamp (mono)

Load more button at bottom (not infinite auto-scroll).
Export: triggers GET /audit/export with current filters, downloads CSV.

### Screen 9: MFA Enrollment
File: apps/admin-portal/app/mfa/enroll/page.tsx  (CREATE)

No sidebar. Centered layout. 4-step wizard.

Step indicator at top: 4 dots connected by a line
- Completed: mint filled dot with ti-check
- Active: mint outlined dot, larger
- Upcoming: gray outlined dot

Step 1 — Method selection:
3 GlassCard tier 1 cards, selectable (accent border when selected):
- ti-device-mobile + "Authenticator App" + "Use Google Authenticator, Authy, etc."
- ti-fingerprint + "Passkey" + "Use Face ID, Touch ID, or hardware key"
- ti-message + "SMS" + "Receive codes via text message"
  SentryButton accent "Continue" disabled until selection made

Step 2 — TOTP Setup:
- QR code centered (white background, 180×180px border, rounded-md)
- "Can't scan?" expandable → manual code in TokenDisplay
- 6-digit verify input (6 individual SentryInput boxes, 1 char each, auto-advance)
- SentryButton accent "Verify & Continue"

Step 3 — Backup Codes:
- GlassCard tier 1 with 10 codes in 2-column grid
  JetBrains Mono 14px, text-secondary
- Two buttons: "Download PDF" ghost + "Copy all" ghost
- Warning text: Montserrat 600 12px in warning color
  "Store these somewhere safe. Each code can only be used once."
- SentryButton accent "I've saved my codes, continue"

Step 4 — Success:
- ti-shield-check icon (48px) in mint glass circle, animate-scale-in
- "MFA enabled" Montserrat 300 24px
- Summary: method + backup codes count
- SentryButton primary "Go to dashboard"

### Screen 10: Invite Accept
File: apps/admin-portal/app/invite/[token]/page.tsx  (CREATE)

No sidebar. Centered layout.

On mount: validate token via GET /api/auth/invite/validate/:token
If invalid: show error state (expired/invalid token message + "Request a new invite" link)

If valid:
- GlassCard tier 2, max-w-[440px], animate-scale-in
- Invited by: small avatar + name + "has invited you to join"
- Tenant name: Montserrat 600 18px
- Form: SentryInput "Your name", SentryInput type="password" "Set password"
  Password strength indicator (bar using mint/warning/danger color based on strength)
- SentryButton accent "Accept & sign in" full width
  Wire to: POST /api/auth/invite/accept with { token, name, password }
  On success: auto-login (SDK handles token storage) → redirect to dashboard

---

## STEP 6 — REACT QUERY HOOKS

Create apps/admin-portal/hooks/ files for all data fetching.
These are the ONLY way to fetch data — no fetch() calls in components.
hooks/

useUsers.ts          — fetchUsers, useUsers, useUser, useInviteUser

useStats.ts          — useTenantStats

useAuditLog.ts       — useAuditLog (infinite query), useExportAudit

useClients.ts        — useClients, useClient, useCreateClient, useDeleteClient

useRoles.ts          — useRoles, useRole, useCreateRole, usePolicies

useGroups.ts         — useGroups, useGroup, useCreateGroup

useSessions.ts       — useUserSessions, useRevokeSession, useRevokeAllSessions

useMfa.ts            — useMfaSetup, useVerifyMfa, useBackupCodes

Every hook follows this pattern:
```typescript
// Example: useUsers.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSentryClient } from '@scrolloop/sdk/react';  // from the SDK

export function useUsers(tenantSlug: string, filters: UserFilters) {
  const sdk = useSentryClient();
  return useQuery({
    queryKey: ['users', tenantSlug, filters],
    queryFn: () => sdk.users.list(tenantSlug, filters),
    staleTime: 30_000,
  });
}

export function useInviteUser(tenantSlug: string) {
  const sdk = useSentryClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: InviteUserDto) => sdk.users.invite(tenantSlug, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', tenantSlug] });
    },
  });
}
```

---

## DELIVERABLES CHECKLIST

Frontend foundation:
- [ ] Stitch MCP was called — all token values come from Stitch (not invented)
- [ ] globals.css fully populated with Stitch tokens for light + dark theme
- [ ] tailwind.config.ts maps all tokens to Tailwind classes
- [ ] ThemeProvider implemented and wired into root layout
- [ ] Root layout has no hardcoded tenant UUID (reads from env)
- [ ] Google AdSense removed from layout

Components (ALL in components/ui/):
- [ ] GlassCard (3 tiers) — light + dark verified
- [ ] SentryButton (5 variants) — loading state works, no layout shift
- [ ] SentryInput — label, error, focus ring all working
- [ ] StatusBadge (7 statuses) — all colors correct in both themes
- [ ] NavItem — active state shows accent tint
- [ ] TokenDisplay — copy works, reveal toggle works
- [ ] Skeleton — shimmer animates in both themes
- [ ] EmptyState — renders cleanly
- [ ] PageHeader — breadcrumb + action slot work
- [ ] DataTable — sorting, selection, hover actions, pagination
- [ ] ThemeToggle — switches theme, persists across refresh
- [ ] AuditTimeline — dots + connecting line + correct colors

Layout:
- [ ] Portal layout uses NavItem for all nav items
- [ ] Portal layout reads tenant from SDK (no mock data)
- [ ] Sidebar active state driven by current pathname
- [ ] Topbar has ThemeToggle + avatar dropdown with working sign out
- [ ] Mobile/tablet sidebar behavior works

Screens (each: loading ✓, empty ✓, error ✓, light ✓, dark ✓):
- [ ] Login — two-panel, form wired to SDK, MFA step renders
- [ ] Dashboard — 4 stats, area chart, recent users table
- [ ] Users list — DataTable, filters, invite modal, bulk actions
- [ ] User detail — two-column, 4 tabs, all tabs fetch independently
- [ ] RBAC — split panel, roles + groups, policy JSON display
- [ ] API Clients — card grid, create modal with type selection
- [ ] Settings — 4 tabs, all fields wired to real endpoints
- [ ] Audit Log — timeline + table toggle, infinite scroll, export
- [ ] MFA Enrollment — 4-step wizard, all steps wired to SDK
- [ ] Invite Accept — token validation, form, auto-login

Code quality:
- [ ] Zero raw hex colors in any component file
- [ ] Zero raw design px values in any component file
- [ ] Zero console.log
- [ ] Zero TypeScript any in new files
- [ ] Zero mock/hardcoded data in any component
- [ ] tsc --noEmit passes on admin-portal
- [ ] All interactive elements have aria-labels
- [ ] Tab navigation works through forms

---

## IF STITCH MCP IS NOT CONNECTED WHEN YOU START

Run in your terminal BEFORE starting Claude Code:

```bash
# Authenticate with Google
gcloud auth application-default login

# Add Stitch MCP (user scope = available in all projects)
claude mcp add -e GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID \
  -s user stitch -- npx -y @_davideast/stitch-mcp proxy

# Start Claude Code in the repo
cd path/to/scrolloop-sentry
claude
```

Then verify inside the session:
/mcp
stitch must show as connected with tool count before proceeding.

Do not start Sprint 3 without Stitch connected.
# Scrolloop Sentry — Stitch Design System Prompt

Use this prompt inside Stitch (via MCP) to generate the complete design system
before ANY frontend work begins. This is the source of truth for all UI.

---

## PRODUCT CONTEXT

**Product name:** Scrolloop Sentry
**Tagline:** Identity, engineered for trust
**Product type:** Enterprise authentication platform (Auth0 competitor)
**Audience:** CTOs, security engineers, enterprise IT admins
**Parent brand:** Scrolloop (scrolloop.com)
**Aesthetic reference:** amaliaboier.com — luxury editorial restraint, things that breathe,
nothing shouts, everything whispers premium. Applied to SaaS with Apple-style glassmorphism.

---

## VISUAL DIRECTION

**Feel:**
- Warm off-white base, not cold dark navy, not clinical white
- Editorial Montserrat at light weights — weight carries meaning
- Frosted glass cards — every surface floats, nothing is a flat box
- Mint green as the single accent — punctuates once per screen, never decorates
- Rounded but not playful — 16–28px radii, iPadOS sheet energy
- Animations: slow fades, gentle 24px upward entrances, cubic-bezier(0.4, 0, 0.2, 1)
  Nothing bounces. Nothing spins. Everything eases.

**NOT:**
- Dark navy + gold (previous direction — rejected)
- Pure white clinical SaaS
- Pastel startup energy
- Generic blue enterprise software
- Anything that looks like Auth0, Okta, or Azure AD

---

## TYPOGRAPHY SYSTEM

### Fonts
- **Display / Headings:** Montserrat (Google Fonts)
  - Weights: 300 (hero display), 400 (subheadings), 600 (UI labels, nav), 700 (strong headings), 800 (logotype only)
  - Italic 300: for editorial accent phrases ("engineered for trust")
  - Letter spacing: -0.02em at 20px+, 0.08em for uppercase labels
- **Body / UI:** DM Sans
  - Weights: 400 (body), 500 (emphasis, interactive elements)
  - Line height: 1.6 paragraphs, 1.3 compact UI
- **Code / Tokens / IDs:** JetBrains Mono
  - Weight: 400
  - Used for: API keys, client IDs, JWT payloads, IP addresses, policy JSON, tenant slugs

### Type Scale (design tokens)
```
--text-xs:    10px / Montserrat 700 / tracking 0.09em / uppercase — micro labels
--text-sm:    12px / DM Sans 400 — secondary body
--text-base:  14px / DM Sans 400 — primary body
--text-md:    16px / DM Sans 500 — emphasized body
--text-lg:    18px / Montserrat 400 — section headings
--text-xl:    22px / Montserrat 300 — page headings
--text-2xl:   28px / Montserrat 300 — stat numbers, display
--text-3xl:   36px / Montserrat 300 italic — hero phrases
--text-4xl:   48px / Montserrat 300 — hero headline
```

---

## COLOR SYSTEM

### Base Palette — Light Theme (PRIMARY)

```
Warm Whites & Grays (Titanium DNA)
--gray-50:   #F7F6F4   ← page background (warm off-white, NOT pure white)
--gray-100:  #EFEDE9   ← secondary background, dividers
--gray-200:  #E2DED8   ← subtle borders, input backgrounds
--gray-300:  #C8C4BC   ← muted borders
--gray-400:  #9A9690   ← placeholder text
--gray-500:  #6E6A64   ← secondary text
--gray-600:  #4A4845   ← primary body text
--gray-700:  #2E2C2A   ← headings
--gray-800:  #1A1916   ← primary text, near-black
--gray-900:  #0D0C0B   ← absolute black (use sparingly)

Mint (Single Accent)
--mint-50:   rgba(42, 191, 108, 0.06)   ← subtle tint backgrounds
--mint-100:  rgba(42, 191, 108, 0.12)   ← badge backgrounds, hover tints
--mint-200:  rgba(42, 191, 108, 0.22)   ← borders on mint elements
--mint-400:  #2ABF6C                     ← primary accent, CTAs, active states
--mint-600:  #1D8F50                     ← text on mint backgrounds, dark accent
--mint-800:  #135E34                     ← deep mint for contrast

Semantic
--success:   #2ABF6C / rgba(42,191,108,0.10) bg
--warning:   #C4830A / rgba(196,131,10,0.10) bg
--danger:    #C0392B / rgba(192,57,43,0.08) bg
--info:      #2563EB / rgba(37,99,235,0.08) bg
--neutral:   #6E6A64 / rgba(0,0,0,0.05) bg
```

### Dark Theme

```
--dark-bg:       #111110   ← page background
--dark-surface:  #1C1B19   ← cards
--dark-elevated: #252422   ← modals, dropdowns
--dark-overlay:  #2E2C2A   ← hover states
--dark-border:   rgba(255,255,255,0.08)
--dark-border2:  rgba(255,255,255,0.13)
--dark-text1:    #F5F4F2
--dark-text2:    #B8B4AE
--dark-text3:    #6E6A64
--dark-mint:     #34D473   ← slightly brighter mint for dark mode legibility
```

### Glass Surfaces (Core Design Language)

```
Light mode glass:
--glass-1: background rgba(255,255,255,0.68), blur(20px), border rgba(255,255,255,0.55)
--glass-2: background rgba(255,255,255,0.80), blur(28px), border rgba(255,255,255,0.60)  ← modals, login card
--glass-3: background rgba(255,255,255,0.92), blur(32px), border rgba(255,255,255,0.70)  ← top-level overlays

Dark mode glass:
--glass-dark-1: background rgba(28,27,25,0.72), blur(20px), border rgba(255,255,255,0.07)
--glass-dark-2: background rgba(28,27,25,0.85), blur(28px), border rgba(255,255,255,0.10)
```

---

## SPACING & RADIUS SYSTEM

```
Radius
--r-xs:  6px    ← badges, chips, small inputs
--r-sm:  10px   ← buttons, input fields, small cards
--r-md:  16px   ← standard cards, panels
--r-lg:  22px   ← large cards, login card, modals
--r-xl:  28px   ← full-bleed panels, hero sections
--r-full: 9999px ← pills only

Spacing (8pt grid)
--space-1:  4px
--space-2:  8px
--space-3:  12px
--space-4:  16px
--space-5:  20px
--space-6:  24px
--space-8:  32px
--space-10: 40px
--space-12: 48px
--space-16: 64px

Shadows (light mode)
--shadow-sm:  0 1px 4px rgba(0,0,0,0.04)
--shadow-md:  0 2px 16px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)
--shadow-lg:  0 8px 40px rgba(0,0,0,0.09), 0 2px 8px rgba(0,0,0,0.05)
--shadow-xl:  0 20px 60px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06)
```

---

## COMPONENT LIBRARY

Design every component below in both light and dark themes.
All states: default, hover, focus, active, disabled, loading, error.

### 1. Buttons

**Primary (Dark fill):**
- Background: --gray-800, color: white
- Radius: --r-sm (10px)
- Height: 42px default, 36px sm, 48px lg
- Font: Montserrat 600, 13px, tracking 0.02em
- Hover: --gray-700, lift shadow-sm
- No rounded-full. Never.

**Accent (Mint fill):**
- Background: --mint-400
- Same sizing as primary
- Used ONLY for the single most important CTA per screen

**Ghost:**
- Background: rgba(0,0,0,0.04), border: 1px solid --gray-300
- Color: --gray-600
- Hover: rgba(0,0,0,0.07)

**Destructive:**
- Background: --danger background, color: --danger text
- Border: 1px solid danger border

**Icon button:** 36×36px, ghost style, radius --r-sm

**Loading state:** spinner replaces label, same dimensions, no layout shift

### 2. Inputs & Form Fields

- Height: 42px
- Background: rgba(0,0,0,0.03)
- Border: 1px solid --gray-300
- Border-radius: --r-sm
- Font: DM Sans 14px
- Focus ring: 0 0 0 3px rgba(42,191,108,0.18), border-color: --mint-400
- Error: border-color danger, red helper text below at 11px
- Label: Montserrat 700, 10px, uppercase, tracking 0.09em, --gray-400 color
  — feels like a security terminal label, precise
- Placeholder: --gray-400

### 3. Glass Cards

Three tiers (match glass surfaces above):

**Card-1 (Default panel):**
- Glass-1 surface + shadow-md + --r-md (16px)
- Padding: 16px 18px
- Use for: stat tiles, table containers, sidebar sections

**Card-2 (Elevated panel):**
- Glass-2 surface + shadow-lg + --r-lg (22px)
- Padding: 20px 24px
- Use for: login card, modal containers, feature cards

**Card-3 (Sheet/overlay):**
- Glass-3 surface + shadow-xl + --r-xl (28px)
- Use for: onboarding steps, full-screen overlays

### 4. Navigation Sidebar

- Width: 200px collapsed content, 240px with padding
- Background: glass-2 surface (frosted, slightly more opaque than page cards)
- No hard border on right — subtle shadow separates from content
- Logo area: 56px height
  - "Scrolloop Sentry" wordmark in Montserrat 700
  - "Sentry" in --mint-400
  - Or abbreviated "SS●" where ● is mint
- Nav section labels: Montserrat 700, 9px, uppercase, tracking 0.12em, --gray-400
- Nav items: 36px height, Montserrat 500 12px, icon (14px) + label
  - Default: --gray-500, transparent bg
  - Hover: --gray-700, rgba(0,0,0,0.04) bg
  - Active: --mint-dark text, mint-100 bg, NO left border stripe (too basic)
    Instead: subtle left inset shadow or just the tint is enough

### 5. Data Table

- Header: Montserrat 700, 10px, uppercase, tracking 0.08em, --gray-400
- Row height: 48px
- Hover: rgba(0,0,0,0.025) row tint
- Bottom border only on rows: 1px solid --gray-100
- Checkbox column: 40px
- Actions column: right-aligned, visible only on row hover (opacity transition)
- No vertical borders ever

### 6. Badges / Status Chips

- Radius: --r-xs (6px) NOT pill-shaped — these are status indicators, not tags
- Height: 22px sm, 26px default
- Font: Montserrat 600, 11px
- All use: subtle bg + matching text + 1px border (all from same color family)

States:
- Active: mint palette
- Pending: warning palette
- Suspended: danger palette
- Admin: info palette
- MFA enabled: mint palette + lock icon
- System: neutral palette

### 7. Modals & Dialogs

- Backdrop: rgba(0,0,0,0.35) + backdrop-filter blur(4px)
- Modal: Glass-2 card, --r-lg, max-width 480px sm / 640px md / 780px lg
- Header: Montserrat 600 16px title, X button top-right (ghost icon btn)
- Footer: right-aligned, always Primary + Ghost pairing
- Danger modal: danger-tinted header strip (4px top border in danger color)
- Confirmation pattern: "Type [resource name] to confirm" input before destructive action

### 8. Toasts

- Position: bottom-right, 16px from edges
- Width: 360px
- Glass-2 card style, shadow-lg
- Left border: 3px solid (color matches type) with radius 0 on left side
- Icon + title (Montserrat 600) + optional description (DM Sans 400)
- Auto-dismiss: 4s with thin progress line at bottom
- Stack multiple toasts with 8px gap

### 9. Monospace / Token Display

```
Background: rgba(0,0,0,0.04)
Border: 1px solid --gray-200
Radius: --r-sm
Font: JetBrains Mono 12px
Padding: 10px 14px
```

- Masked display: `fk_live_••••••••••••a3f9` with copy icon right-aligned
- Copy feedback: icon turns to checkmark for 1.5s, no tooltip needed
- Full reveal: eye icon toggles mask

### 10. Empty States

- Geometric icon (Tabler outline, 40px, --gray-300)
- Montserrat 400 16px title, DM Sans 14px description
- CTA button (ghost or primary depending on context)
- Never use illustrations with characters

### 11. Skeletons / Loading

- Animated shimmer: CSS animation from --gray-100 to --gray-200 and back
- 1.5s duration, ease-in-out, infinite
- Match exact layout of the content it replaces

### 12. Progress / Stats

- Progress bar: 3px height, --gray-200 track, --mint-400 fill, radius 2px
- Stat number: Montserrat 300, 28px, --gray-800
- Positive delta: Montserrat 600 12px, --mint-dark, "↑12%" format
- Negative delta: same size, --danger text

---

## SCREENS TO DESIGN

Design all screens in both light and dark. All interactive states.
Desktop (1280px) primary. Tablet (768px) secondary. Mobile (375px) for user-facing only.

### Screen 1: Login Page
**Layout:** Two-panel split (60/40)

Left panel (60%):
- Glass-2 card centered, max-width 400px
- "Scrolloop Sentry" wordmark with mint dot at top
- Headline: Montserrat 300 "Welcome back, [name]" — NOT bold
- Subheadline: DM Sans 13px "Sign in to [Tenant] workspace"
- Email input, password input, "Forgot password?" link (right-aligned, 11px)
- Primary dark button "Continue" full-width
- Divider "or" with lines
- Social buttons row: Google, GitHub, Microsoft — icon only, ghost style, equal width

Right panel (40%):
- Background: radial gradient from --gray-800 to --gray-900 (near-black, warm)
- Centered: Sentry shield icon (Tabler ti-shield-lock, 48px) in mint-tinted glass circle
- Quote at bottom: Montserrat 300 italic "Identity,\nengineered for\ntrust."
- Below quote: Montserrat 700 10px uppercase tracking "Scrolloop Sentry · Enterprise Auth"
- Mint dot before the meta text

MFA step: same layout, left panel transitions to 6-digit TOTP input
- 6 individual character boxes (42×52px each), auto-advance, paste support
- Below: "Use a backup code instead" link
- Mint focus ring on active box

### Screen 2: Admin Dashboard (Portal Home)
- Sidebar (left, 240px) + Main content
- Topbar: tenant name badge, search (ghost, 240px), notification bell, avatar
- Stats row: 4 glass-1 tiles — Total Users, Active Sessions, API Calls (30d), MFA Adoption
- Chart: login activity area chart, mint fill with low opacity, 14-day view
- Recent events table: type, actor, IP (hashed), time, outcome badge

### Screen 3: Users List
- Page header: Montserrat 600 20px "Users", mint button "Invite user" top-right
- Filter bar: search input, status filter dropdown, role filter, date range
- Glass-1 table card: avatar+name, email, status badge, roles, MFA badge, last active, actions
- Bulk action bar: slides up from bottom when rows selected (glass-2, shadow-xl)
- Empty state with invite CTA

### Screen 4: User Detail
- Breadcrumb: Montserrat 500 12px "Users / Arjun Rao"
- Left col (1/3): Glass-2 user card
  - Large avatar (52px), name Montserrat 600 18px, email DM Sans 13px
  - Status badge, joined date, last active
  - Below: Danger zone section (danger-tinted glass card)
    - Suspend, Force Reset, Delete — each its own ghost/danger button
- Right col (2/3): tab navigation
  - Tabs: Overview · Sessions · Audit Log · Permissions
  - Tab style: Montserrat 600 12px, underline indicator in mint, NOT pill tabs
  - Overview: editable profile fields, MFA status card, roles list
  - Sessions: table of active sessions with revoke button per row
  - Audit Log: timeline (vertical line + event dots, mint for auth events)
  - Permissions: expandable tree by resource namespace

### Screen 5: RBAC — Roles & Policies
- Split: left panel (280px) roles list + right panel role detail
- Left: scrollable list of roles, each a card with name + user count + type badge
  "Create Role" button at top (mint)
- Right: selected role
  - Name (editable), description, system badge if immutable
  - Permissions matrix: grouped by namespace (users:*, sessions:*, audit:*)
    Each permission: toggle + label + resource pattern
  - Policy JSON editor: JetBrains Mono, syntax highlighted, Allow=mint / Deny=danger
  - Attached users: avatar stack + "+N more" count

### Screen 6: API Keys & OAuth Clients
- Cards grid (not table): 2 columns
- Each client card (Glass-1):
  - Client name Montserrat 600, type badge (SPA / M2M / Web)
  - Client ID: masked monospace with copy icon
  - Created, last used
  - Status toggle (active/inactive)
- Create New: glass-2 modal with 3 illustrated type options
  (simple geometric SVG icons for SPA / Machine-to-Machine / Web App)

### Screen 7: Tenant Settings
- Tab bar: General · Branding · Security · Email · Danger Zone
- General: tenant name, slug (readonly monospace), plan badge
- Branding: logo upload dropzone, brand color picker, login page preview iframe
- Security: glass-1 cards for each policy group
  - MFA enforcement: toggle + description
  - Session lifetime: slider (1h to 30d)
  - Callback URLs: tag-input component
  - Password policy: 5 toggles + min-length slider
- Danger Zone: red-tinted glass card, delete tenant with confirmation modal

### Screen 8: MFA Enrollment (User-facing flow)
Step 1 — Method selection:
- 3 glass-2 cards: TOTP / Passkey / SMS
- Each with Tabler icon (48px), name Montserrat 600, description DM Sans 13px
- Mint selected state (border + tint)

Step 2 — TOTP Setup:
- QR code centered in glass-2 card
- Manual code below in JetBrains Mono, copy button
- 6-digit verify input beneath
- "Verify & Continue" mint button

Step 3 — Backup Codes:
- Glass-1 card with 10 codes in 2-column grid
- JetBrains Mono 14px, --gray-600
- "Download PDF" + "Copy All" ghost buttons
- Warning: Montserrat 600 "Store these somewhere safe. Each code can only be used once."

Step 4 — Success:
- Checkmark in mint glass circle (animate in with scale 0.5→1 + opacity)
- "MFA enabled" Montserrat 300 24px
- Summary card: method enrolled, backup codes count

### Screen 9: Invite Accept (User-facing)
- Centered glass-2 card, max-width 440px
- "You've been invited to [Tenant]" Montserrat 300 22px
- Invited by: avatar + name
- Set name, set password (with strength indicator using mint progress bar)
- Accept & Sign In — mint button

### Screen 10: Superadmin Console
- Distinct from tenant portal — darker topbar (--gray-800 glass) to signal elevated access
- "Superadmin" red badge in topbar
- Tenant list table: name, slug, plan, users, status, created
- Platform stats: total tenants, total users, active keys, JWT signing key status
- Key management: current active key kid, expiry date, Rotate Key button
- Platform-wide audit log

---

## ANIMATION SPEC

All transitions use: `cubic-bezier(0.4, 0, 0.2, 1)`

```
Page entrance:    opacity 0→1 + translateY 20px→0, duration 320ms, delay 40ms
Card entrance:    opacity 0→1 + translateY 12px→0, duration 240ms
Hover lift:       translateY 0→-1px + shadow-sm→shadow-md, duration 150ms
Button press:     scale 1→0.98, duration 80ms
Modal enter:      opacity 0→1 + scale 0.97→1, duration 200ms
Modal backdrop:   opacity 0→1, duration 180ms
Toast enter:      translateX 100%→0 + opacity 0→1, duration 280ms
Tab indicator:    left/width transition, duration 200ms (sliding underline)
Skeleton shimmer: background-position animation, 1.5s linear infinite
Number count-up:  on stat tiles, 600ms ease-out (use countUp.js or CSS)
```

---

## DELIVERABLES FROM STITCH

1. Complete Figma component library with all design tokens as Figma variables
2. All 10 screens × 2 themes (light + dark) = 20 frames
3. All interactive states per component
4. Responsive variants: desktop / tablet / mobile where specified
5. CSS variable export (exact token names from this document)
6. Font pairing documented with exact weights and sizes
7. Developer handoff annotations: spacing in px, color token names (not hex)
8. Export glass card specs as CSS snippets
9. Component naming must match the code: `GlassCard`, `SentryButton`, `NavItem`,
   `StatusBadge`, `TokenDisplay`, `AuditTimeline`, etc.

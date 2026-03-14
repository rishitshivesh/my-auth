# Dashboard, Auth Flow & Password Reset OTP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a full Auth0-style dashboard for the admin-portal, fix the post-login redirect, convert password reset to OTP-based flow, and add MFA setup in the dashboard.

**Architecture:** The dashboard lives at `/dashboard` in the Next.js admin-portal app. After login/session-restore, users are redirected there. A single new `DashboardController` on the backend returns all overview data in one call. Password reset is converted from link+token to 6-digit OTP using the existing `otp.html` email template.

**Tech Stack:** Next.js 16 (App Router), NestJS, TypeORM, `@repo/ui` (shadcn components including Skeleton, Tabs, InputOtp), `@fortknox/sdk` (FortKnox client), Framer Motion, Tailwind CSS

---

## Key File Reference

- **SDK client:** `packages/fortknox-sdk/src/core/client.ts`
- **SDK React provider:** `packages/fortknox-sdk/src/react/index.tsx`
- **Auth service:** `apps/auth-service/src/modules/auth/auth.service.ts`
- **Auth controller:** `apps/auth-service/src/modules/auth/auth.controller.ts`
- **Auth DTOs:** `apps/auth-service/src/modules/auth/auth.dto.ts`
- **Email service:** `apps/auth-service/src/modules/email/email.service.ts`
- **OTP template:** `apps/auth-service/templates/otp.html`
- **Module registry:** `apps/auth-service/src/modules/index.ts`
- **Login flow:** `apps/admin-portal/components/auth/step-based-auth-flow.tsx`
- **Reset page:** `apps/admin-portal/app/u/reset-password/page.tsx`
- **Reset form:** `apps/admin-portal/components/auth/reset-password-form.tsx`
- **Portal layout:** `apps/admin-portal/components/layouts/portal-layout.tsx`
- **Response shape:** ALL backend responses are wrapped as `{ status: 200, data: <payload> }` by the global `ResponseInterceptor`

---

## Task 1: SDK — Add `forgotPassword` and `resetPassword` methods

**Files:**
- Modify: `packages/fortknox-sdk/src/core/client.ts` (after `loginIntent` method, ~line 116)

**Step 1: Add the two methods to `FortKnoxClient`**

Add after the `loginIntent` method (line ~116):

```typescript
/**
 * Request password reset OTP
 */
async forgotPassword(email: string): Promise<void> {
  this.log("Forgot password request", { email });
  const response = await this.transport({
    url: `${this.config.baseURL}/auth/forgot-password`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": this.config.tenant,
    },
    body: { email },
  });

  if (!response.ok) {
    throw this.createError(response);
  }
}

/**
 * Reset password with OTP
 */
async resetPassword(otp: string, password: string): Promise<void> {
  this.log("Reset password attempt");
  const response = await this.transport({
    url: `${this.config.baseURL}/auth/reset-password`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": this.config.tenant,
    },
    body: { otp, password },
  });

  if (!response.ok) {
    throw this.createError(response);
  }
}
```

**Step 2: Export the methods on the react provider**

In `packages/fortknox-sdk/src/react/index.tsx`:

Add to the `AuthContextValue` interface:
```typescript
forgotPassword: (email: string) => Promise<void>;
resetPassword: (otp: string, password: string) => Promise<void>;
```

Add the implementations before the `value` object (after `refreshUser`):
```typescript
const forgotPassword = async (email: string) => {
  try {
    setError(null);
    await client.forgotPassword(email);
  } catch (err) {
    setError(err as Error);
    throw err;
  }
};

const resetPassword = async (otp: string, password: string) => {
  try {
    setError(null);
    await client.resetPassword(otp, password);
  } catch (err) {
    setError(err as Error);
    throw err;
  }
};
```

Add both to the `value` object:
```typescript
forgotPassword,
resetPassword,
```

**Step 3: Verify TypeScript compiles**

```bash
cd /Users/rishitshivesh/Projects/Personal/my-auth
npx tsc --noEmit -p packages/fortknox-sdk/tsconfig.json 2>&1 | head -20
```

Expected: no errors (or only pre-existing ones)

---

## Task 2: Backend — Convert password reset from link+token to 6-digit OTP

The current flow generates a 64-char hex token and emails a clickable URL. We change it to generate a 6-digit numeric OTP and email the code directly using the existing `otp.html` template.

**Files:**
- Modify: `apps/auth-service/src/modules/auth/auth.service.ts` (lines ~420-465 `forgotPassword`, lines ~467-520 `resetPassword`)
- Modify: `apps/auth-service/src/modules/auth/auth.dto.ts` (`ResetPasswordDto` - rename `token` to `otp`)
- Modify: `apps/auth-service/src/modules/email/email.service.ts` (add `sendPasswordResetOtpEmail` method)

**Step 1: Update `auth.dto.ts` — rename `token` to `otp` in `ResetPasswordDto`**

Find this in `auth.dto.ts`:
```typescript
export class ResetPasswordDto {
  @ApiProperty({ example: "reset-token-here" })
  @IsString()
  token!: string;
```

Replace with:
```typescript
export class ResetPasswordDto {
  @ApiProperty({ example: "123456", description: "6-digit OTP from email" })
  @IsString()
  otp!: string;
```

**Step 2: Add `sendPasswordResetOtpEmail` to `email.service.ts`**

The existing `otp.html` template expects: `{ userName, otpCode, expiresIn, tenantName, tenantLogo }` (check the template to confirm variable names). Add this method after `sendPasswordResetEmail`:

```typescript
/**
 * Send password reset OTP email
 */
async sendPasswordResetOtpEmail(
  user: User,
  otp: string,
): Promise<boolean> {
  const branding = await this.getTenantBranding(user.tenantId);

  const html = await this.renderTemplate("otp", {
    userName: user.firstName || user.email.split("@")[0],
    userEmail: user.email,
    otpCode: otp,
    expiresIn: "15 minutes",
    purpose: "password reset",
    ...branding,
  });

  return this.sendEmail({
    to: user.email,
    subject: "Your password reset code",
    html,
    tenantId: user.tenantId,
    userId: user.id,
    emailType: "password_reset_otp",
  });
}
```

**Step 3: Update `auth.service.ts` — `forgotPassword` to generate 6-digit OTP**

Find `forgotPassword` method (~line 420). Change the token generation block:

```typescript
// BEFORE:
const resetToken = crypto.randomBytes(32).toString("hex");
const resetTokenHash = crypto
  .createHash("sha256")
  .update(resetToken)
  .digest("hex");

await this.userRepository.update(
  { id: user.id, tenantId },
  {
    passwordResetToken: resetTokenHash,
    passwordResetExpiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
  },
);
// ...
await this.emailService.sendPasswordResetEmail(user, resetToken);
```

```typescript
// AFTER:
const otp = Math.floor(100000 + Math.random() * 900000).toString();
const otpHash = crypto.createHash("sha256").update(otp).digest("hex");

await this.userRepository.update(
  { id: user.id, tenantId },
  {
    passwordResetToken: otpHash,
    passwordResetExpiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
  },
);
// ...
await this.emailService.sendPasswordResetOtpEmail(user, otp);

console.log("Password reset OTP:", otp); // For development
```

**Step 4: Update `auth.service.ts` — `resetPassword` to use `otp` param**

Find the method signature at ~line 467:
```typescript
// BEFORE:
async resetPassword(tenantId: string, token: string, newPassword: string) {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
```

```typescript
// AFTER:
async resetPassword(tenantId: string, otp: string, newPassword: string) {
  const tokenHash = crypto.createHash("sha256").update(otp).digest("hex");
```

**Step 5: Update `auth.controller.ts` — pass `otp` instead of `token`**

Find ~line 194:
```typescript
// BEFORE:
await this.authService.resetPassword(
  tenantId,
  resetPasswordDto.token,
  resetPasswordDto.password,
);
```

```typescript
// AFTER:
await this.authService.resetPassword(
  tenantId,
  resetPasswordDto.otp,
  resetPasswordDto.password,
);
```

**Step 6: Check the otp.html template for correct variable names**

```bash
cat /Users/rishitshivesh/Projects/Personal/my-auth/apps/auth-service/templates/otp.html | grep '{{' | head -20
```

Adjust the template variables in `sendPasswordResetOtpEmail` if they differ from `otpCode`, `userName`, etc.

---

## Task 3: Backend — Create Dashboard Controller

Create a single endpoint `GET /dashboard` that returns user profile + MFA status + active session count in one call.

**Files:**
- Create: `apps/auth-service/src/modules/dashboard/dashboard.controller.ts`
- Create: `apps/auth-service/src/modules/dashboard/dashboard.module.ts`
- Modify: `apps/auth-service/src/modules/index.ts`

**Step 1: Create `dashboard.controller.ts`**

```typescript
// apps/auth-service/src/modules/dashboard/dashboard.controller.ts

import { Controller, Get, Request } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User, Session, MfaSettings } from "@repo/database";
import { Protected } from "@/common/decorators/protected.decorator";

@ApiTags("Dashboard")
@Controller("dashboard")
@Protected()
export class DashboardController {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(MfaSettings)
    private readonly mfaRepository: Repository<MfaSettings>,
  ) {}

  @Get()
  @ApiOperation({ summary: "Get dashboard overview for current user" })
  async getOverview(@Request() req: any) {
    const userId = req.user.sub;
    const tenantId = req.tenantId!;

    const [user, activeSessions, mfaSettings] = await Promise.all([
      this.userRepository.findOne({ where: { id: userId, tenantId } }),
      this.sessionRepository.count({
        where: { userId, tenantId, isRevoked: false },
      }),
      this.mfaRepository.findOne({ where: { userId, tenantId } }),
    ]);

    return {
      user: {
        id: user?.id,
        email: user?.email,
        firstName: user?.firstName,
        lastName: user?.lastName,
        displayName: user?.displayName,
        avatarUrl: user?.avatarUrl,
        emailVerified: user?.emailVerified,
        lastLoginAt: user?.lastLoginAt,
        createdAt: user?.createdAt,
        primaryAuthMethod: user?.primaryAuthMethod,
      },
      mfa: {
        enabled: mfaSettings?.totpEnabled ?? false,
        totpEnabled: mfaSettings?.totpEnabled ?? false,
        emailOtpEnabled: mfaSettings?.emailOtpEnabled ?? false,
        backupCodesCount: mfaSettings?.backupCodes?.length ?? 0,
      },
      stats: {
        activeSessions,
        lastLoginAt: user?.lastLoginAt,
      },
    };
  }
}
```

**Step 2: Create `dashboard.module.ts`**

```typescript
// apps/auth-service/src/modules/dashboard/dashboard.module.ts

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User, Session, MfaSettings } from "@repo/database";
import { DashboardController } from "./dashboard.controller";

@Module({
  imports: [TypeOrmModule.forFeature([User, Session, MfaSettings])],
  controllers: [DashboardController],
})
export class DashboardModule {}
```

**Step 3: Register in `modules/index.ts`**

Add to the imports array:
```typescript
import { DashboardModule } from "@/modules/dashboard/dashboard.module";
// ...
@Module({
  imports: [
    UserModule,
    AuthModule,
    TenantModule,
    OAuthModule,
    RbacModule,
    MfaModule,
    SessionModule,
    DashboardModule,  // ← add this
    ScheduleModule.forRoot(),
  ],
})
```

**Step 4: Verify auth-service compiles**

```bash
cd /Users/rishitshivesh/Projects/Personal/my-auth/apps/auth-service
npx tsc --noEmit 2>&1 | head -30
```

---

## Task 4: Frontend — Auth Redirect After Login

Wire up the post-login redirect to `/dashboard` in both the login form and the provider initialization.

**Files:**
- Modify: `apps/admin-portal/components/auth/step-based-auth-flow.tsx`
- Modify: `apps/admin-portal/app/u/login/page.tsx`

**Step 1: Update `step-based-auth-flow.tsx` — redirect after credentials submit**

Replace `handleCredentialsSubmit`:
```typescript
const handleCredentialsSubmit = async (email: string, password?: string) => {
  try {
    const result = await login({ email, password });
    // login() sets the user in context; redirect to dashboard
    router.push("/dashboard");
  } catch (err: any) {
    if (err?.message === "MFA_REQUIRED") {
      router.push("/u/mfa");
      return;
    }
    console.error("[FortKnox] Credentials submission error:", err);
  }
}
```

**Step 2: Update `login/page.tsx` — redirect if already authenticated on load**

```typescript
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { StepBasedAuthFlow } from "@/components/auth/step-based-auth-flow";
import { UniversalAuthLayout } from "@/components/layouts/universal-auth-layout";
import { useAuth } from "@fortknox/sdk";

export default function LoginPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && user) {
      router.replace("/dashboard");
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <UniversalAuthLayout
        heroTitle="Welcome back"
        heroSubtitle="Sign in to your Fort Knox account to continue"
        primaryColor="#6366f1"
      >
        <div className="space-y-4 animate-pulse">
          <div className="h-10 bg-muted rounded-lg" />
          <div className="h-10 bg-muted rounded-lg" />
          <div className="h-10 bg-muted rounded-lg" />
        </div>
      </UniversalAuthLayout>
    );
  }

  return (
    <UniversalAuthLayout
      heroTitle="Welcome back"
      heroSubtitle="Sign in to your Fort Knox account to continue"
      primaryColor="#6366f1"
    >
      <StepBasedAuthFlow primaryColor="#6366f1" />
    </UniversalAuthLayout>
  );
}
```

---

## Task 5: Frontend — Password Reset OTP Flow (3 stages)

Replace the mock `reset-password` page with a real 3-stage flow: email → OTP entry → new password.

**Files:**
- Modify: `apps/admin-portal/app/u/reset-password/page.tsx`
- Rewrite: `apps/admin-portal/components/auth/reset-password-form.tsx`

**Step 1: Rewrite `reset-password-form.tsx`**

The form handles 3 stages internally. It uses `InputOtp` from `@repo/ui` for the OTP input.

```typescript
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button, Input, Label, InputOTP, InputOTPGroup, InputOTPSlot } from "@repo/ui"
import { useAuth } from "@fortknox/sdk"

interface ResetPasswordFormProps {
  primaryColor?: string
}

export function ResetPasswordForm({ primaryColor }: ResetPasswordFormProps) {
  const router = useRouter()
  const { forgotPassword, resetPassword } = useAuth()

  const [stage, setStage] = useState<"request" | "otp" | "reset">("request")
  const [email, setEmail] = useState("")
  const [otp, setOtp] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await forgotPassword(email)
      setStage("otp")
    } catch (err: any) {
      setError(err?.message || "Failed to send reset code. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleOtpComplete = (value: string) => {
    setOtp(value)
    if (value.length === 6) {
      setStage("reset")
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password !== confirmPassword) {
      setError("Passwords do not match")
      return
    }
    setLoading(true)
    try {
      await resetPassword(otp, password)
      router.push("/u/login?reset=success")
    } catch (err: any) {
      setError(err?.message || "Invalid or expired code. Please try again.")
      setStage("otp")
      setOtp("")
    } finally {
      setLoading(false)
    }
  }

  const btnStyle = primaryColor ? { backgroundColor: primaryColor } : undefined

  if (stage === "request") {
    return (
      <form onSubmit={handleRequestReset} className="space-y-6">
        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </div>
        <p className="text-sm text-muted-foreground">
          We'll send a 6-digit code to this email address.
        </p>
        <Button type="submit" className="w-full" disabled={loading} style={btnStyle}>
          {loading ? "Sending code..." : "Send reset code"}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Remember your password?{" "}
          <a href="/u/login" className="text-primary hover:underline font-medium">
            Sign in
          </a>
        </p>
      </form>
    )
  }

  if (stage === "otp") {
    return (
      <div className="space-y-6">
        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          Enter the 6-digit code sent to <span className="font-medium text-foreground">{email}</span>
        </p>
        <div className="flex justify-center">
          <InputOTP maxLength={6} value={otp} onChange={handleOtpComplete}>
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </div>
        <p className="text-center text-sm text-muted-foreground">
          Didn't receive the code?{" "}
          <button
            type="button"
            className="text-primary hover:underline font-medium"
            onClick={() => { setStage("request"); setOtp(""); setError(null); }}
          >
            Resend
          </button>
        </p>
      </div>
    )
  }

  // stage === "reset"
  return (
    <form onSubmit={handleResetPassword} className="space-y-6">
      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          type="password"
          placeholder="Minimum 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input
          id="confirmPassword"
          type="password"
          placeholder="Confirm your new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading} style={btnStyle}>
        {loading ? "Resetting password..." : "Reset password"}
      </Button>
    </form>
  )
}
```

**Step 2: Update `reset-password/page.tsx`**

Replace entirely with:
```typescript
"use client"

import { ResetPasswordForm } from "@/components/auth/reset-password-form"
import { UniversalAuthLayout } from "@/components/layouts/universal-auth-layout"

export default function ResetPasswordPage() {
  return (
    <UniversalAuthLayout
      heroTitle="Reset your password"
      heroSubtitle="We'll help you regain access to your account"
      primaryColor="#6366f1"
    >
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Forgot password?</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter your email and we'll send you a reset code
          </p>
        </div>
        <ResetPasswordForm primaryColor="#6366f1" />
      </div>
    </UniversalAuthLayout>
  )
}
```

---

## Task 6: Frontend — Dashboard Layout & Loading Skeleton

Create the dashboard shell: a layout with sidebar nav, a `loading.tsx` skeleton, and an auth guard that redirects to login if not authenticated.

**Files:**
- Create: `apps/admin-portal/app/dashboard/layout.tsx`
- Create: `apps/admin-portal/app/dashboard/loading.tsx`

**Step 1: Create `dashboard/layout.tsx`**

```typescript
"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@fortknox/sdk"
import { Skeleton } from "@repo/ui"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { user, isLoading } = useAuth()

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/u/login")
    }
  }, [user, isLoading, router])

  if (isLoading) {
    return (
      <div className="flex h-screen bg-background">
        <div className="w-64 border-r border-border p-4 space-y-4">
          <Skeleton className="h-8 w-32" />
          <div className="space-y-2 pt-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        </div>
        <div className="flex-1 p-8 space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    )
  }

  if (!user) return null

  return <>{children}</>
}
```

**Step 2: Create `dashboard/loading.tsx`**

This is the Next.js loading UI — auto-shown during page data fetches (server components / route transitions).

```typescript
import { Skeleton } from "@repo/ui"

export default function DashboardLoading() {
  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar skeleton */}
      <div className="w-64 border-r border-border p-4 space-y-4 bg-card">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-5 w-40 mt-1" />
        <div className="space-y-1 pt-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-lg" />
          ))}
        </div>
      </div>
      {/* Content skeleton */}
      <div className="flex-1 flex flex-col">
        <div className="border-b border-border px-8 py-4 bg-card">
          <Skeleton className="h-6 w-40" />
        </div>
        <div className="p-8 space-y-6">
          {/* Alert banner skeleton */}
          <Skeleton className="h-16 w-full rounded-xl" />
          {/* Stats cards */}
          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          {/* Main content */}
          <div className="grid grid-cols-2 gap-6">
            <Skeleton className="h-72 rounded-xl" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  )
}
```

---

## Task 7: Frontend — Dashboard Overview Page

The main dashboard page: Auth0-style with sidebar, MFA banner, stats cards, profile tab, and application list placeholder.

**Files:**
- Create: `apps/admin-portal/app/dashboard/page.tsx`
- Create: `apps/admin-portal/components/dashboard/dashboard-sidebar.tsx`
- Create: `apps/admin-portal/components/dashboard/mfa-alert-banner.tsx`
- Create: `apps/admin-portal/components/dashboard/stats-cards.tsx`

**Step 1: Create `dashboard-sidebar.tsx`**

```typescript
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAuth } from "@fortknox/sdk"
import { cn } from "@repo/ui/lib/utils"
import {
  LayoutDashboard,
  AppWindow,
  Shield,
  User,
  LogOut,
  ChevronRight,
  Lock,
} from "lucide-react"

const navItems = [
  { label: "Overview",      href: "/dashboard",              icon: LayoutDashboard },
  { label: "Applications",  href: "/dashboard/applications", icon: AppWindow },
  { label: "Security",      href: "/dashboard/security",     icon: Shield },
  { label: "Profile",       href: "/dashboard/profile",      icon: User },
]

export function DashboardSidebar() {
  const pathname = usePathname()
  const { user, logout } = useAuth()

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-border bg-card">
      {/* Brand */}
      <div className="flex items-center gap-3 border-b border-border px-6 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Lock className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Fort Knox</p>
          <p className="text-xs text-muted-foreground">Admin Portal</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
              {isActive && <ChevronRight className="ml-auto h-3 w-3 opacity-60" />}
            </Link>
          )
        })}
      </nav>

      {/* User + logout */}
      <div className="border-t border-border p-4">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary text-sm font-semibold">
            {user?.firstName?.[0] ?? user?.email?.[0]?.toUpperCase() ?? "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {user?.firstName ? `${user.firstName} ${user.lastName ?? ""}`.trim() : user?.email}
            </p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
          <button
            onClick={() => logout()}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}
```

**Step 2: Create `mfa-alert-banner.tsx`**

```typescript
"use client"

import Link from "next/link"
import { ShieldAlert, ShieldCheck, X } from "lucide-react"

interface MfaAlertBannerProps {
  mfaEnabled: boolean
}

export function MfaAlertBanner({ mfaEnabled }: MfaAlertBannerProps) {
  if (mfaEnabled) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30 px-5 py-4">
        <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <p className="text-sm text-emerald-800 dark:text-emerald-300 font-medium">
          Your account is protected with multi-factor authentication.
        </p>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-5 py-4">
      <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
          Multi-factor authentication is not enabled
        </p>
        <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-0.5">
          MFA is required to secure your account. Enable it now to continue.
        </p>
      </div>
      <Link
        href="/dashboard/security"
        className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors"
      >
        Enable MFA
      </Link>
    </div>
  )
}
```

**Step 3: Create `stats-cards.tsx`**

```typescript
interface StatsCardsProps {
  activeSessions: number
  lastLoginAt: string | null
  mfaEnabled: boolean
  primaryAuthMethod: string
}

export function StatsCards({ activeSessions, lastLoginAt, mfaEnabled, primaryAuthMethod }: StatsCardsProps) {
  const cards = [
    {
      label: "Active Sessions",
      value: activeSessions.toString(),
      sub: "across all devices",
      color: "bg-blue-500/10 text-blue-600",
    },
    {
      label: "MFA Status",
      value: mfaEnabled ? "Enabled" : "Disabled",
      sub: mfaEnabled ? "Account is secured" : "Action required",
      color: mfaEnabled ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600",
    },
    {
      label: "Auth Method",
      value: primaryAuthMethod ?? "Password",
      sub: "Primary sign-in method",
      color: "bg-purple-500/10 text-purple-600",
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">{card.label}</p>
          <p className={`mt-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-semibold ${card.color}`}>
            {card.value}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{card.sub}</p>
        </div>
      ))}
    </div>
  )
}
```

**Step 4: Create `dashboard/page.tsx`**

This is the main overview page. It fetches dashboard data from `GET /dashboard` via the SDK client.

```typescript
"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@fortknox/sdk"
import { Skeleton } from "@repo/ui"
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar"
import { MfaAlertBanner } from "@/components/dashboard/mfa-alert-banner"
import { StatsCards } from "@/components/dashboard/stats-cards"
import { authClient } from "@/app/layout"
import { formatDistanceToNow } from "date-fns"

interface DashboardData {
  user: any
  mfa: { enabled: boolean; totpEnabled: boolean; emailOtpEnabled: boolean }
  stats: { activeSessions: number; lastLoginAt: string }
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    authClient.request({
      url: "http://localhost:4000/dashboard",
      method: "GET",
    }).then((res) => {
      if (res.ok) {
        setData(res.data?.data)
      }
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <DashboardSidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex items-center border-b border-border bg-card px-8 py-4">
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              {user?.firstName ? `Welcome back, ${user.firstName}` : "Dashboard"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {data?.stats?.lastLoginAt
                ? `Last login ${formatDistanceToNow(new Date(data.stats.lastLoginAt), { addSuffix: true })}`
                : "Fort Knox Admin Portal"}
            </p>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8 space-y-6">
          {loading ? (
            <div className="space-y-6">
              <Skeleton className="h-16 w-full rounded-xl" />
              <div className="grid grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
              </div>
              <div className="grid grid-cols-2 gap-6">
                <Skeleton className="h-64 rounded-xl" />
                <Skeleton className="h-64 rounded-xl" />
              </div>
            </div>
          ) : (
            <>
              <MfaAlertBanner mfaEnabled={data?.mfa?.enabled ?? false} />

              <StatsCards
                activeSessions={data?.stats?.activeSessions ?? 0}
                lastLoginAt={data?.stats?.lastLoginAt ?? null}
                mfaEnabled={data?.mfa?.enabled ?? false}
                primaryAuthMethod={data?.user?.primaryAuthMethod ?? "password"}
              />

              <div className="grid gap-6 lg:grid-cols-2">
                {/* Profile card */}
                <div className="rounded-xl border border-border bg-card p-6">
                  <h2 className="text-sm font-semibold text-foreground mb-4">Account Details</h2>
                  <div className="space-y-3">
                    {[
                      { label: "Email", value: data?.user?.email },
                      { label: "Name", value: [data?.user?.firstName, data?.user?.lastName].filter(Boolean).join(" ") || "—" },
                      { label: "Email Verified", value: data?.user?.emailVerified ? "Yes" : "No" },
                      { label: "Member Since", value: data?.user?.createdAt ? new Date(data.user.createdAt).toLocaleDateString() : "—" },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{row.label}</span>
                        <span className="font-medium text-foreground">{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Quick actions */}
                <div className="rounded-xl border border-border bg-card p-6">
                  <h2 className="text-sm font-semibold text-foreground mb-4">Quick Actions</h2>
                  <div className="space-y-2">
                    {[
                      { label: "Set up MFA",           href: "/dashboard/security",     highlight: !data?.mfa?.enabled },
                      { label: "Create an Application", href: "/dashboard/applications" },
                      { label: "Edit Profile",          href: "/dashboard/profile" },
                    ].map((action) => (
                      <a
                        key={action.label}
                        href={action.href}
                        className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
                          action.highlight
                            ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                            : "border-border text-foreground hover:bg-accent"
                        }`}
                      >
                        {action.label}
                        <span className="text-muted-foreground">→</span>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
```

---

## Task 8: Frontend — Dashboard Security Page (MFA Setup)

The Security tab lets the user see MFA status and enable TOTP.

**Files:**
- Create: `apps/admin-portal/app/dashboard/security/page.tsx`

**Step 1: Create `dashboard/security/page.tsx`**

This page reuses the existing `TotpSetup` component if it exists, otherwise implements inline TOTP setup. Check `components/auth/totp-setup.tsx` first.

```typescript
"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button, Skeleton } from "@repo/ui"
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar"
import { authClient } from "@/app/layout"
import { ShieldCheck, ShieldOff, QrCode, Key } from "lucide-react"

interface MfaStatus {
  totpEnabled: boolean
  emailOtpEnabled: boolean
  backupCodesCount: number
}

interface TotpSetupData {
  secret: string
  qrCode: string
  backupCodes: string[]
}

export default function SecurityPage() {
  const router = useRouter()
  const [mfaStatus, setMfaStatus] = useState<MfaStatus | null>(null)
  const [setupData, setSetupData] = useState<TotpSetupData | null>(null)
  const [stage, setStage] = useState<"status" | "setup" | "verify" | "done">("status")
  const [verifyCode, setVerifyCode] = useState("")
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchMfaStatus()
  }, [])

  const fetchMfaStatus = async () => {
    setLoading(true)
    try {
      const res = await authClient.request({ url: "http://localhost:4000/mfa/status", method: "GET" })
      if (res.ok) setMfaStatus(res.data?.data)
    } finally {
      setLoading(false)
    }
  }

  const startTotpSetup = async () => {
    setActionLoading(true)
    setError(null)
    try {
      const res = await authClient.request({ url: "http://localhost:4000/mfa/setup/totp", method: "POST" })
      if (res.ok) {
        setSetupData(res.data?.data)
        setStage("setup")
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  const verifyAndEnableTotp = async () => {
    if (verifyCode.length !== 6) return
    setActionLoading(true)
    setError(null)
    try {
      const res = await authClient.request({
        url: "http://localhost:4000/mfa/verify/totp",
        method: "POST",
        body: { token: verifyCode },
      })
      if (res.ok) {
        setStage("done")
        await fetchMfaStatus()
      } else {
        setError("Invalid code. Please try again.")
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  const disableMfa = async () => {
    if (!confirm("Are you sure you want to disable MFA?")) return
    setActionLoading(true)
    try {
      await authClient.request({ url: "http://localhost:4000/mfa/totp", method: "DELETE" })
      await fetchMfaStatus()
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <DashboardSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center border-b border-border bg-card px-8 py-4">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Security</h1>
            <p className="text-xs text-muted-foreground">Manage your account security settings</p>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8 max-w-2xl space-y-6">
          {loading ? (
            <Skeleton className="h-48 w-full rounded-xl" />
          ) : (
            <>
              {/* MFA Status Card */}
              <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {mfaStatus?.totpEnabled ? (
                      <ShieldCheck className="h-5 w-5 text-emerald-500" />
                    ) : (
                      <ShieldOff className="h-5 w-5 text-amber-500" />
                    )}
                    <div>
                      <h2 className="text-sm font-semibold text-foreground">
                        Multi-Factor Authentication
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        {mfaStatus?.totpEnabled
                          ? "TOTP authenticator app is active"
                          : "Not configured — your account is less secure"}
                      </p>
                    </div>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    mfaStatus?.totpEnabled
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                  }`}>
                    {mfaStatus?.totpEnabled ? "Active" : "Not configured"}
                  </span>
                </div>

                {error && (
                  <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                    {error}
                  </div>
                )}

                {/* Stage: status (not enabled) */}
                {stage === "status" && !mfaStatus?.totpEnabled && (
                  <Button onClick={startTotpSetup} disabled={actionLoading} className="w-full">
                    <QrCode className="h-4 w-4 mr-2" />
                    {actionLoading ? "Preparing..." : "Set up Authenticator App"}
                  </Button>
                )}

                {/* Stage: status (enabled) */}
                {stage === "status" && mfaStatus?.totpEnabled && (
                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1" disabled>
                      <Key className="h-4 w-4 mr-2" />
                      {mfaStatus.backupCodesCount} backup codes remaining
                    </Button>
                    <Button variant="destructive" onClick={disableMfa} disabled={actionLoading}>
                      Disable
                    </Button>
                  </div>
                )}

                {/* Stage: setup (show QR) */}
                {stage === "setup" && setupData && (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Scan this QR code with your authenticator app (Google Authenticator, Authy, 1Password, etc.)
                    </p>
                    <div className="flex justify-center">
                      <img src={setupData.qrCode} alt="TOTP QR Code" className="h-48 w-48 rounded-lg border border-border" />
                    </div>
                    <p className="text-xs text-center text-muted-foreground">
                      Can't scan? Enter this key manually: <code className="font-mono bg-muted px-1 py-0.5 rounded text-xs">{setupData.secret}</code>
                    </p>
                    <Button onClick={() => setStage("verify")} className="w-full">
                      I've scanned the code →
                    </Button>
                  </div>
                )}

                {/* Stage: verify code */}
                {stage === "verify" && (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Enter the 6-digit code from your authenticator app to confirm setup.
                    </p>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="000000"
                      value={verifyCode}
                      onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="w-full rounded-lg border border-border bg-background px-4 py-3 text-center text-2xl font-mono tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-primary"
                      autoFocus
                    />
                    <Button
                      onClick={verifyAndEnableTotp}
                      disabled={verifyCode.length !== 6 || actionLoading}
                      className="w-full"
                    >
                      {actionLoading ? "Verifying..." : "Verify & Enable MFA"}
                    </Button>
                  </div>
                )}

                {/* Stage: done */}
                {stage === "done" && (
                  <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-4 space-y-2">
                    <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                      MFA enabled successfully!
                    </p>
                    {setupData?.backupCodes && (
                      <>
                        <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">
                          Save these backup codes in a safe place. Each can only be used once.
                        </p>
                        <div className="grid grid-cols-2 gap-1 font-mono text-xs bg-white dark:bg-black/20 rounded border p-3">
                          {setupData.backupCodes.map((code) => (
                            <span key={code} className="text-muted-foreground">{code}</span>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
```

---

## Task 9: Frontend — Dashboard Applications & Profile Pages (Placeholders)

Bootstrap the applications and profile pages so navigation works. Full specs come later.

**Files:**
- Create: `apps/admin-portal/app/dashboard/applications/page.tsx`
- Create: `apps/admin-portal/app/dashboard/profile/page.tsx`

**Step 1: Create `dashboard/applications/page.tsx`**

```typescript
"use client"

import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar"
import { Button } from "@repo/ui"
import { AppWindow, Plus } from "lucide-react"

export default function ApplicationsPage() {
  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <DashboardSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-border bg-card px-8 py-4">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Applications</h1>
            <p className="text-xs text-muted-foreground">Manage your OAuth applications</p>
          </div>
          <Button size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Create Application
          </Button>
        </header>

        <main className="flex-1 overflow-y-auto p-8">
          <div className="flex flex-col items-center justify-center h-full text-center gap-4 max-w-md mx-auto">
            <div className="rounded-full bg-muted p-4">
              <AppWindow className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">No applications yet</h2>
            <p className="text-sm text-muted-foreground">
              Create your first application to integrate Fort Knox authentication into your product.
            </p>
            <Button>
              <Plus className="h-4 w-4 mr-1" />
              Create Application
            </Button>
          </div>
        </main>
      </div>
    </div>
  )
}
```

**Step 2: Create `dashboard/profile/page.tsx`**

```typescript
"use client"

import { useAuth } from "@fortknox/sdk"
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar"
import { Badge } from "@repo/ui"

export default function ProfilePage() {
  const { user } = useAuth()

  const fields = [
    { label: "First Name",    value: user?.firstName || "—" },
    { label: "Last Name",     value: user?.lastName || "—" },
    { label: "Email",         value: user?.email || "—" },
    { label: "Display Name",  value: user?.displayName || "—" },
    { label: "Auth Method",   value: user?.primaryAuthMethod || "password" },
    { label: "Account Status",value: user?.status || "active" },
    { label: "Member Since",  value: user?.createdAt ? new Date(user.createdAt as any).toLocaleDateString() : "—" },
    { label: "Last Login",    value: user?.lastLoginAt ? new Date(user.lastLoginAt as any).toLocaleString() : "—" },
  ]

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <DashboardSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center border-b border-border bg-card px-8 py-4">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Profile</h1>
            <p className="text-xs text-muted-foreground">Your account information</p>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8 max-w-2xl">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {/* Avatar header */}
            <div className="flex items-center gap-4 border-b border-border p-6 bg-gradient-to-r from-primary/5 to-transparent">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/20 text-primary text-2xl font-semibold">
                {user?.firstName?.[0] ?? user?.email?.[0]?.toUpperCase() ?? "U"}
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  {user?.firstName ? `${user.firstName} ${user.lastName ?? ""}`.trim() : user?.email}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant={user?.emailVerified ? "default" : "secondary"}>
                    {user?.emailVerified ? "Verified" : "Unverified"}
                  </Badge>
                  <Badge variant="outline">{user?.status ?? "active"}</Badge>
                </div>
              </div>
            </div>

            {/* Fields */}
            <div className="divide-y divide-border">
              {fields.map((field) => (
                <div key={field.label} className="flex items-center justify-between px-6 py-4 text-sm">
                  <span className="text-muted-foreground font-medium w-36">{field.label}</span>
                  <span className="text-foreground font-medium text-right">{field.value}</span>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
```

---

## Task 10: Verify otp.html template variables & fix if needed

**Step 1: Read the otp.html template**

```bash
cat /Users/rishitshivesh/Projects/Personal/my-auth/apps/auth-service/templates/otp.html | grep '{{'
```

**Step 2: Match the template variables**

The Handlebars template likely uses `{{otpCode}}`, `{{userName}}`, `{{expiresIn}}`, `{{tenantName}}`, `{{tenantLogo}}`. If the variable names differ from what `sendPasswordResetOtpEmail` passes, update the method call in `email.service.ts`.

---

## Task 11: Install `date-fns` if not present

The dashboard page uses `formatDistanceToNow` from `date-fns`.

```bash
cd /Users/rishitshivesh/Projects/Personal/my-auth/apps/admin-portal
cat package.json | grep date-fns
```

If not present:
```bash
cd /Users/rishitshivesh/Projects/Personal/my-auth/apps/admin-portal
npm install date-fns
```

---

## Task 12: Wire `lucide-react` in admin-portal

```bash
cd /Users/rishitshivesh/Projects/Personal/my-auth/apps/admin-portal
cat package.json | grep lucide
```

If not present:
```bash
npm install lucide-react
```

---

## Task 13: End-to-end smoke test

**Step 1: Start the auth service**
```bash
cd /Users/rishitshivesh/Projects/Personal/my-auth/apps/auth-service
npm run start:dev
```

**Step 2: Start the admin portal**
```bash
cd /Users/rishitshivesh/Projects/Personal/my-auth/apps/admin-portal
npm run dev
```

**Step 3: Test auth redirect**
1. Go to `http://localhost:3000/u/login`
2. Log in with valid credentials
3. Expected: redirect to `http://localhost:3000/dashboard`
4. Refresh the page
5. Expected: stay on `/dashboard` (session restored, no redirect to login)

**Step 4: Test dashboard loads**
1. Verify MFA banner shows (amber if MFA not enabled)
2. Verify stats cards render
3. Verify profile card shows correct user data

**Step 5: Test password reset OTP flow**
1. Go to `http://localhost:3000/u/reset-password`
2. Enter email → click "Send reset code"
3. Check auth-service logs for the printed OTP (dev mode)
4. Enter the 6-digit OTP
5. Enter new password + confirm
6. Expected: redirected to `/u/login?reset=success`

**Step 6: Test MFA setup**
1. Go to `/dashboard/security`
2. Click "Set up Authenticator App"
3. Scan QR code with Google Authenticator
4. Enter 6-digit code
5. Expected: MFA enabled, backup codes shown, banner changes to green

---

## Implementation Notes

- **Response unwrapping:** All backend responses from this service are wrapped as `{ status: 200, data: <payload> }` by the global `ResponseInterceptor`. When making requests via `authClient.request()`, always read `res.data?.data` for the payload.
- **`authClient` export:** The `authClient` singleton is exported from `apps/admin-portal/app/layout.tsx`. Import it as `import { authClient } from "@/app/layout"`.
- **No new database migrations needed:** The `passwordResetToken` column already exists on the `User` entity (stores hash of both old long tokens and new OTPs identically).
- **SDK `forgotPassword`/`resetPassword`:** These don't go through the standard `this.request()` pipeline since they're unauthenticated — they use `this.transport()` directly with tenant headers only.

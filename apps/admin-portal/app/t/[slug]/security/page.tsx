"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { PortalLayout } from "@/components/layouts/portal-layout";
import { SentryButton, SentrySkeleton, Label } from "@repo/ui";
import { MFASettings } from "@/components/portal/mfa-settings";
import {
  TrustedDeviceCard,
  type TrustedDevice,
} from "@/components/portal/trusted-device-card";
import {
  ActiveSessions,
  type Session,
} from "@/components/portal/active-sessions";
import {
  AuditLogList,
  type AuditEvent,
} from "@/components/portal/audit-log-list";
import {
  useMfaStatus,
  useActiveSessions,
  useRevokeSession,
  useRevokeAllOtherSessions,
  useTenantActivity,
} from "@/lib/queries";
import type { ActiveSessionDto } from "@/lib/types";
import { formatRelativeTime, formatEventDescription } from "@/lib/utils";

// Trusted devices have no backend endpoint yet — kept as empty placeholder
const TRUSTED_DEVICES: TrustedDevice[] = [];

export default function SecurityPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { data: mfaStatusData, isLoading: mfaLoading } = useMfaStatus();
  const {
    data: rawSessions = [],
    isLoading: sessionsLoading,
    isError: sessionsError,
  } = useActiveSessions();
  const {
    data: activity = [],
    isLoading: activityLoading,
    isError: activityError,
  } = useTenantActivity(10);

  const revokeSessionMutation = useRevokeSession();
  const revokeAllOtherMutation = useRevokeAllOtherSessions();

  const [removedDevices, setRemovedDevices] = useState<string[]>([]);

  // Map API shape to the Session shape expected by <ActiveSessions>
  const sessions: Session[] = (rawSessions as ActiveSessionDto[]).map((s) => ({
    id: s.id,
    device: s.deviceInfo?.device ?? s.deviceInfo?.type ?? "Unknown",
    browser: `${s.deviceInfo?.browser ?? "Unknown"} on ${s.deviceInfo?.os ?? "Unknown"}`,
    location:
      [s.location?.city, s.location?.country].filter(Boolean).join(", ") ||
      "Unknown location",
    ipAddress: s.ipAddress ?? "Unknown",
    lastActive: formatRelativeTime(s.lastActivity),
    isCurrent: s.isCurrent,
  }));

  // Map MFA status to MFASettings method list
  const mfaMethods = mfaStatusData
    ? [
        {
          id: "totp",
          name: "Authenticator App",
          type: "totp" as const,
          enabled: mfaStatusData.methods.includes("totp"),
          verified: mfaStatusData.methods.includes("totp"),
        },
        {
          id: "email-otp",
          name: "Email Code",
          type: "email-otp" as const,
          enabled:
            mfaStatusData.methods.includes("email_otp") ||
            mfaStatusData.methods.includes("email-otp"),
          verified:
            mfaStatusData.methods.includes("email_otp") ||
            mfaStatusData.methods.includes("email-otp"),
        },
        {
          id: "backup-codes",
          name: "Backup Codes",
          type: "backup-codes" as const,
          enabled: (mfaStatusData.backupCodesRemaining ?? 0) > 0,
          verified: (mfaStatusData.backupCodesRemaining ?? 0) > 0,
        },
        {
          id: "passkey",
          name: "Passkey",
          type: "passkey" as const,
          enabled:
            mfaStatusData.methods.includes("passkey") ||
            mfaStatusData.methods.includes("webauthn"),
          verified:
            mfaStatusData.methods.includes("passkey") ||
            mfaStatusData.methods.includes("webauthn"),
        },
      ]
    : [];

  // Map ActivityEvent → AuditEvent for AuditLogList component
  const auditEvents: AuditEvent[] = activity.map((e) => ({
    id: e.id,
    // Map eventType to closest AuditEvent type union; fall back to device_login
    type: (() => {
      if (e.eventType.includes("mfa")) return "mfa_challenge" as const;
      if (e.eventType.includes("passkey")) return "passkey_used" as const;
      if (e.eventType.includes("password")) return "password_changed" as const;
      if (e.eventType.includes("revoke")) return "token_revoked" as const;
      if (e.eventType.includes("magic_link")) return "magic_link_sent" as const;
      return "device_login" as const;
    })(),
    title: formatEventDescription(e.eventType),
    description: formatEventDescription(e.eventType),
    timestamp: formatRelativeTime(e.createdAt),
    location: e.location ?? "Unknown",
    ipAddress: e.ipAddress ?? "Unknown",
    device: "Unknown",
    status: (() => {
      if (e.severity === "critical") return "suspicious" as const;
      if (e.eventType.includes("failed") || e.eventType.includes("locked"))
        return "failed" as const;
      return "success" as const;
    })(),
  }));

  const handleRemoveDevice = (deviceId: string) => {
    setRemovedDevices([...removedDevices, deviceId]);
  };

  const handleRevokeSession = (sessionId: string) => {
    revokeSessionMutation.mutate(sessionId);
  };

  const handleRevokeAllSessions = () => {
    revokeAllOtherMutation.mutate();
  };

  const activeTrustedDevices = TRUSTED_DEVICES.filter(
    (d) => !removedDevices.includes(d.id),
  );

  return (
    <PortalLayout
      tenantSlug={slug}
      pageTitle="Security"
      pageSubtitle="Manage your account security and authentication methods"
      currentPath={`/t/${slug}/security`}
      primaryAction={{
        label: "Save Settings",
        onClick: () => {},
      }}
    >
      <div className="space-y-8">
        {/* Multi-Factor Authentication */}
        <div>
          <h3 className="text-lg font-semibold mb-4">
            Multi-Factor Authentication
          </h3>
          {mfaLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-16 rounded-lg bg-muted animate-pulse"
                />
              ))}
            </div>
          ) : mfaStatusData ? (
            <MFASettings
              methods={mfaMethods}
              primaryColor="#2ABF6C"
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Failed to load MFA settings.
            </p>
          )}
        </div>

        {/* Trusted Devices */}
        <div>
          <h3 className="text-lg font-semibold mb-4">Trusted Devices</h3>
          {activeTrustedDevices.length > 0 ? (
            <div className="space-y-3">
              {activeTrustedDevices.map((device) => (
                <TrustedDeviceCard
                  key={device.id}
                  device={device}
                  onRemove={handleRemoveDevice}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No trusted devices.</p>
          )}
        </div>

        {/* Active Sessions */}
        <div>
          <h3 className="text-lg font-semibold mb-4">Active Sessions</h3>
          {sessionsLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-24 rounded-lg bg-muted animate-pulse"
                />
              ))}
            </div>
          ) : sessionsError ? (
            <p className="text-sm text-destructive">Failed to load sessions.</p>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active sessions.</p>
          ) : (
            <ActiveSessions
              sessions={sessions}
              onRevoke={handleRevokeSession}
              onRevokeAll={handleRevokeAllSessions}
            />
          )}
        </div>

        {/* Security Events */}
        <div>
          <h3 className="text-lg font-semibold mb-4">Security Events</h3>
          {activityLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-20 rounded-lg bg-muted animate-pulse"
                />
              ))}
            </div>
          ) : activityError ? (
            <p className="text-sm text-destructive">
              Failed to load security events.
            </p>
          ) : auditEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No recent security events.
            </p>
          ) : (
            <AuditLogList events={auditEvents} />
          )}
        </div>

        {/* Password & Security Policies */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="text-lg font-semibold mb-6">
            Password & Security Policies
          </h3>
          <div className="space-y-4">
            <div>
              <Label>Minimum Password Length</Label>
              <select className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground">
                <option>6 characters</option>
                <option>8 characters</option>
                <option>12 characters</option>
                <option>16 characters</option>
              </select>
            </div>

            <div>
              <Label>Session Timeout</Label>
              <select className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground">
                <option>15 minutes</option>
                <option>30 minutes</option>
                <option>1 hour</option>
                <option>24 hours</option>
              </select>
            </div>

            <div className="flex items-center gap-3 rounded-lg border border-border p-3">
              <input
                type="checkbox"
                id="https"
                defaultChecked
                className="w-4 h-4"
              />
              <Label
                htmlFor="https"
                className="flex-1 cursor-pointer font-normal"
              >
                Require HTTPS for all communications
              </Label>
            </div>

            <div className="flex items-center gap-3 rounded-lg border border-border p-3">
              <input
                type="checkbox"
                id="device-trust"
                defaultChecked
                className="w-4 h-4"
              />
              <Label
                htmlFor="device-trust"
                className="flex-1 cursor-pointer font-normal"
              >
                Enable trusted device feature
              </Label>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6">
          <h3 className="text-lg font-semibold mb-4 text-destructive">
            Danger Zone
          </h3>
          <div className="space-y-3">
            <SentryButton
              variant="outline"
              className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 bg-transparent"
              onClick={() => {}}
            >
              Reset all security settings
            </SentryButton>
            <SentryButton
              variant="outline"
              className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 bg-transparent"
              onClick={() => {}}
            >
              Delete account
            </SentryButton>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}

"use client";

import { useState, useEffect } from "react";
import { PortalLayout } from "@/components/layouts/portal-layout";
import { Button } from "@repo/ui";
import { Label } from "@repo/ui";
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
import { getAuthConfig, type AuthConfig } from "@/lib/auth-config";

const mockMFAMethods = [
  {
    id: "totp",
    name: "Authenticator App",
    type: "totp" as const,
    enabled: true,
    verified: true,
    lastUpdated: "2 weeks ago",
  },
  {
    id: "email-otp",
    name: "Email Code",
    type: "email-otp" as const,
    enabled: false,
    verified: false,
  },
  {
    id: "backup-codes",
    name: "Backup Codes",
    type: "backup-codes" as const,
    enabled: true,
    verified: true,
    lastUpdated: "1 month ago",
  },
  {
    id: "passkey",
    name: "Passkey",
    type: "passkey" as const,
    enabled: false,
    verified: false,
  },
];

const mockTrustedDevices: TrustedDevice[] = [
  {
    id: "1",
    name: "MacBook Pro",
    type: "desktop",
    os: "macOS Ventura",
    lastActive: "Today at 2:30 PM",
    location: "San Francisco, CA",
    isCurrent: true,
  },
  {
    id: "2",
    name: "iPhone 14",
    type: "phone",
    os: "iOS 17",
    lastActive: "Yesterday at 6:45 PM",
    location: "San Francisco, CA",
    isCurrent: false,
  },
];

const mockSessions: Session[] = [
  {
    id: "1",
    device: "MacBook Pro",
    location: "San Francisco, CA",
    ipAddress: "192.168.1.100",
    browser: "Chrome on macOS",
    lastActive: "Just now",
    isCurrent: true,
  },
  {
    id: "2",
    device: "iPhone 14",
    location: "San Francisco, CA",
    ipAddress: "203.0.113.42",
    browser: "Safari on iOS",
    lastActive: "2 hours ago",
    isCurrent: false,
  },
  {
    id: "3",
    device: "Unknown",
    location: "New York, NY",
    ipAddress: "198.51.100.89",
    browser: "Chrome on Windows",
    lastActive: "3 days ago",
    isCurrent: false,
  },
];

const mockAuditEvents: AuditEvent[] = [
  {
    id: "1",
    type: "device_login",
    title: "New device login",
    description: "Signed in from a new device",
    timestamp: "Today at 2:30 PM",
    location: "San Francisco, CA",
    ipAddress: "192.168.1.100",
    device: "MacBook Pro",
    status: "success",
  },
  {
    id: "2",
    type: "mfa_challenge",
    title: "MFA verified",
    description: "Successfully verified with authenticator app",
    timestamp: "Today at 2:29 PM",
    location: "San Francisco, CA",
    ipAddress: "192.168.1.100",
    device: "MacBook Pro",
    status: "success",
  },
  {
    id: "3",
    type: "magic_link_sent",
    title: "Magic link sent",
    description: "Magic link authentication request",
    timestamp: "Yesterday at 6:45 PM",
    location: "San Francisco, CA",
    ipAddress: "203.0.113.42",
    device: "iPhone 14",
    status: "success",
  },
  {
    id: "4",
    type: "password_changed",
    title: "Password changed",
    description: "Account password was updated",
    timestamp: "1 week ago",
    location: "San Francisco, CA",
    ipAddress: "192.168.1.100",
    device: "MacBook Pro",
    status: "success",
  },
  {
    id: "5",
    type: "device_login",
    title: "Failed login attempt",
    description: "Multiple failed login attempts detected",
    timestamp: "2 days ago",
    location: "New York, NY",
    ipAddress: "198.51.100.89",
    device: "Unknown",
    status: "suspicious",
  },
];

export default function SecurityPage({ params }: { params: { slug: string } }) {
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [removedDevices, setRemovedDevices] = useState<string[]>([]);
  const [revokedSessions, setRevokedSessions] = useState<string[]>([]);

  useEffect(() => {
    getAuthConfig().then(setConfig);
  }, []);

  const handleRemoveDevice = (deviceId: string) => {
    setRemovedDevices([...removedDevices, deviceId]);
  };

  const handleRevokeSession = (sessionId: string) => {
    setRevokedSessions([...revokedSessions, sessionId]);
  };

  const handleRevokeAllSessions = () => {
    setRevokedSessions(mockSessions.map((s) => s.id));
  };

  const activeTrustedDevices = mockTrustedDevices.filter(
    (d) => !removedDevices.includes(d.id),
  );
  const activeSessions = mockSessions.filter(
    (s) => !revokedSessions.includes(s.id),
  );

  return (
    <PortalLayout
      tenantSlug={params.slug}
      pageTitle="Security"
      pageSubtitle="Manage your account security and authentication methods"
      currentPath={`/t/${params.slug}/security`}
      primaryAction={{
        label: "Save Settings",
        onClick: () => console.log("Save security"),
      }}
    >
      <div className="space-y-8">
        {/* Multi-Factor Authentication */}
        <div>
          <h3 className="text-lg font-semibold mb-4">
            Multi-Factor Authentication
          </h3>
          {config && (
            <MFASettings
              methods={mockMFAMethods}
              primaryColor="#6366f1"
              onToggle={(methodId, enabled) =>
                console.log("Toggle MFA:", { methodId, enabled })
              }
              onRegenerateCodes={() => console.log("Regenerate backup codes")}
            />
          )}
        </div>

        {/* Trusted Devices */}
        <div>
          <h3 className="text-lg font-semibold mb-4">Trusted Devices</h3>
          <div className="space-y-3">
            {activeTrustedDevices.map((device) => (
              <TrustedDeviceCard
                key={device.id}
                device={device}
                onRemove={handleRemoveDevice}
              />
            ))}
          </div>
        </div>

        {/* Active Sessions */}
        <div>
          <h3 className="text-lg font-semibold mb-4">Active Sessions</h3>
          <ActiveSessions
            sessions={activeSessions}
            onRevoke={handleRevokeSession}
            onRevokeAll={handleRevokeAllSessions}
          />
        </div>

        {/* Security Events */}
        <div>
          <h3 className="text-lg font-semibold mb-4">Security Events</h3>
          <AuditLogList events={mockAuditEvents} />
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
                <option selected>8 characters</option>
                <option>12 characters</option>
                <option>16 characters</option>
              </select>
            </div>

            <div>
              <Label>Session Timeout</Label>
              <select className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground">
                <option>15 minutes</option>
                <option selected>30 minutes</option>
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
            <Button
              variant="outline"
              className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 bg-transparent"
              onClick={() => console.log("Reset account")}
            >
              Reset all security settings
            </Button>
            <Button
              variant="outline"
              className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 bg-transparent"
              onClick={() => console.log("Delete account")}
            >
              Delete account
            </Button>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}

import { describe, expect, it } from "@jest/globals";
import type { Passkey, SecurityEvent } from "@scrolloop/sdk";
import { html } from "@/test-utils/render";
import { ActivityList } from "./ActivityList";
import { ConnectionList } from "./ConnectionList";
import { DeleteAccountPanel } from "./DeleteAccountPanel";
import { MethodCard } from "./MethodCard";
import { Notice } from "./Notice";
import { PasskeyList } from "./PasskeyList";
import { PasswordForm } from "./PasswordForm";
import { ProfileForm } from "./ProfileForm";
import { ResourceBoundary } from "./ResourceBoundary";
import { SecurityTabs } from "./SecurityTabs";
import { SessionTable } from "./SessionTable";
import { TotpEnrollPanel } from "./TotpEnrollPanel";

const noop = () => undefined;

describe("ProfileForm", () => {
  const base = {
    draft: { firstName: "Alex", lastName: "", displayName: "", phone: "", timezone: "", language: "" },
    email: "alex@example.test", emailVerified: true, errors: {}, dirty: false, pending: false,
    onChange: noop, onSave: noop, onDiscard: noop,
  };
  it("labels every field and keeps email read-only", () => {
    const out = html(<ProfileForm {...base} />);
    expect(out).toContain("First name");
    expect(out).toContain("readOnly");
    expect(out).toContain("alex@example.test");
    expect(out).toContain("Verified");
  });
  it("shows validation, server error and saved state truthfully", () => {
    expect(html(<ProfileForm {...base} errors={{ timezone: "timezone" }} />)).toContain("valid timezone");
    expect(html(<ProfileForm {...base} serverError="Nope" />)).toContain("Nope");
    expect(html(<ProfileForm {...base} savedMessage="Profile saved." />)).toContain("Profile saved.");
    expect(html(<ProfileForm {...base} dirty savedMessage="Profile saved." />)).not.toContain("Profile saved.");
  });
});

describe("PasswordForm", () => {
  const base = {
    draft: { current: "", next: "", confirm: "" }, errors: {}, ready: false, pending: false, success: false,
    needsReauth: false, onChange: noop, onBlur: noop, onSubmit: noop, onReauthenticate: noop,
  };
  it("uses password autofill hints and disables submit until ready", () => {
    const out = html(<PasswordForm {...base} />);
    expect(out).toContain('autoComplete="current-password"');
    expect(out).toContain('autoComplete="new-password"');
    expect(out).toContain("disabled");
  });
  it("offers sign-in-again when the server requires recent auth, and success only when confirmed", () => {
    const out = html(<PasswordForm {...base} needsReauth />);
    expect(out).toContain("Sign in again");
    expect(out).not.toContain("Password changed");
    expect(html(<PasswordForm {...base} success />)).toContain("Password changed");
  });
});

describe("TotpEnrollPanel", () => {
  const base = { code: "", onCodeChange: noop, onVerify: noop, onCancel: noop, onCodesAcknowledged: noop, pending: false };
  it("announces loading while the key is prepared", () => {
    expect(html(<TotpEnrollPanel {...base} stage="starting" />)).toContain("aria-busy");
  });
  it("shows the QR with alt text and hides the key by default", () => {
    const out = html(<TotpEnrollPanel {...base} stage="scan" setup={{ secret: "SECRETKEY123", qrCode: "data:image/png;base64,AAA" }} />);
    expect(out).toContain("QR code for your authenticator app");
    expect(out).not.toContain("SECRETKEY123");
  });
  it("shows a failed verification as an alert", () => {
    expect(html(<TotpEnrollPanel {...base} stage="scan" error="bad" />)).toContain('role="alert"');
  });
  it("renders recovery codes through SecretReveal, hidden until revealed", () => {
    const out = html(<TotpEnrollPanel {...base} stage="codes" codes="AAAA-1111  BBBB-2222" />);
    expect(out).toContain("will not be shown again");
    expect(out).not.toContain("AAAA-1111");
  });
});

describe("PasskeyList", () => {
  const passkey: Passkey = { id: "p1", deviceName: "Work laptop", createdAt: "2026-01-01T00:00:00Z", transports: [] };
  const base = { passkeys: [passkey], name: "", onNameChange: noop, onAdd: noop, adding: false, unsupported: false, onRemove: noop };
  it("lists passkeys with an accessible remove action", () => {
    const out = html(<PasskeyList {...base} />);
    expect(out).toContain("Work laptop");
    expect(out).toContain("Remove passkey Work laptop");
  });
  it("renders an empty state and the unsupported notice instead of the add form", () => {
    const out = html(<PasskeyList {...base} passkeys={[]} unsupported />);
    expect(out).toContain("No passkeys yet.");
    expect(out).toContain("does not support passkeys");
    expect(out).not.toContain("Name this passkey");
  });
  it("surfaces a cancelled ceremony as info", () => {
    expect(html(<PasskeyList {...base} addMessage={{ tone: "info", text: "Cancelled" }} />)).toContain("Cancelled");
  });
});

describe("ConnectionList", () => {
  it("shows connect for unlinked providers and disconnect for linked ones", () => {
    const out = html(
      <ConnectionList
        rows={[
          { provider: "google", connection: { id: "1", provider: "google", email: "a@b.co", displayName: "A", primary: true, createdAt: "x" } },
          { provider: "github" },
        ]}
        onConnect={noop}
        onDisconnect={noop}
      />,
    );
    expect(out).toContain("Google connected");
    expect(out).toContain("Disconnect Google");
    expect(out).toContain("Connect GitHub");
  });
});

describe("SessionTable", () => {
  const rows = [
    { id: "a", isCurrent: true, browser: "Chrome", os: "macOS", location: "Pune, India", lastActivity: "2026-01-01T00:00:00Z" },
    { id: "b", isCurrent: false, lastActivity: "2026-01-01T00:00:00Z" },
  ];
  it("marks this device and offers revoke only for others, with fallbacks for unknown data", () => {
    const out = html(<SessionTable rows={rows} now={Date.parse("2026-01-01T01:00:00Z")} onRevoke={noop} />);
    expect(out).toContain("This device");
    expect(out).toContain("Chrome on macOS");
    expect(out).toContain("Unknown device");
    expect(out).toContain("Unknown");
    expect(out).toContain("Revoke session on Unknown device");
    expect(out).not.toContain("Revoke session on Chrome on macOS");
  });
});

describe("ActivityList", () => {
  const event: SecurityEvent = { id: "e", eventType: "PASSWORD_CHANGED", severity: "high", createdAt: "2026-01-01T00:00:00Z", ipAddress: "1.2.3.4" };
  it("describes events with text severity and a time element", () => {
    const out = html(<ActivityList events={[event]} now={Date.parse("2026-01-02T00:00:00Z")} />);
    expect(out).toContain("Password changed");
    expect(out).toContain("High");
    expect(out).toContain("<time");
    expect(out).toContain("1.2.3.4");
  });
});

describe("DeleteAccountPanel", () => {
  it("explains consequences and requires the password field", () => {
    const out = html(<DeleteAccountPanel password="" onPasswordChange={noop} passwordError="Enter your password." onStart={noop} onCancel={noop} />);
    expect(out).toContain("This cannot be undone.");
    expect(out).toContain("does not delete a workspace");
    expect(out).toContain('aria-invalid="true"');
    expect(out).toContain("Keep my account");
  });
});

describe("shared pieces", () => {
  it("MethodCard exposes a labelled region", () => {
    const out = html(<MethodCard id="x" title="Title" status="Enabled" statusTone="ok" />);
    expect(out).toContain('aria-labelledby="x-title"');
    expect(out).toContain("Enabled");
  });
  it("Notice uses alert for errors and status otherwise", () => {
    expect(html(<Notice tone="error">e</Notice>)).toContain('role="alert"');
    expect(html(<Notice tone="success">s</Notice>)).toContain('role="status"');
  });
  it("ResourceBoundary renders loading, error with retry, then content", () => {
    const props = { loadingTitle: "Loading", errorTitle: "Failed", retryLabel: "Retry", onRetry: noop };
    expect(html(<ResourceBoundary {...props} status="loading">x</ResourceBoundary>)).toContain("aria-busy");
    expect(html(<ResourceBoundary {...props} status="error">x</ResourceBoundary>)).toContain("Retry");
    expect(html(<ResourceBoundary {...props} status="ready"><i>content</i></ResourceBoundary>)).toContain("content");
  });
  it("SecurityTabs marks the current section", () => {
    const out = html(<SecurityTabs current="sessions" />);
    expect(out).toContain('aria-current="page"');
    expect(out).toContain("/dashboard/security/sessions");
  });
});

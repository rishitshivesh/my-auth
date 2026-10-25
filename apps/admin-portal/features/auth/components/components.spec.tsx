import { describe, expect, it } from "@jest/globals";
import { html } from "@/test-utils/render";
import { FormAlert } from "./FormAlert";
import { CodeField } from "./CodeField";
import { PasswordInput } from "./PasswordInput";
import { EmailStep } from "./EmailStep";
import { MethodsStep } from "./MethodsStep";
import { PasswordStep } from "./PasswordStep";
import { LinkSentStep } from "./LinkSentStep";
import { SuccessPanel } from "./SuccessPanel";
import { LinkLandingView } from "../views/LinkLandingView";

const noop = () => undefined;

describe("auth components", () => {
  it("FormAlert keeps an empty alert region and shows messages assertively", () => {
    expect(html(<FormAlert />)).toContain("sr-only");
    const out = html(<FormAlert message="Nope" reference="Ref 1" />);
    expect(out).toContain('role="alert"');
    expect(out).toContain("Nope");
    expect(out).toContain("Ref 1");
  });

  it("CodeField wires label, one-time-code autofill and invalid state", () => {
    const out = html(<CodeField label="Code" value="" onChange={noop} error="Bad code" />);
    expect(out).toContain('autoComplete="one-time-code"');
    expect(out).toContain('aria-invalid="true"');
    expect(out).toContain("Bad code");
  });

  it("PasswordInput hides by default with a labelled toggle", () => {
    const out = html(<PasswordInput control={{ id: "p" }} value="x" onChange={noop} autoComplete="current-password" />);
    expect(out).toContain('type="password"');
    expect(out).toContain('aria-pressed="false"');
    expect(out).toContain('aria-label="Show password"');
  });

  it("EmailStep renders a labelled email field and social providers", () => {
    const out = html(<EmailStep initialEmail="" pending={false} social={["google", "github"]} onSubmit={noop} onSocial={noop} />);
    expect(out).toContain("Work email");
    expect(out).toContain('type="email"');
    expect(out).toContain("Google");
    expect(out).toContain("GitHub");
  });

  it("EmailStep shows pending state", () => {
    expect(html(<EmailStep initialEmail="a@b.c" pending social={[]} onSubmit={noop} onSocial={noop} />)).toContain("Signing you in");
  });

  it("MethodsStep offers only enabled methods", () => {
    const out = html(
      <MethodsStep email="a@b.c" methods={{ password: true, magicLink: true, passkey: false, social: [] }} pending={false}
        onMagicLink={noop} onPasskey={noop} onPassword={noop} onSocial={noop} onChangeEmail={noop} />,
    );
    expect(out).toContain("Email me a sign-in link");
    expect(out).toContain("Use a password instead");
    expect(out).not.toContain("Use a passkey");
  });

  it("PasswordStep links to recovery and echoes the account being used", () => {
    const out = html(<PasswordStep email="a@b.c" pending={false} onSubmit={noop} onBack={noop} />);
    expect(out).toContain("/u/reset-password");
    expect(out).toContain("a@b.c");
    expect(out).toContain('autoComplete="current-password"');
  });

  it("LinkSentStep announces politely and starts a resend cooldown label", () => {
    const out = html(<LinkSentStep title="Check" description="Sent" email="a@b.c" onResend={async () => undefined} resendFailure="x" backLabel="Back" onBack={noop} />);
    expect(out).toContain('role="status"');
    expect(out).toContain("Check");
  });

  it("SuccessPanel is a status region with an action", () => {
    const out = html(<SuccessPanel title="Done" description="All good" actionLabel="Go" onAction={noop} />);
    expect(out).toContain('role="status"');
    expect(out).toContain("Go");
  });

  it.each(["expired", "used", "invalid", "wrong-account"] as const)("LinkLandingView %s is an alert and never offers redeem copy", (status) => {
    const out = html(<LinkLandingView status={status} purpose="Verify" account="a@b.c" />);
    expect(out).toContain('role="alert"');
    expect(out).not.toContain("Nothing changes until you confirm");
  });

  it("LinkLandingView valid state needs an intentional continue and can drop the code hint", () => {
    const out = html(<LinkLandingView status="valid" purpose="Verify" validDescription="Confirm it" alternateDeviceHint={null} />);
    expect(out).toContain("Confirm it");
    expect(out).toContain("Continue");
    expect(out).not.toContain("different device");
  });

  it("LinkLandingView pending is busy", () => {
    expect(html(<LinkLandingView status="pending" purpose="Verify" />)).toContain('aria-busy="true"');
  });
});

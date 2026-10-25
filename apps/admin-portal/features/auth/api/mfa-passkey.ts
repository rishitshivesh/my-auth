import type { CompleteMfaInput, MfaWebAuthnStart, WebAuthnCredentialJSON } from "@scrolloop/sdk";

interface WebAuthnBrowser {
  startAuthentication(args: { optionsJSON: Record<string, unknown> }): Promise<WebAuthnCredentialJSON>;
}

class PasskeyCeremonyError extends Error {
  constructor(readonly code: "PASSKEY_AUTH_CANCELLED" | "PASSKEY_NOT_SUPPORTED") {
    super(code);
  }
}

const errorName = (err: unknown): string | undefined =>
  typeof err === "object" && err !== null && "name" in err ? String((err as { name: unknown }).name) : undefined;

/** Runs the browser passkey prompt for an MFA challenge and returns the completion payload. */
export async function runMfaPasskey(tempToken: string, start: MfaWebAuthnStart): Promise<CompleteMfaInput> {
  const { sessionNonce, ...optionsJSON } = start;
  try {
    const lib = (await import("@simplewebauthn/browser")) as unknown as WebAuthnBrowser;
    const webauthnResponse = await lib.startAuthentication({ optionsJSON: optionsJSON as Record<string, unknown> });
    return { tempToken, method: "webauthn", webauthnResponse, sessionNonce };
  } catch (err) {
    const name = errorName(err);
    if (name === "NotAllowedError" || name === "AbortError") throw new PasskeyCeremonyError("PASSKEY_AUTH_CANCELLED");
    throw new PasskeyCeremonyError("PASSKEY_NOT_SUPPORTED");
  }
}

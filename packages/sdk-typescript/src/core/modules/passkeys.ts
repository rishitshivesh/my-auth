/**
 * Passkeys (WebAuthn): sign-in, registration and management.
 *
 * The browser ceremony is delegated to `@simplewebauthn/browser` (an optional
 * peer, loaded on demand). The server-facing halves are exposed separately so
 * non-browser or custom-ceremony clients can drive them.
 */

import type {
  AuthOutcome,
  Passkey,
  PasskeyLoginStart,
  WebAuthnCredentialJSON,
  WebAuthnOptionsJSON,
} from "../api-types";
import { AuthError } from "../types";
import { call, callVoid, enc, payloadOf, type ModuleContext } from "./context";
import { parseAuthOutcome } from "./outcome";

/** Subset of @simplewebauthn/browser the SDK uses. */
export interface WebAuthnBrowser {
  startAuthentication(args: { optionsJSON: WebAuthnOptionsJSON }): Promise<WebAuthnCredentialJSON>;
  startRegistration(args: { optionsJSON: WebAuthnOptionsJSON }): Promise<WebAuthnCredentialJSON>;
}

export interface PasskeysModule {
  startLogin(email: string): Promise<PasskeyLoginStart>;
  finishLogin(email: string, assertion: WebAuthnCredentialJSON, sessionNonce: string): Promise<AuthOutcome>;
  /** Whole ceremony in one call (browser only). */
  authenticate(email: string): Promise<AuthOutcome>;
  startRegistration(): Promise<WebAuthnCredentialJSON>;
  finishRegistration(response: WebAuthnCredentialJSON, deviceName?: string): Promise<{ credentialId: string }>;
  list(): Promise<Passkey[]>;
  remove(credentialId: string): Promise<void>;
}

const errorName = (err: unknown): string | undefined =>
  typeof err === "object" && err !== null && "name" in err ? String((err as { name: unknown }).name) : undefined;

async function loadBrowserLib(loader?: () => Promise<WebAuthnBrowser>): Promise<WebAuthnBrowser> {
  if (loader) return loader();
  // Optional peer dependency. The literal specifier keeps bundlers able to
  // include it; `as string` stops TypeScript requiring its types at build time.
  return (await import("@simplewebauthn/browser" as string)) as WebAuthnBrowser;
}

export function createPasskeysModule(
  ctx: ModuleContext,
  options: { loadBrowser?: () => Promise<WebAuthnBrowser> } = {},
): PasskeysModule {
  const requireBrowser = (code: "PASSKEY_NOT_SUPPORTED", what: string): void => {
    if (typeof window === "undefined" && !options.loadBrowser) {
      throw new AuthError(code, `${what} is only available in browser environments`);
    }
  };

  const cancelled = (
    err: unknown,
    cancelCode: "PASSKEY_AUTH_CANCELLED" | "PASSKEY_REGISTRATION_CANCELLED",
    cancelMsg: string,
  ): never => {
    const name = errorName(err);
    if (name === "NotAllowedError" || name === "AbortError") throw new AuthError(cancelCode, cancelMsg);
    if (name === "NotSupportedError" || name === "SecurityError") {
      throw new AuthError("PASSKEY_NOT_SUPPORTED", "This browser or device does not support passkeys");
    }
    throw err;
  };

  const self: PasskeysModule = {
    startLogin: (email) =>
      call<PasskeyLoginStart>(
        ctx,
        { url: `${ctx.baseURL}/auth/webauthn/login/start`, method: "POST", body: { email } },
        { auth: false },
      ),

    async finishLogin(email, assertion, sessionNonce) {
      const response = await ctx.publicRequest({
        url: `${ctx.baseURL}/auth/webauthn/login/finish`,
        method: "POST",
        body: { email, response: assertion, sessionNonce },
      });
      if (!response.ok) throw ctx.fail(response);
      return parseAuthOutcome(ctx, payloadOf(response));
    },

    async authenticate(email) {
      requireBrowser("PASSKEY_NOT_SUPPORTED", "authenticateWithPasskey");
      const { sessionNonce, ...optionsJSON } = await self.startLogin(email);
      let assertion: WebAuthnCredentialJSON;
      try {
        const lib = await loadBrowserLib(options.loadBrowser);
        assertion = await lib.startAuthentication({ optionsJSON });
      } catch (err) {
        return cancelled(err, "PASSKEY_AUTH_CANCELLED", "Passkey authentication was cancelled");
      }
      return self.finishLogin(email, assertion, sessionNonce);
    },

    async startRegistration() {
      requireBrowser("PASSKEY_NOT_SUPPORTED", "startPasskeyRegistration");
      const optionsJSON = await call<WebAuthnOptionsJSON>(ctx, {
        url: `${ctx.baseURL}/mfa/webauthn/register/start`,
        method: "POST",
      });
      try {
        const lib = await loadBrowserLib(options.loadBrowser);
        return await lib.startRegistration({ optionsJSON });
      } catch (err) {
        return cancelled(err, "PASSKEY_REGISTRATION_CANCELLED", "Passkey registration was cancelled");
      }
    },

    async finishRegistration(response, deviceName) {
      const data = await call<{ credentialId?: string }>(ctx, {
        url: `${ctx.baseURL}/mfa/webauthn/register/finish`,
        method: "POST",
        body: { response, deviceName },
      });
      if (!data?.credentialId) {
        throw new AuthError("UNKNOWN_ERROR", "No credentialId in registration response");
      }
      return { credentialId: data.credentialId };
    },

    async list() {
      const data = await call<{ credentials?: Passkey[] }>(ctx, {
        url: `${ctx.baseURL}/mfa/webauthn/credentials`,
        method: "GET",
      });
      return data?.credentials ?? [];
    },

    remove: (credentialId) =>
      callVoid(ctx, { url: `${ctx.baseURL}/mfa/webauthn/credentials/${enc(credentialId)}`, method: "DELETE" }),
  };
  return self;
}

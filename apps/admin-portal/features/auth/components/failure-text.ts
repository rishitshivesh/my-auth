import { t } from "@/i18n";
import { waitParts, type Failure } from "../model/failure";

export function waitText(seconds: number | undefined): string {
  const parts = waitParts(seconds ?? 60);
  return t(parts.unit === "seconds" ? "auth.wait.seconds" : "auth.wait.minutes", { value: parts.value });
}

/** Sign-in failures. Messages are catalogue copy: server text is never echoed. */
export function loginFailureText(failure: Failure): string {
  const wait = waitText(failure.retryAfterSeconds);
  switch (failure.kind) {
    case "invalid-credentials":
      return t("auth.login.failures.invalidCredentials");
    case "locked":
      return t("auth.login.failures.locked", { wait });
    case "rate-limited":
      return t("auth.login.failures.rateLimited", { wait });
    case "email-unverified":
      return t("auth.login.failures.emailUnverified");
    case "suspended":
      return t("auth.login.failures.suspended");
    case "provider-disabled":
      return t("auth.login.failures.providerDisabled");
    case "passkey-cancelled":
      return t("auth.login.passkeyCancelled");
    case "passkey-unsupported":
      return t("auth.login.unsupportedPasskey");
    default:
      return t("auth.login.failures.generic");
  }
}

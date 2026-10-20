/**
 * Scrolloop Sentry SDK - Main Entry Point
 *
 * Convenience exports for common use cases.
 * For specific environments, use the submodules:
 * - @scrolloop/sdk/core  (pure logic)
 * - @scrolloop/sdk/web   (browser)
 * - @scrolloop/sdk/react (React hooks)
 * - @scrolloop/sdk/next  (Next.js SSR)
 * - @scrolloop/sdk/node  (server-to-server)
 */

// Shared types — re-exported so consumers only need @scrolloop/sdk
// export * from '@scrolloop/types';

// Core exports
export { SentryClient, AuthError, SentryApiError, isSentryApiError } from "./core";
export type {
  SentryConfig,
  LoginCredentials,
  LoginResponse,
  AuthEvent,
  AuthEventListener,
} from "./core";

// Convenience re-exports from web
export {
  createWebClient,
  getTenantFromSubdomain,
  getSocialLoginUrl,
  redirectToSocialLogin,
} from "./web";

export * from "./core/client";
export * from "./core/types";
export * from "./web/index";
export * from "./react/index";
export * from "./next/index";
export * from "./node/index";

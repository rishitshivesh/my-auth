/**
 * Fort Knox SDK - Main Entry Point
 * 
 * Convenience exports for common use cases
 * For specific environments, use the submodules:
 * - @fortknox/sdk/core  (pure logic)
 * - @fortknox/sdk/web   (browser)
 * - @fortknox/sdk/react (React hooks)
 * - @fortknox/sdk/next  (Next.js SSR)
 * - @fortknox/sdk/node  (server-to-server)
 */

// Core exports
export { FortKnoxClient, AuthError } from './core';
export type {
  FortKnoxConfig,
  User,
  Session,
  LoginCredentials,
  LoginResponse,
  AuthEvent,
  AuthEventListener,
} from './core';

// Convenience re-exports from web
export { 
  createWebClient,
  getTenantFromSubdomain,
  getSocialLoginUrl,
  redirectToSocialLogin,
} from './web';

export * from './core/client';
export * from './core/types';
export * from './web/index';
export * from './react/index';
export * from './next/index';
export * from './node/index';
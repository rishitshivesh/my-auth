/**
 * Scrolloop Sentry SDK - Core Module
 *
 * Pure auth logic - no DOM, no cookies, no framework dependencies
 * Works in any JavaScript environment
 */

export { SentryClient } from './client';
export { createFetchTransport } from './transport';
export {
  createAuthState,
  markAuthenticated,
  clearAuthentication,
  isSessionExpiringSoon,
} from './state';

export type {
  SentryConfig,
  Transport,
  TransportRequest,
  TransportResponse,
  AuthState,
  User,
  Session,
  LoginCredentials,
  SignupCredentials,
  LoginResponse,
  MfaChallenge,
  SessionClaims,
  AuthEvent,
  AuthEventListener,
  AuthErrorCode,
  LoginIntentResponse,
} from './types';

export { AuthError } from './types';
export * from './api-types';
export * from './modules';
export { SentryApiError, isSentryApiError } from './errors';
export type { ApiErrorInit } from './errors';

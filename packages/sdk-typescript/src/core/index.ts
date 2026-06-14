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
  setAccessToken,
  clearAccessToken,
  isTokenExpired,
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
  AuthEvent,
  AuthEventListener,
  AuthErrorCode,
} from './types';

export { AuthError } from './types';

/**
 * Fort Knox SDK - Core Module
 * 
 * Pure auth logic - no DOM, no cookies, no framework dependencies
 * Works in any JavaScript environment
 */

export { FortKnoxClient } from './client';
export { createFetchTransport } from './transport';
export {
  createAuthState,
  setAccessToken,
  clearAccessToken,
  isTokenExpired,
} from './state';

export type {
  FortKnoxConfig,
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

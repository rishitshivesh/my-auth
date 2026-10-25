import pino, { Logger } from 'pino';
import pretty from 'pino-pretty';

const stream = pretty({ colorize: true });

/**
 * Keys that must never reach a log line (ASVS 7.1.1). Wildcards cover one
 * level of nesting, e.g. `err.config.headers.authorization` is caught by
 * the explicit header paths and `*.password` by the wildcard entries.
 */
const SENSITIVE_KEYS = [
  'password',
  'newPassword',
  'currentPassword',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'tempToken',
  'secret',
  'clientSecret',
  'code',
  'otp',
  'bindPassword',
  'authorization',
  'cookie',
];

export const LOG_REDACT_PATHS: string[] = [
  ...SENSITIVE_KEYS,
  ...SENSITIVE_KEYS.map((k) => `*.${k}`),
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-authorization"]',
  'req.headers["x-setup-token"]',
  'res.headers["set-cookie"]',
];

export const logger: Logger = pino(
  { redact: { paths: LOG_REDACT_PATHS, censor: '[REDACTED]' } },
  stream,
);

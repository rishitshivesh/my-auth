import { describe, it, expect } from 'vitest';
import { SentryApiError } from './errors';
import { AuthError } from './types';

describe('SentryApiError.fromResponse', () => {
  it('parses problem+json', () => {
    const err = SentryApiError.fromResponse({
      status: 422,
      data: {
        type: 'urn:scrolloop:problem:VALIDATION_FAILED',
        title: 'Validation failed',
        status: 422,
        code: 'VALIDATION_FAILED',
        detail: 'Check the highlighted fields',
        requestId: 'req_1',
        errors: [{ field: 'email', message: 'invalid' }, { bad: true }],
      },
    });
    expect(err).toBeInstanceOf(AuthError);
    expect(err.code).toBe('VALIDATION_FAILED');
    expect(err.message).toBe('Check the highlighted fields');
    expect(err.requestId).toBe('req_1');
    expect(err.fieldErrors).toEqual([{ field: 'email', message: 'invalid' }]);
  });

  it('falls back to title when there is no detail and reads retryAfterSeconds', () => {
    const err = SentryApiError.fromResponse({
      status: 429,
      data: { title: 'Too many requests', code: 'RATE_LIMITED', status: 429, requestId: 'r', retryAfterSeconds: 30 },
    });
    expect(err.message).toBe('Too many requests');
    expect(err.retryAfterSeconds).toBe(30);
  });

  it('handles legacy Nest bodies', () => {
    const err = SentryApiError.fromResponse({
      status: 400,
      statusText: 'Bad Request',
      headers: { 'x-request-id': 'abc' },
      data: { statusCode: 400, message: ['a is required', 'b is required'] },
    });
    expect(err.code).toBe('BAD_REQUEST');
    expect(err.message).toBe('a is required; b is required');
    expect(err.requestId).toBe('abc');
  });

  it('handles legacy error envelope', () => {
    const err = SentryApiError.fromResponse({
      status: 403,
      data: { error: { code: 'ACCESS_FORBIDDEN', message: 'nope', requestId: 'q' } },
    });
    expect(err.code).toBe('ACCESS_FORBIDDEN');
    expect(err.message).toBe('nope');
    expect(err.requestId).toBe('q');
  });

  it('handles non-JSON bodies and Retry-After header', () => {
    const err = SentryApiError.fromResponse({
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'retry-after': '12' },
      data: 'upstream down',
    });
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.detail).toBe('upstream down');
    expect(err.retryAfterSeconds).toBe(12);
  });
});

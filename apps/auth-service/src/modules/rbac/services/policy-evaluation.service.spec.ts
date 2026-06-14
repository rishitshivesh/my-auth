import { PolicyEvaluationService } from './policy-evaluation.service';
import { EvaluationContext } from '../types/policy.types';

describe('PolicyEvaluationService', () => {
  let service: PolicyEvaluationService;

  beforeEach(() => {
    service = Object.create(PolicyEvaluationService.prototype);
  });

  describe('wildcardMatch', () => {
    it('should match exact strings', () => {
      expect(service.wildcardMatch('users:read', 'users:read')).toBe(true);
    });

    it('should match wildcard action (users:*)', () => {
      expect(service.wildcardMatch('users:*', 'users:read')).toBe(true);
      expect(service.wildcardMatch('users:*', 'users:write')).toBe(true);
      expect(service.wildcardMatch('users:*', 'users:delete')).toBe(true);
    });

    it('should match full wildcard (*)', () => {
      expect(service.wildcardMatch('*', 'users:read')).toBe(true);
      expect(service.wildcardMatch('*', 'anything')).toBe(true);
    });

    it('should match resource wildcard pattern', () => {
      expect(
        service.wildcardMatch('sentry:tenant:*/user:*', 'sentry:tenant:acme/user:123'),
      ).toBe(true);
    });

    it('should not match different strings', () => {
      expect(service.wildcardMatch('users:read', 'users:write')).toBe(false);
      expect(service.wildcardMatch('users:read', 'clients:read')).toBe(false);
    });
  });

  describe('evaluateConditions', () => {
    const baseContext: EvaluationContext = {
      ipAddress: '192.168.1.100',
      mfaVerified: true,
    };

    it('should return true when no conditions', () => {
      expect(service.evaluateConditions(undefined, baseContext)).toBe(true);
    });

    it('should match IP address exact match', () => {
      expect(
        service.evaluateConditions(
          { IpAddress: { 'sentry:SourceIp': '192.168.1.100' } },
          baseContext,
        ),
      ).toBe(true);
    });

    it('should match IP address CIDR', () => {
      expect(
        service.evaluateConditions(
          { IpAddress: { 'sentry:SourceIp': '192.168.1.0/24' } },
          baseContext,
        ),
      ).toBe(true);
    });

    it('should reject non-matching IP', () => {
      expect(
        service.evaluateConditions(
          { IpAddress: { 'sentry:SourceIp': '10.0.0.0/8' } },
          baseContext,
        ),
      ).toBe(false);
    });

    it('should check MFA condition - required and present', () => {
      expect(
        service.evaluateConditions(
          { Bool: { 'sentry:MultiFactorAuthPresent': true } },
          { ...baseContext, mfaVerified: true },
        ),
      ).toBe(true);
    });

    it('should check MFA condition - required but missing', () => {
      expect(
        service.evaluateConditions(
          { Bool: { 'sentry:MultiFactorAuthPresent': true } },
          { ...baseContext, mfaVerified: false },
        ),
      ).toBe(false);
    });

    it('should check DateLessThan condition', () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      expect(
        service.evaluateConditions(
          { DateLessThan: { 'sentry:CurrentTime': futureDate } },
          baseContext,
        ),
      ).toBe(true);

      const pastDate = new Date(Date.now() - 86400000).toISOString();
      expect(
        service.evaluateConditions(
          { DateLessThan: { 'sentry:CurrentTime': pastDate } },
          baseContext,
        ),
      ).toBe(false);
    });

    it('should check StringEquals condition', () => {
      const ctx: EvaluationContext = {
        ...baseContext,
        attributes: { 'sentry:department': 'engineering' },
      };
      expect(
        service.evaluateConditions(
          { StringEquals: { 'sentry:department': 'engineering' } },
          ctx,
        ),
      ).toBe(true);

      expect(
        service.evaluateConditions(
          { StringEquals: { 'sentry:department': 'marketing' } },
          ctx,
        ),
      ).toBe(false);
    });
  });

  describe('evaluate (integration-style with mock collectPolicies)', () => {
    const context: EvaluationContext = {
      ipAddress: '10.0.0.1',
      mfaVerified: true,
    };

    function makeService(policies: Array<{ name: string; document: { Version: string; Statement: Array<{ Sid?: string; Effect: 'Allow' | 'Deny'; Action: string | string[]; Resource: string | string[] }> } }>): PolicyEvaluationService {
      const svc = Object.create(PolicyEvaluationService.prototype);
      svc.collectPolicies = async () => policies;
      svc.checkPermissionBoundary = async () => null;
      return svc;
    }

    it('should allow when single Allow statement matches', async () => {
      const svc = makeService([
        {
          name: 'ReadAccess',
          document: {
            Version: '2024-01-01',
            Statement: [
              { Effect: 'Allow', Action: 'users:read', Resource: '*' },
            ],
          },
        },
      ]);

      const result = await svc.evaluate({
        userId: 'u1',
        tenantId: 't1',
        action: 'users:read',
        resource: 'sentry:tenant:t1/users/123',
        context,
      });

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('explicit_allow');
    });

    it('should deny when no statements match (implicit deny)', async () => {
      const svc = makeService([
        {
          name: 'ReadAccess',
          document: {
            Version: '2024-01-01',
            Statement: [
              { Effect: 'Allow', Action: 'users:read', Resource: '*' },
            ],
          },
        },
      ]);

      const result = await svc.evaluate({
        userId: 'u1',
        tenantId: 't1',
        action: 'users:delete',
        resource: 'sentry:tenant:t1/users/123',
        context,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('implicit_deny');
    });

    it('should deny when explicit Deny overrides Allow', async () => {
      const svc = makeService([
        {
          name: 'AllowAll',
          document: {
            Version: '2024-01-01',
            Statement: [
              { Sid: 'AllowAll', Effect: 'Allow', Action: '*', Resource: '*' },
            ],
          },
        },
        {
          name: 'DenyDelete',
          document: {
            Version: '2024-01-01',
            Statement: [
              { Sid: 'DenyDelete', Effect: 'Deny', Action: 'users:delete', Resource: '*' },
            ],
          },
        },
      ]);

      const result = await svc.evaluate({
        userId: 'u1',
        tenantId: 't1',
        action: 'users:delete',
        resource: 'sentry:tenant:t1/users/123',
        context,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('explicit_deny');
      expect(result.deniedBy).toContain('DenyDelete:DenyDelete');
    });

    it('should match wildcard actions (users:*)', async () => {
      const svc = makeService([
        {
          name: 'UserFullAccess',
          document: {
            Version: '2024-01-01',
            Statement: [
              { Effect: 'Allow', Action: 'users:*', Resource: '*' },
            ],
          },
        },
      ]);

      const result = await svc.evaluate({
        userId: 'u1',
        tenantId: 't1',
        action: 'users:write',
        resource: 'sentry:tenant:t1/users',
        context,
      });

      expect(result.allowed).toBe(true);
    });

    it('should match wildcard resources', async () => {
      const svc = makeService([
        {
          name: 'TenantAccess',
          document: {
            Version: '2024-01-01',
            Statement: [
              { Effect: 'Allow', Action: 'users:read', Resource: 'sentry:tenant:*/user:*' },
            ],
          },
        },
      ]);

      const result = await svc.evaluate({
        userId: 'u1',
        tenantId: 't1',
        action: 'users:read',
        resource: 'sentry:tenant:acme/user:456',
        context,
      });

      expect(result.allowed).toBe(true);
    });
  });

  describe('simulate', () => {
    it('should return trace of all evaluated statements', async () => {
      const svc = Object.create(PolicyEvaluationService.prototype);
      const policies = [
        {
          name: 'Policy1',
          document: {
            Version: '2024-01-01',
            Statement: [
              { Sid: 'AllowRead', Effect: 'Allow' as const, Action: 'users:read', Resource: '*' },
              { Sid: 'DenyAdmin', Effect: 'Deny' as const, Action: 'admin:*', Resource: '*' },
            ],
          },
        },
      ];
      svc.collectPolicies = async () => policies;
      svc.checkPermissionBoundary = async () => null;

      const result = await svc.simulate({
        userId: 'u1',
        tenantId: 't1',
        action: 'users:read',
        resource: 'sentry:tenant:t1/users',
        context: { ipAddress: '10.0.0.1', mfaVerified: true },
      });

      expect(result.policiesEvaluated).toBe(1);
      expect(result.trace).toHaveLength(2);
      expect(result.trace[0].policyName).toBe('Policy1');
      expect(result.trace[0].statementSid).toBe('AllowRead');
      expect(result.trace[0].applies).toBe(true);
      expect(result.trace[1].statementSid).toBe('DenyAdmin');
      expect(result.trace[1].applies).toBe(false);
      expect(result.allowed).toBe(true);
    });
  });
});

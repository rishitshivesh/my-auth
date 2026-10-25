import { PolicyEvaluationService } from './policy-evaluation.service';
import { EvaluationContext, PolicyStatement } from '../types/policy.types';

jest.mock('@/common/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

type Pol = { id: string; name: string; document: { Version: string; Statement: PolicyStatement[] } };
const pol = (id: string, statements: PolicyStatement[]): Pol => ({
  id,
  name: id,
  document: { Version: '2024-01-01', Statement: statements },
});
const ctx: EvaluationContext = { ipAddress: '10.0.0.5', mfaVerified: false };

function build() {
  const repo = () => ({ find: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue(null) });
  const r = {
    policy: repo(),
    userRole: repo(),
    userGroup: repo(),
    userPolicy: repo(),
    groupPolicy: repo(),
    rolePolicy: repo(),
    group: repo(),
    role: repo(),
  };
  const cache = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) };
  const svc = new PolicyEvaluationService(
    r.policy as never,
    r.userRole as never,
    r.userGroup as never,
    r.userPolicy as never,
    r.groupPolicy as never,
    r.rolePolicy as never,
    r.group as never,
    r.role as never,
    cache as never,
  );
  return { svc, r, cache };
}

/** Make collectPolicies return fixed policies (cache hit). */
function withPolicies(policies: Pol[]) {
  const b = build();
  b.cache.get.mockResolvedValue(policies);
  return b;
}

const req = (action: string, resource = 'sentry:tenant:t1/users', c = ctx) => ({
  userId: 'u1',
  tenantId: 't1',
  action,
  resource,
  context: c,
});

describe('PolicyEvaluationService.evaluate', () => {
  it('implicit deny when no policy matches', async () => {
    const { svc } = withPolicies([]);
    expect(await svc.evaluate(req('users:read'))).toEqual({
      allowed: false,
      reason: 'implicit_deny',
      deniedBy: [],
      allowedBy: [],
    });
  });

  it('explicit allow with action and resource wildcard', async () => {
    const { svc } = withPolicies([pol('P', [{ Sid: 'A', Effect: 'Allow', Action: 'users:*', Resource: 'sentry:tenant:*' }])]);
    expect(await svc.evaluate(req('users:read'))).toEqual({
      allowed: true,
      reason: 'explicit_allow',
      allowedBy: ['P:A'],
    });
  });

  it('Deny overrides Allow regardless of order', async () => {
    const allow: PolicyStatement = { Sid: 'A', Effect: 'Allow', Action: '*', Resource: '*' };
    const deny: PolicyStatement = { Sid: 'D', Effect: 'Deny', Action: 'users:delete', Resource: '*' };
    for (const order of [[allow, deny], [deny, allow]]) {
      const { svc } = withPolicies([pol('P', order)]);
      const res = await svc.evaluate(req('users:delete'));
      expect(res).toEqual({ allowed: false, reason: 'explicit_deny', deniedBy: ['P:D'] });
    }
  });

  it('Deny in a separate policy overrides Allow in another', async () => {
    const { svc } = withPolicies([
      pol('A', [{ Effect: 'Allow', Action: '*', Resource: '*' }]),
      pol('B', [{ Effect: 'Deny', Action: 'x:y', Resource: '*' }]),
    ]);
    const res = await svc.evaluate(req('x:y'));
    expect(res.allowed).toBe(false);
    expect(res.deniedBy).toEqual(['B:unnamed']);
  });

  it('unrelated Deny does not block allowed action', async () => {
    const { svc } = withPolicies([
      pol('P', [
        { Effect: 'Allow', Action: 'users:read', Resource: '*' },
        { Effect: 'Deny', Action: 'users:delete', Resource: '*' },
      ]),
    ]);
    expect((await svc.evaluate(req('users:read'))).allowed).toBe(true);
  });

  it('Deny with unmet condition does not apply (IP-scoped deny)', async () => {
    const { svc } = withPolicies([
      pol('P', [
        { Effect: 'Allow', Action: '*', Resource: '*' },
        { Sid: 'D', Effect: 'Deny', Action: '*', Resource: '*', Condition: { IpAddress: { 'sentry:SourceIp': '192.168.0.0/16' } } },
      ]),
    ]);
    expect((await svc.evaluate(req('a:b'))).allowed).toBe(true);
    const res = await svc.evaluate(req('a:b', 'r', { ...ctx, ipAddress: '192.168.9.9' }));
    expect(res).toMatchObject({ allowed: false, reason: 'explicit_deny' });
  });

  it('does not match resources outside pattern', async () => {
    const { svc } = withPolicies([pol('P', [{ Effect: 'Allow', Action: '*', Resource: 'sentry:tenant:t1/users' }])]);
    expect((await svc.evaluate(req('a:b', 'sentry:tenant:t2/users'))).reason).toBe('implicit_deny');
  });

  it('substitutes ${sentry:UserId}/${sentry:TenantId} in resources; unknown vars stay literal', async () => {
    const { svc } = withPolicies([
      pol('P', [
        { Effect: 'Allow', Action: '*', Resource: ['sentry:tenant:${sentry:TenantId}/users/${sentry:UserId}'] },
        { Effect: 'Allow', Action: 'z:z', Resource: '${unknown:Var}' },
      ]),
    ]);
    expect((await svc.evaluate(req('a:b', 'sentry:tenant:t1/users/u1'))).allowed).toBe(true);
    expect((await svc.evaluate(req('a:b', 'sentry:tenant:t1/users/OTHER'))).allowed).toBe(false);
    expect((await svc.evaluate(req('z:z', '${unknown:Var}'))).allowed).toBe(true);
  });

  it('user-controlled regex metacharacters in resource do not break matching', async () => {
    const { svc } = withPolicies([pol('P', [{ Effect: 'Allow', Action: 'a:b', Resource: 'r(1)+[x].*' }])]);
    expect((await svc.evaluate(req('a:b', 'r(1)+[x].anything'))).allowed).toBe(true);
    expect((await svc.evaluate(req('a:b', 'rr1+x.anything'))).allowed).toBe(false);
  });

  describe('permission boundary', () => {
    const allowAll = pol('P', [{ Effect: 'Allow', Action: '*', Resource: '*' }]);

    it('denies with boundary_deny when boundary policy lacks the action', async () => {
      const { svc, r } = withPolicies([allowAll]);
      r.userRole.find.mockResolvedValue([{ role: { permissionBoundaryPolicyId: 'b1' } }]);
      r.policy.findOne.mockResolvedValue(pol('B', [{ Effect: 'Allow', Action: 'users:read', Resource: '*' }]));
      const res = await svc.evaluate(req('users:delete'));
      expect(res).toEqual({ allowed: false, reason: 'boundary_deny', deniedBy: ['boundary:B'] });
    });

    it('allows when boundary permits the action', async () => {
      const { svc, r } = withPolicies([allowAll]);
      r.userRole.find.mockResolvedValue([{ role: { permissionBoundaryPolicyId: 'b1' } }]);
      r.policy.findOne.mockResolvedValue(
        pol('B', [
          { Effect: 'Deny', Action: 'users:read', Resource: '*' }, // non-Allow statements ignored
          { Effect: 'Allow', Action: 'users:read', Resource: 'other' }, // resource mismatch
          { Effect: 'Allow', Action: 'users:read', Resource: '*', Condition: { Bool: { 'sentry:MultiFactorAuthPresent': true } } }, // condition mismatch
          { Effect: 'Allow', Action: 'users:other', Resource: '*' }, // action mismatch
          { Effect: 'Allow', Action: 'users:read', Resource: 'sentry:tenant:*' },
        ]),
      );
      expect((await svc.evaluate(req('users:read'))).allowed).toBe(true);
    });

    it('skips expired role assignments, roles without boundary, and missing boundary policy', async () => {
      const { svc, r } = withPolicies([allowAll]);
      r.userRole.find.mockResolvedValue([
        { expiresAt: new Date(Date.now() - 1000), role: { permissionBoundaryPolicyId: 'b1' } },
        { role: {} },
        { role: undefined },
        { role: { permissionBoundaryPolicyId: 'gone' } },
      ]);
      r.policy.findOne.mockResolvedValue(null);
      expect((await svc.evaluate(req('x:y'))).allowed).toBe(true);
      expect(r.policy.findOne).toHaveBeenCalledTimes(1);
    });

    it('is not consulted on implicit/explicit deny', async () => {
      const { svc, r } = withPolicies([]);
      await svc.evaluate(req('x:y'));
      expect(r.userRole.find).not.toHaveBeenCalled();
    });

    it('any one failing boundary among several roles denies', async () => {
      const { svc, r } = withPolicies([allowAll]);
      r.userRole.find.mockResolvedValue([
        { role: { permissionBoundaryPolicyId: 'ok' } },
        { role: { permissionBoundaryPolicyId: 'bad' } },
      ]);
      r.policy.findOne.mockImplementation(async ({ where }: { where: { id: string } }) =>
        where.id === 'ok'
          ? pol('OK', [{ Effect: 'Allow', Action: '*', Resource: '*' }])
          : pol('BAD', [{ Effect: 'Allow', Action: 'nothing', Resource: '*' }]),
      );
      expect((await svc.evaluate(req('x:y'))).reason).toBe('boundary_deny');
    });
  });
});

describe('PolicyEvaluationService.simulate', () => {
  it('returns trace per statement and policy count', async () => {
    const { svc } = withPolicies([
      pol('P', [
        { Sid: 'A', Effect: 'Allow', Action: 'a:b', Resource: '*' },
        { Effect: 'Deny', Action: 'c:d', Resource: ['x'], Condition: { Bool: { 'sentry:MultiFactorAuthPresent': true } } },
      ]),
    ]);
    const res = await svc.simulate(req('a:b'));
    expect(res.allowed).toBe(true);
    expect(res.policiesEvaluated).toBe(1);
    expect(res.trace).toEqual([
      { policyName: 'P', statementSid: 'A', effect: 'Allow', actionMatch: true, resourceMatch: true, conditionMatch: true, applies: true },
      { policyName: 'P', statementSid: undefined, effect: 'Deny', actionMatch: false, resourceMatch: false, conditionMatch: false, applies: false },
    ]);
  });
});

describe('PolicyEvaluationService.evaluateConditions', () => {
  const { svc } = build();
  const c = (o: Partial<EvaluationContext> = {}): EvaluationContext => ({ ...ctx, ...o });

  it('IP: list of cidrs / exact / bad cidrs', () => {
    const ip = (v: string | string[], o = {}) => svc.evaluateConditions({ IpAddress: { 'sentry:SourceIp': v } }, c(o));
    expect(ip(['1.1.1.1', '10.0.0.0/24'])).toBe(true);
    expect(ip('10.0.0.5')).toBe(true);
    expect(ip('10.0.0.6')).toBe(false);
    expect(ip('10.0.0.0/33')).toBe(false);
    expect(ip('10.0.0.0/-1')).toBe(false);
    expect(ip('10.0.0.0/abc')).toBe(false);
    expect(ip('10.0.0.0/')).toBe(false);
    expect(ip('/8')).toBe(false);
    expect(ip('999.0.0.0/8')).toBe(false);
    expect(ip('10.0.0.0/8', { ipAddress: 'not-an-ip' })).toBe(false);
    expect(ip('10.0.0.0/8', { ipAddress: '10.1.2' })).toBe(false);
    expect(ip('0.0.0.0/0', { ipAddress: '200.1.1.1' })).toBe(true);
    expect(ip('10.0.0.5/32')).toBe(true);
    expect(ip('10.0.0.4/31')).toBe(true);
    expect(ip('10.0.0.6/31')).toBe(false);
    expect(ip('128.0.0.0/1', { ipAddress: '255.255.255.255' })).toBe(true);
    expect(ip('10.0.0.0/8', { ipAddress: '10.0.0.1.5' })).toBe(false);
  });

  it('MFA bool both directions', () => {
    expect(svc.evaluateConditions({ Bool: { 'sentry:MultiFactorAuthPresent': true } }, c({ mfaVerified: false }))).toBe(false);
    expect(svc.evaluateConditions({ Bool: { 'sentry:MultiFactorAuthPresent': false } }, c({ mfaVerified: false }))).toBe(true);
  });

  describe('dates (fake clock)', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2025-06-01T00:00:00Z'));
    });
    afterEach(() => jest.useRealTimers());

    it('DateGreaterThan boundary is exclusive, uses clock when no timestamp', () => {
      const gt = (t: string, o = {}) => svc.evaluateConditions({ DateGreaterThan: { 'sentry:CurrentTime': t } }, c(o));
      expect(gt('2025-05-31T23:59:59Z')).toBe(true);
      expect(gt('2025-06-01T00:00:00Z')).toBe(false);
      expect(gt('2025-06-01T00:00:01Z')).toBe(false);
      expect(gt('2030-01-01T00:00:00Z', { timestamp: new Date('2031-01-01') })).toBe(true);
    });

    it('DateLessThan boundary is exclusive', () => {
      const lt = (t: string, o = {}) => svc.evaluateConditions({ DateLessThan: { 'sentry:CurrentTime': t } }, c(o));
      expect(lt('2025-06-01T00:00:01Z')).toBe(true);
      expect(lt('2025-06-01T00:00:00Z')).toBe(false);
      expect(lt('2025-01-01T00:00:00Z')).toBe(false);
      expect(lt('2030-01-01T00:00:00Z', { timestamp: new Date('2031-01-01') })).toBe(false);
    });

    it('invalid date threshold fails closed', () => {
      expect(svc.evaluateConditions({ DateLessThan: { 'sentry:CurrentTime': 'garbage' } }, c())).toBe(false);
      expect(svc.evaluateConditions({ DateGreaterThan: { 'sentry:CurrentTime': 'garbage' } }, c())).toBe(false);
    });
  });

  it('StringEquals: scalar/array, missing attribute, mismatch', () => {
    const se = (e: Record<string, string | string[]>, attrs?: Record<string, string>) =>
      svc.evaluateConditions({ StringEquals: e }, c({ attributes: attrs }));
    expect(se({ dept: 'eng' }, { dept: 'eng' })).toBe(true);
    expect(se({ dept: ['eng', 'ops'] }, { dept: 'ops' })).toBe(true);
    expect(se({ dept: 'eng' }, { dept: 'hr' })).toBe(false);
    expect(se({ dept: 'eng' }, {})).toBe(false);
    expect(se({ dept: 'eng' })).toBe(false);
    expect(se({ dept: 'eng', team: 'a' }, { dept: 'eng' })).toBe(false);
  });

  it('combines conditions with AND', () => {
    const cond = { IpAddress: { 'sentry:SourceIp': '10.0.0.0/8' }, Bool: { 'sentry:MultiFactorAuthPresent': true } };
    expect(svc.evaluateConditions(cond, c({ mfaVerified: true }))).toBe(true);
    expect(svc.evaluateConditions(cond, c({ mfaVerified: false }))).toBe(false);
  });
});

describe('PolicyEvaluationService.wildcardMatch', () => {
  const { svc } = build();
  it('supports ? and anchors the match', () => {
    expect(svc.wildcardMatch('a?c', 'abc')).toBe(true);
    expect(svc.wildcardMatch('a?c', 'ac')).toBe(false);
    expect(svc.wildcardMatch('abc', 'xabcx')).toBe(false);
    expect(svc.wildcardMatch('a.c', 'abc')).toBe(false);
  });
});

describe('PolicyEvaluationService.collectPolicies', () => {
  it('returns cached policies without hitting repos', async () => {
    const { svc, r, cache } = build();
    cache.get.mockResolvedValue([{ id: 'c' }]);
    expect(await svc.collectPolicies('u', 't')).toEqual([{ id: 'c' }]);
    expect(cache.get).toHaveBeenCalledWith('t', 'policies:u');
    expect(r.userPolicy.find).not.toHaveBeenCalled();
  });

  it('merges user, role, and group (with parent chain) policies, dedupes, caches', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2025-01-01T00:00:00Z'));
    const { svc, r, cache } = build();
    const p = (id: string) => ({ id, name: id, document: { Version: 'v', Statement: [] } });
    r.userPolicy.find.mockResolvedValue([{ policy: p('u1') }, { policy: null }, { policy: p('shared') }]);
    r.userRole.find.mockResolvedValue([
      { roleId: 'active', expiresAt: new Date('2026-01-01') },
      { roleId: 'noexp' },
      { roleId: 'expired', expiresAt: new Date('2024-01-01') },
    ]);
    r.rolePolicy.find.mockResolvedValue([{ policy: p('r1') }, { policy: p('shared') }, { policy: undefined }]);
    r.userGroup.find.mockResolvedValue([
      { groupId: 'g1', group: { parentGroupId: 'g0' } },
      { groupId: 'g2', group: undefined },
    ]);
    r.groupPolicy.find.mockImplementation(async ({ where }: { where: { groupId: string } }) => ({ g1: [{ policy: p('gp1') }], g0: [{ policy: p('gp0') }, { policy: null }], g2: [] })[where.groupId]);
    r.group.findOne.mockResolvedValue({ id: 'g0', parentGroupId: 'g-1' });
    r.group.findOne.mockResolvedValueOnce({ id: 'g0', parentGroupId: 'g1' }); // cycle back to visited g1

    const out = await svc.collectPolicies('u', 't');
    expect(out.map((x) => x.id).sort()).toEqual(['gp0', 'gp1', 'r1', 'shared', 'u1']);
    const roleCall = r.rolePolicy.find.mock.calls[0][0].where.roleId;
    expect(roleCall.value).toEqual(['active', 'noexp']);
    expect(cache.set).toHaveBeenCalledWith('t', 'policies:u', out, 300);
    jest.useRealTimers();
  });

  it('skips role policy lookup when all roles expired / none', async () => {
    const { svc, r } = build();
    r.userRole.find.mockResolvedValue([{ roleId: 'x', expiresAt: new Date(0) }]);
    expect(await svc.collectPolicies('u', 't')).toEqual([]);
    expect(r.rolePolicy.find).not.toHaveBeenCalled();
  });

  it('stops walking at a missing parent group and handles cycles', async () => {
    const { svc, r } = build();
    r.userGroup.find.mockResolvedValue([{ groupId: 'a', group: { parentGroupId: 'missing' } }]);
    r.group.findOne.mockResolvedValue(null);
    expect(await svc.collectPolicies('u', 't')).toEqual([]);

    const b = build();
    b.r.userGroup.find.mockResolvedValue([{ groupId: 'a', group: { parentGroupId: 'b' } }]);
    b.r.group.findOne.mockResolvedValue({ id: 'b', parentGroupId: 'b' }); // self cycle
    await b.svc.collectPolicies('u', 't');
    expect(b.r.group.findOne).toHaveBeenCalledTimes(1);
  });
});

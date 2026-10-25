import { PolicyService } from './policy.service';

jest.mock('@/common/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const repo = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findAndCount: jest.fn(),
  save: jest.fn(async (x: unknown) => x),
  delete: jest.fn(),
  create: jest.fn((x: unknown) => ({ id: 'new', ...(x as object) })),
});
function build() {
  const p = repo(), rp = repo(), up = repo(), gp = repo();
  const cache = { invalidateTenant: jest.fn() };
  return { svc: new PolicyService(p as never, rp as never, up as never, gp as never, cache as never), p, rp, cache };
}
const doc = (over: Record<string, unknown> = {}) => ({
  Version: '2024-01-01',
  Statement: [{ Effect: 'Allow', Action: 'a:b', Resource: '*', ...over }],
});
const bad = (document: unknown, detail?: string) => ({ code: 'BAD_REQUEST', ...(detail ? { detail: expect.stringContaining(detail) } : {}) });

describe('PolicyService', () => {
  describe('createPolicy validation', () => {
    it.each([
      ['missing Version', { Statement: [] }, 'Version and Statement'],
      ['missing Statement', { Version: 'v' }, 'Version and Statement'],
      ['non-array Statement', { Version: 'v', Statement: 'x' }, 'Version and Statement'],
      ['empty Statement', { Version: 'v', Statement: [] }, 'at least one statement'],
      ['bad Effect', doc({ Effect: 'allow' }), 'Invalid Effect'],
      ['missing Action', doc({ Action: undefined }), 'Action'],
      ['empty Action array', doc({ Action: [] }), 'Action'],
      ['missing Resource', doc({ Resource: '' }), 'Resource'],
      ['empty Resource array', doc({ Resource: [] }), 'Resource'],
    ])('rejects %s', async (_n, document, detail) => {
      const { svc, p } = build();
      await expect(svc.createPolicy('t', { name: 'n', document } as never)).rejects.toMatchObject(bad(document, detail));
      expect(p.save).not.toHaveBeenCalled();
    });

    it('rejects duplicate name', async () => {
      const { svc, p } = build();
      p.findOne.mockResolvedValue({});
      await expect(svc.createPolicy('t', { name: 'n', document: doc() } as never)).rejects.toMatchObject({ code: 'RESOURCE_CONFLICT' });
    });

    it('creates with defaults', async () => {
      const { svc, p } = build();
      p.findOne.mockResolvedValue(null);
      expect(await svc.createPolicy('t', { name: 'n', document: doc() } as never)).toMatchObject({ type: 'managed', description: null, tenantId: 't' });
      expect(await svc.createPolicy('t', { name: 'n', description: 'd', type: 'inline', document: doc() } as never)).toMatchObject({ type: 'inline', description: 'd' });
    });

    // BUG: validateDocument dereferences each statement; a null statement throws TypeError (500) instead of 400.
    it('null statement yields BAD_REQUEST not TypeError', async () => {
      const { svc } = build();
      await expect(svc.createPolicy('t', { name: 'n', document: { Version: 'v', Statement: [null] } } as never)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  it('listPolicies paginates', async () => {
    const { svc, p } = build();
    p.findAndCount.mockResolvedValue([[1], 9]);
    expect(await svc.listPolicies('t', 3, 10)).toEqual({ data: [1], total: 9 });
    expect(p.findAndCount).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 10 }));
    await svc.listPolicies('t');
    expect(p.findAndCount).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 0, take: 50 }));
  });

  it('getPolicy not found', async () => {
    const { svc, p } = build();
    p.findOne.mockResolvedValue(null);
    await expect(svc.getPolicy('i', 't')).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  });

  describe('updatePolicy', () => {
    it('rejects system policy', async () => {
      const { svc, p } = build();
      p.findOne.mockResolvedValue({ isSystem: true });
      await expect(svc.updatePolicy('i', 't', {} as never)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
    it('rejects invalid new document before saving', async () => {
      const { svc, p } = build();
      p.findOne.mockResolvedValue({});
      await expect(svc.updatePolicy('i', 't', { document: { Version: 'v', Statement: [] } } as never)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      expect(p.save).not.toHaveBeenCalled();
    });
    it('updates document and description, invalidates cache', async () => {
      const { svc, p, cache } = build();
      p.findOne.mockResolvedValue({ description: 'old' });
      const d = doc();
      expect(await svc.updatePolicy('i', 't', { document: d, description: null } as never)).toMatchObject({ document: d, description: null });
      expect(cache.invalidateTenant).toHaveBeenCalledWith('t');
    });
    it('no-op update keeps fields', async () => {
      const { svc, p } = build();
      p.findOne.mockResolvedValue({ description: 'old' });
      expect(await svc.updatePolicy('i', 't', {} as never)).toMatchObject({ description: 'old' });
    });
  });

  it('deletePolicy', async () => {
    const a = build();
    a.p.findOne.mockResolvedValue({ isSystem: true });
    await expect(a.svc.deletePolicy('i', 't')).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    const b = build();
    b.p.findOne.mockResolvedValue({ id: 'i' });
    await b.svc.deletePolicy('i', 't');
    expect(b.p.delete).toHaveBeenCalled();
    expect(b.cache.invalidateTenant).toHaveBeenCalledWith('t');
  });

  describe('role attachments', () => {
    it('attach: not found policy, duplicate, success', async () => {
      const a = build();
      a.p.findOne.mockResolvedValue(null);
      await expect(a.svc.attachPolicyToRole('r', 'p', 't')).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
      const b = build();
      b.p.findOne.mockResolvedValue({});
      b.rp.findOne.mockResolvedValue({});
      await expect(b.svc.attachPolicyToRole('r', 'p', 't')).rejects.toMatchObject({ code: 'RESOURCE_CONFLICT' });
      const c = build();
      c.p.findOne.mockResolvedValue({});
      c.rp.findOne.mockResolvedValue(null);
      await c.svc.attachPolicyToRole('r', 'p', 't');
      expect(c.rp.save).toHaveBeenCalledWith({ roleId: 'r', policyId: 'p', tenantId: 't' });
      expect(c.cache.invalidateTenant).toHaveBeenCalled();
    });
    it('detach', async () => {
      const { svc, rp, cache } = build();
      rp.findOne.mockResolvedValueOnce(null);
      await expect(svc.detachPolicyFromRole('r', 'p', 't')).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
      rp.findOne.mockResolvedValueOnce({ id: "x1" });
      await svc.detachPolicyFromRole('r', 'p', 't');
      expect(rp.delete).toHaveBeenCalledWith({ id: "x1" });
      expect(cache.invalidateTenant).toHaveBeenCalled();
    });
    it('listPoliciesForRole filters missing policies', async () => {
      const { svc, rp } = build();
      rp.find.mockResolvedValue([{ policy: { id: 1 } }, { policy: null }, {}]);
      expect(await svc.listPoliciesForRole('r', 't')).toEqual([{ id: 1 }]);
    });
  });
});

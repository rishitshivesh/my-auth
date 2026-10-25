import { PermissionService } from './permission.service';

jest.mock('@/common/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

function qb(result: unknown) {
  const q: Record<string, jest.Mock> = {};
  for (const m of ['where', 'andWhere', 'orderBy', 'addOrderBy']) q[m] = jest.fn().mockReturnValue(q);
  q.getMany = jest.fn().mockResolvedValue(result);
  return q;
}
function build() {
  const repo = { findOne: jest.fn(), save: jest.fn(async (x: unknown) => ({ id: 'p', ...(x as object) })), delete: jest.fn(), count: jest.fn(), createQueryBuilder: jest.fn() };
  return { svc: new PermissionService(repo as never), repo };
}

describe('PermissionService', () => {
  describe('createPermission', () => {
    it('derives name from resource:action when empty, applies defaults', async () => {
      const { svc, repo } = build();
      repo.findOne.mockResolvedValue(null);
      const out = await svc.createPermission({ tenantId: 't', name: '', resource: 'users', action: 'read' });
      expect(out).toMatchObject({ name: 'users:read', scope: 'tenant', isSystem: false });
    });
    it('keeps explicit fields', async () => {
      const { svc, repo } = build();
      repo.findOne.mockResolvedValue(null);
      expect(await svc.createPermission({ tenantId: 't', name: 'x:y', resource: 'x', action: 'y', scope: 'platform', isSystem: true })).toMatchObject({ scope: 'platform', isSystem: true });
    });
    it('conflicts on duplicate', async () => {
      const { svc, repo } = build();
      repo.findOne.mockResolvedValue({});
      await expect(svc.createPermission({ tenantId: 't', name: 'a:b', resource: 'a', action: 'b' })).rejects.toMatchObject({ code: 'RESOURCE_CONFLICT' });
    });
  });

  describe('bulkCreatePermissions', () => {
    it('skips conflicts, returns created', async () => {
      const { svc, repo } = build();
      repo.findOne.mockResolvedValueOnce({}).mockResolvedValueOnce(null);
      const out = await svc.bulkCreatePermissions('t', [{ resource: 'a', action: 'b' }, { resource: 'c', action: 'd', description: 'x' }]);
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({ name: 'c:d' });
    });
    it('rethrows non-conflict errors', async () => {
      const { svc, repo } = build();
      repo.findOne.mockRejectedValue(new Error('db'));
      await expect(svc.bulkCreatePermissions('t', [{ resource: 'a', action: 'b' }])).rejects.toThrow('db');
    });
  });

  it('getPermission / getPermissionByName', async () => {
    const { svc, repo } = build();
    repo.findOne.mockResolvedValue(null);
    await expect(svc.getPermission('i', 't')).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    expect(await svc.getPermissionByName('n', 't')).toBeNull();
    repo.findOne.mockResolvedValue({ id: 1 });
    expect(await svc.getPermission('i', 't')).toEqual({ id: 1 });
  });

  it('listPermissions applies filters', async () => {
    const { svc, repo } = build();
    const q = qb([1]);
    repo.createQueryBuilder.mockReturnValue(q);
    await svc.listPermissions('t');
    expect(q.andWhere).not.toHaveBeenCalled();
    await svc.listPermissions('t', { resource: 'r', action: 'a', scope: 's', isSystem: false });
    expect(q.andWhere).toHaveBeenCalledTimes(4);
  });

  it('getPermissionsByResource groups', async () => {
    const { svc, repo } = build();
    repo.createQueryBuilder.mockReturnValue(qb([{ resource: 'a', action: '1' }, { resource: 'b', action: '2' }, { resource: 'a', action: '3' }]));
    const g = await svc.getPermissionsByResource('t');
    expect(Object.keys(g)).toEqual(['a', 'b']);
    expect(g.a).toHaveLength(2);
  });

  it('update / delete protect system permissions', async () => {
    const { svc, repo } = build();
    repo.findOne.mockResolvedValue({ isSystem: true });
    await expect(svc.updatePermission('i', 't', { description: 'x' })).rejects.toMatchObject({ code: 'RESOURCE_CONFLICT' });
    await expect(svc.deletePermission('i', 't')).rejects.toMatchObject({ code: 'RESOURCE_CONFLICT' });
    repo.findOne.mockResolvedValue({ name: 'n', isSystem: false });
    expect(await svc.updatePermission('i', 't', { description: 'x' })).toMatchObject({ description: 'x' });
    await svc.deletePermission('i', 't');
    expect(repo.delete).toHaveBeenCalled();
  });

  it('permissionsExist compares counts', async () => {
    const { svc, repo } = build();
    repo.count.mockResolvedValue(2);
    expect(await svc.permissionsExist(['a', 'b'], 't')).toBe(true);
    expect(repo.count).toHaveBeenCalledWith({ where: [{ name: 'a', tenantId: 't' }, { name: 'b', tenantId: 't' }] });
    repo.count.mockResolvedValue(1);
    expect(await svc.permissionsExist(['a', 'b'], 't')).toBe(false);
  });

  it('getPermissionsByNames short-circuits on empty', async () => {
    const { svc, repo } = build();
    expect(await svc.getPermissionsByNames([], 't')).toEqual([]);
    expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    repo.createQueryBuilder.mockReturnValue(qb([1]));
    expect(await svc.getPermissionsByNames(['a'], 't')).toEqual([1]);
  });

  it('seedDefaultPermissions creates the catalog', async () => {
    const { svc, repo } = build();
    repo.findOne.mockResolvedValue(null);
    const out = await svc.seedDefaultPermissions('t');
    expect(out.length).toBe(21);
    expect(out.map((p) => p.name)).toContain('*:*');
  });
});

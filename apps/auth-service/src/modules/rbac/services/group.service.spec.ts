import { GroupService } from './group.service';

jest.mock('@/common/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const repo = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  count: jest.fn(),
  save: jest.fn(async (x: unknown) => x),
  delete: jest.fn(),
  create: jest.fn((x: unknown) => ({ id: 'new', ...(x as object) })),
  createQueryBuilder: jest.fn(),
});

function build() {
  const g = repo(), ug = repo(), gp = repo(), p = repo();
  const cache = { invalidateTenant: jest.fn(), invalidateUser: jest.fn() };
  const svc = new GroupService(g as never, ug as never, gp as never, p as never, cache as never);
  return { svc, g, ug, gp, p, cache };
}

describe('GroupService', () => {
  it('createGroup root path, no description', async () => {
    const { svc, g } = build();
    g.findOne.mockResolvedValue(null);
    const out = await svc.createGroup('t', { name: 'eng' } as never);
    expect(out).toMatchObject({ path: '/eng/', description: null, parentGroupId: null, tenantId: 't' });
  });

  it('createGroup nested path from parent', async () => {
    const { svc, g } = build();
    g.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ path: '/eng/' });
    const out = await svc.createGroup('t', { name: 'be', parentGroupId: 'p', description: 'd' } as never);
    expect(out).toMatchObject({ path: '/eng/be/', parentGroupId: 'p', description: 'd' });
    expect(g.findOne).toHaveBeenLastCalledWith({ where: { id: 'p', tenantId: 't' } });
  });

  it('createGroup rejects duplicates and unknown/cross-tenant parent', async () => {
    const a = build();
    a.g.findOne.mockResolvedValue({ id: 'x' });
    await expect(a.svc.createGroup('t', { name: 'eng' } as never)).rejects.toMatchObject({ code: 'RESOURCE_CONFLICT' });
    const b = build();
    b.g.findOne.mockResolvedValue(null);
    await expect(b.svc.createGroup('t', { name: 'x', parentGroupId: 'nope' } as never)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    expect(b.g.save).not.toHaveBeenCalled();
  });

  it('listGroups scopes by tenant ordered by path', async () => {
    const { svc, g } = build();
    g.find.mockResolvedValue([1]);
    expect(await svc.listGroups('t')).toEqual([1]);
    expect(g.find).toHaveBeenCalledWith({ where: { tenantId: 't' }, order: { path: 'ASC' } });
  });

  it('getGroup / getGroupDetail', async () => {
    const { svc, g, ug, gp } = build();
    g.findOne.mockResolvedValue(null);
    await expect(svc.getGroup('i', 't')).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    g.findOne.mockResolvedValue({ id: 'i' });
    ug.find.mockResolvedValue(['m']);
    gp.find.mockResolvedValue(['p']);
    expect(await svc.getGroupDetail('i', 't')).toEqual({ group: { id: 'i' }, members: ['m'], policies: ['p'] });
  });

  describe('updateGroup', () => {
    it('rejects system group', async () => {
      const { svc, g } = build();
      g.findOne.mockResolvedValue({ isSystem: true });
      await expect(svc.updateGroup('i', 't', { description: 'x' } as never)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('updates description only (null clears)', async () => {
      const { svc, g } = build();
      g.findOne.mockResolvedValue({ name: 'a', path: '/a/' });
      expect(await svc.updateGroup('i', 't', { description: null } as never)).toMatchObject({ description: null });
      expect(await svc.updateGroup('i', 't', { name: 'a' } as never)).toMatchObject({ name: 'a', path: '/a/' });
    });

    it('rename cascades path to descendants', async () => {
      const { svc, g } = build();
      const grp = { id: 'i', name: 'be', path: '/eng/be/' }; // id so the sibling-name lookup resolves to itself
      g.findOne.mockResolvedValue(grp);
      const child = { path: '/eng/be/api/' };
      const qb = { where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), getMany: jest.fn().mockResolvedValue([child]) };
      g.createQueryBuilder.mockReturnValue(qb);
      const out = await svc.updateGroup('i', 't', { name: 'server' } as never);
      expect(out).toMatchObject({ name: 'server', path: '/eng/server/' });
      expect(child.path).toBe('/eng/server/api/');
      expect(g.save).toHaveBeenCalledTimes(2);
      expect(qb.andWhere).toHaveBeenCalledWith('g.path LIKE :prefix', { prefix: '/eng/be/%' });
    });
  });

  describe('deleteGroup', () => {
    it('rejects system, members, children', async () => {
      const a = build();
      a.g.findOne.mockResolvedValue({ isSystem: true });
      await expect(a.svc.deleteGroup('i', 't')).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      const b = build();
      b.g.findOne.mockResolvedValue({});
      b.ug.count.mockResolvedValue(1);
      await expect(b.svc.deleteGroup('i', 't')).rejects.toMatchObject({ detail: expect.stringContaining('members') });
      const c = build();
      c.g.findOne.mockResolvedValue({});
      c.ug.count.mockResolvedValue(0);
      c.g.count.mockResolvedValue(2);
      await expect(c.svc.deleteGroup('i', 't')).rejects.toMatchObject({ detail: expect.stringContaining('child') });
      expect(c.g.delete).not.toHaveBeenCalled();
    });

    it('deletes and invalidates tenant cache', async () => {
      const { svc, g, ug, cache } = build();
      g.findOne.mockResolvedValue({ id: 'i' });
      ug.count.mockResolvedValue(0);
      g.count.mockResolvedValue(0);
      await svc.deleteGroup('i', 't');
      expect(g.delete).toHaveBeenCalled();
      expect(cache.invalidateTenant).toHaveBeenCalledWith('t');
    });
  });

  describe('members', () => {
    it('addMember happy, with and without addedBy', async () => {
      const { svc, g, ug, cache } = build();
      g.findOne.mockResolvedValue({});
      ug.findOne.mockResolvedValue(null);
      expect(await svc.addMember('g', 'u', 't')).toMatchObject({ addedBy: null });
      expect(await svc.addMember('g', 'u', 't', 'adm')).toMatchObject({ addedBy: 'adm' });
      expect(cache.invalidateUser).toHaveBeenCalledWith('u', 't');
    });
    it('addMember errors: missing group, duplicate', async () => {
      const a = build();
      a.g.findOne.mockResolvedValue(null);
      await expect(a.svc.addMember('g', 'u', 't')).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
      const b = build();
      b.g.findOne.mockResolvedValue({});
      b.ug.findOne.mockResolvedValue({});
      await expect(b.svc.addMember('g', 'u', 't')).rejects.toMatchObject({ code: 'RESOURCE_CONFLICT' });
      expect(b.cache.invalidateUser).not.toHaveBeenCalled();
    });
    it('removeMember', async () => {
      const { svc, ug, cache } = build();
      ug.findOne.mockResolvedValueOnce(null);
      await expect(svc.removeMember('g', 'u', 't')).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
      ug.findOne.mockResolvedValueOnce({ id: 1 });
      await svc.removeMember('g', 'u', 't');
      expect(ug.delete).toHaveBeenCalledWith({ id: 1 });
      expect(cache.invalidateUser).toHaveBeenCalledWith('u', 't');
    });
  });

  describe('policies', () => {
    it('attachPolicy happy', async () => {
      const { svc, g, p, gp, cache } = build();
      g.findOne.mockResolvedValue({});
      p.findOne.mockResolvedValue({});
      gp.findOne.mockResolvedValue(null);
      await svc.attachPolicy('g', 'p', 't');
      expect(gp.save).toHaveBeenCalledWith({ tenantId: 't', groupId: 'g', policyId: 'p' });
      expect(cache.invalidateTenant).toHaveBeenCalledWith('t');
    });
    it('attachPolicy errors (policy from another tenant is not found, duplicate)', async () => {
      const a = build();
      a.g.findOne.mockResolvedValue({});
      a.p.findOne.mockResolvedValue(null);
      await expect(a.svc.attachPolicy('g', 'p', 't')).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
      expect(a.p.findOne).toHaveBeenCalledWith({ where: { id: 'p', tenantId: 't' } });
      const b = build();
      b.g.findOne.mockResolvedValue({});
      b.p.findOne.mockResolvedValue({});
      b.gp.findOne.mockResolvedValue({});
      await expect(b.svc.attachPolicy('g', 'p', 't')).rejects.toMatchObject({ code: 'RESOURCE_CONFLICT' });
    });
    it('detachPolicy', async () => {
      const { svc, gp, cache } = build();
      gp.findOne.mockResolvedValueOnce(null);
      await expect(svc.detachPolicy('g', 'p', 't')).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
      gp.findOne.mockResolvedValueOnce({ id: "x1" });
      await svc.detachPolicy('g', 'p', 't');
      expect(gp.delete).toHaveBeenCalledWith({ id: "x1" });
      expect(cache.invalidateTenant).toHaveBeenCalled();
    });
  });

  // BUG: renaming to a name already used by another group is not rejected (createGroup does check).
  it('rename to an existing sibling name is rejected', async () => {
    const { svc, g } = build();
    g.findOne.mockImplementation(async ({ where }: { where: { id?: string; name?: string } }) =>
      where.id ? { name: 'a', path: '/a/' } : { id: 'other', name: where.name },
    );
    g.createQueryBuilder.mockReturnValue({ where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), getMany: jest.fn().mockResolvedValue([]) });
    await expect(svc.updateGroup('i', 't', { name: 'b' } as never)).rejects.toMatchObject({ code: 'RESOURCE_CONFLICT' });
  });
});

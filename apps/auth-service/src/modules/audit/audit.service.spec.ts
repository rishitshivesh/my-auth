import { AuditService } from './audit.service';

type QB = Record<'where' | 'andWhere' | 'orderBy' | 'addOrderBy' | 'take' | 'getCount' | 'getMany', jest.Mock>;
function qb(items: unknown[], count = items.length): QB {
  const q = {
    where: jest.fn(), andWhere: jest.fn(), orderBy: jest.fn(), addOrderBy: jest.fn(), take: jest.fn(),
    getCount: jest.fn().mockResolvedValue(count),
    getMany: jest.fn().mockResolvedValue(items),
  };
  for (const m of ['where', 'andWhere', 'orderBy', 'addOrderBy', 'take'] as const) q[m].mockReturnValue(q);
  return q;
}
const ev = (i: number, over: object = {}) => ({
  id: `e${i}`,
  createdAt: new Date(Date.UTC(2025, 0, 1, 0, 0, 60 - i)),
  eventType: 'LOGIN',
  severity: 'info',
  ipAddress: '1.1.1.1',
  ...over,
});
const make = (q: QB) => new AuditService({ createQueryBuilder: jest.fn().mockReturnValue(q) } as never);

describe('AuditService.list', () => {
  it('always scopes by tenant and applies every filter', async () => {
    const q = qb([]);
    await make(q).list('t1', { userId: 'u', requestId: 'r', eventType: 'X', startDate: '2025-01-01', endDate: '2025-02-01' } as never);
    expect(q.where).toHaveBeenCalledWith('event.tenantId = :tenantId', { tenantId: 't1' });
    expect(q.andWhere).toHaveBeenCalledWith('event.userId = :userId', { userId: 'u' });
    expect(q.andWhere).toHaveBeenCalledWith('event.requestId = :requestId', { requestId: 'r' });
    expect(q.andWhere).toHaveBeenCalledWith('event.eventType = :eventType', { eventType: 'X' });
    expect(q.andWhere).toHaveBeenCalledWith('event.createdAt >= :startDate', { startDate: new Date('2025-01-01') });
    expect(q.andWhere).toHaveBeenCalledWith('event.createdAt <= :endDate', { endDate: new Date('2025-02-01') });
  });

  it('defaults limit to 50 and fetches limit+1', async () => {
    const q = qb([]);
    const out = await make(q).list('t', {} as never);
    expect(q.take).toHaveBeenCalledWith(51);
    expect(q.andWhere).not.toHaveBeenCalled();
    expect(out).toEqual({ items: [], nextCursor: null, total: 0 });
  });

  it('no next cursor when exactly limit items', async () => {
    const items = [ev(1), ev(2)];
    const out = await make(qb(items)).list('t', { limit: 2 } as never);
    expect(out.items).toHaveLength(2);
    expect(out.nextCursor).toBeNull();
  });

  it('returns a base64 `<ISO>|<id>` cursor of the last page item when more exist', async () => {
    const items = [ev(1), ev(2), ev(3)];
    const out = await make(qb(items, 99)).list('t', { limit: 2 } as never);
    expect(out.items).toEqual(items.slice(0, 2));
    expect(out.total).toBe(99);
    expect(Buffer.from(out.nextCursor as string, 'base64').toString()).toBe(`${items[1]!.createdAt.toISOString()}|${items[1]!.id}`);
  });

  it('applies cursor as (createdAt,id) keyset after counting', async () => {
    const q = qb([]);
    const id = '0b9c1d52-6a1e-4f43-9f3a-1c2d3e4f5a6b';
    const cursor = Buffer.from(`2025-01-01T00:00:00.000Z|${id}`).toString('base64');
    await make(q).list('t', { cursor } as never);
    expect(q.andWhere).toHaveBeenCalledWith(
      '(event.createdAt < :cursorDate OR (event.createdAt = :cursorDate AND event.id < :cursorId))',
      { cursorDate: new Date('2025-01-01T00:00:00.000Z'), cursorId: id },
    );
    expect(q.getCount.mock.invocationCallOrder[0]).toBeLessThan(q.andWhere.mock.invocationCallOrder[0]!);
  });

  it('cursor includes id tiebreaker so same-timestamp events are not skipped', async () => {
    const same = new Date('2025-01-01T00:00:00Z');
    const out = await make(qb([ev(1, { createdAt: same }), ev(2, { createdAt: same }), ev(3, { createdAt: same })])).list('t', { limit: 2 } as never);
    expect(Buffer.from(out.nextCursor as string, 'base64').toString()).toContain('e2');
  });

  it('malformed cursor is rejected with VALIDATION_FAILED (422)', async () => {
    await expect(make(qb([])).list('t', { cursor: '!!!' } as never)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});

describe('AuditService.exportCsv', () => {
  const parse = (csv: string) => csv.split('\n');

  it('header only when empty and caps rows at 10000', async () => {
    const q = qb([]);
    const csv = await make(q).exportCsv('t', {} as never);
    expect(csv).toBe('timestamp,eventType,severity,actorEmail,userId,ipAddress,resourceType,resourceId,outcome,requestId\n');
    expect(q.take).toHaveBeenCalledWith(10000);
  });

  it('renders quoted rows with ISO timestamps and blanks for nullish fields', async () => {
    const csv = await make(qb([ev(0)])).exportCsv('t', {} as never);
    const [, row] = parse(csv);
    expect(row).toBe('"2025-01-01T00:01:00.000Z","LOGIN","info","","","1.1.1.1","","","",""');
  });

  it('escapes embedded quotes and neutralises CSV formula injection', async () => {
    const evil = ['=cmd|calc', '+1', '-1', '@SUM(A1)', '\tx', '\rx'];
    const csv = await make(qb([ev(1, { actorEmail: 'a"b@x.io', resourceId: evil[0], resourceType: evil[1], outcome: evil[2], requestId: evil[3], userId: evil[4], eventType: evil[5] })])).exportCsv('t', {} as never);
    expect(csv).toContain('"a""b@x.io"');
    expect(csv).toContain(`"'=cmd|calc"`);
    expect(csv).toContain(`"'+1"`);
    expect(csv).toContain(`"'-1"`);
    expect(csv).toContain(`"'@SUM(A1)"`);
    expect(csv).toContain(`"'\tx"`);
    expect(csv).toContain(`"'\rx"`);
  });

  it('scopes export by tenant and filters', async () => {
    const q = qb([]);
    await make(q).exportCsv('tX', { userId: 'u' } as never);
    expect(q.where).toHaveBeenCalledWith('event.tenantId = :tenantId', { tenantId: 'tX' });
    expect(q.andWhere).toHaveBeenCalledWith('event.userId = :userId', { userId: 'u' });
  });
});

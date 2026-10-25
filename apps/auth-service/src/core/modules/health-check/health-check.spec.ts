import { HealthCheckController } from './health-check.controller';
import { HealthCheckService } from './health-check.service';

jest.mock('@/common/decorators/raw-response.decorator', () => ({ RawResponse: () => () => undefined }));
jest.mock('@/common/service/redis.service', () => ({ RedisService: class RedisService {} }));

function build(db: () => Promise<unknown>, ping: () => Promise<unknown>) {
  const ds = { query: jest.fn(db) };
  const redis = { getClient: () => ({ ping: jest.fn(ping) }) };
  return { svc: new HealthCheckService(ds as never, redis as never), ds };
}

describe('HealthCheckService.readiness', () => {
  afterEach(() => jest.useRealTimers());

  it('ok when both up', async () => {
    const { svc, ds } = build(async () => [1], async () => 'PONG');
    const r = await svc.readiness();
    expect(r).toMatchObject({ status: 'ok', checks: { database: 'up', redis: 'up' } });
    expect(typeof r.uptimeSeconds).toBe('number');
    expect(ds.query).toHaveBeenCalledWith('SELECT 1');
  });

  it('degraded when db down', async () => {
    const r = await build(async () => { throw new Error('x'); }, async () => 'PONG').svc.readiness();
    expect(r).toMatchObject({ status: 'degraded', checks: { database: 'down', redis: 'up' } });
  });

  it('degraded when redis down, and does not leak error text', async () => {
    const r = await build(async () => [1], async () => { throw new Error('secret-host'); }).svc.readiness();
    expect(r.checks.redis).toBe('down');
    expect(JSON.stringify(r)).not.toContain('secret-host');
  });

  it('degraded when a probe throws synchronously', async () => {
    const svc = new HealthCheckService({ query: () => { throw new Error('sync'); } } as never, { getClient: () => ({ ping: async () => 'PONG' }) } as never);
    expect((await svc.readiness()).checks.database).toBe('down');
  });

  it('times out a hung dependency after 2s', async () => {
    jest.useFakeTimers();
    const { svc } = build(() => new Promise(() => undefined), async () => 'PONG');
    const p = svc.readiness();
    await jest.advanceTimersByTimeAsync(1999);
    let settled = false;
    void p.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(2);
    expect(await p).toMatchObject({ status: 'degraded', checks: { database: 'down', redis: 'up' } });
  });
});

describe('HealthCheckController', () => {
  it('liveness never touches dependencies', () => {
    const svc = { readiness: jest.fn() };
    expect(new HealthCheckController(svc as never).liveness()).toEqual({ status: 'ok' });
    expect(svc.readiness).not.toHaveBeenCalled();
  });

  it('readiness returns 200 body when ok (no status override)', async () => {
    const report = { status: 'ok', checks: {}, uptimeSeconds: 1 };
    const res = { status: jest.fn() };
    const c = new HealthCheckController({ readiness: jest.fn().mockResolvedValue(report) } as never);
    expect(await c.readiness(res as never)).toBe(report);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('readiness sets 503 when degraded', async () => {
    const report = { status: 'degraded', checks: {}, uptimeSeconds: 1 };
    const res = { status: jest.fn() };
    const c = new HealthCheckController({ readiness: jest.fn().mockResolvedValue(report) } as never);
    expect(await c.readiness(res as never)).toBe(report);
    expect(res.status).toHaveBeenCalledWith(503);
  });
});

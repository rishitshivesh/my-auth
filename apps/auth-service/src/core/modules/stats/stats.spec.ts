import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

describe('Stats', () => {
  it('service reports system metrics with expected shape', () => {
    const s = new StatsService().getSystemStats();
    expect(typeof s.uptime).toBe('number');
    expect(s.loadAverage).toHaveLength(3);
    expect(s.memoryUsage).toHaveProperty('rss');
    expect(s.totalMemory).toBeGreaterThan(0);
    expect(s.freeMemory).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(s.cpuUsage)).toBe(true);
  });

  it('controller delegates', () => {
    const svc = { getSystemStats: jest.fn().mockReturnValue({ a: 1 }) };
    expect(new StatsController(svc as never).getSystemStats()).toEqual({ a: 1 });
  });
});

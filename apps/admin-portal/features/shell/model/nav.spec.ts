import { describe, expect, it } from '@jest/globals';
import { tenantNav } from '@/constants/navigation';
import { groupBySection, visibleEntries } from './nav';

describe('shell nav model', () => {
  const entries = tenantNav('acme');

  it('keeps everything visible until permissions are known', () => {
    expect(visibleEntries(entries, () => false, false)).toHaveLength(entries.length);
  });

  it('hides entries whose permission is missing once ready', () => {
    const out = visibleEntries(entries, () => false, true);
    expect(out.some((e) => e.id === 'users')).toBe(false);
    expect(out.some((e) => e.id === 'dashboard')).toBe(true);
  });

  it('groups consecutive entries by section', () => {
    const sections = groupBySection(entries);
    expect(sections.reduce((n, s) => n + s.entries.length, 0)).toBe(entries.length);
    expect(sections[0]?.entries[0]?.id).toBe('dashboard');
  });
});

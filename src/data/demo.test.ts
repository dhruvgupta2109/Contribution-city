import { describe, expect, it } from 'vitest';
import { contributionDates, parseDateKey } from './dates.ts';
import { DEMO_END_DATE, DEMO_SEED, generateDemoCity } from './demo.ts';

describe('calendar date boundaries', () => {
  it('includes exactly 365 consecutive UTC dates, including the end date', () => {
    const dates = contributionDates('2024-03-01');
    expect(dates).toHaveLength(365);
    expect(new Set(dates).size).toBe(365);
    expect(dates[0]).toBe('2023-03-03');
    expect(dates.at(-1)).toBe('2024-03-01');
    expect(dates).toContain('2024-02-29');
    for (let index = 1; index < dates.length; index += 1) {
      expect(parseDateKey(dates[index]!).getTime() - parseDateKey(dates[index - 1]!).getTime()).toBe(86_400_000);
    }
  });

  it('does not shift dates around daylight-saving changes', () => {
    const dates = contributionDates('2026-11-02');
    expect(dates.slice(-3)).toEqual(['2026-10-31', '2026-11-01', '2026-11-02']);
    expect(dates).toContain('2026-03-08');
  });

  it.each(['2025-02-29', '2026-02-30', '2026-13-01', '2026-1-01', 'not-a-date'])('rejects invalid date %s', (date) => {
    expect(() => contributionDates(date)).toThrow();
  });
});

describe('deterministic demo city', () => {
  it('has stable defaults and identical complete data for the same inputs', () => {
    const first = generateDemoCity();
    expect(first).toEqual(generateDemoCity({ endDate: DEMO_END_DATE, seed: DEMO_SEED }));
    expect(first.metadata.startDate).toBe('2025-10-14');
    expect(first.metadata.endDate).toBe('2026-10-13');
    expect(first.metadata.timezone).toBe('UTC');
    expect(first.metadata.source).toBe('demo');
    expect(first.metadata.username).toBeNull();
  });

  it('changes activity for a different seed while preserving date boundaries', () => {
    const first = generateDemoCity({ seed: 'first' });
    const second = generateDemoCity({ seed: 'second' });
    expect(first.days).not.toEqual(second.days);
    expect(first.days.map((day) => day.date)).toEqual(second.days.map((day) => day.date));
  });

  it.each(['contribution-city-v1', 'another-seed', '🌃'])('preserves all attribution invariants for seed %s', (seed) => {
    const city = generateDemoCity({ seed, endDate: '2024-03-01' });
    const ids = new Set(city.repositories.map((repo) => repo.id));
    const repoTotals = new Map<string, number>();
    let otherTotal = 0;
    let total = 0;

    expect(city.days).toHaveLength(365);
    expect(city.days.some((day) => day.contributionCount === 0)).toBe(true);
    expect(city.days.some((day) => day.contributionCount >= 36)).toBe(true);
    expect(city.days.some((day) => day.segments.filter((segment) => segment.kind === 'repository').length > 1)).toBe(true);
    expect(city.days.some((day) => day.segments.length === 1 && day.segments[0]?.kind === 'other')).toBe(true);

    for (const day of city.days) {
      expect(Number.isInteger(day.contributionCount)).toBe(true);
      expect(day.contributionCount).toBeGreaterThanOrEqual(0);
      expect(day.segments.reduce((sum, segment) => sum + segment.count, 0)).toBe(day.contributionCount);
      if (day.contributionCount === 0) expect(day.segments).toEqual([]);
      expect(new Set(day.segments.map((segment) => segment.kind === 'other' ? 'other' : segment.repoId)).size).toBe(day.segments.length);
      let lastRank = -1;
      for (const segment of day.segments) {
        expect(Number.isInteger(segment.count)).toBe(true);
        expect(segment.count).toBeGreaterThan(0);
        const rank = segment.kind === 'other' ? city.repositories.length : city.repositories.findIndex((repo) => repo.id === segment.repoId);
        expect(rank).toBeGreaterThan(lastRank);
        lastRank = rank;
        if (segment.kind === 'repository') {
          expect(ids.has(segment.repoId)).toBe(true);
          repoTotals.set(segment.repoId, (repoTotals.get(segment.repoId) ?? 0) + segment.count);
        } else {
          otherTotal += segment.count;
          expect(day.segments.at(-1)).toBe(segment);
        }
      }
      total += day.contributionCount;
    }

    for (const repo of city.repositories) expect(repo.commitCount).toBe(repoTotals.get(repo.id) ?? 0);
    expect(city.repositories.map((repo) => repo.commitCount)).toEqual(city.repositories.map((repo) => repo.commitCount).sort((a, b) => b - a));
    expect(city.metadata.totalContributions).toBe(total);
    expect(city.metadata.otherActivityCount).toBe(otherTotal);
    expect(city.metadata.totalAttributedCommits + otherTotal).toBe(total);
  });

  it('returns independent data objects so UI edits cannot change future generations', () => {
    const baseline = generateDemoCity();
    const edited = generateDemoCity();
    edited.repositories[0]!.color = '#000000';
    edited.days[1]!.contributionCount = 999;
    expect(generateDemoCity()).toEqual(baseline);
  });

  it('rejects an empty seed', () => {
    expect(() => generateDemoCity({ seed: '   ' })).toThrow('Demo seed must not be empty.');
  });
});

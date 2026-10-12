import { describe, expect, it } from 'vitest';
import { assembleCity, cityStats, dateRange, hash, normalizeCalendar } from '../src/data/types';
import { createDemo } from '../src/data/demo';
import { BUILDING, CELL, FLOOR, SLAB, STREET, createLayout } from '../src/city/layout';

describe('contribution accounting', () => {
  it('returns exactly 365 UTC days across leap years', () => {
    const { start, end } = dateRange(new Date('2024-03-02T18:22:11Z'));
    const days = normalizeCalendar([], start, end);
    expect(days).toHaveLength(365);
    expect(days[0].date).toBe('2023-03-04');
    expect(days.at(-1)?.date).toBe('2024-03-02');
    expect(days.some(d => d.date === '2024-02-29')).toBe(true);
  });

  it('sorts repositories and conserves every calendar contribution even when REST overcounts', () => {
    const city = assembleCity('dev', 'Dev', [{ date: '2026-01-01', count: 5 }, { date: '2026-01-02', count: 8 }, { date: '2026-01-03', count: 0 }], [
      { name: 'small', fullName: 'dev/small', daily: { '2026-01-01': 1 } },
      { name: 'big', fullName: 'dev/big', daily: { '2026-01-01': 9, '2026-01-02': 2, '2026-01-03': 1 } },
    ]);
    expect(city.repos.map(r => r.name)).toEqual(['big', 'small', 'Other activity']);
    expect(city.days[0].segments).toEqual([{ repoIndex: 0, count: 5 }]);
    expect(city.days[1].segments).toEqual([{ repoIndex: 0, count: 2 }, { repoIndex: 2, count: 6 }]);
    expect(city.days[2].segments).toEqual([]);
    city.days.forEach(day => expect(day.segments.reduce((sum, segment) => sum + segment.count, 0)).toBe(day.count));
    expect(city.repos[2].commits).toBe(6);
  });

  it('handles no repositories, quiet days, totals and streaks', () => {
    const city = assembleCity('dev', 'Dev', [0, 2, 3, 1, 0, 7, 0].map((count, i) => ({ date: `2026-01-0${i + 1}`, count })), []);
    const stats = cityStats(city);
    expect(stats.total).toBe(13); expect(stats.longestStreak).toBe(3); expect(stats.busiest.count).toBe(7); expect(stats.repos).toBe(0);
    expect(city.repos).toHaveLength(1); expect(city.repos[0].other).toBe(true);
  });

  it('has repeatable demo floors and approximately 12% dark windows', () => {
    expect(createDemo()).toEqual(createDemo());
    const dark = Array.from({ length: 10000 }, (_, i) => hash(i) < .12).filter(Boolean).length / 10000;
    expect(dark).toBeGreaterThan(.10); expect(dark).toBeLessThan(.14);
    expect(hash(123)).toBe(hash(123));
  });
});

describe('city blocks', () => {
  const days = normalizeCalendar([], '2026-01-01', '2026-12-31').map(d => ({ ...d, segments: [] }));
  const layout = createLayout(days);
  it('creates one lot per day with the correct Sunday-based week offset', () => {
    expect(layout.lots).toHaveLength(365);
    expect(layout.lots[0].weekday).toBe(4);
    expect(layout.lots[2].week).toBe(0);
    expect(layout.lots[3].week).toBe(1);
  });
  it('has an avenue only between Wednesday and Thursday and a street every four weeks', () => {
    const sunday = layout.lots.find(l => l.weekday === 0)!;
    const tuesday = layout.lots.find(l => l.weekday === 2)!;
    const wednesday = layout.lots.find(l => l.weekday === 3)!;
    const thursday = layout.lots.find(l => l.weekday === 4)!;
    expect(thursday.z - wednesday.z).toBeCloseTo(CELL + STREET);
    expect(wednesday.z - tuesday.z).toBeCloseTo(CELL);
    expect(sunday.weekday).toBe(0);
    const w3 = layout.lots.find(l => l.week === 3)!;
    const w4 = layout.lots.find(l => l.week === 4)!;
    expect(w4.x - w3.x).toBeCloseTo(CELL + STREET);
    expect(layout.streets).toHaveLength(13);
    expect(STREET / CELL).toBeCloseTo(1.1);
  });
  it('keeps height linear in the authoritative count and no activity as slabs', () => {
    const layout = createLayout([{ date: '2026-01-01', count: 0, segments: [] }, { date: '2026-01-02', count: 123, segments: [] }]);
    expect(layout.lots[0].height).toBe(SLAB);
    expect(layout.lots[1].height).toBeCloseTo(123 * FLOOR + SLAB);
    expect(BUILDING).toBeLessThan(CELL);
  });
});

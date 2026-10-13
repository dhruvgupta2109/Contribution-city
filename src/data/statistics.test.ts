import { describe, expect, it } from 'vitest';
import { generateDemoCity } from './demo.ts';
import { cityStatistics } from './statistics.ts';

describe('city statistics', () => {
  it('handles an all-zero calendar without a fake busiest day', () => {
    const city = generateDemoCity(); city.days = city.days.map((day) => ({ ...day, contributionCount: 0, segments: [] })); city.repositories = [];
    expect(cityStatistics(city)).toEqual({ total: 0, activeDays: 0, longestStreak: 0, busiestDay: null, repositoryCount: 0 });
  });
  it('counts known streaks and resolves busiest-day ties to the first date', () => {
    const city = generateDemoCity(); const counts = [0, 2, 3, 0, 4, 4, 4, 0];
    city.days = city.days.slice(0, counts.length).map((day, index) => ({ ...day, contributionCount: counts[index]! }));
    const stats = cityStatistics(city); expect(stats.total).toBe(17); expect(stats.longestStreak).toBe(3); expect(stats.activeDays).toBe(5);
    expect(stats.busiestDay?.date).toBe(city.days[4]!.date);
  });
});

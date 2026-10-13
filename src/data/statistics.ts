import type { CityData, ContributionDay } from './types.ts';

export interface CityStatistics {
  total: number;
  activeDays: number;
  longestStreak: number;
  busiestDay: ContributionDay | null;
  repositoryCount: number;
}

export function cityStatistics(city: CityData): CityStatistics {
  let total = 0;
  let activeDays = 0;
  let streak = 0;
  let longestStreak = 0;
  let busiestDay: ContributionDay | null = null;
  for (const day of city.days) {
    total += day.contributionCount;
    if (day.contributionCount > 0) {
      activeDays += 1;
      streak += 1;
      longestStreak = Math.max(longestStreak, streak);
      if (!busiestDay || day.contributionCount > busiestDay.contributionCount) busiestDay = day;
    } else {
      streak = 0;
    }
  }
  return { total, activeDays, longestStreak, busiestDay, repositoryCount: city.repositories.length };
}

import { contributionDates, DAY_COUNT, parseDateKey } from './dates.ts';
import { seededRandom } from './random.ts';
import type {
  CityData,
  ContributionDay,
  DateKey,
  DaySegment,
  Repository,
} from './types.ts';

// Frozen fixture defaults: reloads on different days still produce the same demo.
export const DEMO_END_DATE = '2026-10-13';
export const DEMO_SEED = 'contribution-city-v1';
export const OTHER_ACTIVITY_COLOR = '#8c93a5';

const REPOSITORIES = [
  { id: 'demo/city-engine', name: 'city-engine', color: '#66d9c4' },
  { id: 'demo/calendar-kit', name: 'calendar-kit', color: '#8fa8ff' },
  { id: 'demo/night-notes', name: 'night-notes', color: '#f1b66b' },
  { id: 'demo/tiny-tools', name: 'tiny-tools', color: '#dc8dd0' },
  { id: 'demo/open-garden', name: 'open-garden', color: '#b5d98c' },
] as const;

export interface DemoOptions {
  endDate?: DateKey;
  seed?: string;
}

export function generateDemoCity({
  endDate = DEMO_END_DATE,
  seed = DEMO_SEED,
}: DemoOptions = {}): CityData {
  if (seed.trim().length === 0) {
    throw new Error('Demo seed must not be empty.');
  }

  const dates = contributionDates(endDate);
  const random = seededRandom(seed);
  const totals = new Map<string, number>(
    REPOSITORIES.map((repo) => [repo.id, 0]),
  );

  const days: ContributionDay[] = dates.map((date, index) => {
    const weekday = parseDateKey(date).getUTCDay();
    const activity = random();
    const isQuiet = index % 11 === 0 || activity < 0.2;
    const isBusy = index % 29 === 0 && !isQuiet;
    const contributionCount = isQuiet
      ? 0
      : isBusy
        ? 36 + Math.floor(random() * 49)
        : 1 + Math.floor(random() * (weekday === 0 || weekday === 6 ? 6 : 18));

    const repoCounts = new Map<string, number>();
    let otherCount = 0;
    const firstRepo = Math.floor(random() * REPOSITORIES.length);
    const activeRepoCount = 1 + Math.floor(random() * 3);

    for (let unit = 0; unit < contributionCount; unit += 1) {
      if (index % 37 === 0 || random() < 0.18) {
        otherCount += 1;
      } else {
        const repoIndex =
          (firstRepo + Math.floor(random() * activeRepoCount)) %
          REPOSITORIES.length;
        const repo = REPOSITORIES[repoIndex]!;
        repoCounts.set(repo.id, (repoCounts.get(repo.id) ?? 0) + 1);
        totals.set(repo.id, (totals.get(repo.id) ?? 0) + 1);
      }
    }

    const segments: DaySegment[] = Array.from(
      repoCounts,
      ([repoId, count]) => ({
        kind: 'repository',
        repoId,
        count,
      }),
    );
    if (otherCount > 0) segments.push({ kind: 'other', count: otherCount });

    return { date, contributionCount, segments };
  });

  const repositories: Repository[] = REPOSITORIES.map((repo) => ({
    ...repo,
    url: `https://github.com/${repo.id}`,
    commitCount: totals.get(repo.id) ?? 0,
    authoredCommitCount: totals.get(repo.id) ?? 0,
    scanComplete: true,
    stars: [128, 64, 21, 7, 42][REPOSITORIES.indexOf(repo)]!,
    language: ['TypeScript', 'TypeScript', 'Python', 'Go', 'JavaScript'][
      REPOSITORIES.indexOf(repo)
    ]!,
    description: 'A fictional repository in the demo city.',
    dailyCommits: Object.fromEntries(
      days.map((day) => [
        day.date,
        day.segments.reduce(
          (sum, segment) =>
            sum +
            (segment.kind === 'repository' && segment.repoId === repo.id
              ? segment.count
              : 0),
          0,
        ),
      ]),
    ),
  })).sort(
    (a, b) =>
      b.commitCount - a.commitCount || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );

  const repoOrder = new Map(
    repositories.map((repo, index) => [repo.id, index]),
  );
  for (const day of days) {
    const rank = (segment: DaySegment) =>
      segment.kind === 'other'
        ? repositories.length
        : repoOrder.get(segment.repoId)!;
    day.segments.sort((a, b) => rank(a) - rank(b));
  }

  const totalContributions = days.reduce(
    (total, day) => total + day.contributionCount,
    0,
  );
  const totalAttributedCommits = repositories.reduce(
    (total, repo) => total + repo.commitCount,
    0,
  );

  return {
    days,
    repositories,
    warnings: [
      {
        code: 'demo-data',
        message: 'This demo uses fictional activity and repositories.',
      },
    ],
    metadata: {
      source: 'demo',
      username: null,
      startDate: dates[0]!,
      endDate,
      dayCount: DAY_COUNT,
      timezone: 'UTC',
      seed,
      totalContributions,
      totalAttributedCommits,
      otherActivityCount: totalContributions - totalAttributedCommits,
    },
  };
}

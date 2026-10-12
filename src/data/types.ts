export interface ContributionDay { date: string; count: number }
export interface Repository {
  name: string;
  fullName: string;
  color: string;
  commits: number;
  other?: boolean;
}
export interface Segment { repoIndex: number; count: number }
export interface CityDay extends ContributionDay { segments: Segment[] }
export interface CityData {
  username: string;
  name: string;
  days: CityDay[];
  repos: Repository[];
  warnings: string[];
  demo?: boolean;
}
export const PALETTE = [
  '#a99aff', '#63dbc9', '#ffba75', '#f389b4', '#78b9fa', '#e7d775',
  '#c997ed', '#79d29a', '#ef9779', '#83d4e8', '#dc9ccd', '#b8d88a',
];
export const OTHER_COLOR = '#a0aac5';

export function dateRange(now = new Date()): { start: string; end: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 364);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function normalizeCalendar(days: ContributionDay[], start: string, end: string): ContributionDay[] {
  const counts = new Map(days.map(d => [d.date, Math.max(0, Math.floor(d.count))]));
  const result: ContributionDay[] = [];
  for (let date = new Date(`${start}T00:00:00Z`); date.toISOString().slice(0, 10) <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    const key = date.toISOString().slice(0, 10);
    result.push({ date: key, count: counts.get(key) ?? 0 });
  }
  return result;
}

export function assembleCity(
  username: string, name: string, calendar: ContributionDay[],
  attribution: { name: string; fullName: string; daily: Record<string, number> }[],
  warnings: string[] = [],
): CityData {
  const ranked = attribution.map(repo => ({ ...repo, commits: Object.values(repo.daily).reduce((a, b) => a + b, 0) }))
    .filter(repo => repo.commits > 0).sort((a, b) => b.commits - a.commits || a.fullName.localeCompare(b.fullName));
  const repos: Repository[] = ranked.map((repo, i) => ({ name: repo.name, fullName: repo.fullName, commits: repo.commits, color: PALETTE[i % PALETTE.length] }));
  const otherIndex = repos.length;
  let otherTotal = 0;
  const days = calendar.map(day => {
    let remaining = day.count;
    const segments: Segment[] = [];
    ranked.forEach((repo, repoIndex) => {
      // Calendar is authoritative. REST commit dates / GitHub counting rules can differ.
      const count = Math.min(remaining, repo.daily[day.date] ?? 0);
      if (count > 0) { segments.push({ repoIndex, count }); remaining -= count; }
    });
    if (remaining > 0) { segments.push({ repoIndex: otherIndex, count: remaining }); otherTotal += remaining; }
    return { ...day, segments };
  });
  repos.push({ name: 'Other activity', fullName: 'Other activity', color: OTHER_COLOR, commits: otherTotal, other: true });
  return { username, name, days, repos, warnings: [...new Set(warnings)] };
}

export function cityStats(data: CityData) {
  let longestStreak = 0, currentStreak = 0;
  let busiest = data.days[0];
  let total = 0;
  for (const day of data.days) {
    total += day.count;
    currentStreak = day.count ? currentStreak + 1 : 0;
    longestStreak = Math.max(longestStreak, currentStreak);
    if (!busiest || day.count > busiest.count) busiest = day;
  }
  return { total, longestStreak, busiest, repos: data.repos.filter(r => !r.other).length };
}

export function hash(seed: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 16), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

import { contributionDates, parseDateKey } from './dates.ts';
import type { CityData, CityWarning, ContributionDay, DateKey, Repository } from './types.ts';

export const REPOSITORY_LIMIT = 15;
export const VISITOR_REPOSITORY_LIMIT = 40;
export const COMMIT_PAGE_LIMIT = 3;
export const DISCOVERY_PAGE_LIMIT = 5;
export const GITHUB_CONCURRENCY = 3;
const PAGE_SIZE = 100;
export const REPO_PALETTE = ['#66d9c4', '#8fa8ff', '#f1b66b', '#dc8dd0', '#b5d98c', '#ef9291', '#67bce6', '#cab2f1', '#e3cc7a', '#8bc3b4', '#bca28b', '#8b9ccf'];

export class GitHubError extends Error {
  constructor(message: string, public readonly code: 'invalid-user' | 'unknown-user' | 'missing-token' | 'invalid-token' | 'rate-limited' | 'network' | 'github' | 'cancelled', public readonly status = 502) {
    super(message); this.name = 'GitHubError';
  }
}

export function validateUsername(username: string): string {
  if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(username) || username.includes('--')) {
    throw new GitHubError('Enter a valid GitHub username (1–39 letters, numbers, or single hyphens).', 'invalid-user', 400);
  }
  return username;
}

export interface CalendarDay { date: string; contributionCount: number }
interface GitHubRepo { id: number; name: string; full_name: string; html_url: string; fork: boolean; pushed_at: string | null }
interface GitHubCommit { sha: string; commit: { author: { date: string } | null; committer: { date: string } | null } }
interface GraphQLCalendar {
  data?: { user: { contributionsCollection: { contributionCalendar: { weeks: { contributionDays: CalendarDay[] }[] } } } | null };
  errors?: { type?: string; message: string }[];
}

export interface GitHubOptions {
  username: string;
  token: string;
  endDate?: DateKey;
  repositoryLimit?: number;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
  onProgress?: (message: string) => void;
  /** Server-only public-calendar fallback. The normal/token flow uses GraphQL. */
  calendar?: CalendarDay[];
  warnings?: CityWarning[];
  timeLimitMs?: number;
  /** GitHub requires a User-Agent on server requests; browsers supply their own. */
  userAgent?: string;
}

export function normalizeCalendar(days: CalendarDay[], endDate: DateKey): ContributionDay[] {
  const dates = contributionDates(endDate);
  const byDate = new Map<string, number>();
  for (const day of days) {
    parseDateKey(day.date);
    if (!Number.isSafeInteger(day.contributionCount) || day.contributionCount < 0) throw new GitHubError('GitHub returned an invalid daily contribution count.', 'github');
    if (byDate.has(day.date)) throw new GitHubError('GitHub returned a duplicate calendar date.', 'github');
    byDate.set(day.date, day.contributionCount);
  }
  return dates.map((date) => {
    const contributionCount = byDate.get(date) ?? 0;
    return { date, contributionCount, segments: contributionCount ? [{ kind: 'other', count: contributionCount }] : [] };
  });
}

export interface RepoAttribution { repo: Repository; counts: Map<DateKey, number> }

/** Calendar totals win if REST commit dates/eligibility disagree with the graph. */
export function applyAttribution(calendar: ContributionDay[], attributions: RepoAttribution[]): { days: ContributionDay[]; repositories: Repository[]; clamped: boolean } {
  const ordered = [...attributions].sort((a, b) => b.repo.commitCount - a.repo.commitCount || (a.repo.id < b.repo.id ? -1 : 1));
  let clamped = false;
  const attributedTotals = new Map<string, number>();
  const days = calendar.map((day) => {
    let remaining = day.contributionCount;
    const segments: ContributionDay['segments'] = [];
    for (const attribution of ordered) {
      const raw = attribution.counts.get(day.date) ?? 0;
      const count = Math.min(raw, remaining);
      if (count < raw) clamped = true;
      if (count) {
        segments.push({ kind: 'repository', repoId: attribution.repo.id, count });
        attributedTotals.set(attribution.repo.id, (attributedTotals.get(attribution.repo.id) ?? 0) + count);
        remaining -= count;
      }
    }
    if (remaining) segments.push({ kind: 'other', count: remaining });
    return { date: day.date, contributionCount: day.contributionCount, segments };
  });
  // Rank by the totals actually shown after clamping, and re-order the floors too.
  const repositories = ordered.map(({ repo }, index) => ({ ...repo, commitCount: attributedTotals.get(repo.id) ?? 0, color: REPO_PALETTE[index % REPO_PALETTE.length]! }))
    .filter((repo) => repo.commitCount > 0)
    .sort((a, b) => b.commitCount - a.commitCount || (a.id < b.id ? -1 : 1));
  repositories.forEach((repo, index) => { repo.color = REPO_PALETTE[index % REPO_PALETTE.length]!; });
  const ranks = new Map(repositories.map((repo, index) => [repo.id, index]));
  for (const day of days) day.segments.sort((a, b) => (a.kind === 'other' ? repositories.length : ranks.get(a.repoId)!) - (b.kind === 'other' ? repositories.length : ranks.get(b.repoId)!));
  return { days, repositories, clamped };
}

export async function loadGitHubCity(options: GitHubOptions): Promise<CityData> {
  const username = validateUsername(options.username);
  if (!options.token && !options.calendar) throw new GitHubError('GitHub access is not configured. You can use the demo or supply an optional GitHub token.', 'missing-token', 503);
  const endDate = options.endDate ?? new Date().toISOString().slice(0, 10);
  const dates = contributionDates(endDate);
  const startDate = dates[0]!;
  const limit = Math.min(VISITOR_REPOSITORY_LIMIT, Math.max(1, options.repositoryLimit ?? REPOSITORY_LIMIT));
  const fetcher = options.fetcher ?? fetch;
  // Leave room under the serverless function's 60-second limit and return partial attribution.
  const deadline = Date.now() + Math.min(45_000, Math.max(1, options.timeLimitMs ?? 45_000));
  const warnings: CityWarning[] = [...options.warnings ?? []];
  const notice = (message: string, code: CityWarning['code'] = 'incomplete-attribution') => {
    if (!warnings.some((warning) => warning.message === message)) warnings.push({ code, message });
  };
  const request = async <T>(path: string, body?: Record<string, unknown>): Promise<{ data: T; next: boolean }> => {
    if (options.signal?.aborted) throw new GitHubError('Loading cancelled.', 'cancelled', 499);
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new GitHubError('The GitHub scan reached its time limit.', 'network');
    const timeout = AbortSignal.timeout(Math.min(10_000, remaining));
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    let response: Response;
    try {
      response = await fetcher(`https://api.github.com${path}`, {
        method: body ? 'POST' : 'GET', signal,
        headers: { ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}), ...(options.userAgent ? { 'User-Agent': options.userAgent } : {}), Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      if (options.signal?.aborted) throw new GitHubError('Loading cancelled.', 'cancelled', 499);
      throw new GitHubError('GitHub could not be reached or the request timed out. Try again.', 'network');
    }
    if (response.status === 401) throw new GitHubError('GitHub rejected the access token. Check its validity and permissions.', 'invalid-token', 401);
    let limited = response.status === 429 || response.status === 403 && (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after'));
    if (response.status === 403 && !limited) {
      try { limited = /rate limit|abuse|secondary limit/i.test(String((await response.clone().json() as { message?: string }).message)); } catch { /* Use the ordinary forbidden response. */ }
    }
    if (limited) {
      throw new GitHubError('GitHub’s rate limit was reached. Try again after the limit resets.', 'rate-limited', 429);
    }
    if (!response.ok) throw new GitHubError(response.status === 409 ? 'Repository has no commits.' : response.status === 404 ? 'GitHub resource was not found.' : 'GitHub returned an error. Try again.', 'github', response.status);
    let data: T;
    try { data = await response.json() as T; } catch { throw new GitHubError('GitHub returned an unreadable response.', 'github'); }
    return { data, next: /rel="next"/.test(response.headers.get('link') ?? '') };
  };

  options.onProgress?.('Loading the contribution calendar…');
  let rawCalendar = options.calendar;
  if (!rawCalendar) {
    const response = await request<GraphQLCalendar>('/graphql', {
    query: `query ContributionCity($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) { contributionsCollection(from: $from, to: $to) {
        contributionCalendar { weeks { contributionDays { date contributionCount } } }
      } }
    }`,
    variables: { login: username, from: `${startDate}T00:00:00Z`, to: `${endDate}T23:59:59Z` },
  });
  if (response.data.errors?.length) {
    if (response.data.errors.some((error) => error.type === 'RATE_LIMITED')) throw new GitHubError('GitHub’s GraphQL rate limit was reached. Please try again later.', 'rate-limited', 429);
    if (response.data.errors.some((error) => error.type === 'NOT_FOUND')) throw new GitHubError(`No GitHub user named “${username}” was found.`, 'unknown-user', 404);
    throw new GitHubError('GitHub could not load this contribution calendar. Check token permissions and try again.', 'github');
  }
  if (!response.data.data?.user) throw new GitHubError(`No GitHub user named “${username}” was found.`, 'unknown-user', 404);
    rawCalendar = response.data.data.user.contributionsCollection.contributionCalendar.weeks.flatMap((week) => week.contributionDays);
  }
  const calendar = normalizeCalendar(rawCalendar, endDate);
  const repos: GitHubRepo[] = [];
  let discoveryIncomplete = false;
  try {
    for (let page = 1; page <= DISCOVERY_PAGE_LIMIT; page += 1) {
      const result = await request<GitHubRepo[]>(`/users/${encodeURIComponent(username)}/repos?type=owner&sort=pushed&direction=desc&per_page=${PAGE_SIZE}&page=${page}`);
      if (!Array.isArray(result.data)) throw new GitHubError('GitHub returned invalid repository data.', 'github');
      for (const repo of result.data) {
        if (!repo.fork && repo.pushed_at && repo.pushed_at >= `${startDate}T00:00:00Z` && !repos.some((existing) => existing.id === repo.id)) repos.push(repo);
        if (repos.length >= limit) break;
      }
      if (repos.length >= limit) { discoveryIncomplete = result.next || result.data.length >= limit; break; }
      if (!result.next || result.data.length === 0 || result.data.at(-1)?.pushed_at && result.data.at(-1)!.pushed_at! < `${startDate}T00:00:00Z`) break;
      if (page === DISCOVERY_PAGE_LIMIT) discoveryIncomplete = true;
    }
  } catch (error) {
    if (error instanceof GitHubError && error.code === 'cancelled') throw error;
    if (error instanceof GitHubError && error.code === 'rate-limited') notice('GitHub’s rate limit stopped repository discovery. Available repositories were kept; unmatched activity remains Other activity.', 'rate-limited');
    else if (error instanceof GitHubError && error.status === 403) notice('GitHub denied repository discovery. Calendar totals are intact; a GitHub token may allow repository attribution.');
    else notice('Repository discovery was incomplete. Unmatched activity remains Other activity.');
  }
  if (discoveryIncomplete) notice(`Attribution is limited to ${limit} recently pushed, non-fork repositories and ${DISCOVERY_PAGE_LIMIT} discovery pages. Omitted activity remains Other activity.`);

  let stoppedForRateLimit = false;
  const attributions: RepoAttribution[] = [];
  let nextRepo = 0;
  let completed = 0;
  const worker = async () => {
    while (nextRepo < repos.length && !stoppedForRateLimit) {
      if (Date.now() >= deadline) { notice('The repository scan reached its time limit. Available commits were kept; unmatched activity remains Other activity.'); break; }
      const repo = repos[nextRepo++]!;
      const counts = new Map<DateKey, number>();
      const seen = new Set<string>();
      try {
        for (let page = 1; page <= COMMIT_PAGE_LIMIT; page += 1) {
          if (stoppedForRateLimit) break;
          const query = new URLSearchParams({ author: username, since: `${startDate}T00:00:00Z`, until: `${endDate}T23:59:59Z`, per_page: String(PAGE_SIZE), page: String(page) });
          const result = await request<GitHubCommit[]>(`/repos/${repo.full_name.split('/').map(encodeURIComponent).join('/')}/commits?${query}`);
          if (!Array.isArray(result.data)) throw new GitHubError('GitHub returned invalid commit data.', 'github');
          for (const commit of result.data) {
            if (seen.has(commit.sha)) continue;
            seen.add(commit.sha);
            // GitHub's graph uses the author date; UTC matches calendar boundaries.
            const authoredAt = commit.commit.author?.date;
            const timestamp = authoredAt ? new Date(authoredAt).getTime() : NaN;
            const date = Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : null;
            if (date && date >= startDate && date <= endDate) counts.set(date, (counts.get(date) ?? 0) + 1);
          }
          if (!result.next || result.data.length === 0) break;
          if (page === COMMIT_PAGE_LIMIT) notice(`Only the first ${COMMIT_PAGE_LIMIT * PAGE_SIZE} authored commits in ${repo.name} were scanned. Remaining activity is Other activity.`);
        }
      } catch (error) {
        if (error instanceof GitHubError && error.code === 'cancelled') throw error;
        if (error instanceof GitHubError && error.code === 'rate-limited') {
          stoppedForRateLimit = true;
          notice('GitHub’s rate limit stopped repository attribution. Already fetched commits were kept; remaining activity is Other activity.', 'rate-limited');
        } else if (!(error instanceof GitHubError && error.status === 409)) {
          notice(`Some commits from ${repo.name} could not be loaded. Available results were kept and unmatched activity is Other activity.`);
        }
      }
      const commitCount = [...counts.values()].reduce((sum, count) => sum + count, 0);
      attributions.push({ repo: { id: repo.full_name, name: repo.name, url: repo.html_url, color: '', commitCount }, counts });
      completed += 1;
      options.onProgress?.(`Attributing repositories… ${completed} of ${repos.length}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(GITHUB_CONCURRENCY, repos.length) }, worker));
  if (options.signal?.aborted) throw new GitHubError('Loading cancelled.', 'cancelled', 499);
  const attribution = applyAttribution(calendar, attributions);
  if (attribution.clamped) notice('Some commit dates or contribution eligibility differ from GitHub’s graph. Attribution was clamped to preserve the exact daily calendar totals.');
  const totalContributions = calendar.reduce((total, day) => total + day.contributionCount, 0);
  const totalAttributedCommits = attribution.repositories.reduce((total, repo) => total + repo.commitCount, 0);
  return {
    days: attribution.days, repositories: attribution.repositories, warnings,
    metadata: { source: 'github', username, startDate, endDate, dayCount: 365, timezone: 'UTC', seed: null,
      totalContributions, totalAttributedCommits, otherActivityCount: totalContributions - totalAttributedCommits },
  };
}

export async function loadCityFromProxy(username: string, signal: AbortSignal): Promise<CityData> {
  validateUsername(username);
  let response: Response;
  try { response = await fetch(`/api/city?user=${encodeURIComponent(username)}`, { signal }); }
  catch {
    if (signal.aborted) throw new GitHubError('Loading cancelled.', 'cancelled', 499);
    throw new GitHubError('The city service could not be reached. Try again, or use an optional GitHub token.', 'network');
  }
  let data: CityData & { error?: { message: string; code: GitHubError['code'] } };
  try { data = await response.json() as typeof data; }
  catch { throw new GitHubError('The GitHub service is unavailable on this host. You can use an optional GitHub token.', 'missing-token', 503); }
  if (!response.ok || data.error) throw new GitHubError(data.error?.message ?? 'The city could not be loaded.', data.error?.code ?? 'github', response.status);
  if (!Array.isArray(data.days) || data.days.length !== 365 || !data.metadata) throw new GitHubError('The city service returned incomplete data.', 'github');
  return data;
}

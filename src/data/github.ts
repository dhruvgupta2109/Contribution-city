import { assembleCity, dateRange, normalizeCalendar, type CityData, type ContributionDay } from './types';

export class GitHubError extends Error {
  constructor(message: string, public status = 500, public rateLimited = false) { super(message); }
}

type Fetcher = typeof fetch;
interface Options {
  token: string;
  repoLimit?: number;
  fetcher?: Fetcher;
  signal?: AbortSignal;
  now?: Date;
  budgetMs?: number;
  progress?: (message: string) => void;
}
interface GitHubRepo { name: string; full_name: string; fork: boolean; pushed_at: string; owner: { login: string } }
interface GitHubCommit { sha: string; commit: { author: { date: string } | null; committer: { date: string } | null } }

export function validUsername(username: string): boolean {
  return /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(username) && !username.includes('--');
}

/** Runs on the server by default; a visitor's optional token runs this directly in their browser. */
export async function fetchGitHubCity(username: string, options: Options): Promise<CityData> {
  if (!validUsername(username)) throw new GitHubError('Enter a valid GitHub username (no @ or URL).', 400);
  const { token, signal, progress } = options;
  if (!token.trim()) throw new GitHubError('The GitHub proxy needs a server token. Open “Access token” to use your own for this session.', 503);
  const fetcher = options.fetcher ?? fetch;
  const { start, end } = dateRange(options.now);
  const since = `${start}T00:00:00Z`, until = `${end}T23:59:59Z`;
  const deadline = Date.now() + (options.budgetMs ?? 48_000);
  const repoLimit = Math.min(40, Math.max(1, options.repoLimit ?? 15));
  const headers = { Authorization: `Bearer ${token.trim()}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const warnings: string[] = [];
  let limited = false;

  async function request<T>(path: string, body?: object): Promise<{ value: T; hasNext: boolean }> {
    signal?.throwIfAborted();
    const timeout = AbortSignal.timeout(Math.max(1, Math.min(15_000, deadline - Date.now())));
    const response = await fetcher(`https://api.github.com${path}`, {
      method: body ? 'POST' : 'GET', headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!response.ok) {
      if (response.status === 409) throw new GitHubError('Empty repository.', 409);
      if (response.status === 404) throw new GitHubError(`GitHub user or repository “${username}” was not found.`, 404);
      if (response.status === 401) throw new GitHubError('GitHub rejected the access token. Check that it is valid and has not expired.', 401);
      const rateLimited = response.status === 429 || (response.status === 403 && (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after')));
      if (rateLimited) {
        const reset = response.headers.get('x-ratelimit-reset');
        const retry = reset ? ` Try again after ${new Date(Number(reset) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.` : ' Try again in a few minutes.';
        throw new GitHubError(`GitHub rate limit reached.${retry}`, response.status, true);
      }
      throw new GitHubError(`GitHub request failed (${response.status}). Check token permissions and try again.`, response.status);
    }
    return { value: await response.json() as T, hasNext: /rel="next"/.test(response.headers.get('link') ?? '') };
  }

  progress?.('Reading the contribution calendar…');
  interface CalendarResponse {
    data?: { user: null | { name: string | null; contributionsCollection: { contributionCalendar: { weeks: { contributionDays: { date: string; contributionCount: number }[] }[] } } } };
    errors?: { message: string; type?: string }[];
  }
  const query = `query CityCalendar($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) { name contributionsCollection(from: $from, to: $to) {
      contributionCalendar { weeks { contributionDays { date contributionCount } } }
    } }
  }`;
  const { value: graph } = await request<CalendarResponse>('/graphql', { query, variables: { login: username, from: since, to: until } });
  if (!graph.data?.user) {
    if (graph.errors?.some(e => e.type === 'RATE_LIMITED')) throw new GitHubError('GitHub GraphQL rate limit reached. Try again later or use a different token.', 429, true);
    if (graph.errors?.some(e => e.type === 'NOT_FOUND') || graph.data?.user === null) throw new GitHubError(`GitHub user “${username}” was not found.`, 404);
    throw new GitHubError('GitHub could not load this contribution calendar. Check the token permissions and try again.', 502);
  }
  if (graph.errors?.length) warnings.push('GitHub returned a partial calendar response.');
  const user = graph.data.user;
  const calendar: ContributionDay[] = normalizeCalendar(user.contributionsCollection.contributionCalendar.weeks.flatMap(week => week.contributionDays.map(day => ({ date: day.date, count: day.contributionCount }))), start, end);

  const repos: GitHubRepo[] = [];
  let truncatedRepos = false;
  try {
    for (let page = 1; page <= 5 && Date.now() < deadline; page++) {
      const { value, hasNext } = await request<GitHubRepo[]>(`/users/${encodeURIComponent(username)}/repos?type=owner&sort=pushed&direction=desc&per_page=100&page=${page}`);
      for (const repo of value) {
        if (!repo.fork && repo.pushed_at >= since) repos.push(repo);
      }
      if (repos.length >= repoLimit) { truncatedRepos = hasNext || repos.length > repoLimit; break; }
      if (!hasNext || value.some(repo => repo.pushed_at < since)) break;
      if (page === 5) truncatedRepos = true;
    }
  } catch (error) {
    signal?.throwIfAborted();
    warnings.push(`${safeError(error)} Contribution heights are complete; unattributed contributions appear as Other activity.`);
    limited = error instanceof GitHubError && error.rateLimited;
  }
  if (truncatedRepos) warnings.push(`Repository attribution is limited to ${repoLimit} recently pushed non-fork repositories.${repoLimit === 15 ? ' Add your own token to include up to 40.' : ''}`);
  const selected = repos.slice(0, repoLimit);
  const attribution = selected.map(repo => ({ name: repo.name, fullName: repo.full_name, daily: {} as Record<string, number> }));
  let nextRepo = 0;
  let finished = 0;
  async function worker() {
    while (nextRepo < selected.length && !limited && Date.now() < deadline) {
      const index = nextRepo++;
      const repo = selected[index];
      const seen = new Set<string>();
      try {
        for (let page = 1; page <= 12; page++) {
          if (limited || Date.now() >= deadline) { warnings.push('Attribution time limit reached. Partial repo counts are preserved; remaining activity is grey.'); break; }
          const path = `/repos/${repo.full_name.split('/').map(encodeURIComponent).join('/')}/commits?author=${encodeURIComponent(username)}&since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}&per_page=100&page=${page}`;
          const { value, hasNext } = await request<GitHubCommit[]>(path);
          for (const commit of value) {
            if (seen.has(commit.sha)) continue;
            seen.add(commit.sha);
            const date = (commit.commit.author?.date ?? commit.commit.committer?.date)?.slice(0, 10);
            if (date && date >= start && date <= end) attribution[index].daily[date] = (attribution[index].daily[date] ?? 0) + 1;
          }
          if (!hasNext || value.length === 0) break;
          if (page === 12) warnings.push(`${repo.name}: capped at 1,200 commits. Remaining activity is included in Other activity.`);
        }
      } catch (error) {
        signal?.throwIfAborted();
        if (!(error instanceof GitHubError && error.status === 409)) warnings.push(`${repo.name}: ${safeError(error)} Partial data is preserved.`);
        if (error instanceof GitHubError && error.rateLimited) limited = true;
      }
      progress?.(`Attributing commits · ${++finished} of ${selected.length} repositories…`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, selected.length) }, worker));
  if (nextRepo < selected.length) warnings.push('Some repositories could not be fetched before the rate or time limit. Their activity remains in Other activity.');
  return assembleCity(username, user.name ?? username, calendar, attribution, warnings);
}

export function safeError(error: unknown): string {
  if (error instanceof GitHubError) return error.message;
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) return 'GitHub took too long to respond.';
  return 'Could not reach GitHub. Check your connection and try again.';
}

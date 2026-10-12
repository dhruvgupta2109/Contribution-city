import { describe, expect, it, vi } from 'vitest';
import { fetchGitHubCity, validUsername } from '../src/data/github';
import { githubResponse } from '../server/proxy';

const now = new Date('2026-10-13T10:00:00Z');
const date = '2026-10-12';
const graph = { data: { user: { name: 'Developer', contributionsCollection: { contributionCalendar: { weeks: [{ contributionDays: [{ date, contributionCount: 7 }] }] } } } } };
const repo = (name: string, extra = {}) => ({ name, full_name: `dev/${name}`, fork: false, pushed_at: '2026-10-12T00:00:00Z', owner: { login: 'dev' }, ...extra });
const commit = (sha: string, authorDate = date) => ({ sha, commit: { author: { date: `${authorDate}T08:00:00Z` }, committer: { date: `${date}T15:00:00Z` } } });
const json = (body: unknown, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });
const options = { token: 'fake-test-token', now, budgetMs: 10000 };

describe('GitHub collector', () => {
  it('validates usernames without sending any request', async () => {
    const fetcher = vi.fn();
    for (const name of ['../secret', 'dev--name', '-dev', 'dev-', 'a'.repeat(40), '@dev', 'https://github.com/dev']) expect(validUsername(name)).toBe(false);
    expect(validUsername('a')).toBe(true); expect(validUsername('Dev-name-1')).toBe(true);
    await expect(fetchGitHubCity('invalid/name', { ...options, fetcher })).rejects.toMatchObject({ status: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('uses GraphQL for heights and excludes forked and stale repositories', async () => {
    const calls: string[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input); calls.push(url);
      if (url.endsWith('/graphql')) {
        const body = JSON.parse(init!.body as string);
        expect(body.variables.from).toBe('2025-10-14T00:00:00Z');
        expect(body.variables.to).toBe('2026-10-13T23:59:59Z');
        expect(body.query).toContain('contributionCalendar');
        return json(graph);
      }
      if (url.includes('/users/')) return json([repo('a'), repo('fork', { fork: true }), repo('old', { pushed_at: '2024-01-01T00:00:00Z' })]);
      expect(url).toContain('author=dev'); expect(url).toContain('per_page=100');
      return json([commit('one'), commit('two'), commit('one')]);
    };
    const city = await fetchGitHubCity('dev', { ...options, fetcher });
    expect(city.days).toHaveLength(365); expect(city.days.find(d => d.date === date)?.count).toBe(7);
    expect(city.repos.map(r => r.name)).toEqual(['a', 'Other activity']);
    expect(city.repos[0].commits).toBe(2); expect(city.repos[1].commits).toBe(5);
    expect(calls).toHaveLength(3);
  });

  it('paginates repos and commit pages, orders by count and retains author dates', async () => {
    const fetcher: typeof fetch = async input => {
      const url = new URL(String(input));
      if (url.pathname === '/graphql') return json(graph);
      if (url.pathname.includes('/users/')) return url.searchParams.get('page') === '1'
        ? json([repo('a')], 200, { link: '<https://api.github.com/next>; rel="next"' }) : json([repo('b')]);
      if (url.pathname.includes('/a/')) return json([commit('a1')]);
      return url.searchParams.get('page') === '1' ? json([commit('b1'), commit('b2')], 200, { link: '<https://api.github.com/next>; rel="next"' }) : json([commit('b3'), commit('b4', '2026-10-11')]);
    };
    const city = await fetchGitHubCity('dev', { ...options, fetcher });
    expect(city.repos.map(r => r.name)).toEqual(['b', 'a', 'Other activity']);
    expect(city.repos[0].commits).toBe(4);
    expect(city.days.find(d => d.date === date)?.segments).toEqual([{ repoIndex: 0, count: 3 }, { repoIndex: 1, count: 1 }, { repoIndex: 2, count: 3 }]);
    expect(city.days.find(d => d.date === '2026-10-11')?.count).toBe(0);
  });

  it('handles empty repository 409 without losing calendar data', async () => {
    const fetcher: typeof fetch = async input => String(input).endsWith('/graphql') ? json(graph) : String(input).includes('/users/') ? json([repo('empty')]) : json({}, 409);
    const city = await fetchGitHubCity('dev', { ...options, fetcher });
    expect(city.warnings).toEqual([]); expect(city.repos).toHaveLength(1); expect(city.repos[0].commits).toBe(7);
  });

  it('preserves committed pages when the next page hits a rate limit', async () => {
    const fetcher: typeof fetch = async input => {
      const url = String(input);
      if (url.endsWith('/graphql')) return json(graph);
      if (url.includes('/users/')) return json([repo('partial')]);
      if (new URL(url).searchParams.get('page') === '1') return json([commit('one')], 200, { link: '<https://api.github.com/next>; rel="next"' });
      return json({}, 403, { 'x-ratelimit-remaining': '0' });
    };
    const city = await fetchGitHubCity('dev', { ...options, fetcher });
    expect(city.repos[0].commits).toBe(1); expect(city.repos[1].commits).toBe(6);
    expect(city.days.find(d => d.date === date)?.count).toBe(7);
    expect(city.warnings.join(' ')).toContain('rate limit');
    expect(JSON.stringify(city)).not.toContain(options.token);
  });

  it('caps repos at 15 by default and 40 with visitor token', async () => {
    const run = async (repoLimit?: number) => {
      let commitsCalls = 0;
      const fetcher: typeof fetch = async input => {
        const url = String(input);
        if (url.endsWith('/graphql')) return json(graph);
        if (url.includes('/users/')) return json(Array.from({ length: 50 }, (_, i) => repo(`r${i}`)));
        commitsCalls++; return json([commit(`sha${commitsCalls}`)]);
      };
      const city = await fetchGitHubCity('dev', { ...options, fetcher, repoLimit });
      return { city, commitsCalls };
    };
    expect((await run()).commitsCalls).toBe(15);
    expect((await run(40)).commitsCalls).toBe(40);
    expect((await run(100)).commitsCalls).toBe(40);
    expect((await run()).city.warnings[0]).toContain('15');
  });

  it('returns complete calendar with a warning if repository listing fails', async () => {
    const fetcher: typeof fetch = async input => String(input).endsWith('/graphql') ? json(graph) : json({}, 429);
    const city = await fetchGitHubCity('dev', { ...options, fetcher });
    expect(city.repos[0].commits).toBe(7); expect(city.warnings.join()).toContain('rate limit');
  });

  it('distinguishes unknown users, bad tokens and GraphQL rate limits', async () => {
    await expect(fetchGitHubCity('ghost', { ...options, fetcher: async () => json({ data: { user: null }, errors: [{ type: 'NOT_FOUND' }] }) })).rejects.toMatchObject({ status: 404 });
    await expect(fetchGitHubCity('dev', { ...options, fetcher: async () => json({}, 401) })).rejects.toMatchObject({ status: 401 });
    await expect(fetchGitHubCity('dev', { ...options, fetcher: async () => json({ errors: [{ type: 'RATE_LIMITED' }] }) })).rejects.toMatchObject({ status: 429, rateLimited: true });
  });

  it('honours cancellation', async () => {
    const controller = new AbortController(); controller.abort(); const fetcher = vi.fn();
    await expect(fetchGitHubCity('dev', { ...options, signal: controller.signal, fetcher })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('proxy boundary', () => {
  it('rejects methods, invalid usernames and missing configuration clearly', async () => {
    expect((await githubResponse(new Request('https://city.test/api/github?user=dev', { method: 'POST' }), undefined)).status).toBe(405);
    expect((await githubResponse(new Request('https://city.test/api/github?user=bad/name'), 'token')).status).toBe(400);
    const response = await githubResponse(new Request('https://city.test/api/github?user=dev'), undefined);
    expect(response.status).toBe(503); expect(await response.text()).toContain('Access token');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});

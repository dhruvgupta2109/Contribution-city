import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyAttribution,
  COMMIT_PAGE_LIMIT,
  DISCOVERY_PAGE_LIMIT,
  GitHubError,
  GITHUB_CONCURRENCY,
  loadGitHubCity,
  normalizeCalendar,
  validateUsername,
} from './github.ts';
import type { RepoAttribution } from './github.ts';

const END_DATE = '2026-10-13';
const options = {
  username: 'sample-user',
  token: 'fixture-token-not-a-secret',
  endDate: END_DATE,
};
const repo = (index: number, fork = false) => ({
  id: index,
  name: `repo-${index}`,
  full_name: `sample-user/repo-${index}`,
  html_url: `https://github.com/sample-user/repo-${index}`,
  fork,
  pushed_at: `${END_DATE}T12:00:00Z`,
});
const commit = (sha: string, authorDate = `${END_DATE}T10:00:00Z`) => ({
  sha,
  commit: {
    author: { date: authorDate },
    committer: { date: '2026-10-12T10:00:00Z' },
  },
});
const json = (data: unknown, status = 200, next = false) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      ...(next ? { link: '<https://api.github.com/next>; rel="next"' } : {}),
    },
  });
const calendar = (count = 10) => ({
  data: {
    user: {
      contributionsCollection: {
        contributionCalendar: {
          weeks: [
            {
              contributionDays: [{ date: END_DATE, contributionCount: count }],
            },
          ],
        },
      },
    },
  },
});
const mockFetch = (
  handler: (url: URL, init: RequestInit) => Response | Promise<Response>,
) =>
  vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(new URL(String(input)), init ?? {}),
  ) as unknown as typeof fetch;
afterEach(() => vi.restoreAllMocks());

describe('GitHub calendar and attribution boundaries', () => {
  it.each(['a', 'octocat', 'user-1'])('accepts username %s', (username) =>
    expect(validateUsername(username)).toBe(username),
  );
  it.each(['', '-user', 'user-', 'user--name', 'a/b', 'a'.repeat(40)])(
    'rejects invalid username %s',
    (username) => expect(() => validateUsername(username)).toThrow(GitHubError),
  );
  it('normalizes exactly 365 dates, retains zeros, and rejects invalid counts and duplicates', () => {
    const days = normalizeCalendar(
      [{ date: END_DATE, contributionCount: 3 }],
      END_DATE,
    );
    expect(days).toHaveLength(365);
    expect(days[0]!.date).toBe('2025-10-14');
    expect(days[0]!.contributionCount).toBe(0);
    expect(days.at(-1)!.contributionCount).toBe(3);
    expect(() =>
      normalizeCalendar([{ date: END_DATE, contributionCount: -1 }], END_DATE),
    ).toThrow();
    expect(() =>
      normalizeCalendar(
        [
          { date: END_DATE, contributionCount: 1 },
          { date: END_DATE, contributionCount: 1 },
        ],
        END_DATE,
      ),
    ).toThrow();
  });
  it('clamps mismatched attribution and puts one Other segment last', () => {
    const fixture = (id: string, count: number): RepoAttribution => ({
      repo: { id, name: id, url: '', color: '', commitCount: count },
      counts: new Map([[END_DATE, count]]),
    });
    const clamped = applyAttribution(
      normalizeCalendar([{ date: END_DATE, contributionCount: 5 }], END_DATE),
      [fixture('a', 4), fixture('b', 4)],
    );
    expect(clamped.clamped).toBe(true);
    expect(clamped.repositories.map((item) => item.commitCount)).toEqual([
      4, 1,
    ]);
    expect(
      clamped.days.at(-1)!.segments.reduce((sum, item) => sum + item.count, 0),
    ).toBe(5);
    const partial = applyAttribution(
      normalizeCalendar([{ date: END_DATE, contributionCount: 10 }], END_DATE),
      [fixture('a', 4)],
    );
    expect(partial.days.at(-1)!.segments.at(-1)).toEqual({
      kind: 'other',
      count: 6,
    });
  });
});

describe('GitHub loader', () => {
  it('keeps the full discovered catalog and raw commit counts separate from graph clamping', async () => {
    const fetcher = mockFetch((url) =>
      url.pathname === '/graphql'
        ? json(calendar(1))
        : url.pathname.endsWith('/repos')
          ? json([
              {
                ...repo(1),
                language: 'Rust',
                stargazers_count: 42,
                size: 1000,
              },
              repo(2, true),
            ])
          : json([commit('one'), commit('two')]),
    );
    const city = await loadGitHubCity({ ...options, fetcher });
    expect(city.repositoryCatalog).toHaveLength(2);
    expect(city.repositories[0]).toMatchObject({
      commitCount: 1,
      authoredCommitCount: 2,
      scanComplete: true,
      language: 'Rust',
      stars: 42,
      dailyCommits: { [END_DATE]: 2 },
    });
    expect(city.repositoryCatalog![1]).toMatchObject({
      isFork: true,
      authoredCommitCount: 0,
      scanComplete: false,
    });
    expect(city.days.at(-1)!.contributionCount).toBe(1);
  });
  it('uses GraphQL totals and authored UTC dates, deduplicating SHAs across pages', async () => {
    const fetcher = mockFetch((url, init) => {
      expect(new Headers(init.headers).get('Authorization')).toBe(
        'Bearer fixture-token-not-a-secret',
      );
      if (url.pathname === '/graphql') {
        const body = JSON.parse(String(init.body)) as {
          variables: { from: string; to: string };
        };
        expect(body.variables.from).toBe('2025-10-14T00:00:00Z');
        expect(body.variables.to).toBe(`${END_DATE}T23:59:59Z`);
        return json(calendar());
      }
      if (url.pathname.endsWith('/repos'))
        return json([repo(1), repo(2, true)]);
      expect(url.searchParams.get('author')).toBe('sample-user');
      if (url.searchParams.get('page') === '1')
        return json([commit('one'), commit('one')], 200, true);
      return json([commit('one'), commit('two')]);
    });
    const city = await loadGitHubCity({ ...options, fetcher });
    expect(city.repositories).toHaveLength(1);
    expect(city.repositories[0]!.commitCount).toBe(2);
    expect(city.days.at(-1)!.contributionCount).toBe(10);
    expect(city.days.at(-1)!.segments.at(-1)).toEqual({
      kind: 'other',
      count: 8,
    });
    expect(city.metadata.totalAttributedCommits).toBe(2);
    expect(JSON.stringify(city)).not.toContain(options.token);
  });
  it.each([15, 40])(
    'caps discovery at %i repositories with concurrency no greater than three',
    async (limit) => {
      let active = 0;
      let peak = 0;
      let scanned = 0;
      const fetcher = mockFetch(async (url) => {
        if (url.pathname === '/graphql') return json(calendar(100));
        if (url.pathname.endsWith('/repos'))
          return json(
            Array.from({ length: 60 }, (_, index) => repo(index + 1)),
          );
        active++;
        peak = Math.max(peak, active);
        scanned++;
        await new Promise((resolve) => setTimeout(resolve, 1));
        active--;
        return json([commit(url.pathname)]);
      });
      const city = await loadGitHubCity({
        ...options,
        repositoryLimit: limit,
        fetcher,
      });
      expect(scanned).toBe(limit);
      expect(peak).toBeLessThanOrEqual(GITHUB_CONCURRENCY);
      expect(city.repositories).toHaveLength(limit);
      expect(
        city.warnings.some((warning) => warning.message.includes(`${limit}`)),
      ).toBe(true);
      if (limit === 40)
        expect(city.repositories[0]!.color).toBe(city.repositories[12]!.color);
    },
  );
  it('bounds discovery pages when recent results are all forks', async () => {
    let pages = 0;
    const fetcher = mockFetch((url) => {
      if (url.pathname === '/graphql') return json(calendar());
      pages++;
      return json(
        Array.from({ length: 100 }, (_, index) =>
          repo(index + pages * 100, true),
        ),
        200,
        true,
      );
    });
    const city = await loadGitHubCity({ ...options, fetcher });
    expect(pages).toBe(DISCOVERY_PAGE_LIMIT);
    expect(city.repositories).toEqual([]);
    expect(city.metadata.otherActivityCount).toBe(10);
    expect(city.warnings.length).toBeGreaterThan(0);
  });
  it('bounds commit pages and preserves contributions beyond the cap as Other activity', async () => {
    let pages = 0;
    const fetcher = mockFetch((url) => {
      if (url.pathname === '/graphql') return json(calendar(1000));
      if (url.pathname.endsWith('/repos')) return json([repo(1)]);
      pages++;
      return json(
        Array.from({ length: 100 }, (_, index) => commit(`${pages}-${index}`)),
        200,
        true,
      );
    });
    const city = await loadGitHubCity({ ...options, fetcher });
    expect(pages).toBe(COMMIT_PAGE_LIMIT);
    expect(city.metadata.totalAttributedCommits).toBe(300);
    expect(city.metadata.otherActivityCount).toBe(700);
    expect(
      city.warnings.some((warning) => warning.message.includes('300')),
    ).toBe(true);
  });
  it.each([409, 404])(
    'retains the calendar when a repo returns %i',
    async (status) => {
      const fetcher = mockFetch((url) =>
        url.pathname === '/graphql'
          ? json(calendar())
          : url.pathname.endsWith('/repos')
            ? json([repo(1)])
            : json({}, status),
      );
      const city = await loadGitHubCity({ ...options, fetcher });
      expect(city.metadata.totalContributions).toBe(10);
      expect(city.metadata.otherActivityCount).toBe(10);
      expect(city.warnings.length).toBe(status === 409 ? 0 : 1);
    },
  );
  it('keeps fetched pages when a later page hits a rate limit', async () => {
    const fetcher = mockFetch((url) => {
      if (url.pathname === '/graphql') return json(calendar());
      if (url.pathname.endsWith('/repos')) return json([repo(1)]);
      return url.searchParams.get('page') === '1'
        ? json([commit('one')], 200, true)
        : json({}, 429);
    });
    const city = await loadGitHubCity({ ...options, fetcher });
    expect(city.metadata.totalAttributedCommits).toBe(1);
    expect(city.metadata.totalContributions).toBe(10);
    expect(
      city.warnings.some((warning) => warning.code === 'rate-limited'),
    ).toBe(true);
  });
  it('retains partial commits when later requests time out', async () => {
    const fetcher = mockFetch((url) => {
      if (url.pathname === '/graphql') return json(calendar());
      if (url.pathname.endsWith('/repos')) return json([repo(1)]);
      if (url.searchParams.get('page') === '1')
        return json([commit('one')], 200, true);
      throw new DOMException('timed out', 'TimeoutError');
    });
    const city = await loadGitHubCity({ ...options, fetcher });
    expect(city.metadata.totalAttributedCommits).toBe(1);
    expect(city.warnings.length).toBeGreaterThan(0);
  });
  it('reports unknown users, invalid tokens, and GraphQL rate limits clearly', async () => {
    await expect(
      loadGitHubCity({
        ...options,
        fetcher: mockFetch(() => json({ data: { user: null } })),
      }),
    ).rejects.toMatchObject({ code: 'unknown-user' });
    await expect(
      loadGitHubCity({ ...options, fetcher: mockFetch(() => json({}, 401)) }),
    ).rejects.toMatchObject({ code: 'invalid-token' });
    await expect(
      loadGitHubCity({
        ...options,
        fetcher: mockFetch(() =>
          json({ errors: [{ type: 'RATE_LIMITED', message: 'limited' }] }),
        ),
      }),
    ).rejects.toMatchObject({ code: 'rate-limited' });
  });
  it('requires a token and honors cancellation before any network requests', async () => {
    const fetcher = vi.fn();
    await expect(
      loadGitHubCity({ ...options, token: '', fetcher }),
    ).rejects.toMatchObject({ code: 'missing-token' });
    const controller = new AbortController();
    controller.abort();
    await expect(
      loadGitHubCity({ ...options, signal: controller.signal, fetcher }),
    ).rejects.toMatchObject({ code: 'cancelled' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('normalizes authored timestamps with offsets to UTC instead of using committer dates', async () => {
    const fetcher = mockFetch((url) =>
      url.pathname === '/graphql'
        ? json(calendar())
        : url.pathname.endsWith('/repos')
          ? json([repo(1)])
          : json([commit('one', '2026-10-14T01:30:00+09:00')]),
    );
    const city = await loadGitHubCity({ ...options, fetcher });
    expect(city.repositories[0]!.commitCount).toBe(1);
    expect(city.days.at(-1)!.segments[0]).toMatchObject({
      kind: 'repository',
      count: 1,
    });
  });
  it('recognizes secondary rate limits even when the response lacks rate-limit headers', async () => {
    await expect(
      loadGitHubCity({
        ...options,
        fetcher: mockFetch(() =>
          json({ message: 'You have exceeded a secondary rate limit.' }, 403),
        ),
      }),
    ).rejects.toMatchObject({ code: 'rate-limited' });
  });
  it('sets a server User-Agent and reports discovery rate limits without losing the calendar', async () => {
    const fetcher = mockFetch((url, init) => {
      expect(new Headers(init.headers).get('User-Agent')).toBe(
        'Contribution-City',
      );
      return url.pathname === '/graphql'
        ? json(calendar())
        : json({ message: 'Rate limit exceeded' }, 429);
    });
    const city = await loadGitHubCity({
      ...options,
      fetcher,
      userAgent: 'Contribution-City',
    });
    expect(city.metadata.totalContributions).toBe(10);
    expect(
      city.warnings.some(
        (warning) =>
          warning.code === 'rate-limited' &&
          warning.message.includes('repository discovery'),
      ),
    ).toBe(true);
  });
});

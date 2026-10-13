import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateDemoCity } from './demo.ts';
import { GitHubError, loadCityFromProxy, mergePublicRetry } from './github.ts';
import type { CityData } from './types.ts';
afterEach(() => vi.restoreAllMocks());
function limitedCity(): CityData {
  const city = generateDemoCity();
  city.days.forEach((day) => {
    day.segments = day.contributionCount
      ? [{ kind: 'other', count: day.contributionCount }]
      : [];
  });
  city.repositories = [];
  city.repositoryCatalog = [
    {
      id: 'sample/quiet',
      name: 'quiet',
      url: 'https://github.com/sample/quiet',
      color: '#fff',
      commitCount: 0,
      authoredCommitCount: 0,
      scanComplete: false,
    },
  ];
  city.metadata = {
    ...city.metadata,
    source: 'github',
    username: 'sample',
    totalAttributedCommits: 0,
    otherActivityCount: city.metadata.totalContributions,
  };
  city.warnings = [{ code: 'rate-limited', message: 'Server quota exhausted' }];
  return city;
}
const json = (value: unknown, status = 200) => Response.json(value, { status });
describe('shared server quota recovery', () => {
  it('fetches public commits without an Authorization header while retaining every calendar count', async () => {
    const city = limitedCity(),
      date = city.days.find((day) => day.contributionCount > 0)!.date;
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.startsWith('/api/city')) return json(city);
        expect(new Headers(init?.headers).has('Authorization')).toBe(false);
        expect(url).not.toContain('/graphql');
        if (url.includes('/users/sample/repos'))
          return json([
            {
              id: 1,
              name: 'active',
              full_name: 'sample/active',
              html_url: 'https://github.com/sample/active',
              fork: false,
              pushed_at: city.metadata.endDate + 'T12:00:00Z',
            },
          ]);
        return json([
          {
            sha: 'abc',
            commit: { author: { date: date + 'T10:00:00Z' }, committer: null },
          },
        ]);
      });
    const result = await loadCityFromProxy(
      'sample',
      new AbortController().signal,
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(result.metadata.totalAttributedCommits).toBe(1);
    expect(
      result.repositoryCatalog?.find((repo) => repo.id === 'sample/active')
        ?.authoredCommitCount,
    ).toBe(1);
    expect(
      result.repositoryCatalog?.find((repo) => repo.id === 'sample/quiet'),
    ).toBeDefined();
    expect(result.days.map((day) => day.contributionCount)).toEqual(
      city.days.map((day) => day.contributionCount),
    );
    expect(result.warnings.some((w) => w.code === 'rate-limited')).toBe(false);
  });
  it('preserves exact server results and metadata when browser requests also fail', async () => {
    const city = limitedCity();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input).startsWith('/api/city')) return json(city);
      throw new TypeError('Network failure');
    });
    const result = await loadCityFromProxy(
      'sample',
      new AbortController().signal,
    );
    expect(result.days).toEqual(city.days);
    expect(result.repositoryCatalog).toEqual(city.repositoryCatalog);
    expect(result.warnings.at(-1)?.message).toContain('preserved');
  });
  it('retries a partial server scan and keeps the larger per-repository result', async () => {
    const city = limitedCity();
    city.warnings.push({
      code: 'public-history-recovered',
      message: 'Public history recovered a partial scan.',
    });
    const day = city.days.find((day) => day.contributionCount >= 2)!;
    const partial = {
      ...city.repositoryCatalog![0]!,
      id: 'sample/active',
      name: 'active',
      commitCount: 1,
      authoredCommitCount: 1,
      dailyCommits: { [day.date]: 1 },
    };
    city.repositoryCatalog = [partial];
    city.repositories = [partial];
    day.segments = [
      { kind: 'repository', repoId: partial.id, count: 1 },
      { kind: 'other', count: day.contributionCount - 1 },
    ];
    city.metadata.totalAttributedCommits = 1;
    city.metadata.otherActivityCount--;
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.startsWith('/api/city')) return json(city);
        if (url.includes('/users/sample/repos'))
          return json([
            {
              id: 1,
              name: 'active',
              full_name: 'sample/active',
              html_url: 'https://github.com/sample/active',
              fork: false,
              pushed_at: city.metadata.endDate + 'T12:00:00Z',
            },
          ]);
        return json(
          ['a', 'b'].map((sha) => ({
            sha,
            commit: {
              author: { date: day.date + 'T10:00:00Z' },
              committer: null,
            },
          })),
        );
      });
    const result = await loadCityFromProxy(
      'sample',
      new AbortController().signal,
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(
      result.repositoryCatalog?.find((repo) => repo.id === partial.id)
        ?.authoredCommitCount,
    ).toBe(2);
    expect(result.metadata.totalAttributedCommits).toBe(2);
    expect(
      result.days
        .find((candidate) => candidate.date === day.date)
        ?.segments.filter((segment) => segment.kind === 'repository'),
    ).toEqual([{ kind: 'repository', repoId: partial.id, count: 2 }]);
  });
  it('combines different partial repositories without adding the same project twice', () => {
    const server = limitedCity(),
      browser = limitedCity();
    const day = server.days.find((d) => d.contributionCount >= 2)!;
    const repo = (id: string) => ({
      ...server.repositoryCatalog![0]!,
      id,
      name: id.split('/')[1]!,
      authoredCommitCount: 1,
      commitCount: 1,
      dailyCommits: { [day.date]: 1 },
    });
    server.repositories = [repo('sample/alpha')];
    server.repositoryCatalog = [...server.repositories];
    browser.repositories = [repo('sample/beta')];
    browser.repositoryCatalog = [...browser.repositories];
    const merged = mergePublicRetry(server, browser)!;
    expect(merged.repositoryCatalog).toHaveLength(2);
    expect(merged.metadata.totalAttributedCommits).toBe(2);
    expect(
      merged.days
        .find((d) => d.date === day.date)
        ?.segments.filter((s) => s.kind === 'repository'),
    ).toHaveLength(2);
    expect(
      merged.days.every(
        (d) =>
          d.segments.reduce((sum, part) => sum + part.count, 0) ===
          d.contributionCount,
      ),
    ).toBe(true);
  });
  it('keeps server commits when a browser scan returns fewer for that project', () => {
    const server = limitedCity(),
      browser = limitedCity();
    const day = server.days.find((d) => d.contributionCount >= 3)!;
    const first = {
      ...server.repositoryCatalog![0]!,
      id: 'sample/active',
      authoredCommitCount: 3,
      commitCount: 3,
      dailyCommits: { [day.date]: 3 },
    };
    server.repositories = [first];
    server.repositoryCatalog = [first];
    const second = {
      ...first,
      authoredCommitCount: 1,
      commitCount: 1,
      dailyCommits: { [day.date]: 1 },
    };
    browser.repositories = [second];
    browser.repositoryCatalog = [second];
    const merged = mergePublicRetry(server, browser)!;
    expect(merged.repositoryCatalog).toHaveLength(1);
    expect(merged.repositoryCatalog?.[0]?.authoredCommitCount).toBe(3);
    expect(merged.metadata.totalAttributedCommits).toBe(3);
  });
  it('propagates cancellation instead of returning an incomplete retry', async () => {
    const city = limitedCity(),
      controller = new AbortController();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input).startsWith('/api/city')) return json(city);
      controller.abort();
      throw new Error('aborted');
    });
    await expect(
      loadCityFromProxy('sample', controller.signal),
    ).rejects.toMatchObject<Partial<GitHubError>>({ code: 'cancelled' });
  });
});

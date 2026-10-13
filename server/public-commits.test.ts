import { describe, expect, it, vi } from 'vitest';
import { generateDemoCity } from '../src/data/demo.ts';
import type { CityData, Repository } from '../src/data/types.ts';
import {
  parsePublicCommitPage,
  recoverPublicCommits,
} from './public-commits.ts';

const sha = (digit: string) => digit.repeat(40);
const page = (
  commits: { oid: string; authoredDate: string }[],
  hasNextPage = false,
  endCursor = 'cursor 0',
  route = 'commitsRoute',
  repoName = 'alpha',
) =>
  `<script type="application/json" data-target="react-app.embeddedData">${JSON.stringify({
    payload: {
      [route]: {
        commitGroups: [{ title: 'Today', commits }],
        filters: {
          pagination: { hasNextPage, endCursor },
          author: { login: 'sample' },
        },
        repo: { ownerLogin: 'sample', name: repoName },
      },
    },
  })}</script>`;

function limitedCity(): CityData {
  const city = generateDemoCity();
  city.days.forEach((day) => {
    day.segments = day.contributionCount
      ? [{ kind: 'other', count: day.contributionCount }]
      : [];
  });
  city.repositories = [];
  city.repositoryCatalog = ['alpha', 'beta'].map(
    (name, index): Repository => ({
      id: `sample/${name}`,
      name,
      url: `https://github.com/sample/${name}`,
      color: index ? '#f1b66b' : '#66d9c4',
      commitCount: 0,
      authoredCommitCount: 0,
      dailyCommits: {},
      scanComplete: false,
      isFork: false,
    }),
  );
  city.metadata = {
    ...city.metadata,
    source: 'github',
    username: 'sample',
    totalAttributedCommits: 0,
    otherActivityCount: city.metadata.totalContributions,
  };
  return city;
}

describe('public commit-history fallback', () => {
  it('parses GitHub route variants and converts authored timestamps to UTC dates', () => {
    const html = page(
      [
        { oid: sha('a'), authoredDate: '2026-10-14T00:30:00+08:00' },
        { oid: 'bad', authoredDate: '2026-10-14T01:30:00+08:00' },
      ],
      true,
      'cursor 34',
      'commitsRefRoute',
    );
    expect(parsePublicCommitPage(html)).toEqual({
      commits: [{ sha: sha('a'), date: '2026-10-13' }],
      endCursor: 'cursor 34',
      hasNextPage: true,
      authorLogin: 'sample',
      repoOwner: 'sample',
      repoName: 'alpha',
    });
    expect(() => parsePublicCommitPage('<p>Changed markup</p>')).toThrow();
  });

  it('recovers paginated authored commits and preserves every calendar total', async () => {
    const city = limitedCity();
    const day = city.days.find((d) => d.contributionCount === 2)!.date;
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.origin).toBe('https://github.com');
      expect(url.searchParams.get('author')).toBe('sample');
      expect(url.searchParams.get('since')).toBe(
        `${city.metadata.startDate}T00:00:00Z`,
      );
      if (url.pathname.includes('/alpha/'))
        return new Response(
          page(
            url.searchParams.has('after')
              ? [
                  { oid: sha('a'), authoredDate: `${day}T09:00:00Z` },
                  { oid: sha('b'), authoredDate: `${day}T10:00:00Z` },
                ]
              : [{ oid: sha('a'), authoredDate: `${day}T09:00:00Z` }],
            !url.searchParams.has('after'),
          ),
        );
      return new Response(
        page(
          [{ oid: sha('c'), authoredDate: `${day}T11:00:00Z` }],
          false,
          'cursor 0',
          'commitsRoute',
          'beta',
        ),
      );
    });
    const result = await recoverPublicCommits(
      city,
      'sample',
      Date.now() + 10_000,
      undefined,
      fetcher as typeof fetch,
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(
      result.repositoryCatalog?.find((r) => r.id === 'sample/alpha')
        ?.authoredCommitCount,
    ).toBe(2);
    expect(
      result.repositoryCatalog?.find((r) => r.id === 'sample/alpha')
        ?.scanComplete,
    ).toBe(true);
    expect(result.metadata.totalAttributedCommits).toBe(2);
    expect(result.days.map((d) => d.contributionCount)).toEqual(
      city.days.map((d) => d.contributionCount),
    );
    expect(
      result.days.every(
        (d) =>
          d.segments.reduce((sum, segment) => sum + segment.count, 0) ===
          d.contributionCount,
      ),
    ).toBe(true);
  });

  it('keeps a better partial REST scan when HTML has fewer commits', async () => {
    const city = limitedCity();
    const day = city.days.find((d) => d.contributionCount >= 2)!.date;
    const repo = city.repositoryCatalog![0]!;
    repo.authoredCommitCount = 2;
    repo.dailyCommits = { [day]: 2 };
    city.repositories = [repo];
    const fetcher = vi.fn(async () =>
      new Response(page([{ oid: sha('f'), authoredDate: `${day}T12:00:00Z` }])),
    );
    const result = await recoverPublicCommits(
      city,
      'sample',
      Date.now() + 10_000,
      undefined,
      fetcher as typeof fetch,
    );
    expect(
      result.repositoryCatalog?.find((r) => r.id === repo.id)
        ?.authoredCommitCount,
    ).toBe(2);
    expect(result.metadata.totalAttributedCommits).toBeGreaterThanOrEqual(2);
  });
});

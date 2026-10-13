import { parse } from 'node-html-parser';
import {
  applyAttribution,
  GitHubError,
  validateUsername,
  VISITOR_REPOSITORY_LIMIT,
} from '../src/data/github.ts';
import type { CityData, DateKey, Repository } from '../src/data/types.ts';

interface PublicCommitPage {
  commits: { sha: string; date: DateKey }[];
  endCursor: string | null;
  hasNextPage: boolean;
  authorLogin: string | null;
  repoOwner: string | null;
  repoName: string | null;
}

/** GitHub's public history embeds authored dates and a cursor in React data. */
export function parsePublicCommitPage(html: string): PublicCommitPage {
  const script = parse(html).querySelector(
    'script[data-target="react-app.embeddedData"]',
  );
  if (!script) throw new Error('Commit history has no embedded data.');
  const embedded = JSON.parse(script.textContent) as {
    payload?: {
      commitsRoute?: unknown;
      commitsRefRoute?: unknown;
    };
  };
  const route = (embedded.payload?.commitsRoute ??
    embedded.payload?.commitsRefRoute) as
    | {
        commitGroups?: { commits?: { oid?: string; authoredDate?: string }[] }[];
        filters?: {
          pagination?: { endCursor?: string; hasNextPage?: boolean };
          author?: { login?: string } | null;
        };
        repo?: { ownerLogin?: string; name?: string };
        timedOutMessage?: string;
      }
    | undefined;
  if (
    !Array.isArray(route?.commitGroups) ||
    !route.filters?.pagination ||
    route.timedOutMessage
  )
    throw new Error('Commit history format has changed.');
  const commits: PublicCommitPage['commits'] = [];
  for (const group of route.commitGroups)
    for (const commit of group.commits ?? []) {
      if (!/^[a-f\d]{40}$/i.test(commit.oid ?? '')) continue;
      const timestamp = Date.parse(commit.authoredDate ?? '');
      if (!Number.isFinite(timestamp)) continue;
      commits.push({
        sha: commit.oid!,
        date: new Date(timestamp).toISOString().slice(0, 10),
      });
    }
  const pagination = route.filters.pagination;
  return {
    commits,
    endCursor: pagination.endCursor ?? null,
    hasNextPage: pagination.hasNextPage === true,
    authorLogin: route.filters.author?.login ?? null,
    repoOwner: route.repo?.ownerLogin ?? null,
    repoName: route.repo?.name ?? null,
  };
}

interface Scan {
  repo: Repository;
  pages: number;
  limited: boolean;
}

async function scanPublicCommitHistory(
  repo: Repository,
  username: string,
  startDate: DateKey,
  endDate: DateKey,
  deadline: number,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<Scan> {
  const counts = new Map<DateKey, number>(),
    seen = new Set<string>();
  let cursor: string | null = null,
    pages = 0,
    complete = false,
    limited = false;
  for (let page = 0; page < 9 && seen.size < 300; page++) {
    if (signal?.aborted)
      throw new GitHubError('Loading cancelled.', 'cancelled', 499);
    const remaining = deadline - Date.now();
    if (remaining < 250) break;
    const url = new URL(
      `https://github.com/${encodeURIComponent(username)}/${encodeURIComponent(repo.name)}/commits`,
    );
    url.searchParams.set('author', username);
    url.searchParams.set('since', `${startDate}T00:00:00Z`);
    url.searchParams.set('until', `${endDate}T23:59:59Z`);
    if (cursor) url.searchParams.set('after', cursor);
    let response: Response;
    try {
      const timeout = AbortSignal.timeout(Math.min(8000, remaining));
      response = await fetcher(url.toString(), {
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        headers: {
          Accept: 'text/html',
          'Accept-Language': 'en',
          'User-Agent': 'Contribution-City',
        },
      });
    } catch {
      if (signal?.aborted)
        throw new GitHubError('Loading cancelled.', 'cancelled', 499);
      break;
    }
    if (response.status === 429 || response.status === 403) {
      limited = true;
      break;
    }
    if (!response.ok) break;
    let result: PublicCommitPage;
    try {
      const html = await response.text();
      if (html.length > 2_000_000) break;
      result = parsePublicCommitPage(html);
      if (
        result.authorLogin?.toLowerCase() !== username.toLowerCase() ||
        result.repoOwner?.toLowerCase() !== username.toLowerCase() ||
        result.repoName?.toLowerCase() !== repo.name.toLowerCase()
      )
        break;
    } catch {
      if (signal?.aborted)
        throw new GitHubError('Loading cancelled.', 'cancelled', 499);
      break;
    }
    pages++;
    for (const commit of result.commits) {
      if (seen.has(commit.sha)) continue;
      seen.add(commit.sha);
      if (commit.date >= startDate && commit.date <= endDate)
        counts.set(commit.date, (counts.get(commit.date) ?? 0) + 1);
      if (seen.size >= 300) break;
    }
    if (!result.hasNextPage) {
      complete = true;
      break;
    }
    if (!result.endCursor || result.endCursor === cursor || !result.commits.length)
      break;
    cursor = result.endCursor;
  }
  return {
    repo: {
      ...repo,
      authoredCommitCount: [...counts.values()].reduce((a, b) => a + b, 0),
      dailyCommits: Object.fromEntries(counts),
      scanComplete: complete,
    },
    pages,
    limited,
  };
}

/** Recover real commits from public HTML when shared anonymous REST is exhausted. */
export async function recoverPublicCommits(
  city: CityData,
  username: string,
  deadline: number,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<CityData> {
  validateUsername(username);
  const catalog = city.repositoryCatalog ?? city.repositories;
  const pending = catalog
    .filter((repo) => {
      const [owner, name, extra] = repo.id.split('/');
      return (
        !repo.scanComplete &&
        !repo.isFork &&
        !extra &&
        owner?.toLowerCase() === username.toLowerCase() &&
        name?.toLowerCase() === repo.name.toLowerCase() &&
        /^[\w.-]{1,100}$/.test(repo.name)
      );
    })
    .slice(0, VISITOR_REPOSITORY_LIMIT);
  if (!pending.length || deadline - Date.now() < 1000) return city;
  const results: Scan[] = [];
  let next = 0,
    limited = false;
  const worker = async () => {
    while (next < pending.length && !limited && Date.now() < deadline) {
      const repo = pending[next++]!;
      const result = await scanPublicCommitHistory(
        repo,
        username,
        city.metadata.startDate,
        city.metadata.endDate,
        deadline,
        signal,
        fetcher,
      );
      if (result.pages) results.push(result);
      if (result.limited) limited = true;
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, pending.length) }, worker));
  if (signal?.aborted)
    throw new GitHubError('Loading cancelled.', 'cancelled', 499);
  if (!results.length) return city;
  const byId = new Map(catalog.map((repo) => [repo.id, repo]));
  const scanned = new Set(city.repositories.map((repo) => repo.id));
  const raw = (repo: Repository) => repo.authoredCommitCount ?? repo.commitCount;
  for (const result of results) {
    const old = byId.get(result.repo.id);
    if (
      !old ||
      raw(result.repo) > raw(old) ||
      (raw(result.repo) === raw(old) && result.repo.scanComplete && !old.scanComplete)
    )
      byId.set(result.repo.id, result.repo);
    scanned.add(result.repo.id);
  }
  const attribution = applyAttribution(
    city.days.map((day) => ({
      date: day.date,
      contributionCount: day.contributionCount,
      segments: [],
    })),
    [...byId.values()]
      .filter((repo) => scanned.has(repo.id))
      .map((repo) => ({
        repo: { ...repo, commitCount: raw(repo) },
        counts: new Map(Object.entries(repo.dailyCommits ?? {})),
      })),
  );
  const attributed = new Map(
    attribution.repositories.map((repo) => [repo.id, repo]),
  );
  const totalAttributedCommits = attribution.repositories.reduce(
    (sum, repo) => sum + repo.commitCount,
    0,
  );
  return {
    ...city,
    days: attribution.days,
    repositories: attribution.repositories,
    repositoryCatalog: [...byId.values()].map(
      (repo) => attributed.get(repo.id) ?? repo,
    ),
    warnings: [
      ...city.warnings,
      {
        code: 'public-history-recovered',
        message:
          'Public commit-history pages recovered authored dates while GitHub’s anonymous API was limited. Scans may still be partial; exact calendar totals were preserved.',
      },
    ],
    metadata: {
      ...city.metadata,
      totalAttributedCommits,
      otherActivityCount:
        city.metadata.totalContributions - totalAttributedCommits,
    },
  };
}

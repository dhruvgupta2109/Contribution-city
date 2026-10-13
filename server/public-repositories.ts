import { parse } from 'node-html-parser';
import {
  REPO_PALETTE,
  validateUsername,
  GitHubError,
} from '../src/data/github.ts';
import type { Repository } from '../src/data/types.ts';

/** Public metadata fallback only. It never invents a commit total from HTML. */
export function parsePublicRepositories(
  html: string,
  username: string,
): Repository[] {
  const root = parse(html),
    repos: Repository[] = [],
    seen = new Set<string>();
  for (const anchor of root.querySelectorAll(
    'a[itemprop="name codeRepository"]',
  )) {
    const href = anchor.getAttribute('href') ?? '',
      parts = href.split('/').filter(Boolean);
    if (
      parts.length !== 2 ||
      parts[0]!.toLowerCase() !== username.toLowerCase() ||
      seen.has(href)
    )
      continue;
    const item = anchor.closest('li');
    if (!item) continue;
    seen.add(href);
    const stars =
      item
        .querySelectorAll('a')
        .find((a) => a.getAttribute('href') === `${href}/stargazers`)
        ?.text.trim()
        .replaceAll(',', '') ?? '0';
    const number =
      Number(stars.toLowerCase().replace('k', '')) *
      (/k$/i.test(stars) ? 1000 : 1);
    repos.push({
      id: parts.join('/'),
      name: parts[1]!,
      url: `https://github.com${href}`,
      color: REPO_PALETTE[repos.length % REPO_PALETTE.length]!,
      commitCount: 0,
      authoredCommitCount: 0,
      dailyCommits: {},
      scanComplete: false,
      stars: Number.isFinite(number) ? number : 0,
      language:
        item.querySelector('[itemprop="programmingLanguage"]')?.text.trim() ??
        null,
      description:
        item.querySelector('[itemprop="description"]')?.text.trim() ?? null,
      isFork: /forked from/i.test(item.text),
      size: 0,
    });
  }
  return repos;
}
export async function loadPublicRepositoryCatalog(
  username: string,
  signal?: AbortSignal,
): Promise<Repository[]> {
  validateUsername(username);
  const repos: Repository[] = [];
  const timeout = AbortSignal.timeout(9000),
    requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  // Three pages / at most 90 projects is a bounded emergency metadata path.
  for (let page = 1; page <= 3; page++) {
    if (signal?.aborted)
      throw new GitHubError('Loading cancelled.', 'cancelled', 499);
    const response = await fetch(
      `https://github.com/${encodeURIComponent(username)}?tab=repositories&page=${page}`,
      {
        signal: requestSignal,
        headers: {
          'User-Agent': 'Contribution-City',
          Accept: 'text/html',
          'Accept-Language': 'en',
        },
      },
    );
    if (!response.ok) break;
    const html = await response.text(),
      parsed = parsePublicRepositories(html, username);
    for (const repo of parsed)
      if (!repos.some((existing) => existing.id === repo.id)) repos.push(repo);
    const root = parse(html);
    if (
      !root
        .querySelectorAll('a')
        .some(
          (a) => a.text.trim() === 'Next' && !a.classList.contains('disabled'),
        )
    )
      break;
  }
  return repos;
}

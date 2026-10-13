import { parse } from 'node-html-parser';
import { contributionDates, parseDateKey } from '../src/data/dates.ts';
import {
  GitHubError,
  loadGitHubCity,
  validateUsername,
} from '../src/data/github.ts';
import type { CalendarDay } from '../src/data/github.ts';
import type { CityData } from '../src/data/types.ts';
import { loadPublicRepositoryCatalog } from './public-repositories.ts';
import { recoverPublicCommits } from './public-commits.ts';

/** Exact tooltip counts; never infer a total from GitHub's four colour levels. */
export function parsePublicCalendar(html: string): CalendarDay[] {
  const root = parse(html);
  const tooltips = new Map(
    root
      .querySelectorAll('tool-tip[for]')
      .map((tooltip) => [
        tooltip.getAttribute('for'),
        tooltip.textContent.trim(),
      ]),
  );
  const days: CalendarDay[] = [];
  for (const cell of root.querySelectorAll('[data-date]')) {
    const date = cell.getAttribute('data-date')!;
    parseDateKey(date);
    const tooltip = tooltips.get(cell.id);
    const count = tooltip?.match(/^(No|[\d,]+) contributions?\b/i)?.[1];
    if (!count)
      throw new GitHubError(
        'GitHub’s public calendar format has changed. Try again or use an optional GitHub token.',
        'github',
      );
    const contributionCount =
      count.toLowerCase() === 'no' ? 0 : Number(count.replaceAll(',', ''));
    if (!Number.isSafeInteger(contributionCount) || contributionCount < 0)
      throw new GitHubError(
        'GitHub returned an invalid public calendar count.',
        'github',
      );
    days.push({ date, contributionCount });
  }
  if (!days.length)
    throw new GitHubError(
      'The public contribution calendar could not be read. You can try an optional GitHub token.',
      'github',
    );
  return days;
}

export async function loadPublicCity(
  username: string,
  signal?: AbortSignal,
): Promise<CityData> {
  validateUsername(username);
  const started = Date.now();
  const endDate = new Date().toISOString().slice(0, 10);
  const dates = contributionDates(endDate);
  const years = [...new Set([dates[0]!.slice(0, 4), endDate.slice(0, 4)])];
  const calendar = (
    await Promise.all(
      years.map(async (year) => {
        const timeout = AbortSignal.timeout(12_000);
        let response: Response;
        try {
          response = await fetch(
            `https://github.com/users/${encodeURIComponent(username)}/contributions?from=${year}-01-01&to=${year}-12-31`,
            {
              signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
              headers: {
                Accept: 'text/html',
                'Accept-Language': 'en',
                'User-Agent': 'Contribution-City',
              },
            },
          );
        } catch {
          if (signal?.aborted)
            throw new GitHubError('Loading cancelled.', 'cancelled', 499);
          throw new GitHubError(
            'GitHub’s public calendar could not be reached. Try again.',
            'network',
          );
        }
        if (response.status === 404)
          throw new GitHubError(
            `No GitHub user named “${username}” was found.`,
            'unknown-user',
            404,
          );
        if (response.status === 429)
          throw new GitHubError(
            'GitHub is limiting public calendar requests. Please try again later.',
            'rate-limited',
            429,
          );
        if (!response.ok)
          throw new GitHubError(
            'GitHub’s public calendar is temporarily unavailable. Try again.',
            'github',
          );
        return parsePublicCalendar(await response.text());
      }),
    )
  ).flat();
  const dateSet = new Set(dates);
  const relevant = calendar.filter((day) => dateSet.has(day.date));
  if (new Set(relevant.map((day) => day.date)).size !== 365)
    throw new GitHubError(
      'GitHub returned an incomplete public calendar. Try an optional GitHub token.',
      'github',
    );
  let city = await loadGitHubCity({
    username,
    token: '',
    endDate,
    calendar: relevant,
    signal,
    userAgent: 'Contribution-City',
    timeLimitMs: Math.max(1, 45_000 - (Date.now() - started)),
    warnings: [
      {
        code: 'incomplete-attribution',
        message:
          'Showing GitHub’s public contribution calendar. Repository attribution uses public data and may be limited by GitHub’s anonymous request limit. Use an optional token for a larger repository scan.',
      },
    ],
  });
  if (city.warnings.some((w) => w.code === 'rate-limited')) {
    try {
      const fallback = await loadPublicRepositoryCatalog(username, signal),
        known = new Map(
          (city.repositoryCatalog ?? city.repositories).map((repo) => [
            repo.id,
            repo,
          ]),
        );
      for (const repo of fallback)
        if (!known.has(repo.id)) known.set(repo.id, repo);
      city.repositoryCatalog = [...known.values()];
      if (fallback.length)
        city.warnings.push({
          code: 'incomplete-attribution',
          message:
            'Public repository names and metadata were recovered from GitHub’s website. Commit scans will continue through public history pages where possible; unscanned projects remain marked as such.',
        });
    } catch {
      if (signal?.aborted)
        throw new GitHubError(
          'Loading cancelled.',
          'cancelled',
          499,
        ); /* Exact calendar and any fetched commits remain usable. */
    }
    try {
      // Public history pages use a separate website quota from anonymous REST.
      // Leave room under the serverless function's 60-second execution limit.
      city = await recoverPublicCommits(
        city,
        username,
        Math.min(started + 54_000, Date.now() + 28_000),
        signal,
      );
    } catch {
      if (signal?.aborted)
        throw new GitHubError('Loading cancelled.', 'cancelled', 499);
      /* Keep the exact calendar and any REST/HTML commits already fetched. */
    }
  }
  return city;
}

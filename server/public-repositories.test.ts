import { describe, expect, it } from 'vitest';
import { parsePublicRepositories } from './public-repositories.ts';
describe('public repository metadata fallback', () => {
  it('extracts owned projects and metadata while leaving commit totals explicitly unavailable', () => {
    const html =
      '<li><h3><a itemprop="name codeRepository" href="/sample/repo">repo</a></h3><p itemprop="description">A project</p><span itemprop="programmingLanguage">TypeScript</span><a href="/sample/repo/stargazers">1,234</a></li><li><a itemprop="name codeRepository" href="/other/wrong">wrong</a></li>';
    expect(parsePublicRepositories(html, 'sample')).toEqual([
      expect.objectContaining({
        id: 'sample/repo',
        name: 'repo',
        language: 'TypeScript',
        description: 'A project',
        stars: 1234,
        commitCount: 0,
        authoredCommitCount: 0,
        scanComplete: false,
        dailyCommits: {},
      }),
    ]);
  });
  it('ignores duplicates and malformed links and does not treat stars as commits', () => {
    const html =
      '<li><a itemprop="name codeRepository" href="/sample/repo">repo</a><a href="/sample/repo/stargazers">1.2k</a></li><li><a itemprop="name codeRepository" href="/sample/repo">repo</a></li><li><a itemprop="name codeRepository" href="javascript:alert(1)">bad</a></li>';
    const repos = parsePublicRepositories(html, 'sample');
    expect(repos).toHaveLength(1);
    expect(repos[0]!.stars).toBe(1200);
    expect(repos[0]!.authoredCommitCount).toBe(0);
  });
});

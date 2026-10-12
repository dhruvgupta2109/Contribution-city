import { fetchGitHubCity, GitHubError, safeError, validUsername } from '../src/data/github';
import type { CityData } from '../src/data/types';

const cache = new Map<string, { expires: number; data: CityData }>();
const pending = new Map<string, Promise<CityData>>();

export async function githubResponse(request: Request, token: string | undefined): Promise<Response> {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (request.method !== 'GET') return new Response(JSON.stringify({ error: 'Use GET.' }), { status: 405, headers: { ...headers, Allow: 'GET' } });
  const username = new URL(request.url).searchParams.get('user')?.trim() ?? '';
  if (!validUsername(username)) return json({ error: 'Enter a valid GitHub username.' }, 400);
  if (!token) return json({ error: 'The GitHub proxy is not configured yet. Add a server-side GITHUB_TOKEN, or open “Access token” to use your own for this session.' }, 503);
  const key = `${username.toLowerCase()}:${new Date().toISOString().slice(0, 10)}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return json(cached.data);
  try {
    let work = pending.get(key);
    if (!work) {
      work = fetchGitHubCity(username, { token, repoLimit: 15 });
      pending.set(key, work);
    }
    const data = await work;
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(key, { data, expires: Date.now() + (data.warnings.length ? 60_000 : 600_000) });
    return json(data);
  } catch (error) {
    return json({ error: safeError(error) }, error instanceof GitHubError ? error.status : 502);
  } finally { pending.delete(key); }
}

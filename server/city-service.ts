import { GitHubError, loadGitHubCity, REPOSITORY_LIMIT } from '../src/data/github.ts';
import { loadPublicCity } from './public-calendar.ts';

const publicCache = new Map<string, { expires: number; city: Awaited<ReturnType<typeof loadPublicCity>> }>();
const HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

/** Shared by the Vercel function, local dev server, and Sites worker. */
export async function cityResponse(request: Request, token = ''): Promise<Response> {
  if (request.method !== 'GET') return Response.json({ error: { code: 'github', message: 'Use GET to load a city.' } }, { status: 405, headers: { ...HEADERS, Allow: 'GET' } });
  try {
    const username = new URL(request.url).searchParams.get('user') ?? '';
    const key = `${username.toLowerCase()}:${new Date().toISOString().slice(0, 10)}`;
    const cached = publicCache.get(key);
    const useCache = !token && cached && cached.expires > Date.now();
    const city = token
      ? await loadGitHubCity({ username, token, repositoryLimit: REPOSITORY_LIMIT, signal: request.signal, userAgent: 'Contribution-City' })
      : useCache ? cached.city : await loadPublicCity(username, request.signal);
    if (!token && !useCache && !request.signal.aborted) {
      if (publicCache.size >= 50) publicCache.delete(publicCache.keys().next().value!);
      publicCache.set(key, { city, expires: Date.now() + 120_000 });
    }
    return Response.json(city, { headers: HEADERS });
  } catch (error) {
    const known = error instanceof GitHubError;
    // Never forward upstream request objects, raw exceptions, or credentials.
    return Response.json({ error: { code: known ? error.code : 'github', message: known ? error.message : 'The city could not be loaded. Please try again.' } }, { status: known ? error.status : 502, headers: HEADERS });
  }
}

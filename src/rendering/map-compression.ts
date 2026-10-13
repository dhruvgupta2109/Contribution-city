import type { MapAsset } from './world-types.ts';

/** Fetch decodes Content-Encoding itself; raw .gz assets need one explicit pass. */
export async function readMapAsset(
  path: string,
  fetcher: typeof fetch = fetch,
): Promise<MapAsset> {
  const response = await fetcher(path);
  if (!response.ok) throw new Error('The reference map could not be loaded.');
  if (!response.body) throw new Error('The map response was empty.');
  if (/\bgzip\b/i.test(response.headers.get('content-encoding') ?? ''))
    return response.json() as Promise<MapAsset>;
  return new Response(
    response.body.pipeThrough(new DecompressionStream('gzip')),
  ).json() as Promise<MapAsset>;
}

import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { readMapAsset } from './map-compression.ts';

const map = { meta: { attribution: 'test' }, roads: [], parks: [] };

describe('map asset decoding', () => {
  it('inflates a raw .gz asset served without Content-Encoding', async () => {
    const bytes = gzipSync(JSON.stringify(map));
    const fetcher = async () =>
      new Response(bytes, {
        headers: { 'Content-Type': 'application/gzip' },
      });
    expect(await readMapAsset('/maps/test.json.gz', fetcher as typeof fetch)).toEqual(
      map,
    );
  });

  it('does not inflate again when Fetch already decoded Content-Encoding: gzip', async () => {
    const fetcher = async () =>
      new Response(JSON.stringify(map), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Encoding': 'gzip',
        },
      });
    expect(await readMapAsset('/maps/test.json.gz', fetcher as typeof fetch)).toEqual(
      map,
    );
  });
});

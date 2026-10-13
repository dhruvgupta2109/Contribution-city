import { describe, expect, it } from 'vitest';
import { createWorker } from './index.ts';

describe('portable Sites worker', () => {
  const worker = createWorker({ '/index.html': { body: btoa('<title>Contribution City</title>'), contentType: 'text/html' }, '/assets/app.js': { body: btoa('console.log("city")'), contentType: 'text/javascript' } });
  it('serves HTML and hashed assets with the intended cache policy', async () => {
    const html = await worker.fetch(new Request('https://example.test/?user=octocat'));
    expect(html.status).toBe(200); expect(await html.text()).toContain('Contribution City');
    expect(html.headers.get('cache-control')).toBe('no-cache');
    const asset = await worker.fetch(new Request('https://example.test/assets/app.js'));
    expect(await asset.text()).toContain('console.log'); expect(asset.headers.get('cache-control')).toContain('immutable');
  });
  it('supports HEAD, rejects unexpected paths, and enforces supported methods', async () => {
    expect(await (await worker.fetch(new Request('https://example.test/', { method: 'HEAD' }))).text()).toBe('');
    expect((await worker.fetch(new Request('https://example.test/missing'))).status).toBe(404);
    expect((await worker.fetch(new Request('https://example.test/', { method: 'POST' }))).status).toBe(405);
    const api = await worker.fetch(new Request('https://example.test/api/city', { method: 'POST' }));
    expect(api.status).toBe(405); expect(api.headers.get('allow')).toBe('GET');
  });
});

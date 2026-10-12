import { githubResponse } from '../server/proxy';
import assets from './assets.generated';

export default {
  async fetch(request: Request, env: { GITHUB_TOKEN?: string }) {
    const url = new URL(request.url);
    if (url.pathname === '/api/github') return githubResponse(request, env.GITHUB_TOKEN);
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Use GET.', { status: 405 });
    const asset = assets[url.pathname === '/' ? '/index.html' : url.pathname];
    if (!asset) return new Response('Not found.', { status: 404 });
    return new Response(request.method === 'HEAD' ? null : asset.body, {
      headers: {
        'Content-Type': asset.type,
        'Cache-Control': url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      },
    });
  },
};

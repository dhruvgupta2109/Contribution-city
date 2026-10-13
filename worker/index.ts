import { cityResponse } from '../server/city-service.ts';

export interface StaticAsset { body: string; contentType: string }
export interface WorkerEnvironment { GITHUB_TOKEN?: string }

/** Static Vite assets and exactly one API route, in one portable Worker bundle. */
export function createWorker(assets: Record<string, StaticAsset>) {
  return {
    async fetch(request: Request, environment: WorkerEnvironment = {}): Promise<Response> {
      const path = new URL(request.url).pathname;
      if (path === '/api/city') return cityResponse(request, environment.GITHUB_TOKEN ?? '');
      const asset = assets[path === '/' ? '/index.html' : path];
      if (!asset) return new Response('Not found', { status: 404 });
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
      const bytes = request.method === 'HEAD' ? null : Uint8Array.from(atob(asset.body), (character) => character.charCodeAt(0));
      return new Response(bytes, {
        headers: { 'Content-Type': asset.contentType, 'Cache-Control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' },
      });
    },
  };
}

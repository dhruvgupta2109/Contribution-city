import type { IncomingMessage, ServerResponse } from 'node:http';
import { cityResponse } from '../server/city-service.ts';

export const config = { maxDuration: 60 };

/** The only Vercel endpoint; credentials stay on the server. */
export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method !== 'GET') {
    response.statusCode = 405;
    response.setHeader('Allow', 'GET'); response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ error: { code: 'github', message: 'Use GET to load a city.' } })); return;
  }
  const controller = new AbortController();
  const cancel = () => { if (!response.writableEnded) controller.abort(); };
  response.once('close', cancel);
  try {
    const result = await cityResponse(new Request(new URL(request.url ?? '/', 'http://localhost'), {
      method: request.method ?? 'GET', signal: controller.signal,
    }), process.env.GITHUB_TOKEN ?? '');
    if (response.destroyed) return;
    response.statusCode = result.status;
    result.headers.forEach((value, key) => response.setHeader(key, value));
    response.end(await result.text());
  } finally { response.off('close', cancel); }
}

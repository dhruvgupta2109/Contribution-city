import type { IncomingMessage, ServerResponse } from 'node:http';
import { githubResponse } from '../server/proxy';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/api/github', 'https://contribution-city.local');
  const response = await githubResponse(new Request(url, { method: req.method ?? 'GET' }), process.env.GITHUB_TOKEN);
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.statusCode = response.status;
  res.end(await response.text());
}

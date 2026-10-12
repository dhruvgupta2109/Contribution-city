import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { build } from 'esbuild';

// The optional Sites distribution embeds Vite's static assets in a single Worker.
// Vercel's standard static + one function distribution is unaffected.
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const assets = {};
async function collect(directory, prefix = '') {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (item.name.startsWith('.') || item.name === 'server') continue;
    const path = join(directory, item.name);
    const key = `${prefix}/${item.name}`;
    if (item.isDirectory()) await collect(path, key);
    else assets[key] = { body: await readFile(path, 'utf8'), type: types[extname(path)] ?? 'text/plain; charset=utf-8' };
  }
}
await collect('dist');
await mkdir('worker', { recursive: true });
await writeFile('worker/assets.generated.ts', `export default ${JSON.stringify(assets)} as Record<string, { body: string; type: string }>;\n`);
await build({ entryPoints: ['worker/index.ts'], outfile: 'dist/server/index.js', bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true });
await mkdir('dist/.openai', { recursive: true });
await writeFile('dist/.openai/hosting.json', await readFile('.openai/hosting.json', 'utf8'));
console.log('Sites Worker built with embedded static assets and /api/github.');

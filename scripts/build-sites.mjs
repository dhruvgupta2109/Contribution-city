import { readFile, readdir, mkdir, writeFile, rm, mkdtemp } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';

const assets = {};
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const client = resolve('.site-client');
async function collect(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name); const key = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) await collect(path, key);
    else assets[key] = { body: (await readFile(path)).toString('base64'), contentType: types[extname(path)] ?? 'application/octet-stream' };
  }
}
await collect(client);
if (!assets['/index.html']) throw new Error('Build the Vite client before packaging the Site.');
const hostingPath = resolve('.openai/hosting.json');
const hosting = JSON.parse(await readFile(hostingPath, 'utf8'));
if (!hosting.project_id) throw new Error('A registered Sites project ID is required.');
if (hosting.static) throw new Error('The Sites bundle uses a Worker, so static must be omitted.');
const temporary = await mkdtemp(join(tmpdir(), 'contribution-city-worker-'));
try {
  const input = join(temporary, 'entry.mjs');
  const source = `import { createWorker } from ${JSON.stringify(resolve('worker/index.ts'))};\nexport default createWorker(${JSON.stringify(assets)});\n`;
  await writeFile(input, source);
  await rm('dist', { recursive: true, force: true });
  await mkdir('dist/server', { recursive: true }); await mkdir('dist/.openai', { recursive: true });
  await build({ entryPoints: [input], outfile: 'dist/server/index.js', bundle: true, platform: 'neutral', target: 'es2022', format: 'esm', minify: true, conditions: ['worker', 'browser'], mainFields: ['module', 'main'] });
  await writeFile('dist/.openai/hosting.json', JSON.stringify(hosting, null, 2) + '\n');
  console.log(`Sites Worker built with ${Object.keys(assets).length} embedded static assets.`);
} finally { await rm(temporary, { recursive: true, force: true }); }

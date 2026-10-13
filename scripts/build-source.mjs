import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';

// Explicit source allowlist: credentials, dependencies, generated output, and
// the separately supplied Git City checkout can never enter the archive.
const paths = [
  'src',
  'api',
  'server',
  'worker',
  'scripts',
  'public',
  'docs',
  '.github',
];
const top = [
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'vite.config.ts',
  'vitest.config.ts',
  'vercel.json',
  'index.html',
  'README.md',
  'Plan.md',
  'NOTICE',
  'LICENSE',
  '.env.example',
  '.gitignore',
  '.openai/hosting.json',
];
const files = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (
      path === 'public/source.zip' ||
      entry.name.startsWith('.env') ||
      entry.name.endsWith('.local')
    )
      continue;
    if (entry.isDirectory()) await walk(path);
    else if (entry.isFile()) files.push(path);
  }
}
for (const directory of paths) await walk(directory);
files.push(...top);
files.sort();
const crcTable = Uint32Array.from({ length: 256 }, (_, i) => {
  let value = i;
  for (let b = 0; b < 8; b++)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
const crc32 = (bytes) => {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};
const locals = [],
  central = [];
let offset = 0;
for (const file of files) {
  const name = Buffer.from('contribution-city/' + file.replaceAll('\\', '/')),
    data = await readFile(file),
    compressed = deflateRawSync(data),
    crc = crc32(data);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x800, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt16LE(33, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(compressed.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(name.length, 26);
  const record = Buffer.alloc(46);
  record.writeUInt32LE(0x02014b50);
  record.writeUInt16LE(20, 4);
  record.writeUInt16LE(20, 6);
  record.writeUInt16LE(0x800, 8);
  record.writeUInt16LE(8, 10);
  record.writeUInt16LE(33, 14);
  record.writeUInt32LE(crc, 16);
  record.writeUInt32LE(compressed.length, 20);
  record.writeUInt32LE(data.length, 24);
  record.writeUInt16LE(name.length, 28);
  record.writeUInt32LE(offset, 42);
  locals.push(header, name, compressed);
  central.push(record, name);
  offset += header.length + name.length + compressed.length;
}
const directory = Buffer.concat(central),
  end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(directory.length, 12);
end.writeUInt32LE(offset, 16);
await mkdir('public', { recursive: true });
await writeFile(
  'public/source.zip',
  Buffer.concat([...locals, directory, end]),
);
console.log(`Source offer built from ${files.length} allowlisted files.`);

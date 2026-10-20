import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const labRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = path.join(labRoot, 'dist');
const FILE_URL = /\/(?:game-art|audio|runner-assets)\/[A-Za-z0-9_./+-]+\.(?:png|jpe?g|webp|gif|json|wav|ogg|mp3|atlas)/gi;

const collectText = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) files.push(...await collectText(entryPath));
    else if (/\.(?:html|css|js)$/.test(entry.name)) files.push(entryPath);
  }
  return files;
};

const textFiles = await collectText(distRoot);
const urls = new Set();
for (const filePath of textFiles) {
  const source = await readFile(filePath, 'utf8');
  for (const match of source.matchAll(FILE_URL)) urls.add(match[0]);
}

const missing = [];
for (const url of [...urls].sort()) {
  const assetPath = path.join(distRoot, decodeURIComponent(url));
  try {
    const info = await stat(assetPath);
    if (!info.isFile()) missing.push(url);
  } catch {
    missing.push(url);
  }
}

if (missing.length) {
  console.error(`Missing ${missing.length} boss-lab assets:`);
  for (const url of missing) console.error(`  ${url}`);
  process.exit(1);
}

console.log(`Verified ${urls.size} static boss-lab asset URLs.`);

import { cp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const labRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(labRoot, '..');
const distRoot = path.join(labRoot, 'dist');
const assetMode = process.env.BOSS_LAB_ASSET_MODE === 'copy' ? 'copy' : 'link';
const basePath = (process.env.BASE_PATH ?? '').replace(/\/+$/, '');

if (basePath && !basePath.startsWith('/')) {
  throw new Error('BASE_PATH must be empty or start with "/".');
}

const PREFIXES = ['/runner-assets/', '/game-art/', '/audio/', '/runner/', '/favicon.svg'];

const rewriteHostedPaths = (source) => {
  if (!basePath) return source;
  return PREFIXES.reduce(
    (current, prefix) => current.split(prefix).join(`${basePath}${prefix}`),
    source
  );
};

const linkOrCopy = async (source, destination) => {
  await mkdir(path.dirname(destination), { recursive: true });
  if (assetMode === 'copy') {
    await cp(source, destination, { recursive: true, dereference: true });
    return;
  }
  const relativeTarget = path.relative(path.dirname(destination), source);
  await symlink(relativeTarget, destination, 'dir');
};

const rewriteTree = async (directory) => {
  if (!basePath) return;
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await rewriteTree(entryPath);
      continue;
    }
    if (!/\.(?:html|css|js)$/.test(entry.name)) continue;
    const source = await readFile(entryPath, 'utf8');
    const rewritten = rewriteHostedPaths(source);
    if (rewritten !== source) await writeFile(entryPath, rewritten);
  }
};

await rm(distRoot, { recursive: true, force: true });
await mkdir(distRoot, { recursive: true });

await cp(path.join(labRoot, 'site'), distRoot, { recursive: true });
await cp(path.join(labRoot, 'vendor', 'runner'), path.join(distRoot, 'runner'), {
  recursive: true
});
await cp(
  path.join(labRoot, 'vendor', 'runner-assets'),
  path.join(distRoot, 'runner-assets'),
  { recursive: true }
);

const publicRoot = path.join(repoRoot, 'public');
await linkOrCopy(path.join(publicRoot, 'game-art'), path.join(distRoot, 'game-art'));
await linkOrCopy(path.join(publicRoot, 'audio'), path.join(distRoot, 'audio'));
await rewriteTree(distRoot);

console.log(
  `Assembled boss lab at ${distRoot} (${assetMode} assets${basePath ? `, base ${basePath}` : ''}).`
);

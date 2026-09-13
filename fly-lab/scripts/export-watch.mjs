import { readFile, writeFile, mkdir, copyFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runId = process.argv[2];
if (!runId || !/^[A-Za-z0-9_-]{1,120}$/.test(runId)) throw new Error('Usage: node scripts/export-watch.mjs RUN_ID [new-output-directory]');
const destination = path.resolve(process.argv[3] || path.join(root, 'runtime', `pi-display-${runId}`));
try { await stat(destination); throw new Error('Choose a new output directory; existing folders are never overwritten.'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const json = async name => JSON.parse(await readFile(name, 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const cache = path.join(root, 'runtime', 'watch');
const index = await json(path.join(cache, 'index.json'));
const item = index[runId];
if (!item || !/^[A-Za-z0-9_-]+$/.test(item.folder)) throw new Error('No completed display cache for this run. Create one in Watch first.');
const source = path.join(cache, item.folder);
const manifestBytes = await readFile(path.join(source, 'manifest.json'));
if (hash(manifestBytes) !== item.sha256) throw new Error('Display manifest checksum mismatch.');
const manifest = JSON.parse(manifestBytes);
if (!manifest.verification?.passed || manifest.runId !== runId) throw new Error('Only a verified display derivative can be exported.');
const media = new Map();
for (const name of ['replay.mp4', 'poster.png', 'timeline.json']) {
  const bytes = await readFile(path.join(source, name));
  if (hash(bytes) !== manifest.files[name].sha256 || bytes.length !== manifest.files[name].bytes) throw new Error(`Display checksum mismatch: ${name}`);
  media.set(name, bytes);
}
const build = await json(path.join(root, 'dist', '.vite', 'manifest.json'));
const bundle = new Set(['watch.html']);
const visited = new Set();
function dependencies(key) {
  if (visited.has(key)) return;
  visited.add(key); const item = build[key];
  if (!item) throw new Error(`Missing display build dependency: ${key}`);
  bundle.add(item.file);
  for (const asset of [...(item.css || []), ...(item.assets || [])]) bundle.add(asset);
  for (const dep of [...(item.imports || []), ...(item.dynamicImports || [])]) dependencies(dep);
}
dependencies('watch.html');
for (const name of bundle) { const resolved = path.resolve(root, 'dist', name); if (!resolved.startsWith(path.join(root, 'dist') + path.sep)) throw new Error('Build asset escaped its directory.'); await stat(resolved); }
await mkdir(destination, { recursive: true });
for (const name of bundle) { const target = path.join(destination, name); await mkdir(path.dirname(target), { recursive: true }); await copyFile(path.join(root, 'dist', name), target); }
await copyFile(path.join(root, 'scripts', 'serve-watch.py'), path.join(destination, 'serve-watch.py'));
for (const [name, bytes] of media) await writeFile(path.join(destination, name), bytes);
// Preserve the original verified metadata alongside an explicitly relocated viewer manifest.
await writeFile(path.join(destination, 'source-display-manifest.json'), manifestBytes);
manifest.media.url = './replay.mp4'; manifest.media.posterUrl = './poster.png'; manifest.timeline.url = './timeline.json';
manifest.portableDisplay = true;
await writeFile(path.join(destination, 'watch-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(path.join(destination, 'index.html'), '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=watch.html"><a href="watch.html">Open Scicon Fly Lab</a>');
await writeFile(path.join(destination, 'README.txt'), `SCICON FLY LAB — DISPLAY EDITION\n\nThis folder contains a recorded ${manifest.controllerLabel} episode, actual anatomical coordinates and a read-only browser viewer. It does not train a model, start the game engine or connect a wallet. Learning has not been demonstrated.\n\nOn Raspberry Pi OS:\n1. Copy this entire folder to the Pi.\n2. Open a terminal in this folder and run:\n   python3 serve-watch.py\n3. Open Chromium at http://127.0.0.1:8080/watch.html\n   Press F11 for full screen. Play and Loop control the recording.\n\nLow power display starts enabled. The PC can be switched off. Internet is not needed. Leave the terminal open; Ctrl+C stops the local file server. To start kiosk mode from the Pi desktop terminal, run chromium --kiosk http://127.0.0.1:8080/watch.html (the browser command may be chromium-browser on older OS images).\n\nRUN: ${runId}\nSOURCE COMMIT: ${manifest.sourceCommit}\nVIDEO: H.264 baseline, 390 x 844, 20 fps\nReplay pixels/actions were verified before lossy video encoding. The small grayscale panel is a preview of the video; scientific observations stay in the original experiment export. Brain colors identify anatomy, not neural firing.\n\nSource display manifest and file checksums are included for provenance.\n`);
const checksums = {};
for (const name of [...bundle, ...media.keys(), 'source-display-manifest.json', 'watch-manifest.json', 'index.html', 'README.txt', 'serve-watch.py']) checksums[name] = hash(await readFile(path.join(destination, name)));
await writeFile(path.join(destination, 'checksums.json'), JSON.stringify(checksums, null, 2) + '\n');
console.log(JSON.stringify({ destination, runId, files: Object.keys(checksums).length, videoSeconds: manifest.media.durationSeconds }, null, 2));

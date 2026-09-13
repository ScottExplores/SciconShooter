import { readFile, writeFile, mkdir, copyFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destinationArg = process.argv[2], runIds = process.argv.slice(3);
if (!destinationArg || !runIds.length || runIds.length > 20 || new Set(runIds).size !== runIds.length || runIds.some(id => !/^[A-Za-z0-9_-]{1,120}$/.test(id))) throw new Error('Usage: node scripts/export-exhibit.mjs NEW_OUTPUT_DIRECTORY UNIQUE_RUN_IDS...');
const destination = path.resolve(destinationArg);
try { await stat(destination); throw new Error('Choose a new output directory; existing folders are never overwritten.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const json = async filename => JSON.parse(await readFile(filename, 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const index = await json(path.join(root, 'runtime/watch/index.json'));
const python = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const files = new Map(), entries = [];
for (const runId of runIds) {
  const entry = index[runId];
  if (!entry || !/^[A-Za-z0-9_-]+$/.test(entry.folder)) throw new Error('No completed verified recording for ' + runId);
  const source = path.join(root, 'runtime/watch', entry.folder);
  const original = await readFile(path.join(source, 'manifest.json'));
  if (hash(original) !== entry.sha256) throw new Error('Recording manifest checksum mismatch.');
  const manifest = JSON.parse(original);
  if (!manifest.verification?.passed || manifest.runId !== runId) throw new Error('Only verified recordings may be published.');
  for (const name of ['replay.mp4', 'poster.png', 'timeline.json']) {
    const bytes = await readFile(path.join(source, name));
    if (hash(bytes) !== manifest.files[name].sha256 || bytes.length !== manifest.files[name].bytes) throw new Error('Corrupt recording file: ' + name);
    files.set(`recordings/${runId}/${name}`, bytes);
  }
  const signalBytes = execFileSync(python, ['-m', 'scicon_fly.watch_signals', path.join(root, 'experiments', runId)], { env: { ...process.env, PYTHONPATH: path.join(root, 'python') }, windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
  const signals = JSON.parse(signalBytes.toString('utf8'));
  if (signals.version !== 1 || signals.frames?.length !== manifest.timeline.entries) throw new Error('Recorded input signals do not match.');
  files.set(`recordings/${runId}/signals.json`, signalBytes);
  const prefix = `./recordings/${runId}/`;
  const display = {
    runId, controllerLabel: manifest.controllerLabel, evidence: manifest.evidence, sourceCommit: manifest.sourceCommit,
    media: { ...manifest.media, url: prefix + 'replay.mp4', posterUrl: prefix + 'poster.png' },
    timeline: { ...manifest.timeline, url: prefix + 'timeline.json' },
    signals: { url: prefix + 'signals.json', sha256: hash(signalBytes) },
    provenance: { originalManifestSha256: entry.sha256, verifiedBeforeLossyEncoding: true, files: manifest.files },
  };
  files.set(`recordings/${runId}/manifest.json`, Buffer.from(JSON.stringify(display)));
  entries.push({ runId, manifest: prefix + 'manifest.json' });
}
const build = await json(path.join(root, 'dist/.vite/manifest.json'));
const seen = new Set();
async function include(key) {
  if (seen.has(key)) return; seen.add(key);
  const chunk = build[key]; if (!chunk) throw new Error('Missing spectator build: ' + key);
  for (const name of [chunk.file, ...(chunk.css || []), ...(chunk.assets || [])]) {
    const full = path.resolve(root, 'dist', name);
    if (!full.startsWith(path.join(root, 'dist') + path.sep)) throw new Error('Asset escaped the build directory.');
    files.set(name, await readFile(full));
  }
  for (const dep of [...(chunk.imports || []), ...(chunk.dynamicImports || [])]) await include(dep);
}
await include('spectator.html');
const html = await readFile(path.join(root, 'dist/spectator.html'));
files.set('index.html', html); files.set('watch.html', html);
files.set('exhibit.json', Buffer.from(JSON.stringify({ version: 1, kind: 'recorded-sequence', entries })));
files.set('ABOUT.txt', Buffer.from('Scicon Fly Lab spectator showcase. Verified recorded random-baseline gameplay; no neural learning is represented. Anatomy uses released MaleCNS v1.0 cell-body locations (FlyEM/HHMI Janelia and collaborators, CC BY 4.0). Colored cues illustrate recorded screen changes and control commands. Green flashes show score changes, not dopamine or neuronal firing. Sequence totals reset on replay and do not create experimental scores. No local coordinator API, credentials, player profiles, or full connectome data are included.\n'));
await mkdir(destination, { recursive: true });
for (const [name, bytes] of files) { const target = path.join(destination, name); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, bytes); }
await writeFile(path.join(destination, 'checksums.json'), JSON.stringify(Object.fromEntries([...files].map(([name, bytes]) => [name, hash(bytes)])), null, 2));
console.log(JSON.stringify({ destination, recordings: entries.length, files: files.size + 1, bytes: [...files.values()].reduce((n, bytes) => n + bytes.length, 0) }));

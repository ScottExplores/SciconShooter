import fs from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import ts from 'typescript';

// Works with old dist snapshots as well as new builds, without rebuilding either.
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const dist = path.resolve(option('--dist', 'dist'));
const output = option('--out', null);
const html = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
const entries = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+\.js)["'][^>]*>/g)]
  .map((match) => match[1].replace(/^\//, ''));
if (!entries.length) throw new Error('No JavaScript entry found in dist/index.html');

const chunks = new Map();
const visitDirectory = async (directory) => {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await visitDirectory(file);
    else if (entry.name.endsWith('.js')) {
      const source = await fs.readFile(file);
      const relative = path.relative(dist, file).replaceAll(path.sep, '/');
      const ast = ts.createSourceFile(relative, source.toString(), ts.ScriptTarget.ESNext, false, ts.ScriptKind.JS);
      const imports = [];
      for (const statement of ast.statements) {
        if (!(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))) continue;
        const specifier = statement.moduleSpecifier;
        if (!specifier || !ts.isStringLiteral(specifier) || !specifier.text.startsWith('.')) continue;
        imports.push(path.posix.normalize(path.posix.join(path.posix.dirname(relative), specifier.text)));
      }
      chunks.set(relative, { file: relative, bytes: source.length, gzipBytes: gzipSync(source).length, imports });
    }
  }
};
await visitDirectory(path.join(dist, 'assets'));

const closure = (roots) => {
  const files = new Set();
  const visit = (file) => {
    if (files.has(file)) return;
    const chunk = chunks.get(file);
    if (!chunk) throw new Error(`Missing built dependency: ${file}`);
    files.add(file);
    chunk.imports.forEach(visit);
  };
  roots.forEach(visit);
  return files;
};
const findChunk = (name) => [...chunks.keys()].find((file) => path.posix.basename(file).startsWith(`${name}-`));
const summarize = (files) => ({
  bytes: [...files].reduce((sum, file) => sum + chunks.get(file).bytes, 0),
  gzipBytes: [...files].reduce((sum, file) => sum + chunks.get(file).gzipBytes, 0),
  files: [...files].sort()
});
const entryFiles = closure(entries);
// Include App even when lazy: mobile home immediately needs it, so comparing only
// index.js would misleadingly count moving the same code as a loading improvement.
const homeFiles = closure([...entries, ...[findChunk('App')].filter(Boolean)]);
const feature = (name, base) => {
  const root = findChunk(name);
  if (!root) return null;
  const files = closure([...base, root]);
  const additional = new Set([...files].filter((file) => !homeFiles.has(file)));
  return { root, ...summarize(files), additionalToHome: summarize(additional) };
};
const report = {
  dist,
  units: 'bytes; gzip is the sum of independently compressed assets',
  entry: summarize(entryFiles),
  mobileHome: summarize(homeFiles),
  gameplay: feature('GameStage', [...homeFiles]),
  wallet: feature('WalletRuntime', [...homeFiles]),
  bossLab: feature('BossLab', entries),
  totalJavaScript: summarize(new Set(chunks.keys())),
  chunks: [...chunks.values()].sort((a, b) => b.bytes - a.bytes)
};
const json = `${JSON.stringify(report, null, 2)}\n`;
if (output) await fs.writeFile(path.resolve(output), json);
else process.stdout.write(json);

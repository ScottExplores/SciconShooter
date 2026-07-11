const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('Director is isolated from public and serverless production entrypoints', () => {
  assert.equal(fs.existsSync(path.join(root, 'public', 'director')), false);
  assert.equal(fs.existsSync(path.join(root, 'api', 'director.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'api', 'director')), false);

  const ignored = read('.vercelignore').split(/\r?\n/).map((line) => line.trim());
  assert.ok(ignored.includes('director/'));
  assert.ok(ignored.includes('director-data/'));
});

test('Director owns a loopback-only strict port and refuses deployment builds', () => {
  const viteConfig = read('director/vite.config.ts');
  const packageJson = JSON.parse(read('director/package.json'));
  assert.match(viteConfig, /host:\s*['"]127\.0\.0\.1['"]/);
  assert.match(viteConfig, /port:\s*5174/);
  assert.match(viteConfig, /strictPort:\s*true/);
  assert.match(viteConfig, /command === ['"]build['"] \|\| process\.env\.VERCEL/);
  assert.match(packageJson.scripts.build, /local-only/i);
});

test('Director source has no wallet, chain, Supabase, or production write imports', () => {
  const forbidden = [
    '@base-org/account',
    "from 'viem'",
    'wallet_sendCalls',
    'SUPABASE_SERVICE_ROLE_KEY',
    'recordMintService',
    'baseAccountWallet',
    "../api/",
    "../services/"
  ];
  const roots = [path.join(root, 'director', 'src'), path.join(root, 'director', 'server')];
  const violations = [];

  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (/\.(?:ts|tsx|js|mjs)$/.test(entry.name)) {
        const source = fs.readFileSync(absolute, 'utf8');
        for (const marker of forbidden) {
          if (source.includes(marker)) violations.push(`${path.relative(root, absolute)} contains ${marker}`);
        }
      }
    }
  };

  for (const directory of roots) visit(directory);
  assert.deepEqual(violations, []);
});

test('root build keeps an explicit dist-only Vercel boundary', () => {
  const packageJson = JSON.parse(read('package.json'));
  const vercel = JSON.parse(read('vercel.json'));
  assert.match(packageJson.scripts.build, /^vite build/);
  assert.match(packageJson.scripts.build, /assert-director-excluded/);
  assert.equal(vercel.buildCommand, 'npm run build');
  assert.equal(vercel.outputDirectory, 'dist');
});

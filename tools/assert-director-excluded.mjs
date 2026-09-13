import fs from 'node:fs';
import path from 'node:path';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const distRoot = path.join(repositoryRoot, 'dist');
const indexPath = path.join(distRoot, 'index.html');

if (!fs.existsSync(indexPath)) {
  throw new Error('Production boundary check expected dist/index.html after the Vite build.');
}

const forbiddenPathFragments = [
  'fly-lab',
  'scicon_fly',
  'director',
  'director-data',
  '__director',
  'combat-lab',
  'combatlab',
  'test-packages'
];
const forbiddenPrototypeAssetBasenames = [
  'meridian-harrower-assembled',
  'meridian-harrower-modular-sheet',
  'helios-clawcarrier-assembled',
  'helios-clawcarrier-modular-sheet',
  'aurora-storm-engine-assembled',
  'aurora-storm-engine-modular-sheet',
  'umbra-needlewing-assembled',
  'umbra-needlewing-modular-sheet',
  'cinderjaw-siege-beetle-assembled',
  'cinderjaw-siege-beetle-modular-sheet',
  'vesperglass-mothmother-assembled',
  'vesperglass-mothmother-modular-sheet',
  'twin-halo-wardens-assembled',
  'twin-halo-wardens-modular-sheet',
  'riftcoil-wyrm-assembled',
  'riftcoil-wyrm-modular-sheet',
  'gloamforge-mantis-neutral',
  'gloamforge-mantis-atlas',
  'aurora-boss-vfx-sheet-v1'
];
const forbiddenText = [
  'Scicon Fly Lab',
  'sciconFlyEnvironment',
  'Scicon Director',
  '/__director',
  'director-data/',
  'Scicon Combat Lab',
  'EXPERIMENTAL / NO SAVES',
  'neon-breakwater-2026',
  'lab=combat',
  '/combat-lab',
  'scicon-combat-lab-presets-v1',
  ...forbiddenPrototypeAssetBasenames
];
const textExtensions = new Set(['.html', '.js', '.css', '.json', '.map', '.txt', '.svg']);
const violations = [];

const visit = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(distRoot, absolute).replaceAll('\\', '/');
    const lowerRelative = relative.toLowerCase();

    if (forbiddenPathFragments.some((fragment) => lowerRelative.includes(fragment))) {
      violations.push(`forbidden output path: ${relative}`);
    }
    if (forbiddenPrototypeAssetBasenames.some((basename) => lowerRelative.includes(basename))) {
      violations.push(`forbidden prototype asset output: ${relative}`);
    }

    if (entry.isDirectory()) {
      visit(absolute);
      continue;
    }

    if (!textExtensions.has(path.extname(entry.name).toLowerCase())) continue;
    const contents = fs.readFileSync(absolute, 'utf8');
    for (const marker of forbiddenText) {
      if (contents.includes(marker)) violations.push(`forbidden marker ${JSON.stringify(marker)} in ${relative}`);
    }
  }
};

visit(distRoot);

const vercelIgnore = fs.readFileSync(path.join(repositoryRoot, '.vercelignore'), 'utf8');
for (const required of ['director/', 'director-data/', 'fly-lab/']) {
  if (!vercelIgnore.split(/\r?\n/).map((line) => line.trim()).includes(required)) {
    violations.push(`.vercelignore is missing ${required}`);
  }
}

if (violations.length > 0) {
  throw new Error(`Scicon private-tool production exclusion failed:\n- ${violations.join('\n- ')}`);
}

console.log('Scicon production exclusion verified: root dist contains no Director or Fly Lab files or markers.');

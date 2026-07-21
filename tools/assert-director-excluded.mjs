import fs from 'node:fs';
import path from 'node:path';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const distRoot = path.join(repositoryRoot, 'dist');
const indexPath = path.join(distRoot, 'index.html');

if (!fs.existsSync(indexPath)) {
  throw new Error('Production boundary check expected dist/index.html after the Vite build.');
}

const forbiddenPathFragments = ['director', 'director-data', '__director', 'combat-lab'];
const forbiddenText = [
  'Scicon Director',
  '/__director',
  'director-data/workspace',
  'Scicon Combat Lab',
  '/combat-lab',
  'scicon-combat-lab-presets-v1'
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
for (const required of ['director/', 'director-data/']) {
  if (!vercelIgnore.split(/\r?\n/).map((line) => line.trim()).includes(required)) {
    violations.push(`.vercelignore is missing ${required}`);
  }
}

if (violations.length > 0) {
  throw new Error(`Scicon Director production exclusion failed:\n- ${violations.join('\n- ')}`);
}

console.log('Scicon Director exclusion verified: root dist contains no Director files or markers.');

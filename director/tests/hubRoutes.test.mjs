import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '..', '..');
const directorRoot = path.join(repositoryRoot, 'director');
const server = await createServer({
  root: repositoryRoot,
  configFile: false,
  server: { middlewareMode: true, hmr: false },
  appType: 'custom'
});

after(async () => {
  await server.close();
});

const registry = await server.ssrLoadModule('/director/src/app/authoringRegistry.ts');

test('Developer Hub exposes every stable canonical route in registry order', () => {
  assert.deepEqual(
    [...registry.CANONICAL_HUB_PATHS],
    [
      '/',
      '/project',
      '/missions',
      '/waves',
      '/bosses',
      '/formations',
      '/sandbox',
      '/loadouts',
      '/assets',
      '/gallery',
      '/analytics',
      '/reports',
      '/reviews'
    ]
  );
});

test('compatibility and legacy paths resolve without creating competing tools', () => {
  const levelEditor = registry.resolveHubRoute('/level-editor/');
  const combatLab = registry.resolveHubRoute('/combat-lab');
  const projectStatus = registry.resolveHubRoute('/status');
  const bugReports = registry.resolveHubRoute('/bugs');
  const waveGallery = registry.resolveHubRoute('/wave-gallery');
  const studio = registry.resolveHubRoute('/studio');

  assert.equal(levelEditor.descriptor.id, 'missions');
  assert.equal(levelEditor.descriptor.host, 'mission-builder');
  assert.equal(levelEditor.isAlias, true);
  assert.equal(combatLab.descriptor.id, 'sandbox');
  assert.equal(combatLab.descriptor.host, 'combat-lab');
  assert.equal(combatLab.isAlias, true);
  assert.equal(projectStatus.descriptor.id, 'project');
  assert.equal(projectStatus.isAlias, true);
  assert.equal(bugReports.descriptor.id, 'reports');
  assert.equal(bugReports.isAlias, true);
  assert.equal(waveGallery.descriptor.id, 'gallery');
  assert.equal(waveGallery.descriptor.host, 'wave-gallery');
  assert.equal(waveGallery.isAlias, true);
  assert.equal(studio.descriptor.host, 'legacy');
  assert.equal(studio.descriptor.status, 'legacy');
});

test('tool routes declare their current canonical host and authoring resources', () => {
  const byId = registry.AUTHORING_DESCRIPTOR_BY_ID;

  assert.equal(byId.bosses.host, 'boss-sandbox');
  assert.equal(byId.bosses.status, 'live');
  assert.deepEqual([...byId.bosses.resourceKinds], ['boss']);
  assert.equal(byId.waves.status, 'live');
  assert.equal(byId.formations.host, 'combat-lab');
  assert.deepEqual([...byId.formations.resourceKinds], ['formation']);
  assert.equal(byId.reviews.requiredQuerySurface, 'review');
  assert.equal(byId.analytics.host, 'analytics-foundation');
  assert.equal(byId.analytics.status, 'live');
  assert.equal(byId.reports.host, 'report-inbox');
  assert.deepEqual([...byId.reports.resourceKinds], ['player-report']);
  assert.equal(byId.gallery.host, 'wave-gallery');
  assert.deepEqual([...byId.gallery.resourceKinds], ['wave', 'formation']);
  assert.equal(byId.project.host, 'project-guide');
  assert.deepEqual([...byId.project.resourceKinds], ['project-status']);
});

test('unknown and normalized paths have deterministic route behavior', () => {
  assert.equal(registry.normalizeHubPath('//waves///'), '/waves');
  const unknown = registry.resolveHubRoute('/not-a-tool');
  assert.equal(unknown.notFound, true);
  assert.equal(unknown.requestedPath, '/not-a-tool');
  assert.equal(unknown.descriptor.id, 'overview');
});

test('the Director entrypoint mounts existing tools inside the shared Hub shell', async () => {
  const [main, shell] = await Promise.all([
    readFile(path.join(directorRoot, 'src', 'main.tsx'), 'utf8'),
    readFile(path.join(directorRoot, 'src', 'app', 'DeveloperHubApp.tsx'), 'utf8')
  ]);

  assert.match(main, /DeveloperHubApp/);
  assert.match(main, /\.\/editor\/LevelEditorApp/);
  assert.match(main, /\.\/combat-lab\/CombatLabApp/);
  assert.match(main, /\.\/tools\/bosses\/BossSandboxApp/);
  assert.match(main, /\.\/App/);
  assert.match(shell, /Local only/);
  assert.match(shell, /No production writes/);
  assert.match(shell, /Legacy \/ read-only/);
  assert.match(shell, /case 'report-inbox'/);
  assert.match(shell, /case 'wave-gallery'/);
  assert.match(shell, /case 'project-guide'/);
});

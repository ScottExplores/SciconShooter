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
  server: { middlewareMode: true },
  appType: 'custom'
});

after(async () => {
  await server.close();
});

const model = await server.ssrLoadModule('/director/src/editor/workspaceDraftModel.ts');

const makeCampaign = () => ({
  schemaVersion: 1,
  id: 'campaign',
  revision: 1,
  updatedAt: '2026-07-23T00:00:00.000Z',
  recordCard: { copy: { title: 'Run' } },
  hudAssets: { bombIcon: 'bomb' },
  levels: [
    { id: 'mission-one', order: 1, name: 'Mission One', waves: [{ id: 'wave-one', order: 1, events: [] }] },
    { id: 'mission-two', order: 2, name: 'Mission Two', waves: [{ id: 'wave-two', order: 1, events: [] }] }
  ]
});

test('browser recovery promotes changed and new missions through resource saves', () => {
  const authoritative = makeCampaign();
  const recovered = structuredClone(authoritative);
  recovered.levels[0].name = 'Recovered Mission';
  recovered.levels.push({
    id: 'mission-three',
    order: 3,
    name: 'Mission Three',
    waves: [{ id: 'wave-three', order: 1, events: [] }]
  });

  const plan = model.planBrowserDraftRecovery(authoritative, recovered);
  assert.equal(plan.changed, true);
  assert.equal(plan.requiresFullCampaignApply, false);
  assert.deepEqual(
    plan.resources.map(({ reference }) => reference),
    [
      { kind: 'level', levelId: 'mission-one' },
      { kind: 'level', levelId: 'mission-three' }
    ]
  );
});

test('schema-v1 global, mission-delete, and mission-order recovery stays on the explicit full apply path', async (t) => {
  await t.test('top-level presentation edit', () => {
    const authoritative = makeCampaign();
    const recovered = structuredClone(authoritative);
    recovered.recordCard.copy.title = 'Recovered Run';
    const plan = model.planBrowserDraftRecovery(authoritative, recovered);
    assert.equal(plan.requiresFullCampaignApply, true);
  });

  await t.test('mission deletion', () => {
    const authoritative = makeCampaign();
    const recovered = structuredClone(authoritative);
    recovered.levels.pop();
    const plan = model.planBrowserDraftRecovery(authoritative, recovered);
    assert.equal(plan.requiresFullCampaignApply, true);
    assert.deepEqual(plan.resources, []);
  });

  await t.test('atomic mission order swap', () => {
    const authoritative = makeCampaign();
    const recovered = structuredClone(authoritative);
    recovered.levels[0].order = 2;
    recovered.levels[1].order = 1;
    const plan = model.planBrowserDraftRecovery(authoritative, recovered);
    assert.equal(plan.requiresFullCampaignApply, true);
    assert.deepEqual(plan.resources, []);
  });
});

test('workspace resource keys are stable for optimistic autosave coalescing', () => {
  assert.equal(
    model.workspaceResourceKey({ kind: 'level', levelId: 'mission-one' }),
    'level:mission-one'
  );
  assert.equal(
    model.workspaceResourceKey({ kind: 'wave', levelId: 'mission-one', waveId: 'wave-one' }),
    'wave:mission-one:wave-one'
  );
  assert.equal(
    model.workspaceResourceKey({
      kind: 'boss-event',
      levelId: 'mission-one',
      waveId: 'wave-one',
      eventId: 'boss-one'
    }),
    'boss-event:mission-one:wave-one:boss-one'
  );
});

test('Mission Builder uses the server workspace while preserving the canonical preview and recovery boundary', async () => {
  const [editor, autosave] = await Promise.all([
    readFile(path.join(directorRoot, 'src', 'editor', 'LevelEditorApp.tsx'), 'utf8'),
    readFile(path.join(directorRoot, 'src', 'hooks', 'useWorkspaceAutosave.ts'), 'utf8')
  ]);

  assert.match(editor, /fetchGameCampaignWorkspace<GameCampaignConfig>/);
  assert.match(editor, /useWorkspaceAutosave/);
  assert.match(editor, /levelWorkspaceSave/);
  assert.match(editor, /waveWorkspaceSave/);
  assert.match(editor, /bossWorkspaceSave/);
  assert.match(editor, /applyGameCampaignWorkspace/);
  assert.match(editor, /recoveryOnly:\s*true/);
  assert.match(editor, /<GameEditorCanvas/);
  assert.doesNotMatch(editor, /revertGameCampaignEdits/);

  assert.match(autosave, /expectedBaseContentHash:\s*summaryRef\.current\.baseContentHash/);
  assert.match(autosave, /expectedDraftRevision:\s*summaryRef\.current\.draftRevision/);
  assert.match(autosave, /idempotencyKey:\s*pending\.idempotencyKey/);
});

test('stable Hub authoring routes select their intended initial inspector and boss', async () => {
  const campaign = makeCampaign();
  campaign.levels[1].waves[0].events.push({
    id: 'boss-one',
    kind: 'boss',
    label: 'Gatekeeper'
  });

  const missions = model.initialWorkspaceEditorSelection(campaign, '/missions', 'game');
  const alias = model.initialWorkspaceEditorSelection(campaign, '/level-editor/', 'game');
  const waves = model.initialWorkspaceEditorSelection(campaign, '/waves', 'game');
  const bosses = model.initialWorkspaceEditorSelection(campaign, '/bosses', 'game');
  const card = model.initialWorkspaceEditorSelection(campaign, '/missions', 'card');

  assert.equal(missions.inspectorTab, 'level');
  assert.equal(alias.inspectorTab, 'level');
  assert.equal(waves.inspectorTab, 'wave');
  assert.deepEqual(bosses, {
    levelId: 'mission-two',
    waveId: 'wave-two',
    eventId: 'boss-one',
    inspectorTab: 'boss'
  });
  assert.equal(card.inspectorTab, 'card');

  const editor = await readFile(
    path.join(directorRoot, 'src', 'editor', 'LevelEditorApp.tsx'),
    'utf8'
  );
  assert.match(editor, /initialWorkspaceEditorSelection/);
});

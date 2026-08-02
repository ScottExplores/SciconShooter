import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const directorRoot = path.resolve(testDirectory, '..');
const workspaceRoot = path.resolve(directorRoot, '..');
const readDirectorSource = (...segments) => readFile(path.join(directorRoot, 'src', ...segments), 'utf8');
const readWorkspaceSource = (...segments) => readFile(path.join(workspaceRoot, ...segments), 'utf8');

test('Mission Builder presents compatibility levels as missions containing waves', async () => {
  const [editor, levelRail, waveStrip] = await Promise.all([
    readDirectorSource('editor', 'LevelEditorApp.tsx'),
    readDirectorSource('editor', 'LevelRail.tsx'),
    readDirectorSource('editor', 'WaveStrip.tsx')
  ]);

  assert.match(levelRail, /<h2>Missions<\/h2>/);
  assert.match(levelRail, /Campaign → Mission → Wave → Encounter/);
  assert.match(editor, /levels=\{campaign\.value\.levels\}/);
  assert.match(editor, /waves=\{selectedLevel\.waves\}/);
  assert.match(editor, /Previewing Mission \$\{selectedLevel\.order\}/);
  assert.match(editor, /missionName=\{selectedLevel\.name\}/);
  assert.match(editor, /missionOrder=\{selectedLevel\.order\}/);
  assert.match(waveStrip, /Waves in \$\{missionLabel\}/);
  assert.match(waveStrip, /<strong>\{missionLabel\}<\/strong>/);
});

test('Combat Lab uses Mission display copy without renaming compatibility identifiers', async () => {
  const [catalog, app, workshop] = await Promise.all([
    readDirectorSource('combat-lab', 'contentCatalog.ts'),
    readDirectorSource('combat-lab', 'CombatLabApp.tsx'),
    readDirectorSource('combat-lab', 'FormationWorkshop.tsx')
  ]);

  assert.match(catalog, /'stages-waves': 'Missions & Waves'/);
  assert.match(catalog, /label: 'Mission \/ wave'/);
  assert.match(catalog, /label: 'Available in missions'/);
  assert.doesNotMatch(catalog, /label: 'Available in stages'/);
  assert.match(catalog, /category: 'stages-waves'/);
  assert.match(catalog, /kind: 'stage'/);
  assert.match(catalog, /levelId: level\.id/);
  assert.match(app, /requires at least one mission and wave/);
  assert.match(app, /existing local Mission Builder draft/);
  assert.match(app, /Could not prepare Mission Builder draft/);
  assert.doesNotMatch(app, /Level Editor draft/);
  assert.match(workshop, /never alters another mission by surprise/);
});

test('Combat Lab exposes direct Mission, Wave, sequence, and checkpoint controls without leaving the canonical preview', async () => {
  const [app, behaviorFields] = await Promise.all([
    readDirectorSource('combat-lab', 'CombatLabApp.tsx'),
    readDirectorSource('combat-lab', 'FormationBehaviorFields.tsx')
  ]);

  assert.match(app, /<span>Mission<\/span>/);
  assert.match(app, /<span>Wave<\/span>/);
  assert.match(app, /Jump to checkpoint/);
  assert.match(app, /Run Mission/);
  assert.match(app, /Restart sequence/);
  assert.match(app, /createFocusedPreviewCampaign\(preview\.campaign/);
  assert.match(app, /<GameEditorCanvas/);
  assert.match(behaviorFields, /Entry path/);
  assert.match(behaviorFields, /Group movement/);
  assert.match(behaviorFields, /Attack behavior/);
  assert.match(behaviorFields, /Formation fire/);
  assert.match(behaviorFields, /Return \/ exit/);
});

test('Director review and preview accessibility copy uses Mission terminology', async () => {
  const [reviewBoard, levelPreview] = await Promise.all([
    readDirectorSource('review', 'ReviewBoard.tsx'),
    readDirectorSource('waves', 'LevelPreview.tsx')
  ]);

  assert.match(reviewBoard, /Live mission preview/);
  assert.doesNotMatch(reviewBoard, /Live level preview/);
  assert.match(levelPreview, /aria-label="Interactive mission preview"/);
  assert.doesNotMatch(levelPreview, /aria-label="Interactive level preview"/);
});

test('campaign documentation presents Missions while preserving level and stage-id compatibility keys', async () => {
  const [readme, types] = await Promise.all([
    readWorkspaceSource('game-config', 'README.md'),
    readWorkspaceSource('game-config', 'types.ts')
  ]);

  assert.match(readme, /player-facing Missions/);
  assert.match(readme, /`levels` property and existing `stage-\*` IDs unchanged for compatibility/);
  assert.match(types, /`levels` remains the compatibility\/config key/);
  assert.match(types, /historical `stage-\*` IDs remain compatibility identifiers/);
  assert.doesNotMatch(readme, /player-facing Stages|twenty-Stage campaign/);
});

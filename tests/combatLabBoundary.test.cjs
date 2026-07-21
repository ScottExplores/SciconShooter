const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const collectSource = (directory) => {
  const sources = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      sources.push(collectSource(absolute));
    } else if (/\.(?:ts|tsx|js|mjs)$/.test(entry.name)) {
      sources.push(fs.readFileSync(absolute, 'utf8'));
    }
  }
  return sources.join('\n');
};

test('Combat Lab has no public, serverless, or root application entrypoint', () => {
  for (const relative of [
    'public/combat-lab',
    'public/combat-lab.js',
    'api/combat-lab',
    'api/combat-lab.js'
  ]) {
    assert.equal(fs.existsSync(path.join(root, relative)), false, `${relative} must remain absent`);
  }

  const forbiddenRootMarkers = [
    'Scicon Combat Lab',
    '/combat-lab',
    'CombatLabApp',
    'scicon-combat-lab-presets-v1'
  ];

  for (const entrypoint of ['App.tsx', 'index.tsx', 'index.html']) {
    const source = read(entrypoint);
    for (const marker of forbiddenRootMarkers) {
      assert.equal(
        source.includes(marker),
        false,
        `${entrypoint} must not expose Combat Lab marker ${JSON.stringify(marker)}`
      );
    }
  }
});

test('Combat Lab is routed only inside Director and reuses the canonical game stage', () => {
  const directorMain = read('director/src/main.tsx');
  const combatLabRoot = path.join(root, 'director', 'src', 'combat-lab');
  const combatLabApp = path.join(combatLabRoot, 'CombatLabApp.tsx');

  assert.equal(fs.existsSync(combatLabApp), true, 'Director must own CombatLabApp.tsx');
  assert.match(directorMain, /['"]\.\/combat-lab\/CombatLabApp['"]/);
  assert.match(directorMain, /['"]\/combat-lab['"]/);
  assert.match(directorMain, /\bCombatLabApp\b/);

  const combatLabSource = collectSource(combatLabRoot);
  const editorCanvas = read('components/GameEditorCanvas.tsx');

  assert.match(combatLabSource, /<GameEditorCanvas\b/);
  assert.match(editorCanvas, /import GameStage from ['"]\.\/GameStage['"]/);
  assert.match(editorCanvas, /<GameStage\b/);
  assert.doesNotMatch(combatLabSource, /\bnew\s+GameEngine\s*\(/);
  assert.doesNotMatch(combatLabSource, /\bnew\s+PixiGameRenderer\s*\(/);
  assert.doesNotMatch(combatLabSource, /services\/pixi\/PixiGameRenderer/);
});

test('production output scanner rejects every Combat Lab marker', () => {
  const exclusionScript = read('tools/assert-director-excluded.mjs');
  for (const marker of [
    'Scicon Combat Lab',
    '/combat-lab',
    'scicon-combat-lab-presets-v1'
  ]) {
    assert.equal(
      exclusionScript.includes(`'${marker}'`) || exclusionScript.includes(`"${marker}"`),
      true,
      `production exclusion scanner must reject ${JSON.stringify(marker)}`
    );
  }
});

test('Combat Lab explains the draft-only workflow and keeps source refresh explicit', () => {
  const combatLab = read('director/src/combat-lab/CombatLabApp.tsx');
  const levelEditor = read('director/src/editor/LevelEditorApp.tsx');

  assert.match(combatLab, /From experiment to game/);
  assert.match(combatLab, /Play and save/);
  assert.match(combatLab, /Only Apply to game in Mission Builder updates game-config\/campaign\.json/);
  assert.match(combatLab, /Reload source/);
  assert.match(combatLab, /Draft only:/);
  assert.match(combatLab, /Review draft in Mission Builder/);
  assert.match(levelEditor, /'Apply to game'/);
});

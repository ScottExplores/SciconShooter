const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('runtime exposes ordered level and within-level wave position from campaign metadata', () => {
  const engine = read('services', 'gameLogic.ts');

  for (const field of [
    'levelNumber: number',
    'levelTotal: number',
    'waveNumber: number',
    'waveTotal: number',
    'wavePresentationRevision: number'
  ]) {
    assert.match(engine, new RegExp(field));
  }

  assert.match(engine, /levels\.forEach\(\(\{ level \}, levelIndex\) =>/);
  assert.match(engine, /waves\.forEach\(\(\{ wave \}, waveIndex\) =>/);
  assert.match(engine, /waveNumber: Math\.max\(1, \(entry\?\.waveIndex \?\? 0\) \+ 1\)/);
  assert.match(engine, /waveTotal = Math\.max\(1, entry\?\.level\.waves\.length \?\? 1\)/);
  assert.match(engine, /beginWavePresentation\(\) \{\s*this\.wavePresentationRevision\+\+;/);
  assert.match(engine, /this\.cinematicPaused = cinematicPause;/);
});

test('canonical Pixi scene reuses bitmap wave glyphs for an animated intro and a persistent counter', () => {
  const renderer = read('services', 'pixi', 'PixiGameRenderer.ts');

  assert.match(renderer, /scicon-simple-arcade-kit-v1\/wave-glyphs\/cyan/);
  assert.match(renderer, /wave-title-cyan\.png/);
  assert.match(renderer, /wave-glyph-slash-cyan\.png/);
  assert.match(renderer, /\.\.\.PIXI_WAVE_PRESENTATION_TEXTURE_URLS/);
  assert.match(renderer, /private readonly waveCounterGlyphs = Array\.from\(\{ length: 8 \}/);
  assert.match(renderer, /this\.waveBadgeText\.text = `WAVE \$\{state\.waveNumber\}\/\$\{state\.waveTotal\}`/);
  assert.match(renderer, /const narrowTopHud = this\.width < 464;/);
  assert.match(renderer, /const badgeY = narrowTopHud \? \(bossVisible \? 128 : 63\) : 20;/);
  assert.match(renderer, /this\.positionWaveBadge\(this\.bossHealthRoot\.visible\);/);
  assert.match(renderer, /LEVEL \$\{String\(state\.levelNumber\)\.padStart\(2, '0'\)\} · \$\{state\.levelName\.toUpperCase\(\)\}/);
  assert.match(renderer, /this\.waveNameText\.text = state\.waveName\.toUpperCase\(\)/);
  assert.match(renderer, /prefers-reduced-motion: reduce/);
  assert.match(renderer, /if \(!engine\.cinematicPaused\) \{\s*this\.wavePresentationElapsedMs =/);

  const updateStart = renderer.indexOf('  private updateWavePresentation(');
  const updateEnd = renderer.indexOf('\n  private createEntityView(', updateStart);
  const update = renderer.slice(updateStart, updateEnd);
  assert.ok(updateStart >= 0 && updateEnd > updateStart);
  assert.doesNotMatch(update, /new (?:Container|Graphics|Sprite|Text)\b/);
  assert.doesNotMatch(update, /collision|hitbox|damage|hp\b/i);
});

test('production and Director previews share the same wave presentation renderer', () => {
  const stage = read('components', 'GameStage.tsx');
  const editor = read('components', 'GameEditorCanvas.tsx');
  const canvas = read('components', 'GameCanvas.tsx');

  assert.match(stage, /<GameCanvas \{\.\.\.canvas\} \/>/);
  assert.match(editor, /<GameStage/);
  assert.match(canvas, /new PixiGameRenderer\(\)/);
  assert.doesNotMatch(editor, /new PixiGameRenderer\(\)/);
});

test('story transmission uses the same enclosing level identity', () => {
  const story = read('services', 'storyBeats.ts');
  assert.match(story, /title: 'Research Frontier'/);
});

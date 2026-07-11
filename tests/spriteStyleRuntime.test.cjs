const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const engineSource = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
const typesSource = fs.readFileSync(path.join(root, 'game-config', 'types.ts'), 'utf8');

test('sprite style is a typed optional setting for enemies, bosses, and asteroid belts', () => {
  assert.match(typesSource, /export interface SpriteStyle\s*{/);
  assert.equal((typesSource.match(/spriteStyle\?: SpriteStyle;/g) || []).length, 3);
});

test('configured sprite styles are copied onto every supported runtime entity', () => {
  assert.match(engineSource, /spriteStyle: enemySetting\.spriteStyle/);
  assert.match(engineSource, /overrides\.spriteStyle\) e\.spriteStyle = \{ \.\.\.overrides\.spriteStyle \}/);
  assert.match(engineSource, /configured\.spriteStyle\) mb\.spriteStyle = \{ \.\.\.configured\.spriteStyle \}/);
  assert.match(engineSource, /configured\.spriteStyle\) e\.spriteStyle = \{ \.\.\.configured\.spriteStyle \}/);
  assert.match(engineSource, /configured\.spriteStyle\) asteroid\.spriteStyle = \{ \.\.\.configured\.spriteStyle \}/);
  assert.match(engineSource, /configured\.spriteStyle\) boss\.spriteStyle = \{ \.\.\.configured\.spriteStyle \}/);
});

test('sprite presentation composes inside drawing and never mutates collision dimensions', () => {
  const drawStart = engineSource.indexOf('  drawSprite(');
  const drawEnd = engineSource.indexOf('  drawTiledLayer(', drawStart);
  assert.ok(drawStart >= 0 && drawEnd > drawStart);
  const drawSource = engineSource.slice(drawStart, drawEnd);

  assert.match(drawSource, /\(options\.alpha \?\? 1\) \* \(spriteStyle\?\.opacity \?\? 1\)/);
  assert.match(drawSource, /options\.rotation \?\? 0/);
  assert.match(drawSource, /spriteStyle\?\.rotationDegrees/);
  assert.match(drawSource, /ctx\.scale\(spriteStyle\.flipX \? -scale : scale, scale\)/);
  assert.match(drawSource, /hue-rotate/);
  assert.match(drawSource, /saturate/);
  assert.match(drawSource, /brightness/);
  assert.match(drawSource, /spriteStyle\?\.glowColor/);
  assert.match(drawSource, /spriteStyle\?\.glowBlur/);
  assert.doesNotMatch(drawSource, /(?:entity|e)\.width\s*[*/+-]?=/);
  assert.doesNotMatch(drawSource, /(?:entity|e)\.height\s*[*/+-]?=/);
  assert.match(drawSource, /spriteStyle && \(scale !== 1 \|\| spriteStyle\.flipX\)/);
});

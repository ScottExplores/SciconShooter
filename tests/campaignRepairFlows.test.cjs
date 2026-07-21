const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');

test('paywall rows recycle from the top until every segment is destroyed', () => {
  const engine = read('services', 'gameLogic.ts');

  assert.match(engine, /wallLaneX\?: number/);
  assert.match(engine, /wallRowOffset\?: number/);
  assert.match(engine, /inv\.wallPass = \(inv\.wallPass \?\? 0\) \+ 1/);
  assert.match(engine, /inv\.y = -inv\.height - \(inv\.wallRowOffset \?\? 0\)/);
  assert.match(engine, /const laneX = inv\.wallLaneX \?\? inv\.x/);
  assert.doesNotMatch(engine, /inv\.moveY \+= 15/);
});

test('the wave-three helmet disappears as soon as its component is destroyed', () => {
  const engine = read('services', 'gameLogic.ts');

  assert.match(engine, /component\.id === 'helmet' && component\.destroyed/);
  assert.match(engine, /boss\.bossDecayStage = helmetDestroyed[\s\S]*?\? healthRatio <= 0\.2 \? 4 : healthRatio <= 0\.45 \? 3 : 2/);
});

test('story transmissions are remembered per beat for the current local day', () => {
  const schedule = read('services', 'storyTransmissionSchedule.ts');
  const app = read('App.tsx');

  assert.match(schedule, /scicon:story-transmissions:daily:v1/);
  assert.match(schedule, /getStoryBeatDailyId = \(beat: Pick<StoryBeat, 'phase' \| 'title'>\)/);
  assert.match(schedule, /parsed\.dayKey !== dayKey/);
  assert.match(app, /!hasSeenStoryBeatToday\(introBeat\)/);
  assert.match(app, /markStoryBeatSeenToday\(activeStoryBeat\)/);
  assert.match(app, /!hasSeenStoryBeatToday\(nextBeat\)/);
});

test('the More menu no longer advertises the source repository', () => {
  const startScreen = read('components', 'StartScreen.tsx');

  assert.doesNotMatch(startScreen, />Open Source</);
  assert.doesNotMatch(startScreen, /github\.com\/ScottExplores\/SciconShooter/);
});

test('upgrade drops render as larger unframed sprites in Pixi and canvas', () => {
  const pixi = read('services', 'pixi', 'PixiGameRenderer.ts');
  const engine = read('services', 'gameLogic.ts');
  const pixiStart = pixi.lastIndexOf('} else if (entity.type === EntityType.POWERUP)');
  const pixiPowerup = pixi.slice(pixiStart, pixi.indexOf('\n    }\n\n    if (entity.isElite', pixiStart));
  const canvasStart = engine.lastIndexOf('} else if (e.type === EntityType.POWERUP)');
  const canvasPowerup = engine.slice(canvasStart, engine.indexOf('} else if (e.type === EntityType.MINI_BOSS)', canvasStart));

  assert.match(pixiPowerup, /view\.root\.scale\.set\(1\.22\)/);
  assert.match(pixiPowerup, /view\.aura\.clear\(\)/);
  assert.doesNotMatch(pixiPowerup, /\.circle\(/);
  assert.match(canvasPowerup, /ctx\.drawImage\(img, -23, -23, 46, 46\)/);
  assert.doesNotMatch(canvasPowerup, /ctx\.arc\(/);
});

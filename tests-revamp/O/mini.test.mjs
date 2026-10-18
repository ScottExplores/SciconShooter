import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const oldImage = globalThis.Image;
globalThis.Image = class { complete = false; naturalWidth = 0; };
const temp = await mkdtemp(join(tmpdir(), 'scicon-O-mini-'));
after(async () => { globalThis.Image = oldImage; await rm(temp, { recursive: true, force: true }); });
const compiled = await build({ stdin: { contents: `export * from './services/gameLogic.ts';
 export * from './services/combatLab.ts'; export * from './services/levelConfig.ts';
 export * from './services/revamp/bosses/bossLab.ts'; export * from './services/revamp/bosses/labRoster.ts';
 export * from './services/revamp/bosses/miniInteractive.ts'; export * from './services/revamp/qa/interactiveBoss.ts';
 export * from './types.ts';`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false,
 platform: 'node', format: 'esm', target: 'es2022', define: { 'import.meta.env': '{}' } });
const modulePath = join(temp, 'mini.mjs'); await writeFile(modulePath, compiled.outputFiles[0].text);
const { GameEngine, createCombatLabStats, DEFAULT_GAME_CAMPAIGN, createBossLabEncounter, INTERACTIVE_MINI_BOSSES,
 getInteractiveMini, interactiveMiniCanEmit, interactiveMiniGeneration, acceptInteractiveMiniHazard,
 readInteractiveBoss, commandInteractiveBoss, EntityType } = await import(pathToFileURL(modulePath).href);

const fight = (profile, frames = 240) => {
 const encounter = createBossLabEncounter(DEFAULT_GAME_CAMPAIGN, profile);
 const engine = new GameEngine(createCombatLabStats(), { campaign: encounter.campaign, previewMode: true,
 previewInvincible: true, initialLevelId: encounter.levelId, initialWaveId: encounter.waveId,
 randomSeed: 12345, audioEnabled: false, preloadCanvasAssets: false });
 engine.init(390, 844);
 for (let n = 0; n < frames; n++) engine.update();
 return { engine, encounter, owners: engine.entities.filter(entity => getInteractiveMini(entity)) };
};

test('all ten mini IDs launch exact original campaign artwork/choreography with reachable hardware', () => {
 const source = JSON.stringify(DEFAULT_GAME_CAMPAIGN);
 const reviewedMounts = { 'bottleneck-drone': 0.68, 'railspine-wallcrawler': 0.68,
  'gridline-sentries': 0.68, 'aegis-convoy-captain': 0.74 };
 for (const profile of INTERACTIVE_MINI_BOSSES) {
  const { engine, owners, encounter } = fight(profile);
  assert.ok(owners.length > 0, profile.id);
  const event = encounter.campaign.levels.find(l => l.id === encounter.levelId).waves.find(w => w.id === encounter.waveId).events[0];
  assert.equal(event.bossId, profile.sourceBossId);
  for (const owner of owners) {
   assert.equal(owner.sourceItemId, profile.id);
   const state = getInteractiveMini(owner);
   if (profile.id === 'paywall-wall') { assert.equal(state.wall, true); continue; }
   assert.equal(state.parts.length, 2);
   for (const [index, part] of state.parts.entries()) {
    assert.equal(owner.bossComponents[index].centerYRatio, reviewedMounts[profile.id] ?? 0.9,
      'each source keeps its reviewed painted-hull attachment band');
    assert.ok(part.x >= owner.x && part.x <= owner.x + owner.width);
    assert.ok(part.y >= owner.y && part.y <= owner.y + owner.height);
    if (profile.id === 'bottleneck-drone') assert.ok(Math.abs(part.y - owner.y - owner.height * 0.68) < 1e-8);
    if (owner.miniBossLabDamageable || !owner.miniBossLabEncounterId) {
     assert.ok(engine.getBossComponentHit(owner, { x: part.x - 1, y: part.y - 1, width: 2, height: 2 }), profile.id);
    }
   }
  }
  assert.equal(readInteractiveBoss(engine)?.id, profile.id);
 }
 assert.equal(JSON.stringify(DEFAULT_GAME_CAMPAIGN), source);
});

test('drone armaments absorb travelling shots; break gates expose a periodically opening core', () => {
 const { engine, owners: [boss] } = fight(INTERACTIVE_MINI_BOSSES[0]);
 const state = getInteractiveMini(boss); const original = boss.hp;
 for (const part of [...state.parts].reverse()) {
  for (let n = 0; n < 200 && state.stage === 'transition'; n++) engine.update();
  const shot = engine.createEntity(EntityType.PROJECTILE, part.x - 3, boss.y + boss.height + 30);
  Object.assign(shot, { width: 6, height: 6, vy: -5, isPlayerShot: true, damage: part.maxHp * 3 });
  engine.entities.push(shot);
  for (let n = 0; n < 60 && !part.broken; n++) engine.update();
  assert.ok(part.broken, part.id);
  if (part.id === 'right-cannon') assert.equal(state.parts[0].broken, false, 'aimed right hit must not redirect into the left cannon');
 }
 assert.equal(state.phase, 2); assert.equal(boss.hp, original * 0.6);
 assert.equal(interactiveMiniCanEmit(boss, true), false);
 assert.equal(engine.entities.filter(e => e.type === EntityType.COIN).length, 2);
 let opened = false; let closed = false;
 for (let n = 0; n < 600; n++) { engine.update(); opened ||= state.openAmount === 1; closed ||= opened && state.openAmount === 0; }
 assert.ok(opened && closed, 'core opens and closes in fixed simulation time');
});

test('mini damage and QA commands respect intro/guard gates and reject absent part IDs', () => {
 const { engine, owners: [boss] } = fight(INTERACTIVE_MINI_BOSSES[0]);
 const state = getInteractiveMini(boss);
 assert.deepEqual(commandInteractiveBoss(engine, { type: 'damage-part', partId: 'missing', amount: 1e6 }), { accepted: false, damage: 0 });
 const part = state.parts[0]; const before = part.hp; state.stage = 'intro';
 engine.damageBossHull(boss, 1e6); assert.equal(part.hp, before);
 state.stage = 'fire';
 assert.equal(commandInteractiveBoss(engine, { type: 'damage-part', partId: part.id, amount: part.maxHp }).accepted, true);
 assert.equal(commandInteractiveBoss(engine, { type: 'damage-part', partId: part.id, amount: part.maxHp }).accepted, false);
});

test('a shell break invalidates queued generations and requires a fresh complete warning', () => {
 const { engine, owners: [boss] } = fight(INTERACTIVE_MINI_BOSSES[0]);
 const state = getInteractiveMini(boss); state.stage = 'fire';
 const generation = interactiveMiniGeneration(boss);
 assert.equal(acceptInteractiveMiniHazard(boss, 'core', true, 100, false), true);
 assert.equal(acceptInteractiveMiniHazard(boss, 'core', false, 135, false), false);
 assert.equal(acceptInteractiveMiniHazard(boss, 'core', false, 136, false), true);
 engine.damageBossComponent(boss, boss.bossComponents[0], 1e6);
 for (let n = 0; n < 60; n++) engine.update();
 assert.equal(interactiveMiniCanEmit(boss, false, generation), false);
 assert.equal(acceptInteractiveMiniHazard(boss, 'core', false, 200, false), false);
 assert.equal(interactiveMiniCanEmit(boss, true), false);
});

test('each wall volley has an actual 48-frame vent warning and a surviving owner', () => {
 const { engine } = fight(INTERACTIVE_MINI_BOSSES[1], 40);
 const warnings = []; const shots = [];
 const playSound = engine.playSound.bind(engine);
 const spawn = engine.spawnGeneratedBossProjectile.bind(engine);
 engine.playSound = (name, ...args) => { if (name === 'boss_alert') warnings.push(engine.frameCount); return playSound(name, ...args); };
 engine.spawnGeneratedBossProjectile = (owner, ...args) => { shots.push({ frame: engine.frameCount, owner }); return spawn(owner, ...args); };
 for (let n = 0; n < 320 && !shots.length; n++) engine.update();
 assert.ok(shots.length, 'wall must fire');
 assert.ok(warnings.length, 'wall must visibly charge');
 for (const shot of shots) {
  assert.ok(shot.frame - warnings.at(-1) >= 48);
  assert.ok(shot.owner.hp > 0 && !shot.owner.markedForDeletion);
 }
});

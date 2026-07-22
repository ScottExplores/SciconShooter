const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const archetypeSource = fs.readFileSync(
  path.join(root, 'services', 'generatedBossArchetypes.ts'),
  'utf8'
);
const engineSource = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');

const loadArchetypes = () => {
  const compiled = ts.transpileModule(archetypeSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(
    `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
    { module, require, Math, Number, Object }
  );
  return module.exports;
};

test('all nine generated Gatekeeper encounters resolve to eight stable boss archetypes', () => {
  const campaign = JSON.parse(fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8'));
  const { GENERATED_BOSS_ARCHETYPE_BY_ASSET_KEY, resolveGeneratedBossArchetype } = loadArchetypes();
  const generatedBosses = campaign.levels
    .flatMap((level) => level.waves)
    .flatMap((wave) => wave.events)
    .filter((event) => event.kind === 'boss' && event.spriteKey in GENERATED_BOSS_ARCHETYPE_BY_ASSET_KEY)
    .map((event) => ({
      id: event.id,
      spriteKey: event.spriteKey,
      archetype: resolveGeneratedBossArchetype(event.spriteKey)
    }));

  assert.equal(Object.keys(GENERATED_BOSS_ARCHETYPE_BY_ASSET_KEY).length, 8);
  assert.equal(generatedBosses.length, 9, 'Eclipse Engine is intentionally reused by two encounters');
  assert.deepEqual(
    JSON.parse(JSON.stringify(generatedBosses)),
    [
      { id: 'redline-corridor-final-boss', spriteKey: 'CAMPAIGN_BOSS_RAIL_SERPENT', archetype: 'rail-serpent' },
      { id: 'mirror-array-final-boss', spriteKey: 'CAMPAIGN_BOSS_PRISM_MOTH', archetype: 'prism-moth' },
      { id: 'null-sector-final-boss', spriteKey: 'CAMPAIGN_BOSS_ECLIPSE_ENGINE', archetype: 'eclipse-engine' },
      { id: 'quantum-cage-final-boss', spriteKey: 'CAMPAIGN_BOSS_ORBIT_GYROSCOPE', archetype: 'orbit-gyroscope' },
      { id: 'gravity-well-final-boss', spriteKey: 'CAMPAIGN_BOSS_SINGULARITY_CRAB', archetype: 'singularity-crab' },
      { id: 'ion-citadel-final-boss', spriteKey: 'CAMPAIGN_BOSS_HELIX_LEVIATHAN', archetype: 'helix-leviathan' },
      { id: 'crimson-vector-final-boss', spriteKey: 'CAMPAIGN_BOSS_HAMMERHEAD_SIEGE', archetype: 'hammerhead-siege' },
      { id: 'fracture-engine-final-boss', spriteKey: 'CAMPAIGN_BOSS_ECLIPSE_ENGINE', archetype: 'eclipse-engine' },
      { id: 'terminus-ascendant-final-boss', spriteKey: 'CAMPAIGN_BOSS_TRIBUNAL_DREADNOUGHT', archetype: 'tribunal-dreadnought' }
    ]
  );
  assert.equal(resolveGeneratedBossArchetype('PLAYER_SHIP'), null);
});

test('each generated boss has a deterministic and materially distinct cue schedule', () => {
  const { getGeneratedBossTechniqueCue } = loadArchetypes();
  const cue = (archetype, frame, phase = 1) => (
    getGeneratedBossTechniqueCue(archetype, frame, phase)?.technique ?? null
  );

  assert.equal(cue('rail-serpent', 86), 'rail-telegraph');
  assert.equal(cue('rail-serpent', 118), 'rail-fire');
  assert.equal(cue('prism-moth', 72), 'prism-gap-ring');
  assert.equal(cue('singularity-crab', 82), 'singularity-collapse');
  assert.equal(cue('orbit-gyroscope', 48), 'orbit-cross');
  assert.equal(cue('helix-leviathan', 44), 'helix-left');
  assert.equal(cue('helix-leviathan', 138), 'helix-right');
  assert.equal(cue('hammerhead-siege', 52), 'hammerhead-port');
  assert.equal(cue('hammerhead-siege', 180), 'hammerhead-starboard');
  assert.equal(cue('eclipse-engine', 76), 'eclipse-dark-pulse');

  const deterministicCue = getGeneratedBossTechniqueCue('prism-moth', 72, 3);
  assert.deepEqual(
    JSON.parse(JSON.stringify(getGeneratedBossTechniqueCue('prism-moth', 72, 3))),
    JSON.parse(JSON.stringify(deterministicCue))
  );
  assert.doesNotMatch(archetypeSource, /Math\.random/);
});

test('Tribunal Dreadnought changes vocabulary by phase and rotates its final mix', () => {
  const { getGeneratedBossTechniqueCue } = loadArchetypes();
  const technique = (frame, phase) => (
    getGeneratedBossTechniqueCue('tribunal-dreadnought', frame, phase)?.technique ?? null
  );

  assert.equal(technique(78, 1), 'rail-telegraph');
  assert.equal(technique(110, 1), 'rail-fire');
  assert.equal(technique(66, 2), 'prism-gap-ring');
  assert.equal(technique(206, 2), 'orbit-cross');
  assert.deepEqual(
    [54, 166, 278, 390, 502, 614].map((frame) => technique(frame, 3)),
    ['helix-left', 'hammerhead-port', 'eclipse-dark-pulse', 'singularity-collapse', 'helix-right', 'hammerhead-starboard']
  );
});

test('runtime routes generated archetypes before generic arena roaming and bounds attack density', () => {
  const { MAX_GENERATED_BOSS_PROJECTILES_PER_CUE } = loadArchetypes();
  const updateBoss = engineSource.slice(
    engineSource.indexOf('updateBoss(boss: Entity)'),
    engineSource.indexOf('spawnPowerup(', engineSource.indexOf('updateBoss(boss: Entity)'))
  );

  assert.equal(MAX_GENERATED_BOSS_PROJECTILES_PER_CUE, 24);
  assert.match(engineSource, /boss\.bossAttackArchetype = resolveGeneratedBossArchetype\(configured\.spriteKey\)/);
  assert.match(updateBoss, /if \(boss\.bossAttackArchetype\)/);
  assert.ok(
    updateBoss.indexOf('if (boss.bossAttackArchetype)') < updateBoss.indexOf('this.updateEscalationBossAttacks(boss)'),
    'authored archetypes bypass the shared escalation and arena-roam layers'
  );
  assert.match(engineSource, /Math\.min\(MAX_GENERATED_BOSS_PROJECTILES_PER_CUE, requestedCount\)/);
  assert.match(engineSource, /const requestedCount = \(this\.mobileProfile \? 14 : 18\) \+ phase \* 2/);
  assert.match(engineSource, /component\?\.destroyed/);
  assert.match(engineSource, /PORT DISABLED|\$\{side\.toUpperCase\(\)\} DISABLED/);
});

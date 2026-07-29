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

test('the generated revision-23 sector bosses resolve through the stable archetype catalog', () => {
  const campaign = JSON.parse(fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8'));
  const { GENERATED_BOSS_ARCHETYPE_BY_ASSET_KEY, resolveGeneratedBossArchetype } = loadArchetypes();
  const sectorBosses = campaign.sectors.map((sector) => {
    const mission = campaign.levels.find((level) => level.id === sector.missionIds.at(-1));
    const event = mission.waves.flatMap((wave) => wave.events).find((candidate) => candidate.kind === 'boss');
    assert.equal(mission.campaignProgression.missionRole, 'major-boss');
    assert.equal(mission.waves.length, 4, `${mission.name} teaches, varies, recovers, then launches its boss`);
    assert.equal(event.bossId, sector.majorBossId);
    return { missionId: mission.id, event };
  });
  const generatedBosses = sectorBosses
    .filter(({ event }) => event.spriteKey in GENERATED_BOSS_ARCHETYPE_BY_ASSET_KEY)
    .map((event) => ({
      id: event.event.id,
      spriteKey: event.event.spriteKey,
      archetype: resolveGeneratedBossArchetype(event.event.spriteKey)
    }));

  assert.equal(campaign.revision, 23);
  assert.equal(campaign.sectors.length, 10);
  assert.equal(sectorBosses.length, 10);
  assert.equal(Object.keys(GENERATED_BOSS_ARCHETYPE_BY_ASSET_KEY).length, 8);
  assert.equal(
    resolveGeneratedBossArchetype(sectorBosses[0].event.spriteKey),
    null,
    'Gatekeeper Prime retains its dedicated Boss Factory runtime'
  );
  assert.equal(generatedBosses.length, 8);
  assert.deepEqual(
    JSON.parse(JSON.stringify(generatedBosses)),
    [
      { id: 'stage-null-sector-major-boss', spriteKey: 'CAMPAIGN_BOSS_ECLIPSE_ENGINE', archetype: 'eclipse-engine' },
      { id: 'stage-ion-citadel-major-boss', spriteKey: 'CAMPAIGN_BOSS_HELIX_LEVIATHAN', archetype: 'helix-leviathan' },
      { id: 'stage-terminus-ascendant-major-boss', spriteKey: 'CAMPAIGN_BOSS_TRIBUNAL_DREADNOUGHT', archetype: 'tribunal-dreadnought' },
      { id: 'stage-prism-expanse-commander-major-boss', spriteKey: 'CAMPAIGN_BOSS_PRISM_MOTH', archetype: 'prism-moth' },
      { id: 'stage-rail-meridian-commander-major-boss', spriteKey: 'CAMPAIGN_BOSS_RAIL_SERPENT', archetype: 'rail-serpent' },
      { id: 'stage-singularity-reach-commander-major-boss', spriteKey: 'CAMPAIGN_BOSS_SINGULARITY_CRAB', archetype: 'singularity-crab' },
      { id: 'stage-gyroscope-array-commander-major-boss', spriteKey: 'CAMPAIGN_BOSS_ORBIT_GYROSCOPE', archetype: 'orbit-gyroscope' },
      { id: 'stage-hammerhead-line-commander-major-boss', spriteKey: 'CAMPAIGN_BOSS_HAMMERHEAD_SIEGE', archetype: 'hammerhead-siege' }
    ]
  );
  assert.equal(resolveGeneratedBossArchetype('PLAYER_SHIP'), null);
});

test('each generated boss has a deterministic and materially distinct cue schedule', () => {
  const { getGeneratedBossTechniqueCue } = loadArchetypes();
  const cue = (archetype, frame, phase = 1) => (
    getGeneratedBossTechniqueCue(archetype, frame, phase)?.technique ?? null
  );

  assert.equal(cue('rail-serpent', 78), 'rail-telegraph');
  assert.equal(cue('rail-serpent', 112), 'rail-fire');
  assert.equal(cue('rail-serpent', 332, 2), 'rail-tail-telegraph');
  assert.equal(cue('rail-serpent', 356, 2), 'rail-tail-volley');
  assert.equal(cue('prism-moth', 42), 'prism-telegraph');
  assert.equal(cue('prism-moth', 72), 'prism-gap-ring');
  assert.equal(cue('singularity-crab', 48), 'singularity-telegraph');
  assert.equal(cue('singularity-crab', 82), 'singularity-collapse');
  assert.equal(cue('orbit-gyroscope', 22), 'orbit-telegraph');
  assert.equal(cue('orbit-gyroscope', 48), 'orbit-cross');
  assert.equal(cue('helix-leviathan', 20), 'helix-left-telegraph');
  assert.equal(cue('helix-leviathan', 44), 'helix-left');
  assert.equal(cue('helix-leviathan', 116), 'helix-right-telegraph');
  assert.equal(cue('helix-leviathan', 140), 'helix-right');
  assert.equal(cue('hammerhead-siege', 24), 'hammerhead-port-telegraph');
  assert.equal(cue('hammerhead-siege', 52), 'hammerhead-port');
  assert.equal(cue('hammerhead-siege', 156), 'hammerhead-starboard-telegraph');
  assert.equal(cue('hammerhead-siege', 184), 'hammerhead-starboard');
  assert.equal(cue('eclipse-engine', 44), 'eclipse-telegraph');
  assert.equal(cue('eclipse-engine', 76), 'eclipse-dark-pulse');

  const deterministicCue = getGeneratedBossTechniqueCue('prism-moth', 72, 3);
  assert.deepEqual(
    JSON.parse(JSON.stringify(getGeneratedBossTechniqueCue('prism-moth', 72, 3))),
    JSON.parse(JSON.stringify(deterministicCue))
  );
  assert.doesNotMatch(archetypeSource, /Math\.random/);
});

test('every generated preview attack resolves to its matching warning frame', () => {
  const {
    GENERATED_BOSS_FIRE_TELEGRAPH,
    GENERATED_BOSS_PREVIEW_ATTACKS,
    getGeneratedBossPreviewAttackStart,
    getGeneratedBossPreviewAttackWindow,
    getGeneratedBossTechniqueCue
  } = loadArchetypes();
  let attackCount = 0;

  for (const [archetype, attacks] of Object.entries(GENERATED_BOSS_PREVIEW_ATTACKS)) {
    for (const attack of attacks) {
      attackCount += 1;
      const start = getGeneratedBossPreviewAttackStart(archetype, attack.id);
      const window = getGeneratedBossPreviewAttackWindow(archetype, attack.id);
      assert.ok(start, `${attack.id} needs a bounded preview lookup`);
      assert.ok(window, `${attack.id} needs a bounded replay window`);
      assert.equal(start.phase, attack.phase);
      assert.equal(window.phase, attack.phase);
      assert.equal(window.startFrame, start.startFrame);

      const warning = getGeneratedBossTechniqueCue(
        archetype,
        start.startFrame,
        start.phase
      );
      assert.ok(warning, `${attack.id} must start on a real warning cue`);
      assert.equal(warning.stage, 'warning');
      assert.equal(warning.sequence, attack.sequence);
      assert.equal(
        warning.technique,
        GENERATED_BOSS_FIRE_TELEGRAPH[attack.fireTechnique]
      );

      const fireFrame = start.startFrame + warning.warningFrames;
      const fire = getGeneratedBossTechniqueCue(archetype, fireFrame, start.phase);
      assert.ok(fire, `${attack.id} must reach its paired fire cue`);
      assert.equal(fire.stage, 'fire');
      assert.equal(fire.sequence, attack.sequence);
      assert.equal(fire.technique, attack.fireTechnique);
      assert.equal(window.endFrame, fireFrame + fire.recoveryFrames);
      assert.ok(window.endFrame > fireFrame);
    }
  }

  assert.equal(attackCount, 19);
  assert.equal(
    getGeneratedBossPreviewAttackStart('rail-serpent', 'generated:missing'),
    null
  );
  assert.equal(
    getGeneratedBossPreviewAttackWindow('rail-serpent', 'generated:missing'),
    null
  );
});

test('Tribunal Dreadnought changes vocabulary by phase and rotates its final mix', () => {
  const { getGeneratedBossTechniqueCue } = loadArchetypes();
  const technique = (frame, phase) => (
    getGeneratedBossTechniqueCue('tribunal-dreadnought', frame, phase)?.technique ?? null
  );

  assert.equal(technique(78, 1), 'rail-telegraph');
  assert.equal(technique(110, 1), 'rail-fire');
  assert.equal(technique(34, 2), 'prism-telegraph');
  assert.equal(technique(66, 2), 'prism-gap-ring');
  assert.equal(technique(174, 2), 'orbit-telegraph');
  assert.equal(technique(206, 2), 'orbit-cross');
  assert.deepEqual(
    [22, 134, 246, 358, 470, 582].map((frame) => technique(frame, 3)),
    [
      'helix-left-telegraph',
      'hammerhead-port-telegraph',
      'eclipse-telegraph',
      'singularity-telegraph',
      'helix-right-telegraph',
      'hammerhead-starboard-telegraph'
    ]
  );
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
  assert.match(engineSource, /getCampaignGeneratedBossProjectileBudget\(boss: Entity, fallbackCount: number\)/);
  assert.match(engineSource, /endsWith\('-major-boss'\)/);
  assert.match(engineSource, /Math\.floor\(authoredBurstCount\) \* 3/);
  assert.match(engineSource, /this\.getCampaignGeneratedBossProjectileBudget\(boss, fallbackCount\)/);
  assert.match(engineSource, /requestedComponent\?\.destroyed/);
  assert.match(engineSource, /allCannonsDestroyed/);
  assert.match(engineSource, /motionCue === 'gatling-barrage'/);
  assert.match(engineSource, /this\.spawnBossGatlingPulse/);
});

test('runtime presents every generated warning without damage and resets phase timing', () => {
  const warningHandlerStart = engineSource.indexOf('  spawnGeneratedBossTechniqueWarning(');
  const warningHandlerEnd = engineSource.indexOf('\n  spawnBossTailFan(', warningHandlerStart);
  const warningHandler = engineSource.slice(warningHandlerStart, warningHandlerEnd);
  const runtimeStart = engineSource.indexOf('  updateGeneratedBossArchetype(');
  const runtimeEnd = engineSource.indexOf('\n  updateArenaRoamingBoss(', runtimeStart);
  const runtime = engineSource.slice(runtimeStart, runtimeEnd);

  for (const cue of [
    'rail-tail-telegraph',
    'prism-telegraph',
    'singularity-telegraph',
    'orbit-telegraph',
    'helix-left-telegraph',
    'helix-right-telegraph',
    'hammerhead-port-telegraph',
    'hammerhead-starboard-telegraph',
    'eclipse-telegraph'
  ]) {
    assert.match(warningHandler, new RegExp(cue));
  }
  assert.doesNotMatch(warningHandler, /spawnGeneratedBossProjectile|damage\s*=/);
  assert.match(runtime, /if \(cue\.stage === 'warning'\)/);
  assert.match(runtime, /this\.spawnGeneratedBossTechniqueWarning\(boss, cue\)/);
  assert.match(runtime, /if \(cue\.technique === 'rail-tail-volley'\)/);
  assert.match(runtime, /if \(cue\.technique === 'eclipse-dark-pulse'\)/);
  assert.equal(
    (runtime.match(/this\.spawnBossSafeGapRing\([\s\S]*?boss,[\s\S]*?cue\.sequence,[\s\S]*?phase,[\s\S]*?true,[\s\S]*?this\.getCampaignGeneratedBossProjectileBudget\(boss, fallbackCount\)[\s\S]*?\)/g) || []).length,
    1,
    'dark pulse has one explicit fire route rather than a warning fallthrough'
  );
  assert.match(engineSource, /boss\.attackTimer = 0;[\s\S]*boss\.generatedBossChargeUntilTimer = -1/);
  assert.match(runtime, /const authoredCadenceScale = isAuthoredCampaignBoss/);
  assert.match(runtime, /techniqueTimer === boss\.generatedBossTechniqueTimer/);
  assert.match(runtime, /boss\.generatedBossTechniqueTimer = techniqueTimer/);
  assert.match(engineSource, /if \(String\(boss\.sourceEventId \?\? ''\)\.endsWith\('-major-boss'\)\) return/);
});

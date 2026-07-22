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

const collectCues = (getCue, archetype, phase, frameCount = 1800) => {
  const cues = [];
  for (let frame = 0; frame < frameCount; frame += 1) {
    const cue = getCue(archetype, frame, phase);
    if (cue) cues.push({ frame, ...cue });
  }
  return cues;
};

const loadCollapseTargetHelper = () => {
  const start = engineSource.indexOf('export const getBossInwardCollapseTarget');
  const end = engineSource.indexOf('\nconst moveToward', start);
  assert.ok(start >= 0 && end > start, 'collapse target helper is extractable');
  const compiled = ts.transpileModule(engineSource.slice(start, end), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(
    `(function(exports, require, module) { const clamp = (value, min, max) => Math.max(min, Math.min(max, value)); ${compiled} })(module.exports, require, module);`,
    { module, require, Math, Number }
  );
  return module.exports.getBossInwardCollapseTarget;
};

test('Stage 6 Violet Arbiter keeps its health budget while reducing stacked pressure', () => {
  const campaign = JSON.parse(fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8'));
  const stage = campaign.levels.find((level) => level.order === 6);
  const boss = stage.waves
    .flatMap((wave) => wave.events)
    .find((event) => event.id === 'helix-convergence-final-boss');

  assert.ok(boss);
  assert.equal(boss.health, 820);
  assert.equal(boss.shieldCount, 0);
  assert.equal(boss.speed, 2.05);

  const burst = boss.weapons.find((weapon) => weapon.id === 'helix-convergence-radial-burst');
  assert.deepEqual(
    {
      attackIntervalSeconds: burst.attackIntervalSeconds,
      projectileSpeed: burst.projectileSpeed,
      burstCount: burst.burstCount
    },
    { attackIntervalSeconds: 1.05, projectileSpeed: 7.8, burstCount: 7 }
  );

  assert.deepEqual(
    boss.phases.map((phase) => ({
      id: phase.id,
      triggerHealthRatio: phase.triggerHealthRatio,
      speedMultiplier: phase.speedMultiplier
    })),
    [
      { id: 'helix-convergence-phase-control', triggerHealthRatio: 1, speedMultiplier: 1 },
      { id: 'helix-convergence-phase-crossfire', triggerHealthRatio: 0.6, speedMultiplier: 1.08 },
      { id: 'helix-convergence-phase-collapse', triggerHealthRatio: 0.24, speedMultiplier: 1.18 }
    ]
  );

  assert.match(engineSource, /isVioletArbiter \? 420/);
  assert.match(engineSource, /isVioletArbiter \? 510/);
  assert.match(engineSource, /isVioletArbiter \? 60 : 54/);
  assert.match(engineSource, /Math\.max\(330, 354 - Math\.round\(pressure \* 24\)\)/);
  assert.match(engineSource, /cycleLength - \(isVioletArbiter \? 76 : 70\)/);
  assert.match(engineSource, /const lifetime = telegraph \? 46 : 26/);
});

test('every generated heavy attack is preceded by its paired warning and followed by recovery', () => {
  const {
    GENERATED_BOSS_ARCHETYPE_BY_ASSET_KEY,
    GENERATED_BOSS_FIRE_TELEGRAPH,
    MIN_GENERATED_BOSS_RECOVERY_FRAMES,
    MIN_GENERATED_BOSS_WARNING_FRAMES,
    getGeneratedBossTechniqueCue
  } = loadArchetypes();
  const archetypes = [...new Set(Object.values(GENERATED_BOSS_ARCHETYPE_BY_ASSET_KEY))];

  for (const archetype of archetypes) {
    for (const phase of [1, 2, 3]) {
      const cues = collectCues(getGeneratedBossTechniqueCue, archetype, phase);
      const fireCues = cues.filter((cue) => cue.stage === 'fire');
      assert.ok(fireCues.length > 0, `${archetype} phase ${phase} fires`);

      for (const fireCue of fireCues) {
        const expectedWarning = GENERATED_BOSS_FIRE_TELEGRAPH[fireCue.technique];
        assert.ok(expectedWarning, `${fireCue.technique} has a warning mapping`);
        const warningCue = cues.find((cue) => (
          cue.stage === 'warning'
          && cue.sequence === fireCue.sequence
          && cue.technique === expectedWarning
          && cue.frame < fireCue.frame
        ));
        assert.ok(warningCue, `${archetype} ${fireCue.technique} is warned`);
        assert.equal(fireCue.frame - warningCue.frame, fireCue.warningFrames);
        assert.ok(
          fireCue.warningFrames >= MIN_GENERATED_BOSS_WARNING_FRAMES,
          `${archetype} ${fireCue.technique} gives a readable warning`
        );
        assert.ok(
          fireCue.recoveryFrames >= MIN_GENERATED_BOSS_RECOVERY_FRAMES,
          `${archetype} ${fireCue.technique} reserves recovery`
        );

        const nextWarning = cues.find((cue) => cue.stage === 'warning' && cue.frame > fireCue.frame);
        if (nextWarning) {
          assert.ok(
            nextWarning.frame - fireCue.frame >= fireCue.recoveryFrames,
            `${archetype} ${fireCue.technique} does not overlap the next warning`
          );
        }
      }
    }
  }
});

test('generated schedules escalate by phase without exceeding deterministic density caps', () => {
  const {
    GENERATED_BOSS_ARCHETYPE_BY_ASSET_KEY,
    MAX_GENERATED_BOSS_PROJECTILES_PER_CUE,
    getGeneratedBossTechniqueCue
  } = loadArchetypes();
  const expectedCycleLengths = {
    'rail-serpent': [196, 184, 172],
    'prism-moth': [150, 136, 124],
    'singularity-crab': [176, 160, 146],
    'orbit-gyroscope': [116, 104, 94],
    'helix-leviathan': [96, 84, 74],
    'hammerhead-siege': [132, 116, 104],
    'eclipse-engine': [164, 148, 132],
    'tribunal-dreadnought': [196, 140, 112]
  };

  assert.equal(MAX_GENERATED_BOSS_PROJECTILES_PER_CUE, 24);
  assert.doesNotMatch(archetypeSource, /Math\.random/);

  const archetypes = [...new Set(Object.values(GENERATED_BOSS_ARCHETYPE_BY_ASSET_KEY))];
  for (const archetype of archetypes) {
    for (const phase of [1, 2, 3]) {
      const cues = collectCues(getGeneratedBossTechniqueCue, archetype, phase, 600);
      assert.equal(cues[0].cycleLength, expectedCycleLengths[archetype][phase - 1]);
      const fireFrames = cues.filter((cue) => cue.stage === 'fire').map((cue) => cue.frame);
      assert.ok(fireFrames.length <= 9, `${archetype} phase ${phase} stays below 9 heavy fires per 10 seconds`);
      for (let index = 1; index < fireFrames.length; index += 1) {
        assert.ok(
          fireFrames[index] - fireFrames[index - 1] >= 32,
          `${archetype} phase ${phase} never stacks heavy fire cues`
        );
      }
    }
  }
});

test('singularity warnings lock the same dodge target used by the later collapse', () => {
  const getTarget = loadCollapseTargetHelper();
  const warnedTarget = getTarget(120, 610, 3, 430, 860);
  const laterPlayerTarget = getTarget(340, 430, 3, 430, 860);
  assert.notDeepEqual(warnedTarget, laterPlayerTarget, 'moving after warning would otherwise shift the target');

  assert.match(engineSource, /boss\.generatedBossTargetX = singularityTarget\.x/);
  assert.match(engineSource, /boss\.generatedBossTargetSequence = cue\.sequence/);
  assert.match(engineSource, /boss\.generatedBossTargetSequence === sequence/);
  assert.match(engineSource, /const targetX = hasLockedTarget \? Number\(boss\.generatedBossTargetX\) : fallbackTarget\.x/);
  assert.match(engineSource, /boss\.generatedBossTargetSequence = -1/);
});

test('pending missiles wait for a quiet frame instead of overlapping boss beams', () => {
  const start = engineSource.indexOf('  updatePendingBossStrikes()');
  const end = engineSource.indexOf('\n  updateEscalationBossAttacks(', start);
  const method = engineSource.slice(start, end);
  assert.match(method, /ownerHasActiveBeam/);
  assert.match(method, /owner\.isCharging \|\| ownerHasActiveBeam/);
  assert.match(method, /strike\.frames = 1/);
  assert.match(method, /continue/);
});

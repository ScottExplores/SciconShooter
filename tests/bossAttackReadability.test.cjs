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

const loadCrossBeamLifetimeHelper = () => {
  const methodStart = engineSource.indexOf('spawnBossCrossBeamPair(');
  const lifetimeStart = engineSource.indexOf('const lifetime = telegraph', methodStart);
  const lifetimeEnd = engineSource.indexOf(';', lifetimeStart) + 1;
  assert.ok(
    methodStart >= 0 && lifetimeStart > methodStart && lifetimeEnd > lifetimeStart,
    'cross-beam lifetime contract is extractable'
  );
  const compiled = ts.transpileModule(
    `export const resolveCrossBeamLifetime = (telegraph, authoredLifetimeFrames) => {
      ${engineSource.slice(lifetimeStart, lifetimeEnd)}
      return lifetime;
    };`,
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }
  ).outputText;
  const module = { exports: {} };
  vm.runInNewContext(
    `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
    { module, require, Math, Number }
  );
  return module.exports.resolveCrossBeamLifetime;
};

test('Mission 10 Paywall Decimator keeps its authored burst budget while charged lanes stay readable', () => {
  const campaign = JSON.parse(fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8'));
  const migration = JSON.parse(
    fs.readFileSync(path.join(root, 'game-config', 'campaign-migration-v23.json'), 'utf8')
  );
  const missionSix = campaign.levels.find((level) => level.order === 6);
  const missionTen = campaign.levels.find((level) => level.order === 10);
  const boss = missionTen.waves.at(-1).events.find((event) => event.kind === 'boss');

  assert.equal(campaign.revision, 24);
  assert.equal(missionSix.campaignProgression.missionRole, 'introduction');
  assert.equal(
    missionSix.waves.flatMap((wave) => wave.events).some((event) => event.kind === 'boss'),
    false,
    'the former Violet Arbiter Mission is now the second-sector introduction'
  );
  assert.equal(missionTen.campaignProgression.missionRole, 'major-boss');
  assert.equal(missionTen.waves.length, 2, 'major-boss Missions run one intercept directly into the boss');
  assert.equal(migration.toRevision, 23);
  assert.equal(migration.missionNodeAliases['stage-null-sector'], 'node-s02-d05');
  assert.ok(boss);
  assert.equal(boss.id, 'stage-null-sector-major-boss');
  assert.equal(boss.bossId, 'paywall-decimator');
  assert.equal(boss.health, 800);
  assert.equal(boss.shieldCount, 0);
  assert.equal(boss.speed, 2);
  assert.ok(boss.warningSeconds >= 1.2 && boss.warningSeconds <= 1.5);

  const burst = boss.weapons.find((weapon) => weapon.id === 'sandbox-paywall-decimator-burst');
  assert.deepEqual(
    {
      attackIntervalSeconds: burst.attackIntervalSeconds,
      projectileSpeed: burst.projectileSpeed,
      burstCount: burst.burstCount
    },
    { attackIntervalSeconds: 0.65, projectileSpeed: 7.65, burstCount: 7 }
  );

  const chargedLanes = boss.weapons.find((weapon) => weapon.id === 'sandbox-paywall-decimator-beam');
  assert.deepEqual(
    {
      attackIntervalSeconds: chargedLanes.attackIntervalSeconds,
      projectileSpeed: chargedLanes.projectileSpeed,
      burstCount: chargedLanes.burstCount
    },
    { attackIntervalSeconds: 0.333, projectileSpeed: 0, burstCount: 3 }
  );

  assert.deepEqual(
    boss.phases.map((phase) => ({
      id: phase.id,
      triggerHealthRatio: phase.triggerHealthRatio,
      speedMultiplier: phase.speedMultiplier
    })),
    [
      { id: 'sandbox-paywall-decimator-standard', triggerHealthRatio: 1, speedMultiplier: 1 },
      { id: 'sandbox-paywall-decimator-low-health', triggerHealthRatio: 0.35, speedMultiplier: 1 }
    ]
  );

  const resolveCrossBeamLifetime = loadCrossBeamLifetimeHelper();
  assert.equal(resolveCrossBeamLifetime(true), 46);
  assert.equal(resolveCrossBeamLifetime(true, 91.8), 91);
  assert.equal(resolveCrossBeamLifetime(true, 0), 1);
  assert.equal(resolveCrossBeamLifetime(false, 91.8), 26);

  const warningBranchStart = engineSource.indexOf(
    "if (style === 'lane' && linkedAction?.primitiveId === 'cross-beam')"
  );
  const warningBranchEnd = engineSource.indexOf(
    "if (style === 'lane' && linkedAction?.primitiveId === 'rail-sweep')",
    warningBranchStart
  );
  assert.ok(
    warningBranchStart >= 0 && warningBranchEnd > warningBranchStart,
    'cross-beam warning branch is extractable'
  );
  const warningBranch = engineSource.slice(warningBranchStart, warningBranchEnd);
  assert.match(warningBranch, /spawnBossCrossBeamPair\(boss, true, warningFrames\)/);
});

test('promoted early-sector major bosses preserve approved durability and authored pressure identities', () => {
  const campaign = JSON.parse(fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8'));
  const expected = new Map([
    [10, {
      bossId: 'paywall-decimator',
      health: 800,
      speed: 2,
      shields: 0,
      burstInterval: 0.65,
      projectileSpeed: 7.65,
      burstCount: 7,
      laneInterval: 0.333,
      laneBurst: 3,
      phaseTriggers: [1, 0.35]
    }],
    [15, {
      bossId: 'prism-moth',
      health: 1300,
      speed: 2.1,
      shields: 0,
      burstInterval: 1.1,
      projectileSpeed: 5.8,
      burstCount: 4,
      laneInterval: 2.4,
      laneBurst: 1,
      phaseTriggers: [1, 0.5]
    }],
    [20, {
      bossId: 'frontier-crownclaw',
      health: 1600,
      speed: 0.74,
      shields: 0,
      burstInterval: 30,
      projectileSpeed: 5.8,
      burstCount: 4,
      laneInterval: 30,
      laneBurst: 1,
      phaseTriggers: [1, 0.5]
    }],
    [25, {
      bossId: 'helios-clawcarrier',
      health: 2350,
      speed: 1.35,
      shields: 0,
      burstInterval: 4.8,
      projectileSpeed: 5.8,
      burstCount: 4,
      laneInterval: 8,
      laneBurst: 1,
      phaseTriggers: [1, 0.67, 0.32]
    }]
  ]);

  for (const [missionNumber, contract] of expected) {
    const level = campaign.levels.find((entry) => entry.order === missionNumber);
    const boss = level.waves.at(-1).events.find((event) => event.kind === 'boss');
    const burst = boss.weapons.find((weapon) => weapon.weaponId === 'burst-volley');
    const lane = boss.weapons.find((weapon) => weapon.weaponId === 'lane-beam');

    assert.equal(level.campaignProgression.missionRole, 'major-boss');
    assert.equal(boss.bossId, contract.bossId);
    assert.equal(boss.health, contract.health);
    assert.equal(boss.speed, contract.speed);
    assert.equal(boss.shieldCount, contract.shields);
    assert.equal(burst.attackIntervalSeconds, contract.burstInterval);
    assert.equal(burst.projectileSpeed, contract.projectileSpeed);
    assert.equal(burst.burstCount, contract.burstCount, 'the bounded authored radial identity is retained');
    assert.equal(lane.attackIntervalSeconds, contract.laneInterval);
    assert.equal(lane.burstCount, contract.laneBurst, 'sector lane pressure still escalates');
    assert.deepEqual(boss.phases.map((phase) => phase.triggerHealthRatio), contract.phaseTriggers);
  }
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

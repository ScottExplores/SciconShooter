const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const loadTypeScriptModule = (relativePath) => {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(
    `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
    { module, require, Math, Number, Object, Boolean, Array }
  );
  return module.exports;
};

const gatekeeper = loadTypeScriptModule(
  'services/gameplay/bosses/GatekeeperPrimeRuntime.ts'
);

test('Mission 5 ends its authored runway with a dedicated Gatekeeper Prime encounter', () => {
  const campaign = JSON.parse(
    fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8')
  );
  const mission = campaign.levels.find((candidate) => (
    candidate.id === 'stage-bastion-protocol'
  ));
  assert.ok(mission, 'Mission 5 exists');
  assert.equal(mission.order, 5);
  // REVAMP(G): B permits expanded early lead-ins, with one unchanged terminal commander.
  assert.ok(mission.waves.length >= 2 && mission.waves.length <= 8);
  assert.equal(mission.waves.flatMap(wave => wave.events).filter(event => event.kind === 'boss').length, 1);
  assert.ok(mission.waves.slice(0, -1).every((wave) => wave.completionRule === 'clear-after-duration'));
  const finalWave = mission.waves.at(-1);
  assert.equal(finalWave.completionRule, 'boss-defeat');
  assert.equal(finalWave.events.length, 1);

  const event = finalWave.events[0];
  assert.equal(event.kind, 'boss');
  assert.equal(event.id, 'stage-bastion-protocol-major-boss');
  assert.equal(event.bossId, gatekeeper.GATEKEEPER_PRIME_BOSS_ID);
  assert.equal(event.rigId, 'open-orbit');
  assert.equal(event.spriteKey, 'PIXI_BOSS_OPEN_ORBIT_FRAMES');
});

test('Gatekeeper Prime patrol stays bounded in the upper arena without player tracking', () => {
  const viewport = {
    viewportWidth: 390,
    viewportHeight: 844,
    bossWidth: 220,
    bossHeight: 200
  };
  let maximumSpeed = 0;
  let maximumAcceleration = 0;
  let previousX;
  let previousVelocity;

  for (let frame = 0; frame < 1200; frame += 1) {
    const sample = gatekeeper.sampleGatekeeperPrimePatrol({
      ...viewport,
      combatFrame: frame,
      healthRatio: 0.2
    });
    assert.ok(sample.x >= sample.minimumX - 0.001);
    assert.ok(sample.x <= sample.maximumX + 0.001);
    assert.ok(sample.y >= sample.minimumY - 0.001);
    assert.ok(sample.y <= sample.maximumY + 0.001);
    assert.ok(sample.y + viewport.bossHeight < viewport.viewportHeight * 0.5);

    if (previousX !== undefined) {
      const velocity = sample.x - previousX;
      maximumSpeed = Math.max(maximumSpeed, Math.abs(velocity));
      if (previousVelocity !== undefined) {
        maximumAcceleration = Math.max(
          maximumAcceleration,
          Math.abs(velocity - previousVelocity)
        );
      }
      previousVelocity = velocity;
    }
    previousX = sample.x;
  }

  assert.ok(maximumSpeed <= 1.72 + 0.001);
  assert.ok(maximumAcceleration < 0.08);
  assert.equal(
    /player|target/i.test(gatekeeper.sampleGatekeeperPrimePatrol.toString()),
    false,
    'patrol sampling has no player/target input'
  );
});

test('Gatekeeper Prime phases deepen gradually and each attack returns to baseline', () => {
  const phases = [
    gatekeeper.resolveGatekeeperPrimePhase(1),
    gatekeeper.resolveGatekeeperPrimePhase(0.64),
    gatekeeper.resolveGatekeeperPrimePhase(0.32)
  ];
  assert.deepEqual(
    phases.map((phase) => phase.id),
    ['prime-sentinel', 'prime-pressure', 'prime-overdrive']
  );
  assert.ok(phases[0].verticalExcursionPixels < phases[1].verticalExcursionPixels);
  assert.ok(phases[1].verticalExcursionPixels < phases[2].verticalExcursionPixels);

  const attackWindows = [
    {
      attackStart: 0,
      attackDuration: gatekeeper.GATEKEEPER_PRIME_SIGNATURE_CYCLE_FRAMES
    },
    {
      attackStart: gatekeeper.GATEKEEPER_PRIME_SIGNATURE_CYCLE_FRAMES,
      attackDuration: gatekeeper.GATEKEEPER_PRIME_ATTACK_CYCLE_FRAMES
    },
    {
      attackStart:
        gatekeeper.GATEKEEPER_PRIME_SIGNATURE_CYCLE_FRAMES
        + gatekeeper.GATEKEEPER_PRIME_ATTACK_CYCLE_FRAMES,
      attackDuration: gatekeeper.GATEKEEPER_PRIME_ATTACK_CYCLE_FRAMES
    }
  ];

  for (const { attackStart, attackDuration } of attackWindows) {
    const baseline = gatekeeper.sampleGatekeeperPrimePatrol({
      combatFrame: attackStart,
      healthRatio: 0.2,
      viewportWidth: 390,
      viewportHeight: 844,
      bossWidth: 220,
      bossHeight: 200
    });
    const descended = gatekeeper.sampleGatekeeperPrimePatrol({
      combatFrame: attackStart + Math.floor(attackDuration * 0.47),
      healthRatio: 0.2,
      viewportWidth: 390,
      viewportHeight: 844,
      bossWidth: 220,
      bossHeight: 200
    });
    const reset = gatekeeper.sampleGatekeeperPrimePatrol({
      combatFrame: attackStart + Math.floor(attackDuration * 0.9),
      healthRatio: 0.2,
      viewportWidth: 390,
      viewportHeight: 844,
      bossWidth: 220,
      bossHeight: 200
    });
    assert.ok(descended.y > baseline.y);
    assert.ok(Math.abs(reset.y - baseline.y) < 0.001);
  }
});

test('Gatekeeper Prime restores three aimed volleys before its signature laser', () => {
  assert.equal(gatekeeper.GATEKEEPER_PRIME_SIGNATURE_CYCLE_FRAMES, 410);
  assert.equal(
    gatekeeper.GATEKEEPER_PRIME_SEQUENCE_FRAMES,
    gatekeeper.GATEKEEPER_PRIME_SIGNATURE_CYCLE_FRAMES
      + gatekeeper.GATEKEEPER_PRIME_ATTACK_CYCLE_FRAMES * 2
  );

  const attackStarts = [
    0,
    gatekeeper.GATEKEEPER_PRIME_SIGNATURE_CYCLE_FRAMES,
    gatekeeper.GATEKEEPER_PRIME_SIGNATURE_CYCLE_FRAMES
      + gatekeeper.GATEKEEPER_PRIME_ATTACK_CYCLE_FRAMES
  ];
  const order = attackStarts.map((attackStart) => (
    gatekeeper.sampleGatekeeperPrimeAttack(attackStart).attackId
  ));
  assert.deepEqual(order, ['rail-fan', 'core-lane', 'twin-gate']);
  assert.deepEqual(
    [...gatekeeper.GATEKEEPER_PRIME_SIGNATURE_VOLLEY_FRAMES],
    [77, 154, 231]
  );
  const emittedVolleyFrames = [];
  for (let frame = 0; frame < gatekeeper.GATEKEEPER_PRIME_SIGNATURE_CYCLE_FRAMES; frame += 1) {
    if (gatekeeper.isGatekeeperPrimeRailPulseFrame(frame, 1)) {
      emittedVolleyFrames.push(frame);
    }
  }
  assert.deepEqual(emittedVolleyFrames, [77, 154, 231]);

  assert.equal(
    gatekeeper.sampleGatekeeperPrimeAttack(
      gatekeeper.GATEKEEPER_PRIME_SIGNATURE_TELEGRAPH_START_FRAME
    ).stage,
    'telegraph'
  );
  assert.equal(
    gatekeeper.sampleGatekeeperPrimeAttack(
      gatekeeper.GATEKEEPER_PRIME_SIGNATURE_FIRE_START_FRAME
    ).stage,
    'fire'
  );
  assert.equal(
    gatekeeper.sampleGatekeeperPrimeAttack(
      gatekeeper.GATEKEEPER_PRIME_SIGNATURE_RECOVERY_END_FRAME
    ).stage,
    'return'
  );
  assert.equal(
    gatekeeper.GATEKEEPER_PRIME_SIGNATURE_FIRE_START_FRAME
      - gatekeeper.GATEKEEPER_PRIME_SIGNATURE_TELEGRAPH_START_FRAME,
    70,
    'the laser keeps its historical 70-frame warning'
  );
  assert.equal(
    gatekeeper.GATEKEEPER_PRIME_SIGNATURE_FIRE_END_FRAME
      - gatekeeper.GATEKEEPER_PRIME_SIGNATURE_FIRE_START_FRAME,
    68,
    'the signature beam keeps its historical 68-frame live window'
  );

  const coreAttackStart = gatekeeper.GATEKEEPER_PRIME_SIGNATURE_CYCLE_FRAMES;
  assert.equal(
    gatekeeper.sampleGatekeeperPrimeAttack(
      coreAttackStart + gatekeeper.GATEKEEPER_PRIME_TELEGRAPH_START_FRAME
    ).stage,
    'telegraph'
  );
  assert.equal(
    gatekeeper.sampleGatekeeperPrimeAttack(
      coreAttackStart + gatekeeper.GATEKEEPER_PRIME_FIRE_START_FRAME
    ).stage,
    'fire'
  );
  assert.equal(
    gatekeeper.sampleGatekeeperPrimeAttack(
      coreAttackStart + gatekeeper.GATEKEEPER_PRIME_RECOVERY_END_FRAME
    ).stage,
    'return'
  );
  assert.ok(gatekeeper.GATEKEEPER_PRIME_MOBILE_PROJECTILE_CAP <= 18);
  assert.ok(gatekeeper.GATEKEEPER_PRIME_DESKTOP_PROJECTILE_CAP <= 24);

  const overdriveRailProjectiles = gatekeeper.resolveGatekeeperPrimePhase(0.2)
    .railPulseFrames.length * 3;
  assert.equal(overdriveRailProjectiles, 9);
  assert.ok(
    overdriveRailProjectiles < gatekeeper.GATEKEEPER_PRIME_MOBILE_PROJECTILE_CAP,
    'the densest rail sentence stays below the mobile runtime cap'
  );

  for (let frame = 0; frame < gatekeeper.GATEKEEPER_PRIME_SEQUENCE_FRAMES; frame += 1) {
    const sample = gatekeeper.sampleGatekeeperPrimeAttack(frame);
    assert.ok(['rail-fan', 'core-lane', 'twin-gate'].includes(sample.attackId));
    assert.ok(['settle', 'telegraph', 'fire', 'recovery', 'return'].includes(sample.stage));
  }
});

test('Archive Gatekeeper cadence accelerates without skipping its 48-frame lane warnings', () => {
  const easyTempo = 1;
  const mediumTempo = 1.12;
  const heroicTempo = 1.28;
  const easy = gatekeeper.resolveGatekeeperPrimeAttackSchedule(easyTempo);
  const medium = gatekeeper.resolveGatekeeperPrimeAttackSchedule(mediumTempo);
  const heroic = gatekeeper.resolveGatekeeperPrimeAttackSchedule(heroicTempo);

  assert.equal(easyTempo, 1);
  assert.equal(easy.attackCycleFrames, gatekeeper.GATEKEEPER_PRIME_ATTACK_CYCLE_FRAMES);
  assert.equal(easy.signatureCycleFrames, gatekeeper.GATEKEEPER_PRIME_SIGNATURE_CYCLE_FRAMES);
  assert.equal(easy.sequenceFrames, gatekeeper.GATEKEEPER_PRIME_SEQUENCE_FRAMES);
  assert.deepEqual([...easy.signatureVolleyFrames], [77, 154, 231]);
  assert.ok(medium.sequenceFrames < easy.sequenceFrames);
  assert.ok(heroic.sequenceFrames < medium.sequenceFrames);

  for (const schedule of [easy, medium, heroic]) {
    assert.ok(schedule.fireStartFrame - schedule.telegraphStartFrame >= 48);
    assert.ok(
      schedule.signatureFireStartFrame - schedule.signatureTelegraphStartFrame >= 48
    );
    const emittedVolleyFrames = [];
    for (let frame = 0; frame < schedule.signatureCycleFrames; frame += 1) {
      if (gatekeeper.isGatekeeperPrimeRailPulseFrame(
        frame,
        0.2,
        schedule.attackTempoMultiplier
      )) emittedVolleyFrames.push(frame);
    }
    assert.deepEqual(emittedVolleyFrames, [...schedule.signatureVolleyFrames]);
  }

  for (const proof of gatekeeper.proveGatekeeperPrimeRoutes({
    viewportId: 'heroic-mobile-390x844',
    width: 390,
    height: 844,
    attackTempoMultiplier: heroicTempo
  })) {
    assert.equal(proof.passes, true, proof.attackId);
    assert.ok(proof.minimumClearancePixelsAfterUncertainty >= 6, proof.attackId);
  }
});

test('all Gatekeeper Prime attacks have reproducible routes with at least 6px clearance', () => {
  const viewports = [
    { viewportId: 'mobile-390x844', width: 390, height: 844 },
    // The game arena is portrait-only. A wide desktop host still embeds the
    // same canonical 390x844 playfield instead of changing encounter geometry.
    { viewportId: 'wide-host-mobile-390x844', width: 390, height: 844 }
  ];
  const expectedHashes = new Map([
    ['mobile-390x844:rail-fan', 'f4d96f4e'],
    ['mobile-390x844:core-lane', 'ceedee33'],
    ['mobile-390x844:twin-gate', '73cdff8a'],
    ['wide-host-mobile-390x844:rail-fan', 'f4d96f4e'],
    ['wide-host-mobile-390x844:core-lane', 'ceedee33'],
    ['wide-host-mobile-390x844:twin-gate', '73cdff8a']
  ]);

  for (const viewport of viewports) {
    const proofs = gatekeeper.proveGatekeeperPrimeRoutes(viewport);
    assert.equal(proofs.length, 3);
    for (const proof of proofs) {
      const key = `${proof.viewportId}:${proof.attackId}`;
      assert.equal(proof.fixedSeed, gatekeeper.GATEKEEPER_PRIME_FIXED_SEED);
      assert.equal(proof.routeHash, expectedHashes.get(key));
      assert.equal(proof.geometryUncertaintyPixels, 3);
      assert.ok(proof.minimumClearancePixelsAfterUncertainty >= 6, key);
      assert.equal(proof.passes, true, key);
    }
  }
});

test('game runtime dispatches Gatekeeper Prime before generic boss movement', () => {
  const source = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
  assert.match(source, /sourceItemId === GATEKEEPER_PRIME_BOSS_ID/);
  assert.match(source, /this\.updateGatekeeperPrime\(boss, healthRatio\);\s*return;/);
  assert.match(source, /getGatekeeperPrimeActiveCannonOrigins/);
  assert.match(source, /getGatekeeperPrimeProjectileCap/);
  assert.match(source, /const shotCount = 3;/);
  assert.match(source, /const attackTempoMultiplier = boss\.configuredAttackTempoMultiplier/);
  assert.match(source, /isGatekeeperPrimeRailPulseFrame\(combatFrame, healthRatio, attackTempoMultiplier\)/);
  assert.match(source, /sample\.attack\.fireEndFrame - sample\.attack\.fireStartFrame/);
});

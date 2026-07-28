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

test('Mission 5 is a direct, dedicated Gatekeeper Prime encounter', () => {
  const campaign = JSON.parse(
    fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8')
  );
  const mission = campaign.levels.find((candidate) => (
    candidate.id === 'stage-bastion-protocol'
  ));
  assert.ok(mission, 'Mission 5 exists');
  assert.equal(mission.order, 5);
  assert.equal(mission.waves.length, 1);
  assert.equal(mission.waves[0].completionRule, 'boss-defeat');
  assert.equal(mission.waves[0].events.length, 1);

  const event = mission.waves[0].events[0];
  assert.equal(event.kind, 'boss');
  assert.equal(event.id, 'open-orbit-gatekeeper');
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

  for (let attackIndex = 0; attackIndex < 3; attackIndex += 1) {
    const attackStart = attackIndex * gatekeeper.GATEKEEPER_PRIME_ATTACK_CYCLE_FRAMES;
    const baseline = gatekeeper.sampleGatekeeperPrimePatrol({
      combatFrame: attackStart,
      healthRatio: 0.2,
      viewportWidth: 390,
      viewportHeight: 844,
      bossWidth: 220,
      bossHeight: 200
    });
    const descended = gatekeeper.sampleGatekeeperPrimePatrol({
      combatFrame: attackStart + 118,
      healthRatio: 0.2,
      viewportWidth: 390,
      viewportHeight: 844,
      bossWidth: 220,
      bossHeight: 200
    });
    const reset = gatekeeper.sampleGatekeeperPrimePatrol({
      combatFrame: attackStart + 220,
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

test('Gatekeeper Prime owns three telegraphed attacks with bounded projectile caps', () => {
  const order = [0, 1, 2].map((attackIndex) => (
    gatekeeper.sampleGatekeeperPrimeAttack(
      attackIndex * gatekeeper.GATEKEEPER_PRIME_ATTACK_CYCLE_FRAMES
    ).attackId
  ));
  assert.deepEqual(order, ['rail-fan', 'core-lane', 'twin-gate']);
  assert.equal(
    gatekeeper.sampleGatekeeperPrimeAttack(
      gatekeeper.GATEKEEPER_PRIME_TELEGRAPH_START_FRAME
    ).stage,
    'telegraph'
  );
  assert.equal(
    gatekeeper.sampleGatekeeperPrimeAttack(
      gatekeeper.GATEKEEPER_PRIME_FIRE_START_FRAME
    ).stage,
    'fire'
  );
  assert.equal(
    gatekeeper.sampleGatekeeperPrimeAttack(
      gatekeeper.GATEKEEPER_PRIME_RECOVERY_END_FRAME
    ).stage,
    'return'
  );
  assert.ok(gatekeeper.GATEKEEPER_PRIME_MOBILE_PROJECTILE_CAP <= 18);
  assert.ok(gatekeeper.GATEKEEPER_PRIME_DESKTOP_PROJECTILE_CAP <= 24);

  const overdriveRailProjectiles = gatekeeper.resolveGatekeeperPrimePhase(0.2)
    .railPulseFrames.length * 2;
  assert.equal(overdriveRailProjectiles, 8);
  assert.ok(
    overdriveRailProjectiles < gatekeeper.GATEKEEPER_PRIME_MOBILE_PROJECTILE_CAP,
    'the densest rail sentence stays below the mobile runtime cap'
  );

  for (let frame = 0; frame < gatekeeper.GATEKEEPER_PRIME_ATTACK_CYCLE_FRAMES * 3; frame += 1) {
    const sample = gatekeeper.sampleGatekeeperPrimeAttack(frame);
    assert.ok(['rail-fan', 'core-lane', 'twin-gate'].includes(sample.attackId));
    assert.ok(['settle', 'telegraph', 'fire', 'recovery', 'return'].includes(sample.stage));
  }
});

test('all Gatekeeper Prime attacks have reproducible routes with at least 6px clearance', () => {
  const viewports = [
    { viewportId: 'mobile-390x844', width: 390, height: 844 },
    { viewportId: 'desktop-1280x720', width: 1280, height: 720 }
  ];
  const expectedHashes = new Map([
    ['mobile-390x844:rail-fan', '9a6623fa'],
    ['mobile-390x844:core-lane', 'ceedee33'],
    ['mobile-390x844:twin-gate', 'b7498aba'],
    ['desktop-1280x720:rail-fan', '20d4c83a'],
    ['desktop-1280x720:core-lane', '51c9122b'],
    ['desktop-1280x720:twin-gate', '847ee312']
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
});

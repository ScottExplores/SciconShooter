const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const sourcePath = path.resolve(
  __dirname,
  '..',
  'services',
  'gameplay',
  'bosses',
  'FrontierCrownclawRuntime.ts'
);
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022
  }
}).outputText;
const moduleBox = { exports: {} };
vm.runInNewContext(
  `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
  {
    module: moduleBox,
    exports: moduleBox.exports,
    require,
    Array,
    Math,
    Number,
    Object
  }
);

const runtime = moduleBox.exports;
const plain = (value) => JSON.parse(JSON.stringify(value));

test('Frontier Crownclaw exposes exactly three core attacks and keeps Cross-Link a signature variant', () => {
  assert.deepEqual(Array.from(runtime.FRONTIER_CROWNCLAW_ACTION_IDS), [
    'chainclaw-harpoon',
    'crown-reactor-beam',
    'bastion-crabwalk-barrage'
  ]);
  assert.equal(runtime.FRONTIER_CROWNCLAW_SIGNATURE_ID, 'crown-cross-link');
  assert.equal(runtime.FRONTIER_CROWNCLAW_ACTION_IDS.includes('crown-cross-link'), false);
  assert.equal(new Set(runtime.FRONTIER_CROWNCLAW_ACTION_IDS).size, 3);
});

test('critical phase deploys new anatomy and cross-linked emitters instead of only scaling numbers', () => {
  const phaseOne = runtime.resolveFrontierCrownclawPhaseState({
    phaseIndex: 1,
    phaseProgress: 0,
    healthRatio: 1
  });
  const transition = runtime.resolveFrontierCrownclawPhaseState({
    phaseIndex: 2,
    phaseProgress: 0.5,
    healthRatio: 0.45
  });
  const critical = runtime.resolveFrontierCrownclawPhaseState({
    phaseIndex: 2,
    phaseProgress: 1,
    healthRatio: 0.35
  });

  assert.equal(phaseOne.critical, false);
  assert.equal(phaseOne.rearAppendageDeployment, 0);
  assert.equal(phaseOne.beamRelayMode, 'direct');
  assert.ok(transition.shellOpening > 0 && transition.shellOpening < 1);
  assert.ok(transition.crownLift > 0 && transition.crownLift < 1);
  assert.equal(critical.dualHarpoonsEnabled, true);
  assert.equal(critical.rearBarrageSocketsEnabled, true);
  assert.equal(critical.beamRelayMode, 'cross-linked');
  assert.equal(critical.rearAppendageDeployment, 1);
  assert.equal(Object.isFrozen(critical), true);
});

test('chainclaw visibly unspools, launches, tensions, retracts, and reseats on one continuous curve', () => {
  const base = {
    side: 'port',
    sequence: 4,
    spool: { x: -44, y: 0 },
    rest: { x: -76, y: 20 },
    target: { x: 58, y: 112 }
  };
  const warning = runtime.sampleFrontierChainclawHarpoon({
    ...base,
    stage: 'warning',
    progress: 1
  });
  const launchStart = runtime.sampleFrontierChainclawHarpoon({
    ...base,
    stage: 'fire',
    progress: 0
  });
  const launchEnd = runtime.sampleFrontierChainclawHarpoon({
    ...base,
    stage: 'fire',
    progress: 0.25
  });
  const tensioned = runtime.sampleFrontierChainclawHarpoon({
    ...base,
    stage: 'fire',
    progress: 0.5
  });
  const retracting = runtime.sampleFrontierChainclawHarpoon({
    ...base,
    stage: 'fire',
    progress: 0.8
  });
  const reseated = runtime.sampleFrontierChainclawHarpoon({
    ...base,
    stage: 'fire',
    progress: 1
  });
  const recovered = runtime.sampleFrontierChainclawHarpoon({
    ...base,
    stage: 'recovery',
    progress: 1
  });

  assert.equal(warning.lifecycle, 'unspooling');
  assert.equal(launchStart.lifecycle, 'launching');
  assert.deepEqual(plain(launchStart.claw), base.rest);
  assert.equal(launchEnd.lifecycle, 'latched');
  assert.deepEqual(plain(launchEnd.claw), base.target);
  assert.equal(tensioned.lifecycle, 'tensioned');
  assert.ok(tensioned.tension > 0.7);
  assert.equal(tensioned.chainDamaging, true);
  assert.equal(warning.chainDamaging, false);
  assert.equal(launchStart.chainDamaging, false);
  assert.equal(launchEnd.chainDamaging, true);
  assert.equal(retracting.chainDamaging, false);
  assert.equal(recovered.chainDamaging, false);
  assert.equal(retracting.lifecycle, 'retracting');
  assert.ok(retracting.extensionRatio < 1 && retracting.extensionRatio > 0);
  assert.equal(reseated.reseated, true);
  assert.deepEqual(plain(reseated.claw), base.rest);
  assert.equal(recovered.lifecycle, 'seated');
  assert.equal(recovered.reseated, true);

  for (const sample of [warning, launchEnd, tensioned, retracting, reseated]) {
    assert.equal(sample.links.length, runtime.FRONTIER_CROWNCLAW_CHAIN_LINK_COUNT);
    assert.deepEqual(
      plain({ x: sample.links[0].x, y: sample.links[0].y }),
      base.spool,
      'first visible link must remain owned by the live spool'
    );
    assert.deepEqual(
      plain({ x: sample.links.at(-1).x, y: sample.links.at(-1).y }),
      plain(sample.claw),
      'last visible link must remain connected to the claw'
    );
    assert.equal(Object.isFrozen(sample.links), true);
    sample.links.forEach((link) => assert.equal(Object.isFrozen(link), true));
  }
  assert.deepEqual(
    plain(runtime.sampleFrontierChainclawHarpoon({
      ...base,
      stage: 'fire',
      progress: 0.5
    })),
    plain(tensioned)
  );
});

test('harpoon plans lock bounded deterministic targets and Cross-Link swaps both claws across center', () => {
  const normal = runtime.resolveFrontierChainclawPlan({
    seedKey: 'route-proof',
    sequence: 3,
    phaseIndex: 1
  });
  const repeated = runtime.resolveFrontierChainclawPlan({
    seedKey: 'route-proof',
    sequence: 3,
    phaseIndex: 1
  });
  const signature = runtime.resolveFrontierChainclawPlan({
    seedKey: 'route-proof',
    sequence: 3,
    phaseIndex: 2,
    signature: true
  });

  assert.deepEqual(plain(normal), plain(repeated));
  assert.equal(normal.sides.length, 1);
  assert.deepEqual(Array.from(signature.sides), ['port', 'starboard']);
  assert.equal(signature.crossLink, true);
  assert.ok(signature.portTargetRatio.x > 0.5);
  assert.ok(signature.starboardTargetRatio.x < 0.5);
  for (const target of [signature.portTargetRatio, signature.starboardTargetRatio]) {
    assert.ok(target.x >= 0.14 && target.x <= 0.86);
    assert.ok(target.y >= 0.58 && target.y <= 0.74);
  }
});

test('reactor beam telegraphs before damage and phase two relays through deployed anatomy', () => {
  const directPlan = runtime.resolveFrontierReactorBeamPlan({
    seedKey: 'beam-proof',
    sequence: 1,
    phaseIndex: 1,
    lockedTargetAngleRadians: Math.PI / 2
  });
  const relayPlan = runtime.resolveFrontierReactorBeamPlan({
    seedKey: 'beam-proof',
    sequence: 1,
    phaseIndex: 2,
    lockedTargetAngleRadians: Math.PI / 2
  });
  const warning = runtime.sampleFrontierCrownReactorBeam({
    stage: 'warning',
    progress: 0.9,
    plan: directPlan
  });
  const preDamage = runtime.sampleFrontierCrownReactorBeam({
    stage: 'fire',
    progress: 0.04,
    plan: directPlan
  });
  const firing = runtime.sampleFrontierCrownReactorBeam({
    stage: 'fire',
    progress: 0.5,
    plan: directPlan
  });
  const relayed = runtime.sampleFrontierCrownReactorBeam({
    stage: 'fire',
    progress: 0.5,
    plan: relayPlan
  });

  assert.equal(warning.warningVisible, true);
  assert.equal(warning.damaging, false);
  assert.equal(preDamage.warningVisible, true);
  assert.equal(preDamage.damaging, false);
  assert.equal(firing.damaging, true);
  assert.equal(firing.beamAnglesRadians.length, 1);
  assert.equal(relayPlan.relayMode, 'cross-linked');
  assert.equal(relayPlan.beamCount, 2);
  assert.equal(
    relayPlan.relayOffsetRadians,
    runtime.FRONTIER_CROWNCLAW_CRITICAL_BEAM_CORRIDOR_HALF_ANGLE_RADIANS
  );
  assert.equal(
    runtime.FRONTIER_CROWNCLAW_CRITICAL_BEAM_CORRIDOR_HALF_ANGLE_RADIANS,
    Math.PI * 0.11
  );
  assert.equal(
    runtime.FRONTIER_CROWNCLAW_CRITICAL_BEAM_SWEEP_HALF_ANGLE_RADIANS,
    Math.PI * 0.21
  );
  assert.ok(
    runtime.FRONTIER_CROWNCLAW_CRITICAL_BEAM_SWEEP_HALF_ANGLE_RADIANS
      > runtime.FRONTIER_CROWNCLAW_CRITICAL_BEAM_CORRIDOR_HALF_ANGLE_RADIANS,
    'the original wide sweep must cross the arena while the paired relays leave their center empty'
  );
  assert.equal(relayed.beamAnglesRadians.length, 2);
  assert.ok(relayed.beamAnglesRadians[0] < relayed.beamAnglesRadians[1]);
  assert.ok(
    Math.abs(
      (relayed.beamAnglesRadians[0] + relayed.beamAnglesRadians[1]) / 2
        - relayed.primaryAngleRadians
    ) < 1e-9,
    'the paired relays must leave the primary centerline empty'
  );
  assert.ok(
    relayed.beamAnglesRadians.every((angle) => (
      Math.abs(angle - relayed.primaryAngleRadians)
        >= relayPlan.relayOffsetRadians - 1e-9
    )),
    'neither phase-two relay may occupy the removed center beam'
  );
  assert.deepEqual(
    plain(runtime.resolveFrontierReactorBeamPlan({
      seedKey: 'beam-proof',
      sequence: 1,
      phaseIndex: 2,
      lockedTargetAngleRadians: Math.PI / 2
    })),
    plain(relayPlan)
  );
});

test('bastion crabwalk reaches each edge continuously and fires sequential anatomy-owned rounds', () => {
  const plan = runtime.resolveFrontierCrabwalkPlan({
    seedKey: 'crabwalk-proof',
    sequence: 2,
    phaseIndex: 2
  });
  const input = {
    plan,
    anchorX: 115,
    anchorY: 94,
    arenaWidth: 390,
    bossWidth: 160,
    horizontalPadding: 12
  };
  const warningEnd = runtime.sampleFrontierBastionCrabwalk({
    ...input,
    stage: 'warning',
    progress: 1
  });
  const fireStart = runtime.sampleFrontierBastionCrabwalk({
    ...input,
    stage: 'fire',
    progress: 0
  });
  const fireEnd = runtime.sampleFrontierBastionCrabwalk({
    ...input,
    stage: 'fire',
    progress: 1
  });
  const recoveryStart = runtime.sampleFrontierBastionCrabwalk({
    ...input,
    stage: 'recovery',
    progress: 0
  });
  const recoveryEnd = runtime.sampleFrontierBastionCrabwalk({
    ...input,
    stage: 'recovery',
    progress: 1
  });

  assert.equal(warningEnd.x, fireStart.x);
  assert.equal(fireEnd.x, recoveryStart.x);
  assert.equal(recoveryEnd.x, input.anchorX);
  assert.ok(plan.waypointRatios.length >= 4, 'phase two adds an anatomy-led extra anchor');
  assert.equal(Object.isFrozen(plan.waypointRatios), true);

  const firing = [];
  for (let frame = 0; frame < 64; frame += 1) {
    const pulse = runtime.sampleFrontierBarragePulse({
      elapsedFrames: frame,
      durationFrames: 64,
      sequence: 2,
      phaseIndex: 2,
      intervalFrames: 5
    });
    if (pulse?.firing) firing.push(pulse);
  }
  assert.equal(firing[0].elapsedFrames, runtime.FRONTIER_CROWNCLAW_FIRST_BARRAGE_FRAME);
  assert.equal(new Set(firing.map((pulse) => pulse.elapsedFrames)).size, firing.length);
  assert.deepEqual(
    firing.slice(0, 6).map((pulse) => pulse.side),
    ['port', 'starboard', 'port', 'starboard', 'port', 'starboard']
  );
  assert.ok(firing.some((pulse) => pulse.rearSocket));
  firing.forEach((pulse) => {
    assert.match(pulse.socketId, /bastion/);
    assert.ok(pulse.angleRadians >= Math.PI * 0.2);
    assert.ok(pulse.angleRadians <= Math.PI * 0.8);
  });
});

test('owner loss clears all Crownclaw-owned hazards and disconnected attacks', () => {
  const phaseState = runtime.resolveFrontierCrownclawPhaseState({
    phaseIndex: 2,
    phaseProgress: 1,
    healthRatio: 0.3
  });
  const alive = runtime.resolveFrontierCrownclawOwnedArtifactState({
    ownerAlive: true,
    actionId: 'crown-reactor-beam',
    stage: 'fire',
    phaseState
  });
  const removed = runtime.resolveFrontierCrownclawOwnedArtifactState({
    ownerAlive: false,
    actionId: 'crown-reactor-beam',
    stage: 'fire',
    phaseState
  });
  assert.equal(alive.beamActive, true);
  assert.equal(alive.rearSocketsActive, true);
  assert.deepEqual(plain(removed), {
    chainsVisible: false,
    portClawConnected: false,
    starboardClawConnected: false,
    beamActive: false,
    barrageActive: false,
    rearSocketsActive: false,
    clearOnOwnerLoss: true
  });
});

test('Frontier runtime contains no wall-time or unrestricted randomness', () => {
  assert.doesNotMatch(
    source,
    /Math\.random|Date\.|performance\.|requestAnimationFrame|setTimeout|setInterval/
  );
});

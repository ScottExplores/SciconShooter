import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '..', '..');
const proofSourcePath = path.join(
  repositoryRoot,
  'services',
  'gameplay',
  'bosses',
  'FrontierCrownclawSafeRouteProof.ts'
);
const proofSource = await readFile(proofSourcePath, 'utf8');
const componentFallbackEvidence = JSON.parse(await readFile(path.join(
  repositoryRoot,
  'director-data',
  'prototype-assets',
  'frontier-crownclaw',
  'evidence',
  'frontier-crownclaw-component-fallback-safe-route-evidence.json'
), 'utf8'));

const vite = await createServer({
  root: repositoryRoot,
  configFile: false,
  server: { middlewareMode: true, hmr: false },
  appType: 'custom'
});
after(async () => vite.close());

const runtime = await vite.ssrLoadModule(
  '/services/gameplay/bosses/FrontierCrownclawSafeRouteProof.ts'
);

const {
  FRONTIER_CROWNCLAW_ATTACK_IDS,
  FRONTIER_CROWNCLAW_BENCHMARK_VIEWPORTS,
  FRONTIER_CROWNCLAW_CRITICAL_BEAM_CORRIDOR_HALF_ANGLE_RADIANS,
  FRONTIER_CROWNCLAW_DEFAULT_SANDBOX_ROUTE_PLAYER,
  FRONTIER_CROWNCLAW_GEOMETRY_UNCERTAINTY_PIXELS,
  FRONTIER_CROWNCLAW_PHASE_IDS,
  FRONTIER_CROWNCLAW_SAFE_ROUTE_SEED,
  FRONTIER_CROWNCLAW_SAFE_ROUTE_VARIANT_SEEDS,
  buildFrontierCrownclawComponentFallbackSafeRouteMatrix,
  buildFrontierCrownclawSafeRouteMatrix,
  proveFrontierCrownclawSafeRoute,
  sampleFrontierCrownclawAttackGeometry
} = runtime;

const mobile = FRONTIER_CROWNCLAW_BENCHMARK_VIEWPORTS.mobile;
const desktop = FRONTIER_CROWNCLAW_BENCHMARK_VIEWPORTS.desktop;

const sample = ({
  attackId,
  phaseId = FRONTIER_CROWNCLAW_PHASE_IDS.critical,
  viewport = mobile,
  seed = FRONTIER_CROWNCLAW_SAFE_ROUTE_SEED,
  operationalClawSides,
  sequence,
  frame
}) => sampleFrontierCrownclawAttackGeometry({
  attackId,
  phaseId,
  viewport,
  seed,
  ...(operationalClawSides === undefined ? {} : { operationalClawSides }),
  ...(sequence === undefined ? {} : { sequence }),
  frame,
  geometryUncertaintyPixels: FRONTIER_CROWNCLAW_GEOMETRY_UNCERTAINTY_PIXELS
});

const plainMatrixEvidence = (matrix) => matrix.map((entry) => ({
  attackId: entry.attackId,
  phaseId: entry.phaseId,
  seed: entry.seed,
  viewportId: entry.viewportId,
  status: entry.proof.status,
  reason: entry.proof.reason,
  checkedFrames: entry.proof.checkedFrames,
  minimumClearancePixels: Number(entry.proof.minimumClearancePixels.toFixed(6)),
  routeHash: entry.proof.routeHash,
  configurationHash: entry.proof.configurationHash
}));

const plainFallbackEvidence = (matrix) => matrix.map((entry) => ({
  scenarioId: entry.scenarioId,
  requestedAttackId: entry.attackId,
  resolvedAttackId: entry.resolvedAttackId,
  phaseId: entry.phaseId,
  operationalClawSides: entry.operationalClawSides,
  sequence: entry.sequence,
  seed: entry.seed,
  viewportId: entry.viewportId,
  status: entry.proof.status,
  reason: entry.proof.reason,
  checkedFrames: entry.proof.checkedFrames,
  geometryUncertaintyPixels: entry.proof.geometryUncertaintyPixels,
  requiredClearancePixels: entry.proof.requiredClearancePixels,
  minimumClearancePixels: Number(entry.proof.minimumClearancePixels.toFixed(9)),
  routeHash: entry.proof.routeHash,
  configurationHash: entry.proof.configurationHash
}));

const distance = (left, right) => Math.hypot(left.x - right.x, left.y - right.y);

test('Frontier benchmark viewports and uncertainty match the Boss Factory contract', () => {
  assert.deepEqual(
    { id: mobile.id, width: mobile.width, height: mobile.height, mobileProfile: mobile.mobileProfile },
    { id: 'mobile-390x844', width: 390, height: 844, mobileProfile: true }
  );
  assert.deepEqual(
    { id: desktop.id, width: desktop.width, height: desktop.height, mobileProfile: desktop.mobileProfile },
    { id: 'desktop-1280x720', width: 1280, height: 720, mobileProfile: false }
  );
  assert.equal(FRONTIER_CROWNCLAW_GEOMETRY_UNCERTAINTY_PIXELS, 3);
  assert.equal(FRONTIER_CROWNCLAW_SAFE_ROUTE_VARIANT_SEEDS.length, 2);
  assert.equal(
    FRONTIER_CROWNCLAW_SAFE_ROUTE_VARIANT_SEEDS[1],
    FRONTIER_CROWNCLAW_SAFE_ROUTE_VARIANT_SEEDS[0] + 1
  );
});

test('all core attacks and Critical Crown Cross-Link retain six pixels after uncertainty on mobile and desktop', () => {
  const first = buildFrontierCrownclawSafeRouteMatrix();
  const repeated = buildFrontierCrownclawSafeRouteMatrix();

  // 3 core attacks x 2 phases plus the phase-two signature, across two seeds
  // and both canonical viewports.
  assert.equal(first.length, 28);
  assert.deepEqual(plainMatrixEvidence(repeated), plainMatrixEvidence(first));

  for (const entry of first) {
    const { proof } = entry;
    assert.equal(
      proof.status,
      'proven',
      `${entry.attackId}/${entry.phaseId}/${entry.seed}/${entry.viewportId}: ${proof.detail}`
    );
    assert.equal(proof.reason, 'proven');
    assert.equal(proof.geometryUncertaintyPixels, 3);
    assert.equal(proof.requiredClearancePixels, 6);
    assert.ok(
      proof.minimumClearancePixels >= 6,
      `${entry.attackId}/${entry.phaseId}/${entry.viewportId} retained ${proof.minimumClearancePixels}px`
    );
    assert.equal(proof.checkedFrames, proof.witness.length);
    assert.ok(proof.checkedFrames >= 300);
    assert.match(proof.routeHash, /^[0-9a-f]{8}$/);
    assert.match(proof.configurationHash, /^[0-9a-f]{8}$/);
    assert.match(proof.detail, /continuous default-loadout route/i);

    for (let index = 1; index < proof.witness.length; index += 1) {
      assert.ok(
        distance(proof.witness[index - 1], proof.witness[index])
          <= FRONTIER_CROWNCLAW_DEFAULT_SANDBOX_ROUTE_PLAYER.maximumSpeedPerFrame + 0.000001,
        `${entry.attackId} witness teleported at frame ${index}`
      );
    }
  }

  const weakest = [...first].sort((left, right) => (
    left.proof.minimumClearancePixels - right.proof.minimumClearancePixels
  ))[0];
  assert.equal(weakest.attackId, FRONTIER_CROWNCLAW_ATTACK_IDS.reactorBeam);
  assert.equal(weakest.phaseId, FRONTIER_CROWNCLAW_PHASE_IDS.critical);
  assert.equal(weakest.viewportId, desktop.id);
  assert.ok(weakest.proof.minimumClearancePixels > 6.01);
});

test('every retained one-claw and zero-claw fallback branch keeps a deterministic safe route on mobile and desktop', () => {
  const first = buildFrontierCrownclawComponentFallbackSafeRouteMatrix();
  const repeated = buildFrontierCrownclawComponentFallbackSafeRouteMatrix();

  // Twelve fallback scenarios x two bounded seeds x both canonical viewports:
  // - port-only and starboard-only Harpoon in both phases;
  // - port-only and starboard-only Cross-Link in phase two;
  // - even Reactor and odd Barrage zero-claw substitutions for both owners.
  assert.equal(first.length, 48);
  assert.deepEqual(plainFallbackEvidence(repeated), plainFallbackEvidence(first));
  assert.equal(componentFallbackEvidence.scenarioCount, 12);
  assert.equal(componentFallbackEvidence.matrixCount, first.length);
  assert.equal(componentFallbackEvidence.geometryUncertaintyPixels, 3);
  assert.equal(componentFallbackEvidence.requiredClearancePixels, 6);
  assert.deepEqual(componentFallbackEvidence.routes, plainFallbackEvidence(first));
  assert.deepEqual(
    new Set(first.map((entry) => entry.viewportId)),
    new Set([mobile.id, desktop.id])
  );

  for (const entry of first) {
    const { proof } = entry;
    assert.equal(
      proof.status,
      'proven',
      `${entry.scenarioId}/${entry.seed}/${entry.viewportId}: ${proof.detail}`
    );
    assert.equal(proof.reason, 'proven');
    assert.equal(proof.requestedAttackId, entry.attackId);
    assert.equal(proof.resolvedAttackId, entry.resolvedAttackId);
    assert.deepEqual(proof.operationalClawSides, entry.operationalClawSides);
    assert.equal(proof.sequence, entry.sequence);
    assert.equal(proof.geometryUncertaintyPixels, 3);
    assert.equal(proof.requiredClearancePixels, 6);
    assert.ok(proof.minimumClearancePixels >= 6);
    assert.equal(proof.checkedFrames, proof.witness.length);
    assert.match(proof.routeHash, /^[0-9a-f]{8}$/);
    assert.match(proof.configurationHash, /^[0-9a-f]{8}$/);
    for (let index = 1; index < proof.witness.length; index += 1) {
      assert.ok(
        distance(proof.witness[index - 1], proof.witness[index])
          <= FRONTIER_CROWNCLAW_DEFAULT_SANDBOX_ROUTE_PLAYER.maximumSpeedPerFrame + 0.000001,
        `${entry.scenarioId} witness teleported at frame ${index}`
      );
    }
  }

  const zeroClaw = first.filter((entry) => entry.operationalClawSides.length === 0);
  assert.ok(zeroClaw.length > 0);
  for (const entry of zeroClaw) {
    assert.equal(
      entry.resolvedAttackId,
      entry.sequence % 2 === 0
        ? FRONTIER_CROWNCLAW_ATTACK_IDS.reactorBeam
        : FRONTIER_CROWNCLAW_ATTACK_IDS.crabwalkBarrage
    );
  }

  const weakest = [...first].sort((left, right) => (
    left.proof.minimumClearancePixels - right.proof.minimumClearancePixels
  ))[0];
  assert.ok(
    weakest.proof.minimumClearancePixels >= 6,
    `${weakest.scenarioId} retained only ${weakest.proof.minimumClearancePixels}px`
  );
});

test('component geometry redirects both authored beats to the survivor and never retains a destroyed-side hazard', () => {
  for (const side of ['port', 'starboard']) {
    const destroyedSide = side === 'port' ? 'starboard' : 'port';
    const firstBeat = sample({
      attackId: FRONTIER_CROWNCLAW_ATTACK_IDS.harpoon,
      phaseId: FRONTIER_CROWNCLAW_PHASE_IDS.bastion,
      frame: 110,
      operationalClawSides: [side]
    });
    const secondBeat = sample({
      attackId: FRONTIER_CROWNCLAW_ATTACK_IDS.harpoon,
      phaseId: FRONTIER_CROWNCLAW_PHASE_IDS.bastion,
      frame: 330,
      operationalClawSides: [side]
    });
    for (const frame of [firstBeat, secondBeat]) {
      assert.equal(frame.resolvedAttackId, FRONTIER_CROWNCLAW_ATTACK_IDS.harpoon);
      assert.deepEqual(frame.operationalClawSides, [side]);
      const ownedHazards = frame.hazards.filter((hazard) => (
        hazard.kind === 'claw-head' || hazard.kind === 'tensioned-chain'
      ));
      assert.ok(ownedHazards.length > 0, `${side} must retain both redirected beats`);
      assert.ok(ownedHazards.every((hazard) => hazard.sourceSocket.startsWith(side)));
      assert.ok(ownedHazards.every((hazard) => !hazard.sourceSocket.startsWith(destroyedSide)));
    }

    const signature = sample({
      attackId: FRONTIER_CROWNCLAW_ATTACK_IDS.crossLink,
      phaseId: FRONTIER_CROWNCLAW_PHASE_IDS.critical,
      frame: 150,
      operationalClawSides: [side]
    });
    assert.ok(signature.hazards.some((hazard) => hazard.kind === 'tensioned-chain'));
    assert.ok(signature.hazards
      .filter((hazard) => hazard.kind === 'claw-head' || hazard.kind === 'tensioned-chain')
      .every((hazard) => hazard.sourceSocket.startsWith(side)));
  }

  const reactorFallback = sample({
    attackId: FRONTIER_CROWNCLAW_ATTACK_IDS.harpoon,
    phaseId: FRONTIER_CROWNCLAW_PHASE_IDS.bastion,
    frame: 150,
    operationalClawSides: [],
    sequence: 0
  });
  const barrageFallback = sample({
    attackId: FRONTIER_CROWNCLAW_ATTACK_IDS.crossLink,
    phaseId: FRONTIER_CROWNCLAW_PHASE_IDS.critical,
    frame: 150,
    operationalClawSides: [],
    sequence: 1
  });
  assert.equal(reactorFallback.resolvedAttackId, FRONTIER_CROWNCLAW_ATTACK_IDS.reactorBeam);
  assert.ok(reactorFallback.hazards.some((hazard) => hazard.kind === 'reactor-beam'));
  assert.equal(barrageFallback.resolvedAttackId, FRONTIER_CROWNCLAW_ATTACK_IDS.crabwalkBarrage);
  assert.ok(barrageFallback.hazards.some((hazard) => hazard.kind === 'barrage-bolt'));
  for (const frame of [reactorFallback, barrageFallback]) {
    assert.equal(frame.hazards.some((hazard) => (
      hazard.kind === 'claw-head' || hazard.kind === 'tensioned-chain'
    )), false);
  }
});

test('Chainclaw Harpoon samples attached heads and tensioned tethers from live chain sockets', () => {
  // The odd benchmark seed intentionally teaches starboard then port.
  const firstStroke = sample({
    attackId: FRONTIER_CROWNCLAW_ATTACK_IDS.harpoon,
    phaseId: FRONTIER_CROWNCLAW_PHASE_IDS.bastion,
    frame: 110
  });
  const firstChain = firstStroke.hazards.find((hazard) => (
    hazard.kind === 'tensioned-chain'
  ));
  const firstClaw = firstStroke.hazards.find((hazard) => hazard.kind === 'claw-head');
  assert.ok(firstChain);
  assert.ok(firstClaw);
  assert.equal(firstChain.sourceSocket, 'starboard-chain-spool');
  assert.deepEqual(firstChain.start, firstStroke.chainSockets.starboard);
  assert.deepEqual(firstChain.end, firstClaw.center);
  assert.equal(firstChain.geometryUncertaintyPixels, 3);

  const nextFrame = sample({
    attackId: FRONTIER_CROWNCLAW_ATTACK_IDS.harpoon,
    phaseId: FRONTIER_CROWNCLAW_PHASE_IDS.bastion,
    frame: 111
  });
  const nextClaw = nextFrame.hazards.find((hazard) => hazard.kind === 'claw-head');
  assert.ok(distance(firstClaw.center, nextClaw.center) < 8);

  const secondStroke = sample({
    attackId: FRONTIER_CROWNCLAW_ATTACK_IDS.harpoon,
    phaseId: FRONTIER_CROWNCLAW_PHASE_IDS.bastion,
    frame: 330
  });
  const secondChain = secondStroke.hazards.find((hazard) => (
    hazard.kind === 'tensioned-chain'
  ));
  assert.equal(secondChain.sourceSocket, 'port-chain-spool');
  assert.deepEqual(secondChain.start, secondStroke.chainSockets.port);
  assert.notEqual(firstStroke.routeTarget.x, secondStroke.routeTarget.x);

  const preparation = sample({
    attackId: FRONTIER_CROWNCLAW_ATTACK_IDS.harpoon,
    phaseId: FRONTIER_CROWNCLAW_PHASE_IDS.bastion,
    frame: 20
  });
  assert.equal(
    preparation.hazards.some((hazard) => hazard.kind === 'tensioned-chain'),
    false,
    'The warning pose must not create an invisible damaging tether.'
  );
});

test('Critical Crown Reactor Beam owns two full-length tapered boundaries with an empty rideable center', () => {
  const beamPairAt = (frame, prefix) => sample({
    attackId: FRONTIER_CROWNCLAW_ATTACK_IDS.reactorBeam,
    frame
  }).hazards.filter((hazard) => hazard.id.startsWith(prefix));
  const firstStart = beamPairAt(81, 'reactor-primary-sweep-');
  const firstMiddle = beamPairAt(126, 'reactor-primary-sweep-');
  const firstEnd = beamPairAt(164, 'reactor-primary-sweep-');
  const reversalStart = beamPairAt(257, 'reactor-controlled-reversal-');
  const reversalEnd = beamPairAt(328, 'reactor-controlled-reversal-');

  for (const pair of [
    firstStart,
    firstMiddle,
    firstEnd,
    reversalStart,
    reversalEnd
  ]) {
    assert.equal(pair.length, 2, 'Critical Cross-Link must own exactly two beams.');
    assert.deepEqual(
      pair.map((beam) => beam.id.slice(beam.id.lastIndexOf('-') + 1)),
      ['port', 'starboard']
    );
    for (const beam of pair) {
      assert.equal(beam.shape, 'capsule');
      assert.equal(beam.sourceSocket, 'crown-reactor-aperture');
      assert.ok(
        distance(beam.start, beam.end) > Math.hypot(mobile.width, mobile.height),
        'Each paired boundary must retain the original full-screen ray length.'
      );
    }
  }

  const angleFromVertical = (beam) => Math.atan2(
    beam.end.x - beam.start.x,
    beam.end.y - beam.start.y
  );
  for (const pair of [firstStart, firstMiddle, firstEnd]) {
    const angles = pair.map(angleFromVertical).sort((left, right) => left - right);
    assert.ok(angles[0] < angles[1]);
    assert.ok(
      Math.abs(
        (angles[1] - angles[0])
          - FRONTIER_CROWNCLAW_CRITICAL_BEAM_CORRIDOR_HALF_ANGLE_RADIANS * 2
      ) < 1e-9,
      'The two relays must preserve the authored tapered corridor angle.'
    );
    const centerAngle = (angles[0] + angles[1]) / 2;
    assert.ok(
      angles.every((angle) => Math.abs(angle - centerAngle) > 1e-6),
      'No damaging beam may occupy the centerline.'
    );
  }

  const routeY = mobile.height * 0.62;
  const xAtRouteY = (beam) => (
    beam.start.x
      + (routeY - beam.start.y)
        * (beam.end.x - beam.start.x)
        / (beam.end.y - beam.start.y)
  );
  const middleX = firstMiddle.map(xAtRouteY).sort((left, right) => left - right);
  const freeCorridorWidth = middleX[1]
    - middleX[0]
    - firstMiddle[0].radius
    - firstMiddle[1].radius;
  assert.ok(
    freeCorridorWidth >= 150,
    `The restored mobile corridor must retain its original wide spacing; observed ${freeCorridorWidth.toFixed(2)} px.`
  );

  const firstDelta = firstEnd[0].end.x - firstStart[0].end.x;
  const reversalDelta = reversalEnd[0].end.x - reversalStart[0].end.x;
  assert.ok(firstDelta * reversalDelta < 0, 'The phase-two second sweep must reverse direction.');

  const transitionGap = sample({
    attackId: FRONTIER_CROWNCLAW_ATTACK_IDS.reactorBeam,
    frame: 230
  });
  assert.equal(
    transitionGap.hazards.some((hazard) => hazard.kind === 'reactor-beam'),
    false,
    'The controlled reversal must include a visible non-damaging reset window.'
  );
});

test('Bastion Crabwalk Barrage preserves live rear-socket origins and authored changing openings', () => {
  const emission = sample({
    attackId: FRONTIER_CROWNCLAW_ATTACK_IDS.crabwalkBarrage,
    frame: 62
  });
  const bolts = emission.hazards.filter((hazard) => hazard.kind === 'barrage-bolt');
  assert.ok(bolts.length >= 4);
  for (const bolt of bolts) {
    const side = bolt.sourceSocket.startsWith('port') ? 'port' : 'starboard';
    assert.deepEqual(
      bolt.center,
      emission.rearSockets[side],
      'Each first projectile frame must originate at its live rear-shell socket.'
    );
  }

  const leftBoundary = sample({
    attackId: FRONTIER_CROWNCLAW_ATTACK_IDS.crabwalkBarrage,
    frame: 62
  });
  const rightBoundary = sample({
    attackId: FRONTIER_CROWNCLAW_ATTACK_IDS.crabwalkBarrage,
    frame: 148
  });
  assert.ok(
    Math.abs(leftBoundary.bossCenter.x - rightBoundary.bossCenter.x) > 150,
    'Critical crabwalk must visibly reach both lateral boundaries.'
  );

  const routeXs = [0, 165, 245, 325].map((frame) => sample({
    attackId: FRONTIER_CROWNCLAW_ATTACK_IDS.crabwalkBarrage,
    frame
  }).routeTarget.x);
  assert.ok(new Set(routeXs.map((value) => value.toFixed(2))).size >= 3);

  const nextEmissionFrame = sample({
    attackId: FRONTIER_CROWNCLAW_ATTACK_IDS.crabwalkBarrage,
    frame: 63
  });
  const movingBolt = nextEmissionFrame.hazards.find((hazard) => (
    hazard.kind === 'barrage-bolt' && hazard.id === bolts[0].id
  ));
  assert.ok(movingBolt);
  assert.ok(distance(bolts[0].center, movingBolt.center) <= 5.250001);
});

test('Critical Crown Cross-Link keeps two visible moving boundaries and reverses its opening once', () => {
  const active = sample({
    attackId: FRONTIER_CROWNCLAW_ATTACK_IDS.crossLink,
    frame: 150
  });
  const chains = active.hazards.filter((hazard) => hazard.kind === 'tensioned-chain');
  const claws = active.hazards.filter((hazard) => hazard.kind === 'claw-head');
  assert.equal(chains.length, 2);
  assert.equal(claws.length, 2);
  for (const chain of chains) {
    const side = chain.sourceSocket.startsWith('port') ? 'port' : 'starboard';
    assert.deepEqual(chain.start, active.chainSockets[side]);
    assert.ok(claws.some((claw) => distance(claw.center, chain.end) < 0.000001));
  }

  const center = mobile.width / 2;
  const shiftedFirst = sample({
    attackId: FRONTIER_CROWNCLAW_ATTACK_IDS.crossLink,
    frame: 190
  }).routeTarget.x;
  const shiftedReverse = sample({
    attackId: FRONTIER_CROWNCLAW_ATTACK_IDS.crossLink,
    frame: 255
  }).routeTarget.x;
  assert.ok((shiftedFirst - center) * (shiftedReverse - center) < 0);
  assert.ok(Math.abs(shiftedFirst - shiftedReverse) > 60);

  const next = sample({
    attackId: FRONTIER_CROWNCLAW_ATTACK_IDS.crossLink,
    frame: 151
  });
  const activePortClaw = claws.find((hazard) => hazard.sourceSocket.startsWith('port'));
  const nextPortClaw = next.hazards.find((hazard) => (
    hazard.kind === 'claw-head' && hazard.sourceSocket.startsWith('port')
  ));
  assert.ok(distance(activePortClaw.center, nextPortClaw.center) < 4);

  const preTension = sample({
    attackId: FRONTIER_CROWNCLAW_ATTACK_IDS.crossLink,
    frame: 70
  });
  const recovered = sample({
    attackId: FRONTIER_CROWNCLAW_ATTACK_IDS.crossLink,
    frame: 390
  });
  assert.equal(preTension.hazards.some((hazard) => hazard.kind === 'tensioned-chain'), false);
  assert.equal(recovered.hazards.some((hazard) => hazard.kind === 'tensioned-chain'), false);
});

test('the proof fails closed for unsupported phases and geometry that consumes the reserve', () => {
  const unsupported = proveFrontierCrownclawSafeRoute({
    attackId: FRONTIER_CROWNCLAW_ATTACK_IDS.crossLink,
    phaseId: FRONTIER_CROWNCLAW_PHASE_IDS.bastion,
    viewport: mobile
  });
  assert.equal(unsupported.status, 'unproven');
  assert.equal(unsupported.reason, 'unsupported-phase');

  const inflated = proveFrontierCrownclawSafeRoute({
    attackId: FRONTIER_CROWNCLAW_ATTACK_IDS.crossLink,
    phaseId: FRONTIER_CROWNCLAW_PHASE_IDS.critical,
    viewport: mobile,
    geometryUncertaintyPixels: 40
  });
  assert.equal(inflated.status, 'unproven');
  assert.equal(inflated.reason, 'route-collision');
  assert.ok(inflated.minimumClearancePixels <= 0);

  const invalidViewport = proveFrontierCrownclawSafeRoute({
    attackId: FRONTIER_CROWNCLAW_ATTACK_IDS.harpoon,
    phaseId: FRONTIER_CROWNCLAW_PHASE_IDS.bastion,
    viewport: { id: 'invalid', width: 10, height: 10, mobileProfile: true }
  });
  assert.equal(invalidViewport.status, 'unproven');
  assert.equal(invalidViewport.reason, 'invalid-viewport');
});

test('Frontier proof geometry contains no ambient nondeterminism or Helios choreography dependency', () => {
  assert.doesNotMatch(proofSource, /Math\.random|Date\.|performance\./);
  assert.doesNotMatch(proofSource, /Helios|machine.?gun|mine/i);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '..', '..');
const campaign = JSON.parse(await readFile(
  path.join(repositoryRoot, 'game-config', 'campaign.json'),
  'utf8'
));

globalThis.Image ??= class ImageStub {
  complete = true;
  naturalWidth = 1;
  naturalHeight = 1;
  crossOrigin = 'anonymous';
  src = '';
};
globalThis.document ??= {
  hidden: false,
  addEventListener() {},
  removeEventListener() {}
};
globalThis.window ??= {
  AudioContext: undefined,
  webkitAudioContext: undefined,
  addEventListener() {},
  removeEventListener() {},
  setInterval,
  clearInterval,
  localStorage: {
    getItem() { return null; },
    setItem() {},
    removeItem() {}
  }
};

const vite = await createServer({
  root: repositoryRoot,
  configFile: false,
  resolve: {
    alias: {
      '@game': repositoryRoot,
      '@director': path.join(repositoryRoot, 'director', 'src')
    }
  },
  server: { middlewareMode: true, hmr: false },
  appType: 'custom'
});
after(async () => vite.close());

const { buildSandboxBossPrototypePreview } = await vite.ssrLoadModule(
  '/director/src/combat-lab/sandboxBossPrototypes.ts'
);
const {
  MINI_BOSS_LAB_ENCOUNTER_IDS,
  getMiniBossEncounterDefinition
} = await vite.ssrLoadModule('/services/gameplay/mini-bosses/index.ts');
const { GameEngine, Entity } = await vite.ssrLoadModule('/services/gameLogic.ts');
const { EntityType } = await vite.ssrLoadModule('/types.ts');
const { rotatedBeamRectangleIntersectsBox } = await vite.ssrLoadModule(
  '/services/gameplay/bosses/CornerAmbushBeamRuntime.ts'
);

const VIEWPORT = Object.freeze({ width: 390, height: 844 });
const FPS = 60;
const GEOMETRY_UNCERTAINTY_PIXELS = 3;
const REQUIRED_CLEARANCE_AFTER_UNCERTAINTY_PIXELS = 6;
const REQUIRED_RAW_CLEARANCE_PIXELS = (
  GEOMETRY_UNCERTAINTY_PIXELS + REQUIRED_CLEARANCE_AFTER_UNCERTAINTY_PIXELS
);
const PLAYER_MAXIMUM_SPEED_PER_FRAME = 2.5;
const PLAYER_ACCELERATION_PER_FRAME = 0.38;
const CONTROL_FRAMES = Math.max(
  1,
  Number.parseInt(process.env.MINI_BOSS_PROOF_CONTROL_FRAMES ?? '4', 10) || 4
);
const SEARCH_BREADTH = Math.max(
  32,
  Number.parseInt(process.env.MINI_BOSS_PROOF_SEARCH_BREADTH ?? '256', 10) || 256
);
const CLEARANCE_EPSILON = 1e-6;
const selectedProofEncounterIds = process.env.MINI_BOSS_PROOF_ENCOUNTER
  ? MINI_BOSS_LAB_ENCOUNTER_IDS.filter((encounterId) => (
      process.env.MINI_BOSS_PROOF_ENCOUNTER.split(',').includes(encounterId)
    ))
  : MINI_BOSS_LAB_ENCOUNTER_IDS;

const createStats = () => ({
  score: 0,
  highScore: 0,
  wave: 1,
  coins: 0,
  totalCoins: 0,
  enemiesDefeated: 0,
  bombs: 2,
  bombCharge: 0,
  bombChargeMax: 100,
  shipAbilityCooldown: 0,
  shipAbilityCooldownMax: 960,
  lives: 3,
  repairsCount: 0,
  upgrades: { fireRate: 0, speed: 0, missile: 0 },
  powerupUses: {},
  bossProgress: 0,
  isBossActive: false,
  bossHp: 0,
  bossMaxHp: 100
});

const attackDurationFrames = (attack) => Math.round((
  attack.telegraphSeconds + attack.activeSeconds + attack.recoverySeconds
) * FPS);

const completeCycleFrames = (definition) => (
  Math.round(definition.entranceSeconds * FPS)
  + attackDurationFrames(definition.signature)
  + attackDurationFrames(definition.support)
  + 2
);

const createHarness = (encounterId, seedSuffix = 'default') => {
  const definition = getMiniBossEncounterDefinition(encounterId);
  assert.ok(definition, `${encounterId} must resolve a Mini-Boss Lab definition`);
  const preview = buildSandboxBossPrototypePreview(campaign, encounterId);
  const engine = new GameEngine(createStats(), {
    campaign: preview.campaign,
    previewMode: true,
    previewInvincible: true,
    audioEnabled: false,
    initialLevelId: preview.levelId,
    initialWaveId: preview.waveId,
    randomSeed: `mini-boss-safe-route:${encounterId}:${seedSuffix}`,
    previewBossCollisionEventId: preview.eventId
  });
  engine.init(VIEWPORT.width, VIEWPORT.height);
  assert.equal(engine.width, VIEWPORT.width);
  assert.equal(engine.height, VIEWPORT.height);
  assert.equal(engine.spawnPreviewEventNow(preview.eventId), true);

  // The proof replays production collision geometry itself. Disabling collision
  // side effects prevents the observer ship from consuming projectiles while a
  // trace is being recorded; no encounter motion or emission code is replaced.
  engine.checkCollisions = () => {};
  return { definition, engine, preview };
};

const round = (value, digits = 4) => Number(Number(value).toFixed(digits));

const fnvUpdate = (hash, text) => {
  let next = hash >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    next ^= text.charCodeAt(index);
    next = Math.imul(next, 16777619);
  }
  return next >>> 0;
};

const hashStrings = (values) => {
  let hash = 2166136261;
  for (const value of values) hash = fnvUpdate(hash, `${value}\n`);
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const isOwnedMember = (entity, eventId) => (
  entity.sourceEventId === eventId
  && entity.type === EntityType.MINI_BOSS
  && entity.hp > 0
  && entity.miniBossLabDeathStartedFrame < 0
  && !entity.markedForDeletion
);

const isOwnedReinforcement = (entity, eventId) => (
  entity.sourceEventId === eventId
  && entity.sourceItemId?.endsWith(':reinforcement')
  && !entity.markedForDeletion
);

const isDamagingOwnedProjectile = (entity, eventId) => (
  entity.sourceEventId === eventId
  && entity.type === EntityType.PROJECTILE
  && !entity.isPlayerShot
  && !entity.isTelegraph
  && Number(entity.damage) > 0
  && !entity.markedForDeletion
);

const captureHazards = (engine, eventId) => {
  const hazards = [];
  for (const entity of engine.entities) {
    if (isOwnedMember(entity, eventId)) {
      hazards.push({
        id: entity.id,
        ownerId: entity.id,
        source: `member:${entity.miniBossLabRole ?? 'unknown'}`,
        kind: 'aabb',
        box: { ...engine.getCollisionBox(entity) }
      });
      continue;
    }
    if (isOwnedReinforcement(entity, eventId)) {
      if (entity.miniBossLabReinforcementStage === 'active' && entity.contactDamage > 0) {
        hazards.push({
          id: entity.id,
          ownerId: entity.bossOwnerId,
          source: 'reinforcement',
          kind: 'aabb',
          box: { ...engine.getCollisionBox(entity) }
        });
      }
      continue;
    }
    if (!isDamagingOwnedProjectile(entity, eventId)) continue;
    if (entity.isBeam && entity.beamAngleRadians !== null) {
      hazards.push({
        id: entity.id,
        ownerId: entity.bossOwnerId,
        source: 'beam',
        kind: 'beam',
        beam: {
          x: entity.x,
          y: entity.y,
          width: entity.width,
          height: entity.height,
          angleRadians: entity.beamAngleRadians
        }
      });
    } else {
      hazards.push({
        id: entity.id,
        ownerId: entity.bossOwnerId,
        source: 'projectile',
        kind: 'aabb',
        box: { ...engine.getCollisionBox(entity) }
      });
    }
  }
  hazards.sort((left, right) => `${left.source}:${left.id}`.localeCompare(`${right.source}:${right.id}`));
  return hazards;
};

const serializeHazard = (hazard) => {
  if (hazard.kind === 'beam') {
    const beam = hazard.beam;
    return [
      hazard.source,
      hazard.id,
      hazard.ownerId ?? '',
      round(beam.x),
      round(beam.y),
      round(beam.width),
      round(beam.height),
      round(beam.angleRadians, 6)
    ].join(':');
  }
  const box = hazard.box;
  return [
    hazard.source,
    hazard.id,
    hazard.ownerId ?? '',
    round(box.x),
    round(box.y),
    round(box.width),
    round(box.height)
  ].join(':');
};

const destroyMember = (engine, eventId, predicate) => {
  const entity = engine.entities.find((candidate) => (
    isOwnedMember(candidate, eventId) && predicate(candidate)
  ));
  assert.ok(entity, `missing live Mini-Boss Lab member for ${eventId}`);
  entity.hp = 0;
  engine.handleEnemyDestroyed(entity);
  assert.ok(entity.miniBossLabDeathStartedFrame >= 0);
  return entity;
};

const advancePastHitStop = (engine) => {
  for (let frame = 0; frame < 4; frame += 1) engine.update(false);
};

const recordTrace = ({ encounterId, seedSuffix = 'default', frames, setup }) => {
  const harness = createHarness(encounterId, seedSuffix);
  const { definition, engine, preview } = harness;
  const eventId = preview.eventId;
  const playerCollisionBox = engine.getCollisionBox(engine.player);
  const playerProfile = Object.freeze({
    collisionWidth: playerCollisionBox.width,
    collisionHeight: playerCollisionBox.height,
    startX: playerCollisionBox.x + playerCollisionBox.width / 2,
    startY: playerCollisionBox.y + playerCollisionBox.height / 2
  });
  const setupResult = setup?.({ ...harness, eventId });
  const trace = [];
  const stages = new Set();
  const reinforcementStages = new Set();
  const reinforcementIds = new Set();
  const hazardOwnerIds = new Set();
  const memberWallSides = new Set();
  let maximumOwnedMembers = 0;
  let maximumOwnedReinforcements = 0;
  let maximumOwnedProjectiles = 0;
  let maximumOwnedBeams = 0;
  let hash = 2166136261;
  const traceFrames = frames ?? completeCycleFrames(definition);

  for (let frame = 0; frame < traceFrames; frame += 1) {
    engine.update(false);
    const snapshot = engine.getPreviewSnapshot().miniBossEncounter;
    if (snapshot?.eventId === eventId) stages.add(snapshot.stage);

    const members = engine.entities.filter((entity) => isOwnedMember(entity, eventId));
    const reinforcements = engine.entities.filter((entity) => isOwnedReinforcement(entity, eventId));
    const projectiles = engine.entities.filter((entity) => isDamagingOwnedProjectile(entity, eventId));
    const beams = projectiles.filter((entity) => entity.isBeam);
    maximumOwnedMembers = Math.max(maximumOwnedMembers, members.length);
    maximumOwnedReinforcements = Math.max(maximumOwnedReinforcements, reinforcements.length);
    maximumOwnedProjectiles = Math.max(maximumOwnedProjectiles, projectiles.length - beams.length);
    maximumOwnedBeams = Math.max(maximumOwnedBeams, beams.length);
    for (const entity of members) {
      if (entity.miniBossLabWallSide) memberWallSides.add(entity.miniBossLabWallSide);
    }
    for (const reinforcement of reinforcements) {
      reinforcementIds.add(reinforcement.id);
      if (reinforcement.miniBossLabReinforcementStage) {
        reinforcementStages.add(reinforcement.miniBossLabReinforcementStage);
      }
    }

    const hazards = captureHazards(engine, eventId);
    for (const hazard of hazards) {
      if (hazard.ownerId) hazardOwnerIds.add(hazard.ownerId);
    }
    trace.push(hazards);
    hash = fnvUpdate(
      hash,
      `${frame}|${hazards.map(serializeHazard).join('|')}\n`
    );

    // The proof ship does not fire. Marking player rounds after the canonical
    // update prevents unrelated auto-fire presentation from growing the trace.
    for (const entity of engine.entities) {
      if (entity.isPlayerShot) entity.markedForDeletion = true;
    }
  }

  assert.ok(
    maximumOwnedMembers + maximumOwnedReinforcements <= definition.budgets.maximumHostileEntities,
    `${encounterId} exceeded its hostile-entity budget`
  );
  assert.ok(
    maximumOwnedProjectiles <= definition.budgets.maximumProjectiles,
    `${encounterId} exceeded its projectile budget`
  );
  assert.ok(
    maximumOwnedBeams <= definition.budgets.maximumBeams,
    `${encounterId} exceeded its beam budget`
  );
  assert.ok(
    reinforcementIds.size <= definition.budgets.maximumReinforcements,
    `${encounterId} exceeded its reinforcement ownership cap`
  );

  return {
    ...harness,
    eventId,
    hash: (hash >>> 0).toString(16).padStart(8, '0'),
    hazardOwnerIds,
    maximumOwnedBeams,
    maximumOwnedMembers,
    maximumOwnedProjectiles,
    maximumOwnedReinforcements,
    memberWallSides,
    playerProfile,
    reinforcementIds,
    reinforcementStages,
    setupResult,
    stages,
    trace
  };
};

const expandBox = (box, amount) => ({
  x: box.x - amount,
  y: box.y - amount,
  width: box.width + amount * 2,
  height: box.height + amount * 2
});

const aabbClearance = (left, right) => {
  const dx = Math.max(
    left.x - (right.x + right.width),
    right.x - (left.x + left.width),
    0
  );
  const dy = Math.max(
    left.y - (right.y + right.height),
    right.y - (left.y + left.height),
    0
  );
  if (dx > 0 || dy > 0) return Math.hypot(dx, dy);
  const overlapX = Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x);
  const overlapY = Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y);
  return -Math.min(overlapX, overlapY);
};

const beamClearance = (beam, playerBox) => {
  if (rotatedBeamRectangleIntersectsBox(beam, playerBox)) return -1;
  let low = 0;
  let high = 16;
  while (
    high < 512
    && !rotatedBeamRectangleIntersectsBox(beam, expandBox(playerBox, high))
  ) high *= 2;
  if (high >= 512 && !rotatedBeamRectangleIntersectsBox(beam, expandBox(playerBox, high))) {
    return high;
  }
  for (let iteration = 0; iteration < 9; iteration += 1) {
    const middle = (low + high) / 2;
    if (rotatedBeamRectangleIntersectsBox(beam, expandBox(playerBox, middle))) high = middle;
    else low = middle;
  }
  return low;
};

const frameClearance = (hazards, centerX, centerY, playerProfile) => {
  const playerBox = {
    x: centerX - playerProfile.collisionWidth / 2,
    y: centerY - playerProfile.collisionHeight / 2,
    width: playerProfile.collisionWidth,
    height: playerProfile.collisionHeight
  };
  let clearance = 999;
  let closestHazard;
  for (const hazard of hazards) {
    const rawClearance = hazard.kind === 'beam'
      ? beamClearance(hazard.beam, playerBox)
      : aabbClearance(hazard.box, playerBox);
    const adjustedClearance = rawClearance - GEOMETRY_UNCERTAINTY_PIXELS;
    if (adjustedClearance < clearance) {
      clearance = adjustedClearance;
      closestHazard = hazard;
    }
  }
  return { clearance, closestHazard };
};

const moveToward = (value, target, amount) => {
  if (value < target) return Math.min(value + amount, target);
  if (value > target) return Math.max(value - amount, target);
  return value;
};

const controls = Object.freeze(
  [-1, 0, 1].flatMap((y) => [-1, 0, 1].map((x) => {
    const length = Math.hypot(x, y) || 1;
    return Object.freeze({ x: x / length, y: y / length, id: `${x},${y}` });
  }))
);

const advanceState = (state, control, trace, startFrame, endFrame, playerProfile) => {
  let {
    x,
    y,
    vx,
    vy,
    minimumClearance,
    minimumClearanceFrame,
    minimumClearanceHazard
  } = state;
  let currentClearance = state.currentClearance;
  const targetVx = control.x * PLAYER_MAXIMUM_SPEED_PER_FRAME;
  const targetVy = control.y * PLAYER_MAXIMUM_SPEED_PER_FRAME;
  for (let frame = startFrame; frame < endFrame; frame += 1) {
    vx = moveToward(vx, targetVx, PLAYER_ACCELERATION_PER_FRAME);
    vy = moveToward(vy, targetVy, PLAYER_ACCELERATION_PER_FRAME);
    x = Math.max(0, Math.min(VIEWPORT.width, x + vx));
    y = Math.max(0, Math.min(VIEWPORT.height, y + vy));
    const result = frameClearance(trace[frame], x, y, playerProfile);
    currentClearance = result.clearance;
    if (currentClearance < minimumClearance) {
      minimumClearance = currentClearance;
      minimumClearanceFrame = frame;
      minimumClearanceHazard = result.closestHazard;
    }
  }
  return {
    x,
    y,
    vx,
    vy,
    minimumClearance,
    minimumClearanceFrame,
    minimumClearanceHazard,
    currentClearance,
    node: {
      parent: state.node,
      control,
      startFrame,
      endFrame
    }
  };
};

const stateKey = (state) => [
  Math.round(state.x / 10),
  Math.round(state.y / 10),
  Math.round(state.vx / 0.55),
  Math.round(state.vy / 0.55)
].join(':');

const stateScore = (state) => (
  state.minimumClearance * 1000
  + state.currentClearance * 2
  + Math.abs(state.x - VIEWPORT.width / 2) * 0.001
);

const reconstructNodes = (node) => {
  const nodes = [];
  for (let cursor = node; cursor; cursor = cursor.parent) nodes.push(cursor);
  return nodes.reverse();
};

const replayWitness = (trace, playerProfile, nodes) => {
  let state = {
    x: playerProfile.startX,
    y: playerProfile.startY,
    vx: 0,
    vy: 0,
    minimumClearance: 999,
    minimumClearanceFrame: undefined,
    minimumClearanceHazard: undefined,
    currentClearance: 999,
    node: undefined
  };
  const witness = [];
  for (const node of nodes) {
    const next = advanceState(
      state,
      node.control,
      trace,
      node.startFrame,
      node.endFrame,
      playerProfile
    );
    let x = state.x;
    let y = state.y;
    let vx = state.vx;
    let vy = state.vy;
    const targetVx = node.control.x * PLAYER_MAXIMUM_SPEED_PER_FRAME;
    const targetVy = node.control.y * PLAYER_MAXIMUM_SPEED_PER_FRAME;
    for (let frame = node.startFrame; frame < node.endFrame; frame += 1) {
      vx = moveToward(vx, targetVx, PLAYER_ACCELERATION_PER_FRAME);
      vy = moveToward(vy, targetVy, PLAYER_ACCELERATION_PER_FRAME);
      x = Math.max(0, Math.min(VIEWPORT.width, x + vx));
      y = Math.max(0, Math.min(VIEWPORT.height, y + vy));
      witness.push({ frame, x, y, vx, vy, control: node.control.id });
    }
    state = next;
  }
  return { state, witness };
};

const proveTraceRoute = ({ trace, playerProfile }) => {
  let states = [{
    x: playerProfile.startX,
    y: playerProfile.startY,
    vx: 0,
    vy: 0,
    minimumClearance: 999,
    minimumClearanceFrame: undefined,
    minimumClearanceHazard: undefined,
    currentClearance: 999,
    node: undefined
  }];

  for (let startFrame = 0; startFrame < trace.length; startFrame += CONTROL_FRAMES) {
    const endFrame = Math.min(trace.length, startFrame + CONTROL_FRAMES);
    const candidates = [];
    for (const state of states) {
      for (const control of controls) {
        const candidate = advanceState(
          state,
          control,
          trace,
          startFrame,
          endFrame,
          playerProfile
        );
        candidates.push(candidate);
      }
    }
    candidates.sort((left, right) => stateScore(right) - stateScore(left));
    const spatiallyDistinct = new Map();
    for (const candidate of candidates) {
      const key = stateKey(candidate);
      if (!spatiallyDistinct.has(key)) spatiallyDistinct.set(key, candidate);
      if (spatiallyDistinct.size >= SEARCH_BREADTH) break;
    }
    states = [...spatiallyDistinct.values()];
  }

  states.sort((left, right) => stateScore(right) - stateScore(left));
  const winner = states[0];
  const nodes = reconstructNodes(winner.node);
  const replay = replayWitness(trace, playerProfile, nodes);
  assert.equal(replay.witness.length, trace.length);
  assert.ok(
    Math.abs(replay.state.minimumClearance - winner.minimumClearance) < 1e-9,
    'route replay must preserve the exact discovered clearance'
  );
  const witnessHash = hashStrings(replay.witness.map((point) => (
    `${point.frame}:${round(point.x, 5)}:${round(point.y, 5)}:${round(point.vx, 5)}:${round(point.vy, 5)}:${point.control}`
  )));
  if (
    replay.state.minimumClearance + CLEARANCE_EPSILON
    < REQUIRED_CLEARANCE_AFTER_UNCERTAINTY_PIXELS
  ) {
    const closest = replay.state.minimumClearanceHazard;
    const closestFrame = replay.state.minimumClearanceFrame;
    const playerPoint = Number.isInteger(closestFrame)
      ? replay.witness[closestFrame]
      : undefined;
    const geometry = closest?.kind === 'beam'
      ? `beam=${JSON.stringify(Object.fromEntries(Object.entries(closest.beam).map(([key, value]) => [key, round(value, 4)])))}`
      : `box=${JSON.stringify(Object.fromEntries(Object.entries(closest?.box ?? {}).map(([key, value]) => [key, round(value, 4)])))}`;
    return {
      status: 'unproven',
      checkedFrames: trace.length,
      minimumClearancePixels: replay.state.minimumClearance,
      minimumClearanceFrame: closestFrame,
      closestHazard: closest,
      closestPlayerPoint: playerPoint,
      witnessHash,
      detail: `The widest bounded-search route retained ${round(replay.state.minimumClearance, 3)}px after uncertainty; ${REQUIRED_CLEARANCE_AFTER_UNCERTAINTY_PIXELS}px is required. Closest live hazard: ${closest?.source ?? 'unknown'} (${closest?.id ?? 'unknown'}) at frame ${closestFrame ?? 'unknown'}, ${geometry}, playerCenter=${playerPoint ? `${round(playerPoint.x, 4)},${round(playerPoint.y, 4)}` : 'unknown'}.`
    };
  }
  return {
    status: 'proven',
    checkedFrames: trace.length,
    minimumClearancePixels: replay.state.minimumClearance,
    witnessHash,
    witness: replay.witness
  };
};

const assertProvenRoute = (label, recorded) => {
  const proof = proveTraceRoute(recorded);
  assert.equal(proof.status, 'proven', `${label}: ${proof.detail ?? 'route unproven'}`);
  assert.ok(
    proof.minimumClearancePixels + CLEARANCE_EPSILON
      >= REQUIRED_CLEARANCE_AFTER_UNCERTAINTY_PIXELS,
    `${label} retained only ${proof.minimumClearancePixels}px after uncertainty`
  );
  assert.match(proof.witnessHash, /^[0-9a-f]{8}$/);
  assert.equal(proof.checkedFrames, recorded.trace.length);
  return proof;
};

test('all eight 390x844 Mini-Boss Lab encounters replay the same live hazards and retain a proven route', { timeout: 180_000 }, () => {
  const evidence = [];
  const failures = [];
  for (const encounterId of selectedProofEncounterIds) {
    const first = recordTrace({ encounterId, seedSuffix: 'normal' });
    const repeated = recordTrace({ encounterId, seedSuffix: 'normal' });
    assert.equal(repeated.hash, first.hash, `${encounterId} changed its actual GameEngine hazard trace`);
    assert.deepEqual([...repeated.stages], [...first.stages]);
    assert.ok(first.stages.has('signature'), `${encounterId} never executed its signature stage`);
    assert.ok(first.stages.has('support'), `${encounterId} never executed its support stage`);
    const proof = proveTraceRoute(first);
    if (proof.status !== 'proven') {
      failures.push(`${encounterId}: ${proof.detail}`);
      continue;
    }
    assert.ok(
      proof.minimumClearancePixels + CLEARANCE_EPSILON
        >= REQUIRED_CLEARANCE_AFTER_UNCERTAINTY_PIXELS
    );
    assert.match(proof.witnessHash, /^[0-9a-f]{8}$/);
    assert.equal(proof.checkedFrames, first.trace.length);
    evidence.push({
      encounterId,
      traceHash: first.hash,
      witnessHash: proof.witnessHash,
      minimumClearancePixels: round(proof.minimumClearancePixels, 6)
    });
  }
  assert.deepEqual(failures, [], failures.join('\n'));
  assert.equal(evidence.length, selectedProofEncounterIds.length);
  assert.ok(evidence.every((item) => item.minimumClearancePixels >= 6));
});

test('both paired encounters retain owner-clean survivor routes for either surviving side', { timeout: 120_000 }, () => {
  for (const encounterId of ['fracture-engine-elite', 'twin-meridian-sentinels']) {
    for (const destroyedRole of ['leader', 'partner']) {
      const recorded = recordTrace({
        encounterId,
        seedSuffix: `survivor-after-${destroyedRole}`,
        setup: ({ engine, eventId }) => destroyMember(
          engine,
          eventId,
          (entity) => entity.miniBossLabRole === destroyedRole
        )
      });
      assert.ok(recorded.stages.has('survivor'));
      assert.equal(
        recorded.hazardOwnerIds.has(recorded.setupResult.id),
        false,
        `${encounterId} kept a hazard owned by its destroyed ${destroyedRole}`
      );
      assertProvenRoute(`${encounterId}/${destroyedRole}-destroyed`, recorded);
    }
  }
});

test('guardian and convoy protection open at their authored surviving-unit thresholds', () => {
  const aegis = createHarness('aegis-brood-core', 'guardian-exposure');
  aegis.engine.checkCollisions = () => {};
  advancePastHitStop(aegis.engine);
  const aegisEventId = aegis.preview.eventId;
  const aegisCore = aegis.engine.entities.find((entity) => (
    isOwnedMember(entity, aegisEventId) && entity.miniBossLabRole === 'primary'
  ));
  assert.ok(aegisCore);
  assert.equal(aegisCore.miniBossLabShielded, true);
  for (let index = 0; index < 3; index += 1) {
    destroyMember(aegis.engine, aegisEventId, (entity) => entity.miniBossLabRole === 'guardian');
  }
  advancePastHitStop(aegis.engine);
  assert.equal(aegisCore.miniBossLabShielded, true, 'three surviving guardians must still guard the core');
  destroyMember(aegis.engine, aegisEventId, (entity) => entity.miniBossLabRole === 'guardian');
  advancePastHitStop(aegis.engine);
  assert.equal(aegisCore.miniBossLabShielded, false, 'two surviving guardians must expose the core');
  assert.equal(aegisCore.miniBossLabDamageable, true);

  const convoy = createHarness('aegis-convoy-captain', 'escort-exposure');
  convoy.engine.checkCollisions = () => {};
  advancePastHitStop(convoy.engine);
  const convoyEventId = convoy.preview.eventId;
  const captain = convoy.engine.entities.find((entity) => (
    isOwnedMember(entity, convoyEventId) && entity.miniBossLabRole === 'primary'
  ));
  assert.ok(captain);
  assert.equal(captain.miniBossLabShielded, true);
  for (let index = 0; index < 3; index += 1) {
    destroyMember(convoy.engine, convoyEventId, (entity) => entity.miniBossLabRole === 'escort');
  }
  advancePastHitStop(convoy.engine);
  assert.equal(captain.miniBossLabShielded, false, 'one surviving escort must expose the captain');
  assert.equal(captain.miniBossLabDamageable, true);
});

test('Railspine proves both authored wall sides and Gridline removes only the destroyed owner boundary', { timeout: 120_000 }, () => {
  for (const side of ['left', 'right']) {
    const recorded = recordTrace({
      encounterId: 'railspine-wallcrawler',
      seedSuffix: `wall-${side}`,
      setup: ({ engine, eventId }) => {
        assert.equal(engine.setPreviewMiniBossWallSide(eventId, side), true);
      }
    });
    assert.deepEqual([...recorded.memberWallSides], [side]);
    assert.ok(recorded.maximumOwnedBeams > 0);
    assertProvenRoute(`railspine-wallcrawler/${side}`, recorded);
  }

  for (const destroyedRole of ['sentry-west', 'sentry-north']) {
    const recorded = recordTrace({
      encounterId: 'gridline-sentries',
      seedSuffix: `grid-owner-${destroyedRole}`,
      setup: ({ engine, eventId }) => destroyMember(
        engine,
        eventId,
        (entity) => entity.miniBossLabRole === destroyedRole
      )
    });
    assert.equal(recorded.maximumOwnedMembers, 1);
    assert.equal(recorded.maximumOwnedBeams, 1);
    assert.equal(recorded.hazardOwnerIds.has(recorded.setupResult.id), false);
    assertProvenRoute(`gridline-sentries/${destroyedRole}-destroyed`, recorded);
  }
});

test('Maw Carrier reinforcement deployment is staged, bounded, deterministic, and owner-clean', () => {
  const definition = getMiniBossEncounterDefinition('maw-carrier');
  const signatureFrames = attackDurationFrames(definition.signature);
  const recorded = recordTrace({
    encounterId: 'maw-carrier',
    seedSuffix: 'reinforcement-cap',
    frames: signatureFrames * 2 + 8,
    setup: ({ engine, eventId }) => {
      assert.equal(engine.setPreviewMiniBossSignatureLoop(eventId, true), true);
    }
  });
  assert.equal(recorded.reinforcementIds.size, definition.budgets.maximumReinforcements);
  assert.ok(recorded.maximumOwnedReinforcements <= definition.budgets.maximumReinforcements);
  assert.deepEqual(
    new Set(recorded.reinforcementStages),
    new Set(['deploy', 'activation', 'active'])
  );
});

test('defeating every encounter removes all owned members, beams, projectiles, and reinforcements while preserving unrelated entities', { timeout: 60_000 }, () => {
  for (const encounterId of MINI_BOSS_LAB_ENCOUNTER_IDS) {
    const { engine, preview } = createHarness(encounterId, 'cleanup');
    engine.checkCollisions = () => {};
    for (let frame = 0; frame < 180; frame += 1) engine.update(false);

    const unrelated = new Entity(EntityType.EFFECT, 180, 420, 0.8125);
    unrelated.sourceEventId = 'mini-boss-safe-route:unrelated';
    unrelated.life = 1000;
    unrelated.maxLife = 1000;
    engine.entities.push(unrelated);

    assert.equal(engine.triggerPreviewMiniBossDeath(preview.eventId), true);
    for (let frame = 0; frame < 72; frame += 1) engine.update(false);

    const ownedResidue = engine.entities.filter((entity) => (
      entity.sourceEventId === preview.eventId && !entity.markedForDeletion
    ));
    assert.deepEqual(
      ownedResidue.map((entity) => ({
        id: entity.id,
        type: entity.type,
        sourceItemId: entity.sourceItemId,
        reinforcementStage: entity.miniBossLabReinforcementStage,
        isBeam: entity.isBeam
      })),
      [],
      `${encounterId} left owned runtime residue after completion`
    );
    assert.equal(unrelated.markedForDeletion, false, `${encounterId} deleted an unrelated entity`);
    assert.ok(engine.entities.includes(unrelated));
    assert.equal(
      engine.pendingEnemyLasers.some((laser) => (
        engine.entities.some((entity) => (
          entity.sourceEventId === preview.eventId && entity.id === laser.sourceId
        ))
      )),
      false,
      `${encounterId} left an owned pending laser`
    );
  }
});

test('the proof uses the canonical player collision geometry and does not accept metadata-only corridor widths', () => {
  const recorded = recordTrace({ encounterId: 'fracture-engine-elite', seedSuffix: 'proof-contract' });
  assert.equal(round(recorded.playerProfile.collisionWidth, 2), 51.24);
  assert.equal(round(recorded.playerProfile.collisionHeight, 2), 63.44);
  assert.equal(REQUIRED_RAW_CLEARANCE_PIXELS, 9);
  assert.doesNotMatch(
    proveTraceRoute.toString(),
    /corridorWidthPixels|minimumGapPixels|safeRoute\.variants/
  );
  assert.ok(recorded.trace.some((frame) => frame.some((hazard) => hazard.source === 'projectile')));
});

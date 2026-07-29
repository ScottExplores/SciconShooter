import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  MINI_BOSS_ENCOUNTER_DEFINITIONS,
  MINI_BOSS_LAB_ASSET_INVENTORY,
  getMiniBossEncounterByEventId,
  getMiniBossEncounterDefinition,
  isMiniBossLabEventId,
  listMiniBossEncountersByCategory
} from './MiniBossEncounterRegistry.ts';
import {
  createMiniBossMemberInstances,
  resolveMiniBossMemberAssetUrl,
  sampleMiniBossEncounter
} from './MiniBossEncounterRuntime.ts';
import {
  proveMiniBossSafeRoute,
  validateMiniBossEncounterDefinition,
  validateMiniBossEncounterFrame,
  validateMiniBossEncounterRegistry
} from './MiniBossEncounterValidation.ts';
import { MINI_BOSS_LAB_ENCOUNTER_IDS } from './types.ts';

const DEFAULT_FPS = 60;

const actionStartFrame = (
  encounterId: (typeof MINI_BOSS_LAB_ENCOUNTER_IDS)[number],
  kind: 'signature' | 'support' = 'signature'
) => {
  const definition = getMiniBossEncounterDefinition(encounterId)!;
  const entrance = Math.round(definition.entranceSeconds * DEFAULT_FPS);
  const signatureWarning = Math.round(definition.signature.telegraphSeconds * DEFAULT_FPS);
  if (kind === 'signature') return entrance + signatureWarning;
  const signatureTotal = Math.round((
    definition.signature.telegraphSeconds
    + definition.signature.activeSeconds
    + definition.signature.recoverySeconds
  ) * DEFAULT_FPS);
  return entrance + signatureTotal + Math.round(definition.support.telegraphSeconds * DEFAULT_FPS);
};

test('registry contains eight Campaign-assigned definitions that remain Sandbox-previewable', () => {
  assert.deepEqual(
    MINI_BOSS_ENCOUNTER_DEFINITIONS.map((definition) => definition.id),
    [...MINI_BOSS_LAB_ENCOUNTER_IDS]
  );
  assert.equal(MINI_BOSS_ENCOUNTER_DEFINITIONS.length, 8);
  assert.deepEqual(
    MINI_BOSS_ENCOUNTER_DEFINITIONS.map((definition) => definition.batch),
    ['A', 'A', 'A', 'A', 'B', 'B', 'B', 'B'],
    'Batch A remains the first validated vertical slice before Batch B'
  );
  for (const definition of MINI_BOSS_ENCOUNTER_DEFINITIONS) {
    assert.equal(definition.sandboxReady, true);
    assert.equal(definition.campaignAssigned, true);
    assert.match(definition.eventId, new RegExp(`^sandbox-mini-boss-lab:${definition.id}:v1$`));
    assert.ok(definition.expectedDurationSeconds >= 15 && definition.expectedDurationSeconds <= 35);
    assert.notEqual(definition.signature.name, definition.support.name);
    assert.equal(getMiniBossEncounterByEventId(definition.eventId), definition);
    assert.equal(isMiniBossLabEventId(definition.eventId), true);
  }
  assert.equal(isMiniBossLabEventId('campaign-stage-20'), false);
});

test('Boss Sandbox preview event aliases resolve to the same stable definitions', () => {
  for (const definition of MINI_BOSS_ENCOUNTER_DEFINITIONS) {
    assert.equal(getMiniBossEncounterByEventId(definition.eventId), definition);
    assert.equal(getMiniBossEncounterByEventId(`sandbox-${definition.id}`), definition);
    assert.equal(isMiniBossLabEventId(`sandbox-${definition.id}`), true);
  }
});

test('category queries expose encounter metadata to Campaign and Sandbox consumers', () => {
  const paired = listMiniBossEncountersByCategory('paired-encounters').map((definition) => definition.id);
  assert.ok(paired.includes('fracture-engine-elite'));
  assert.ok(paired.includes('twin-meridian-sentinels'));
  assert.ok(paired.includes('gridline-sentries'));
  assert.ok(listMiniBossEncountersByCategory('wall-encounters').some((definition) => definition.id === 'railspine-wallcrawler'));
});

test('all definitions and the complete registry pass structural and safety validation', () => {
  assert.deepEqual(validateMiniBossEncounterRegistry(), []);
  for (const definition of MINI_BOSS_ENCOUNTER_DEFINITIONS) {
    assert.deepEqual(validateMiniBossEncounterDefinition(definition), []);
    assert.equal(proveMiniBossSafeRoute(definition, 390, 844).passed, true);
    assert.equal(proveMiniBossSafeRoute(definition, 780, 1688).passed, true);
  }
});

test('every sampled encounter is deterministic for the same frame, seed, and state', () => {
  for (const definition of MINI_BOSS_ENCOUNTER_DEFINITIONS) {
    const frame = actionStartFrame(definition.id) + definition.signature.emissionIntervalFrames * 2;
    const context = { frame, seed: 'repeatable-test-seed', viewportWidth: 390, viewportHeight: 844 } as const;
    assert.deepEqual(
      sampleMiniBossEncounter(definition, context),
      sampleMiniBossEncounter(definition, context),
      definition.id
    );
  }
});

test('every Mini-Boss Lab encounter has purposeful light motion instead of a static sprite', () => {
  for (const definition of MINI_BOSS_ENCOUNTER_DEFINITIONS) {
    const entranceEndFrame = Math.ceil(definition.entranceSeconds * DEFAULT_FPS);
    const first = sampleMiniBossEncounter(definition, {
      frame: entranceEndFrame + 7,
      seed: 'light-motion-proof',
      viewportWidth: 390,
      viewportHeight: 844
    }).members.find((member) => member.alive)!;
    const second = sampleMiniBossEncounter(definition, {
      frame: entranceEndFrame + 36,
      seed: 'light-motion-proof',
      viewportWidth: 390,
      viewportHeight: 844
    }).members.find((member) => member.id === first.id)!;
    const visibleMotion = Math.max(
      Math.abs(second.x - first.x),
      Math.abs(second.y - first.y),
      Math.abs(second.rotationRadians - first.rotationRadians) * 100,
      Math.abs(second.scale - first.scale) * 100
    );

    assert.ok(
      visibleMotion > 0.1,
      `${definition.displayName} must visibly breathe, sway, rotate, or shift while alive`
    );
  }
});

test('mini-boss means encounter role, so every primary body remains readable at boss scale', () => {
  for (const definition of MINI_BOSS_ENCOUNTER_DEFINITIONS) {
    const primaryAssetIds = new Set(
      definition.assets
        .filter((binding) => binding.usage === 'primary-body')
        .map((binding) => binding.id)
    );
    const primaryBodies = definition.memberArchetypes.filter((member) => (
      primaryAssetIds.has(member.assetId)
    ));

    assert.ok(primaryBodies.length > 0, `${definition.displayName} must have a primary body`);
    assert.ok(
      primaryBodies.every((member) => member.widthPixels >= 112 && member.heightPixels >= 112),
      `${definition.displayName} primary art must stay large enough to read in the mobile arena`
    );
  }
});

test('Fracture Engine Elite uses ordered alternating diagonal crossfire and linked satellites', () => {
  const definition = getMiniBossEncounterDefinition('fracture-engine-elite')!;
  if (definition.choreography.kind !== 'paired-crossfire') {
    assert.fail('Fracture Engine Elite must use paired-crossfire choreography');
  }
  const baseCadenceFrames = definition.choreography.baseCadenceFrames;
  const start = actionStartFrame(definition.id);
  const samples = Array.from({ length: 4 }, (_, index) => sampleMiniBossEncounter(definition, {
    frame: start + index * baseCadenceFrames,
    seed: 'fracture-order'
  }));
  const sources = samples.map((frameState) => {
    const hazard = frameState.hazards.find((candidate) => candidate.emitNow)!;
    assert.equal(hazard.kind, 'diagonal-crossfire');
    assert.equal(hazard.projectileCount, definition.signature.maximumProjectilesPerEmission);
    return hazard.sourceMemberId;
  });
  assert.notEqual(sources[0], sources[1]);
  assert.equal(sources[0], sources[2]);
  assert.equal(sources[1], sources[3]);
  assert.equal(samples[0].members.filter((member) => member.role === 'satellite').length, 4);
});

test('Fracture Engine survivor becomes slower and one-sided after its partner dies', () => {
  const definition = getMiniBossEncounterDefinition('fracture-engine-elite')!;
  const instances = createMiniBossMemberInstances(definition);
  const cores = instances.filter((member) => member.archetypeId === 'fracture-core');
  const start = actionStartFrame(definition.id);
  const context = {
    seed: 'fracture-survivor',
    members: [{ id: cores[0].id, health: 0, alive: false }]
  } as const;
  const first = sampleMiniBossEncounter(definition, { ...context, frame: start });
  const oldCadenceFrame = sampleMiniBossEncounter(definition, {
    ...context,
    frame: start + definition.signature.emissionIntervalFrames
  });
  assert.equal(first.stage, 'survivor');
  assert.equal(first.survivorMode, true);
  assert.equal(first.hazards[0].projectileCount, 2);
  assert.equal(first.hazards[0].sourceMemberId, cores[1].id);
  assert.equal(oldCadenceFrame.hazards[0].emitNow, false, 'survivor cadence must be slower than the paired cadence');
});

test('guardian protection opens only after enough Aegis Brood guardians are destroyed', () => {
  const definition = getMiniBossEncounterDefinition('aegis-brood-core')!;
  const instances = createMiniBossMemberInstances(definition);
  const core = instances.find((member) => member.archetypeId === 'aegis-core')!;
  const guardians = instances.filter((member) => member.archetypeId === 'aegis-guardian');
  const start = actionStartFrame(definition.id);
  const guarded = sampleMiniBossEncounter(definition, { frame: start });
  assert.equal(guarded.guard.active, true);
  assert.equal(guarded.guard.primaryExposed, false);
  assert.equal(guarded.members.find((member) => member.id === core.id)!.damageable, false);

  const exposed = sampleMiniBossEncounter(definition, {
    frame: start,
    members: guardians.slice(0, 4).map((member) => ({ id: member.id, health: 0, alive: false }))
  });
  assert.equal(exposed.guard.survivingGuardianCount, 2);
  assert.equal(exposed.guard.primaryExposed, true);
  assert.equal(exposed.members.find((member) => member.id === core.id)!.damageable, true);
});

test('Railspine stays edge-attached while its rail uses the opposite playfield edge', () => {
  const definition = getMiniBossEncounterDefinition('railspine-wallcrawler')!;
  const frameState = sampleMiniBossEncounter(definition, { frame: actionStartFrame(definition.id), seed: 'rail-edge' });
  const wallcrawler = frameState.members[0];
  const rail = frameState.hazards[0];
  assert.equal(wallcrawler.edgeAttached, true);
  assert.ok(wallcrawler.x < 40 || wallcrawler.x > 350);
  assert.equal(rail.kind, 'rail-sweep');
  assert.ok(rail.target.x === 0 || rail.target.x === 390);
  assert.notEqual(rail.origin.x, rail.target.x);
});

test('Maw Carrier reinforcement requests are encounter-owned and capped by remaining budget', () => {
  const definition = getMiniBossEncounterDefinition('maw-carrier')!;
  const start = actionStartFrame(definition.id);
  const oneSlot = sampleMiniBossEncounter(definition, { frame: start, reinforcementsSpawned: 5 });
  assert.equal(oneSlot.reinforcements.length, 1);
  assert.equal(oneSlot.reinforcements[0].count, 1);
  assert.equal(oneSlot.reinforcements[0].ownerEventId, definition.eventId);

  const capped = sampleMiniBossEncounter(definition, { frame: start, reinforcementsSpawned: 6 });
  assert.deepEqual(capped.reinforcements, []);
});

test('paired Meridian survivor keeps one source and slows its firing cadence', () => {
  const definition = getMiniBossEncounterDefinition('twin-meridian-sentinels')!;
  const sentinels = createMiniBossMemberInstances(definition);
  const start = actionStartFrame(definition.id);
  const context = { members: [{ id: sentinels[0].id, health: 0, alive: false }] } as const;
  const first = sampleMiniBossEncounter(definition, { ...context, frame: start });
  const oldCadence = sampleMiniBossEncounter(definition, {
    ...context,
    frame: start + definition.signature.emissionIntervalFrames
  });
  assert.equal(first.survivorMode, true);
  assert.equal(first.hazards[0].sourceMemberId, sentinels[1].id);
  assert.equal(oldCadence.hazards[0].emitNow, false);
});

test('Prism Bloom always emits an incomplete ring with a deterministic passable gap', () => {
  const definition = getMiniBossEncounterDefinition('prism-bloom')!;
  const frameState = sampleMiniBossEncounter(definition, { frame: actionStartFrame(definition.id), seed: 42 });
  const ring = frameState.hazards[0];
  assert.equal(ring.kind, 'ring-with-gap');
  assert.ok((ring.gapArcRadians ?? 0) > 0);
  assert.equal(definition.choreography.kind, 'rotating-gap');
  if (definition.choreography.kind === 'rotating-gap') {
    assert.ok(ring.projectileCount < definition.choreography.projectileCount);
  }
});

test('Convoy captain guard follows surviving escorts', () => {
  const definition = getMiniBossEncounterDefinition('aegis-convoy-captain')!;
  const instances = createMiniBossMemberInstances(definition);
  const captain = instances.find((member) => member.archetypeId === 'convoy-captain')!;
  const escorts = instances.filter((member) => member.archetypeId === 'convoy-escort');
  const start = actionStartFrame(definition.id);
  const protectedFrame = sampleMiniBossEncounter(definition, { frame: start });
  assert.equal(protectedFrame.members.find((member) => member.id === captain.id)!.damageable, false);
  const openFrame = sampleMiniBossEncounter(definition, {
    frame: start,
    members: escorts.slice(0, 3).map((member) => ({ id: member.id, health: 0, alive: false }))
  });
  assert.equal(openFrame.guard.survivingGuardianCount, 1);
  assert.equal(openFrame.members.find((member) => member.id === captain.id)!.damageable, true);
});

test('Gridline Sentries preserve a named quadrant with exactly two owned boundaries', () => {
  const definition = getMiniBossEncounterDefinition('gridline-sentries')!;
  const frameState = sampleMiniBossEncounter(definition, { frame: actionStartFrame(definition.id), seed: 'grid-proof' });
  assert.equal(frameState.members.length, 2);
  assert.match(frameState.safeCorridorId, /^grid-/);
  assert.equal(frameState.hazards.length, 2);
  assert.ok(frameState.hazards.every((hazard) => hazard.kind === 'grid-boundary'));
  assert.ok(frameState.members.every((member) => member.edgeAttached));
});

test('Gridline Sentries remove only the boundary owned by a destroyed sentry', () => {
  const definition = getMiniBossEncounterDefinition('gridline-sentries')!;
  const instances = createMiniBossMemberInstances(definition);
  const west = instances.find((member) => member.role === 'sentry-west')!;
  const north = instances.find((member) => member.role === 'sentry-north')!;
  const frame = actionStartFrame(definition.id);
  const withoutWest = sampleMiniBossEncounter(definition, {
    frame,
    seed: 'grid-destruction-proof',
    members: [{ id: west.id, health: 0, alive: false }]
  });
  const withoutNorth = sampleMiniBossEncounter(definition, {
    frame,
    seed: 'grid-destruction-proof',
    members: [{ id: north.id, health: 0, alive: false }]
  });

  assert.equal(withoutWest.hazards.length, 1);
  assert.equal(withoutWest.hazards[0]?.sourceMemberId, north.id);
  assert.equal(withoutNorth.hazards.length, 1);
  assert.equal(withoutNorth.hazards[0]?.sourceMemberId, west.id);
});

test('all sampled attack and cleanup frames obey budgets and owner-scoped cleanup', () => {
  for (const definition of MINI_BOSS_ENCOUNTER_DEFINITIONS) {
    const attackFrame = sampleMiniBossEncounter(definition, { frame: actionStartFrame(definition.id), seed: 'budget-proof' });
    assert.deepEqual(validateMiniBossEncounterFrame(definition, attackFrame), [], `${definition.id} attack frame`);

    const allDefeated = createMiniBossMemberInstances(definition)
      .filter((member) => member.damageable)
      .map((member) => ({ id: member.id, health: 0, alive: false }));
    const cleanupFrame = sampleMiniBossEncounter(definition, {
      frame: actionStartFrame(definition.id),
      members: allDefeated,
      defeatElapsedFrames: 48
    });
    assert.equal(cleanupFrame.stage, 'cleanup');
    assert.equal(cleanupFrame.cleanup.requested, true);
    assert.equal(cleanupFrame.cleanup.ownerEventId, definition.eventId);
    assert.equal(cleanupFrame.cleanup.preserveUnrelatedEntities, true);
    assert.deepEqual(cleanupFrame.hazards, []);
    assert.deepEqual(cleanupFrame.reinforcements, []);
    assert.deepEqual(validateMiniBossEncounterFrame(definition, cleanupFrame), []);
  }
});

test('expected duration is tuning metadata and never despawns a living encounter', () => {
  for (const definition of MINI_BOSS_ENCOUNTER_DEFINITIONS) {
    const lateFrame = sampleMiniBossEncounter(definition, {
      frame: Math.ceil((definition.expectedDurationSeconds + 8) * DEFAULT_FPS),
      seed: 'duration-is-not-cleanup'
    });
    assert.notEqual(lateFrame.stage, 'cleanup');
    assert.equal(lateFrame.cleanup.requested, false);
    assert.ok(lateFrame.members.some((member) => member.alive));
  }
});

test('generated primary art preserves one readable identity across runtime animation states', () => {
  const definition = getMiniBossEncounterDefinition('fracture-engine-elite')!;
  const member = sampleMiniBossEncounter(definition, { frame: actionStartFrame(definition.id) }).members
    .find((candidate) => candidate.archetypeId === 'fracture-core')!;
  const attackUrl = resolveMiniBossMemberAssetUrl(definition, member, 0)!;
  assert.match(attackUrl, /mini-boss-lab-v2\/fracture-engine-elite\/fracture-engine-elite-neutral\.png$/);
  assert.equal(
    resolveMiniBossMemberAssetUrl(definition, { ...member, animationState: 'damage', healthRatio: 0.4 }, 0),
    attackUrl
  );
  assert.equal(
    resolveMiniBossMemberAssetUrl(definition, { ...member, animationState: 'critical', healthRatio: 0.1 }, 0),
    attackUrl
  );
});

test('asset inventory is explicit, approved, and points only at existing runtime art URLs', () => {
  assert.equal(
    MINI_BOSS_LAB_ASSET_INVENTORY.length,
    MINI_BOSS_ENCOUNTER_DEFINITIONS.reduce((total, definition) => total + definition.assets.length, 0)
  );
  assert.ok(MINI_BOSS_LAB_ASSET_INVENTORY.length >= 32);
  for (const item of MINI_BOSS_LAB_ASSET_INVENTORY) {
    assert.equal(item.galleryCategory, 'Mini Bosses');
    if (item.usage === 'primary-body') {
      assert.equal(item.status, 'approved-generated');
      assert.equal(item.provenance, 'generated-mini-boss-lab-v2');
    } else {
      assert.equal(item.status, 'approved-existing');
      assert.equal(item.provenance, 'existing-runtime-art');
    }
    for (const path of [...(item.frames ?? []), ...(item.url ? [item.url] : [])]) {
      assert.match(path, /^\/game-art\//);
      const publicAssetPath = fileURLToPath(new URL(`../../../public${path}`, import.meta.url));
      assert.equal(
        existsSync(publicAssetPath),
        true,
        `${item.encounterId} is bound to a missing runtime asset: ${path}`
      );
    }
  }
});

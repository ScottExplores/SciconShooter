import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '..', '..');
const campaign = JSON.parse(await readFile(path.join(
  repositoryRoot,
  'game-config',
  'campaign.json'
), 'utf8'));

const vite = await createServer({
  root: repositoryRoot,
  configFile: false,
  resolve: { alias: { '@game': repositoryRoot } },
  server: { middlewareMode: true, hmr: false },
  appType: 'custom'
});
after(async () => vite.close());

const prototypeRuntime = await vite.ssrLoadModule(
  '/director/src/combat-lab/sandboxBossPrototypes.ts'
);
const proofRuntime = await vite.ssrLoadModule(
  '/services/gameplay/bosses/AbyssalOctarchSafeRouteProof.ts'
);
const octarchRuntime = await vite.ssrLoadModule(
  '/services/gameplay/bosses/AbyssalOctarchRuntime.ts'
);
const timelineRuntime = await vite.ssrLoadModule(
  '/services/gameplay/bosses/BossTimelineRuntime.ts'
);

const preview = prototypeRuntime.buildSandboxBossPrototypePreview(
  campaign,
  'abyssal-octarch'
);
const sandboxBoss = preview.previewWave.events.find((event) => (
  event.kind === 'boss' && event.id === 'sandbox-abyssal-octarch'
));
assert.ok(sandboxBoss?.timeline, 'Abyssal Octarch must expose a compiled Sandbox timeline');
const timeline = sandboxBoss.timeline;

const variantKeys = timeline.attacks.flatMap((attack) => (
  attack.variants.map((variant) => `${variant.phaseId}/${attack.id}`)
));
let routeMatrix;
const getRouteMatrix = () => (
  routeMatrix ??= proofRuntime.buildAbyssalOctarchSafeRouteMatrix(timeline)
);

test('every retained compiled Sandbox variant proves both portrait host contracts', () => {
  const matrix = getRouteMatrix();
  const presentationIds = Object.values(
    proofRuntime.ABYSSAL_OCTARCH_SAFE_ROUTE_PRESENTATIONS
  ).map((presentation) => presentation.id);

  assert.equal(matrix.length, variantKeys.length * presentationIds.length);
  assert.deepEqual(
    [...new Set(matrix.map((entry) => `${entry.phaseId}/${entry.attackId}`))],
    variantKeys
  );
  const failures = matrix.filter((entry) => entry.proof.status !== 'proven');
  assert.deepEqual(
    failures.map((entry) => ({
      attackId: entry.attackId,
      phaseId: entry.phaseId,
      presentationId: entry.presentationId,
      reason: entry.proof.reason,
      detail: entry.proof.detail
    })),
    [],
    JSON.stringify(failures, null, 2)
  );

  for (const entry of matrix) {
    const { proof } = entry;
    assert.equal(proof.seed, proofRuntime.ABYSSAL_OCTARCH_SAFE_ROUTE_SEED);
    assert.equal(
      proof.geometryUncertaintyPixels,
      proofRuntime.ABYSSAL_OCTARCH_GEOMETRY_UNCERTAINTY_PIXELS
    );
    assert.ok(
      proof.minimumRawClearancePixels
        >= proofRuntime.ABYSSAL_OCTARCH_REQUIRED_RAW_CLEARANCE_PIXELS
    );
    assert.ok(
      proof.minimumClearanceAfterUncertaintyPixels
        >= proofRuntime.ABYSSAL_OCTARCH_REQUIRED_CLEARANCE_AFTER_UNCERTAINTY_PIXELS
    );
    assert.equal(proof.worldWidth, 542);
    assert.equal(proof.worldHeight, 1172);
    assert.equal(proof.checkedFrames, proof.durationFrames);
    assert.equal(proof.witness.length, proof.durationFrames);
    assert.match(proof.routeHash, /^[0-9a-f]{8}$/);
    assert.match(proof.configurationHash, /^[0-9a-f]{8}$/);
    assert.ok(proof.witness.every((point) => (
      Number.isFinite(point.x)
      && Number.isFinite(point.y)
      && Number.isFinite(point.rawClearancePixels)
      && Number.isFinite(point.clearanceAfterUncertaintyPixels)
    )));
  }
});

test('wide hosts preserve the exact portrait route instead of widening gameplay', () => {
  const matrix = getRouteMatrix();
  for (const key of variantKeys) {
    const entries = matrix.filter((entry) => (
      `${entry.phaseId}/${entry.attackId}` === key
    ));
    assert.equal(entries.length, 2);
    const portrait = entries.find((entry) => (
      entry.presentationId === 'portrait-390x844'
    ));
    const wideHost = entries.find((entry) => (
      entry.presentationId === 'wide-host-1440x900-portrait-390x844'
    ));
    assert.ok(portrait && wideHost);
    assert.equal(wideHost.proof.worldWidth, portrait.proof.worldWidth);
    assert.equal(wideHost.proof.worldHeight, portrait.proof.worldHeight);
    assert.equal(wideHost.proof.routeHash, portrait.proof.routeHash);
    assert.notEqual(
      wideHost.proof.configurationHash,
      portrait.proof.configurationHash,
      'host presentation metadata must remain auditable even when the route is identical'
    );
  }
});

test('the fixed-seed proof replays deterministically without ambient randomness', async () => {
  const request = {
    timeline,
    attackId: 'constricting-ring',
    phaseId: 'octarch-severed-fury'
  };
  const first = proofRuntime.proveAbyssalOctarchSafeRoute(request);
  const repeated = proofRuntime.proveAbyssalOctarchSafeRoute(request);
  const source = await readFile(path.join(
    repositoryRoot,
    'services',
    'gameplay',
    'bosses',
    'AbyssalOctarchSafeRouteProof.ts'
  ), 'utf8');

  assert.equal(first.status, 'proven', first.detail);
  assert.equal(repeated.status, 'proven', repeated.detail);
  assert.equal(repeated.routeHash, first.routeHash);
  assert.equal(repeated.configurationHash, first.configurationHash);
  assert.deepEqual(
    JSON.parse(JSON.stringify(repeated.witness)),
    JSON.parse(JSON.stringify(first.witness))
  );
  assert.doesNotMatch(source, /Math\.random|Date\.|performance\./);
});

test('the proof configuration and duration are derived from the compiled variant', () => {
  const attackId = 'tentacle-slam';
  const phaseId = 'octarch-first-contact';
  const baseline = proofRuntime.proveAbyssalOctarchSafeRoute({
    timeline,
    attackId,
    phaseId
  });
  const changedTimeline = structuredClone(timeline);
  const variant = changedTimeline.attacks
    .find((attack) => attack.id === attackId)
    .variants.find((candidate) => candidate.phaseId === phaseId);
  const recovery = changedTimeline.clips.find((clip) => (
    clip.id === variant.recoveryClipId
  ));
  recovery.durationSeconds += 0.25;
  const changed = proofRuntime.proveAbyssalOctarchSafeRoute({
    timeline: changedTimeline,
    attackId,
    phaseId
  });

  assert.equal(baseline.status, 'proven', baseline.detail);
  assert.equal(changed.status, 'proven', changed.detail);
  assert.equal(changed.durationFrames, baseline.durationFrames + 15);
  assert.notEqual(changed.configurationHash, baseline.configurationHash);
});

test('non-portrait gameplay and missing retained variants hard-fail', () => {
  const invalidPresentation = proofRuntime.proveAbyssalOctarchSafeRoute({
    timeline,
    attackId: 'tentacle-slam',
    phaseId: 'octarch-first-contact',
    presentation: {
      id: 'wide-gameplay-1280x720',
      hostWidth: 1280,
      hostHeight: 720,
      displayWidth: 1280,
      displayHeight: 720,
      stageOffsetX: 0,
      stageOffsetY: 0
    }
  });
  const missing = proofRuntime.proveAbyssalOctarchSafeRoute({
    timeline,
    attackId: 'asteroid-hurl',
    phaseId: 'octarch-first-contact'
  });

  assert.equal(invalidPresentation.status, 'unproven');
  assert.equal(invalidPresentation.reason, 'invalid-presentation');
  assert.match(invalidPresentation.detail, /390x844/);
  assert.equal(missing.status, 'unproven');
  assert.equal(missing.reason, 'missing-attack-variant');
});

test('sparse phase rosters wrap to the next available attack without a blank fallback', () => {
  const phase = octarchRuntime.ABYSSAL_OCTARCH_PHASES.find((candidate) => (
    candidate.id === 'octarch-final-core'
  ));
  const available = octarchRuntime.ABYSSAL_OCTARCH_PHASE_ACTIONS[phase.id]
    .flatMap((attackId) => {
      const window = timelineRuntime.getBossTimelineAttackWindow(
        timeline,
        attackId,
        phase.id,
        60
      );
      return window ? [{ attackId, window }] : [];
    })
    .sort((left, right) => left.window.startFrame - right.window.startFrame);
  const first = available[0];
  const last = available.at(-1);
  const durationFrames = timelineRuntime.getBossTimelineDurationFrames(timeline, 60);
  const transition = octarchRuntime.resolveAbyssalOctarchQueuedAttackTransition({
    timeline,
    phaseId: phase.id,
    attackFrame: last.window.endFrame,
    framesPerSecond: 60
  });

  assert.ok(transition);
  assert.equal(transition.attackId, first.attackId);
  assert.equal(
    transition.nextAttackStartFrame,
    durationFrames + first.window.startFrame
  );
  assert.equal(
    transition.transitionStartFrame,
    Math.max(
      last.window.endFrame,
      transition.nextAttackStartFrame - phase.transitionFrames
    )
  );
  assert.equal(octarchRuntime.resolveAbyssalOctarchQueuedAttackTransition({
    timeline,
    phaseId: phase.id,
    attackFrame: last.window.endFrame,
    framesPerSecond: 60,
    selectedAttackLoopActive: true
  }), null);
});

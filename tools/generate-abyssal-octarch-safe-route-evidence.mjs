import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const campaignPath = path.join(repositoryRoot, 'game-config', 'campaign.json');
const evidenceDirectory = path.join(
  repositoryRoot,
  'director-data',
  'prototype-assets',
  'abyssal-octarch',
  'evidence'
);
const evidencePath = path.join(
  evidenceDirectory,
  'abyssal-octarch-safe-route-evidence.json'
);

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const round = (value, digits = 9) => Number(value.toFixed(digits));

const vite = await createServer({
  root: repositoryRoot,
  configFile: false,
  resolve: { alias: { '@game': repositoryRoot } },
  server: { middlewareMode: true, hmr: false },
  appType: 'custom'
});

try {
  const proofRuntime = await vite.ssrLoadModule(
    '/services/gameplay/bosses/AbyssalOctarchSafeRouteProof.ts'
  );
  const { buildSandboxBossPrototypePreview } = await vite.ssrLoadModule(
    '/director/src/combat-lab/sandboxBossPrototypes.ts'
  );
  const campaign = JSON.parse(await readFile(campaignPath, 'utf8'));
  const preview = buildSandboxBossPrototypePreview(campaign, 'abyssal-octarch');
  const boss = preview.previewWave.events.find((event) => (
    event.kind === 'boss' && event.id === 'sandbox-abyssal-octarch'
  ));
  if (!boss?.timeline) {
    throw new Error('The current Abyssal Octarch Sandbox prototype has no compiled timeline.');
  }

  const variantCount = boss.timeline.attacks.reduce((count, attack) => (
    count + attack.variants.length
  ), 0);
  const presentations = Object.values(
    proofRuntime.ABYSSAL_OCTARCH_SAFE_ROUTE_PRESENTATIONS
  );
  const matrix = proofRuntime.buildAbyssalOctarchSafeRouteMatrix(
    boss.timeline,
    presentations
  );
  const expectedCount = variantCount * presentations.length;
  if (matrix.length !== expectedCount) {
    throw new Error(
      `Octarch route matrix covered ${matrix.length} cases; expected ${expectedCount} from the current compiled roster.`
    );
  }
  const failures = matrix.filter((entry) => (
    entry.proof.status !== 'proven'
    || entry.proof.geometryUncertaintyPixels
      < proofRuntime.ABYSSAL_OCTARCH_GEOMETRY_UNCERTAINTY_PIXELS
    || entry.proof.minimumClearanceAfterUncertaintyPixels
      < proofRuntime.ABYSSAL_OCTARCH_REQUIRED_CLEARANCE_AFTER_UNCERTAINTY_PIXELS
    || !entry.proof.routeHash
    || !entry.proof.configurationHash
  ));
  if (failures.length > 0) {
    throw new Error(failures.map((entry) => (
      `${entry.phaseId}/${entry.attackId}/${entry.presentationId}: ${entry.proof.reason} - ${entry.proof.detail}`
    )).join('\n'));
  }

  for (const attack of boss.timeline.attacks) {
    for (const variant of attack.variants) {
      const entries = matrix.filter((entry) => (
        entry.attackId === attack.id && entry.phaseId === variant.phaseId
      ));
      if (entries.length !== presentations.length) {
        throw new Error(`${variant.phaseId}/${attack.id} does not cover every host presentation.`);
      }
      if (new Set(entries.map((entry) => entry.proof.routeHash)).size !== 1) {
        throw new Error(`${variant.phaseId}/${attack.id} widened or shifted its logical route inside the wide host.`);
      }
    }
  }

  const routes = matrix.map((entry) => ({
    attackId: entry.attackId,
    phaseId: entry.phaseId,
    presentationId: entry.presentationId,
    status: entry.proof.status,
    reason: entry.proof.reason,
    actionClipId: entry.proof.actionClipId,
    seed: entry.proof.seed,
    sequence: entry.proof.sequence,
    activeTentacleIds: entry.proof.activeTentacleIds,
    selectedTentacleIds: entry.proof.selectedTentacleIds,
    checkedFrames: entry.proof.checkedFrames,
    durationFrames: entry.proof.durationFrames,
    worldWidth: entry.proof.worldWidth,
    worldHeight: entry.proof.worldHeight,
    geometryUncertaintyPixels: entry.proof.geometryUncertaintyPixels,
    requiredRawClearancePixels: entry.proof.requiredRawClearancePixels,
    requiredClearanceAfterUncertaintyPixels:
      entry.proof.requiredClearanceAfterUncertaintyPixels,
    minimumRawClearancePixels: round(entry.proof.minimumRawClearancePixels),
    minimumClearanceAfterUncertaintyPixels: round(
      entry.proof.minimumClearanceAfterUncertaintyPixels
    ),
    routeHash: entry.proof.routeHash,
    configurationHash: entry.proof.configurationHash
  }));
  const routePayload = JSON.stringify(routes);
  const evidence = {
    evidenceKind: 'abyssal-octarch-deterministic-safe-route-proof',
    evidenceRevision: 1,
    prototypeId: 'abyssal-octarch',
    eventId: 'sandbox-abyssal-octarch',
    timelineSource: 'compiled Boss Sandbox preview',
    timelineSha256: sha256(JSON.stringify(boss.timeline)),
    fixedSeed: {
      hex: `0x${proofRuntime.ABYSSAL_OCTARCH_SAFE_ROUTE_SEED
        .toString(16)
        .padStart(8, '0')}`,
      decimal: proofRuntime.ABYSSAL_OCTARCH_SAFE_ROUTE_SEED
    },
    portraitStage: { width: 390, height: 844 },
    expandedWorld: {
      width: routes[0].worldWidth,
      height: routes[0].worldHeight,
      scale: 0.72
    },
    presentations,
    geometryUncertaintyPixels:
      proofRuntime.ABYSSAL_OCTARCH_GEOMETRY_UNCERTAINTY_PIXELS,
    minimumRequiredRawClearancePixels:
      proofRuntime.ABYSSAL_OCTARCH_REQUIRED_RAW_CLEARANCE_PIXELS,
    minimumRequiredClearanceAfterUncertaintyPixels:
      proofRuntime.ABYSSAL_OCTARCH_REQUIRED_CLEARANCE_AFTER_UNCERTAINTY_PIXELS,
    compiledVariantCount: variantCount,
    proofCount: routes.length,
    minimumObservedRawClearancePixels: round(Math.min(
      ...routes.map((route) => route.minimumRawClearancePixels)
    )),
    minimumObservedClearanceAfterUncertaintyPixels: round(Math.min(
      ...routes.map((route) => route.minimumClearanceAfterUncertaintyPixels)
    )),
    proofMatrixSha256: sha256(routePayload),
    routes,
    limitation: 'This fixed-seed proof replays the compiled Sandbox sentence, settled boss motion, live action origins, player acceleration, expanded-world bounds, and boss-owned damage geometry. Canonical browser review remains responsible for Pixi layer ownership and visible telegraph/art alignment.'
  };

  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(
    `Wrote ${routes.length} proven Abyssal Octarch routes (${variantCount} variants × ${presentations.length} hosts) to ${evidencePath}`
  );
} finally {
  await vite.close();
}

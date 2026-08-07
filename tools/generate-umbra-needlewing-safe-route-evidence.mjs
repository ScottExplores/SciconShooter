import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const evidencePath = path.join(
  repositoryRoot,
  'director-data',
  'prototype-assets',
  'umbra-needlewing',
  'evidence',
  'umbra-needlewing-safe-route-evidence.json'
);
const campaignPath = path.join(repositoryRoot, 'game-config', 'campaign.json');

const round = (value, digits = 9) => Number(value.toFixed(digits));
const server = await createServer({
  root: repositoryRoot,
  configFile: false,
  resolve: {
    alias: { '@game': repositoryRoot }
  },
  server: { middlewareMode: true, hmr: false },
  appType: 'custom'
});

try {
  const runtime = await server.ssrLoadModule(
    '/services/gameplay/bosses/UmbraNeedlewingSafeRouteProof.ts'
  );
  const { buildSandboxBossPrototypePreview } = await server.ssrLoadModule(
    '/director/src/combat-lab/sandboxBossPrototypes.ts'
  );
  const campaign = JSON.parse(await readFile(campaignPath, 'utf8'));
  const preview = buildSandboxBossPrototypePreview(campaign, 'umbra-needlewing');
  const boss = preview.previewWave.events.find((event) => (
    event.kind === 'boss' && event.bossId === 'umbra-needlewing'
  ));
  if (!boss?.timeline) {
    throw new Error('The current Umbra Sandbox prototype has no compiled timeline.');
  }
  const matrix = runtime.buildUmbraNeedlewingSafeRouteMatrix(boss.timeline);
  const failures = matrix.filter((entry) => entry.proof.status !== 'proven');
  if (failures.length > 0) {
    throw new Error(failures.map((entry) => (
      `${entry.phaseId}/${entry.attackId}: ${entry.proof.detail}`
    )).join('\n'));
  }

  const template = JSON.parse(await readFile(evidencePath, 'utf8'));
  const routes = matrix.map((entry) => ({
    attackId: entry.attackId,
    phaseId: entry.phaseId,
    status: entry.proof.status,
    reason: entry.proof.reason,
    checkedFrames: entry.proof.checkedFrames,
    durationFrames: entry.proof.durationFrames,
    minimumRawClearancePixels: round(entry.proof.minimumRawClearancePixels),
    minimumClearanceAfterUncertaintyPixels: round(
      entry.proof.minimumClearanceAfterUncertaintyPixels
    ),
    routeHash: entry.proof.routeHash,
    configurationHash: entry.proof.configurationHash
  }));
  const evidence = {
    ...template,
    generatedAt: new Date().toISOString().slice(0, 10),
    fixedSeed: {
      hex: `0x${runtime.UMBRA_NEEDLEWING_SAFE_ROUTE_SEED.toString(16).padStart(8, '0')}`,
      decimal: runtime.UMBRA_NEEDLEWING_SAFE_ROUTE_SEED
    },
    viewport: { ...runtime.UMBRA_NEEDLEWING_PHONE_VIEWPORT },
    geometryUncertaintyPixels: runtime.UMBRA_NEEDLEWING_GEOMETRY_UNCERTAINTY_PIXELS,
    minimumRequiredRawClearancePixels:
      runtime.UMBRA_NEEDLEWING_REQUIRED_RAW_CLEARANCE_PIXELS,
    minimumRequiredClearanceAfterUncertaintyPixels:
      matrix[0].proof.requiredClearanceAfterUncertaintyPixels,
    proofCount: routes.length,
    minimumObservedRawClearancePixels: Math.min(
      ...routes.map((route) => route.minimumRawClearancePixels)
    ),
    minimumObservedClearanceAfterUncertaintyPixels: Math.min(
      ...routes.map((route) => route.minimumClearanceAfterUncertaintyPixels)
    ),
    routes,
    limitation: 'This deterministic boss-owned replay uses the exact authored timings plus the shared gap-route, corner-beam, corner-ram, and mobile projectile geometry. Browser review still confirms Pixi layer ownership, visible socket alignment, and the canonical 390x844 presentation.'
  };

  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${routes.length} Umbra routes to ${evidencePath}`);
} finally {
  await server.close();
}

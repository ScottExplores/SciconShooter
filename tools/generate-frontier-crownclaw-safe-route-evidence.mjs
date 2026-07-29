import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const evidenceDirectory = path.join(
  repositoryRoot,
  'director-data',
  'prototype-assets',
  'frontier-crownclaw',
  'evidence'
);
const intactEvidencePath = path.join(
  evidenceDirectory,
  'frontier-crownclaw-safe-route-evidence.json'
);
const fallbackEvidencePath = path.join(
  evidenceDirectory,
  'frontier-crownclaw-component-fallback-safe-route-evidence.json'
);

const readJson = async (filePath) => JSON.parse(await readFile(filePath, 'utf8'));
const round = (value, digits = 9) => Number(value.toFixed(digits));

const server = await createServer({
  root: repositoryRoot,
  configFile: false,
  server: { middlewareMode: true, hmr: false },
  appType: 'custom'
});

try {
  const runtime = await server.ssrLoadModule(
    '/services/gameplay/bosses/FrontierCrownclawSafeRouteProof.ts'
  );
  const intactMatrix = runtime.buildFrontierCrownclawSafeRouteMatrix();
  const fallbackMatrix = runtime.buildFrontierCrownclawComponentFallbackSafeRouteMatrix();
  const generatedAt = new Date().toISOString().slice(0, 10);

  const intactTemplate = await readJson(intactEvidencePath);
  const requiredClearancePixels = intactMatrix[0]?.proof.requiredClearancePixels;
  if (!Number.isFinite(requiredClearancePixels)) {
    throw new Error('Frontier safe-route matrix did not expose a required clearance.');
  }
  const intactRoutes = intactMatrix.map((entry) => ({
    attackId: entry.attackId,
    phaseId: entry.phaseId,
    seed: entry.seed,
    viewportId: entry.viewportId,
    status: entry.proof.status,
    reason: entry.proof.reason,
    checkedFrames: entry.proof.checkedFrames,
    geometryUncertaintyPixels: entry.proof.geometryUncertaintyPixels,
    minimumClearancePixels: round(entry.proof.minimumClearancePixels),
    routeHash: entry.proof.routeHash,
    configurationHash: entry.proof.configurationHash
  }));
  const intactEvidence = {
    ...intactTemplate,
    generatedAt,
    matrixCount: intactRoutes.length,
    requiredClearancePixels,
    geometryUncertaintyPixels: runtime.FRONTIER_CROWNCLAW_GEOMETRY_UNCERTAINTY_PIXELS,
    minimumClearancePixels: Math.min(
      ...intactRoutes.map((route) => route.minimumClearancePixels)
    ),
    limitation: 'Deterministic boss-owned analytic geometry shares Frontier runtime samplers but approximates registered-rig sockets. Exact GameEngine timing, live sockets, beam count, and collision for Critical Attack 2 are separately gated by frontierCrownclawManualAttackPlayback.test.mjs.',
    routes: intactRoutes
  };

  const fallbackTemplate = await readJson(fallbackEvidencePath);
  const fallbackRoutes = fallbackMatrix.map((entry) => ({
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
    minimumClearancePixels: round(entry.proof.minimumClearancePixels),
    routeHash: entry.proof.routeHash,
    configurationHash: entry.proof.configurationHash
  }));
  const fallbackEvidence = {
    ...fallbackTemplate,
    generatedAt,
    matrixCount: fallbackRoutes.length,
    requiredClearancePixels,
    geometryUncertaintyPixels: runtime.FRONTIER_CROWNCLAW_GEOMETRY_UNCERTAINTY_PIXELS,
    minimumClearancePixels: Math.min(
      ...fallbackRoutes.map((route) => route.minimumClearancePixels)
    ),
    limitation: 'Deterministic component-fallback analytic geometry shares Frontier runtime samplers but approximates registered-rig sockets. Exact GameEngine fallback cleanup is covered by frontierCrownclawComponentFallback.test.mjs, and exact Critical Attack 2 playback is covered by frontierCrownclawManualAttackPlayback.test.mjs.',
    routes: fallbackRoutes
  };

  await Promise.all([
    writeFile(intactEvidencePath, `${JSON.stringify(intactEvidence, null, 2)}\n`),
    writeFile(fallbackEvidencePath, `${JSON.stringify(fallbackEvidence, null, 2)}\n`)
  ]);
  console.log(`Wrote ${intactRoutes.length} intact routes to ${intactEvidencePath}`);
  console.log(`Wrote ${fallbackRoutes.length} fallback routes to ${fallbackEvidencePath}`);
} finally {
  await server.close();
}

import assert from 'node:assert/strict';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '..', '..');
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

const { HELIOS_CLAWCARRIER_MODULAR_RIG } = await vite.ssrLoadModule(
  '/director/src/tools/bosses/bossSandboxModel.ts'
);
const { sampleHeliosModularPose } = await vite.ssrLoadModule(
  '/services/pixi/boss-rigs/HeliosModularPose.ts'
);
const { resolveModularBossRigHierarchy } = await vite.ssrLoadModule(
  '/services/pixi/boss-rigs/ModularHierarchyRig.ts'
);
const {
  resolveHeliosCornerClampPlacement,
  sampleHeliosCornerClamp
} = await vite.ssrLoadModule(
  '/services/gameplay/bosses/HeliosClawcarrierRuntime.ts'
);

const BOSS_WIDTH = 297;
const BOSS_HEIGHT = Math.round(BOSS_WIDTH * 330 / 460);
const VIEWPORTS = Object.freeze([
  Object.freeze({ id: 'mobile', width: 390, height: 844, mobileProfile: true }),
  Object.freeze({ id: 'desktop', width: 1280, height: 720, mobileProfile: false })
]);

const getStructuralDesignBounds = (action) => {
  const pose = sampleHeliosModularPose({
    frameCount: 100,
    reducedMotion: false,
    healthRatio: 1,
    phaseIndex: 1,
    entranceProgress: 1,
    damageStage: 0,
    action
  });
  const hierarchy = resolveModularBossRigHierarchy(
    HELIOS_CLAWCARRIER_MODULAR_RIG,
    pose.partOverrides
  );
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const part of hierarchy.parts) {
    if (!part.visible || !part.frame || !part.anchor || part.role === 'effect') continue;
    const { a, b, c, d, tx, ty } = part.worldTransform;
    const localXs = [
      -part.anchor.x * part.frame.width,
      (1 - part.anchor.x) * part.frame.width
    ];
    const localYs = [
      -part.anchor.y * part.frame.height,
      (1 - part.anchor.y) * part.frame.height
    ];
    for (const localX of localXs) {
      for (const localY of localYs) {
        const x = a * localX + c * localY + tx;
        const y = b * localX + d * localY + ty;
        bounds.minX = Math.min(bounds.minX, x);
        bounds.maxX = Math.max(bounds.maxX, x);
        bounds.minY = Math.min(bounds.minY, y);
        bounds.maxY = Math.max(bounds.maxY, y);
      }
    }
  }
  return bounds;
};

test('Helios Attack 2 keeps the complete animated rig inside mobile and desktop canvases', () => {
  for (const viewport of VIEWPORTS) {
    const anchorX = (viewport.width - BOSS_WIDTH) / 2;
    const anchorY = Math.max(72, Math.min(viewport.height * 0.13, 116));
    for (const side of ['port', 'starboard']) {
      const placement = resolveHeliosCornerClampPlacement({
        side,
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
        bossWidth: BOSS_WIDTH,
        bossHeight: BOSS_HEIGHT,
        mobileProfile: viewport.mobileProfile
      });
      const edgeLockedX = side === 'port'
        ? placement.trackingMinX
        : placement.trackingMaxX;
      let minimumHorizontalMargin = Infinity;
      for (const stage of ['warning', 'fire']) {
        for (let step = 0; step <= 100; step += 1) {
          const progress = step / 100;
          const sample = sampleHeliosCornerClamp({ stage, progress, side });
          const topLeftX = stage === 'warning'
            ? anchorX + (edgeLockedX - anchorX) * sample.movementProgress
            : edgeLockedX + (anchorX - edgeLockedX) * sample.returnProgress;
          const topLeftY = stage === 'warning'
            ? anchorY + (placement.cornerY - anchorY) * sample.movementProgress
            : placement.cornerY + (anchorY - placement.cornerY) * sample.returnProgress;
          const designBounds = getStructuralDesignBounds({
            primitiveId: 'articulated-melee-sweep',
            stage,
            progress,
            side,
            sequence: side === 'port' ? 0 : 1,
            motionCue: 'claw-sweep'
          });
          const scaleX = BOSS_WIDTH / HELIOS_CLAWCARRIER_MODULAR_RIG.manifest.designSize.width;
          const scaleY = BOSS_HEIGHT / HELIOS_CLAWCARRIER_MODULAR_RIG.manifest.designSize.height;
          const screenBounds = {
            minX: topLeftX + BOSS_WIDTH / 2 + designBounds.minX * scaleX,
            maxX: topLeftX + BOSS_WIDTH / 2 + designBounds.maxX * scaleX,
            minY: topLeftY + BOSS_HEIGHT / 2 + designBounds.minY * scaleY,
            maxY: topLeftY + BOSS_HEIGHT / 2 + designBounds.maxY * scaleY
          };
          minimumHorizontalMargin = Math.min(
            minimumHorizontalMargin,
            screenBounds.minX,
            viewport.width - screenBounds.maxX
          );
          assert.ok(
            screenBounds.minX >= -0.001 && screenBounds.maxX <= viewport.width + 0.001,
            `${viewport.id} ${side} ${stage} ${progress.toFixed(2)} clips horizontally: ${JSON.stringify(screenBounds)}`
          );
          assert.ok(
            screenBounds.minY >= -0.001 && screenBounds.maxY <= viewport.height + 0.001,
            `${viewport.id} ${side} ${stage} ${progress.toFixed(2)} clips vertically: ${JSON.stringify(screenBounds)}`
          );
        }
      }
      assert.ok(
        minimumHorizontalMargin >= 2,
        `${viewport.id} ${side} must retain a visible edge margin; got ${minimumHorizontalMargin}`
      );
    }
  }
});

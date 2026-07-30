const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');

const engineSource = read('services', 'gameLogic.ts');
const canvasSource = read('components', 'GameCanvas.tsx');
const editorCanvasSource = read('components', 'GameEditorCanvas.tsx');
const localSandboxSource = read(
  'director',
  'src',
  'tools',
  'bosses',
  'BossSandboxApp.tsx'
);
const remoteRunnerSource = read('director', 'remote', 'RemoteBossRunnerApp.tsx');

function sliceRequired(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

const applyPreviewLoadoutMethod = sliceRequired(
  engineSource,
  '  applyPreviewLoadout(update: PreviewPlayerLoadoutUpdate)',
  '\n  jumpToCampaignWave('
);

function buildExactMethodHarness() {
  const harnessSource = `
    const loadedImages: string[] = [];
    const ASSETS = { PLAYER_SHIP: 'fallback-player.png' };
    const loadImage = (url: string) => loadedImages.push(url);
    const getShipAbilityDefinition = (shipId: string) => ({
      cooldownFrames: shipId === 'biology' ? 90 : 180
    });
    const getSquadCompanionFormationTarget = (
      x: number,
      y: number,
      width: number,
      height: number,
      slot: string,
      index: number
    ) => ({
      x: x + (slot === 'left' ? -width : width) + index,
      y: y + height
    });

    class PreviewLoadoutHarness {
      previewAllowed = true;
      restartCount = 0;

      canUsePreviewControl() {
        return this.previewAllowed;
      }

      restartPreview() {
        this.restartCount += 1;
      }

${applyPreviewLoadoutMethod}
    }

    export { PreviewLoadoutHarness, loadedImages };
  `;
  const compiled = ts.transpileModule(harnessSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  });
  const harnessModule = { exports: {} };
  Function('module', 'exports', compiled.outputText)(
    harnessModule,
    harnessModule.exports
  );
  return harnessModule.exports;
}

test('preview loadout hot-swap preserves the live encounter while updating player equipment', () => {
  const { PreviewLoadoutHarness, loadedImages } = buildExactMethodHarness();
  const harness = new PreviewLoadoutHarness();
  const boss = { id: 'boss-live', hp: 2314, phase: 2 };
  const projectile = { id: 'projectile-live', x: 84, y: 190 };
  const entities = [boss, projectile];
  const pendingBossStrikes = [{ sourceId: boss.id, warningFrames: 18 }];
  const pendingEnemyLasers = [{ sourceId: boss.id, lockFrames: 11 }];
  const gameplayRandom = { seed: 'unchanged-seed', calls: 47 };
  const player = { x: 222, y: 615, width: 44, height: 52, hp: 3 };
  const companions = [{
    slot: 'left',
    id: 'citation-dart',
    frames: ['left-a.png', 'left-b.png', 'left-c.png'],
    fireIntervalFrames: 36,
    x: 141,
    y: 604,
    frameIndex: 2,
    fireTimer: 51,
    shotSequence: 8,
    entryProgress: 0.75
  }];

  Object.assign(harness, {
    playerShipId: 'researchhub',
    playerShipUrl: 'researchhub.png',
    previewShipAbilityNoCooldown: false,
    stats: {
      score: 9876,
      bossHp: boss.hp,
      bossMaxHp: 5600,
      shipAbilityCooldown: 122,
      shipAbilityCooldownMax: 960
    },
    player,
    frameCount: 1842,
    currentCampaignIndex: 6,
    activeBossEventId: 'gloamforge-event',
    bossTimelineFrame: 433,
    gameplayRandom,
    entities,
    pendingBossStrikes,
    pendingEnemyLasers,
    squadLoadout: null,
    squadCompanions: companions
  });

  const preserved = {
    player,
    playerSnapshot: { ...player },
    frameCount: harness.frameCount,
    currentCampaignIndex: harness.currentCampaignIndex,
    activeBossEventId: harness.activeBossEventId,
    bossTimelineFrame: harness.bossTimelineFrame,
    gameplayRandom,
    entities,
    boss,
    projectile,
    pendingBossStrikes,
    pendingEnemyLasers,
    score: harness.stats.score,
    bossHp: harness.stats.bossHp,
    companionArray: companions
  };
  const nextLoadout = {
    mainShipId: 'biology',
    upgrades: { fireRate: 8, speed: 5, startingHearts: 0 },
    companions: [
      {
        slot: 'left',
        id: 'citation-dart',
        frames: ['left-new-a.png', 'left-new-b.png', 'left-new-c.png'],
        fireIntervalFrames: 30
      },
      {
        slot: 'right',
        id: 'photon-manta',
        frames: ['right-a.png', 'right-b.png', 'right-c.png'],
        fireIntervalFrames: 42
      }
    ]
  };

  assert.equal(harness.applyPreviewLoadout({
    playerShipId: 'biology',
    playerShipUrl: 'biology.png',
    squadLoadout: nextLoadout
  }), true);

  assert.equal(harness.restartCount, 0);
  assert.equal(harness.frameCount, preserved.frameCount);
  assert.equal(harness.currentCampaignIndex, preserved.currentCampaignIndex);
  assert.equal(harness.activeBossEventId, preserved.activeBossEventId);
  assert.equal(harness.bossTimelineFrame, preserved.bossTimelineFrame);
  assert.strictEqual(harness.gameplayRandom, preserved.gameplayRandom);
  assert.strictEqual(harness.entities, preserved.entities);
  assert.strictEqual(harness.entities[0], preserved.boss);
  assert.strictEqual(harness.entities[1], preserved.projectile);
  assert.strictEqual(harness.pendingBossStrikes, preserved.pendingBossStrikes);
  assert.strictEqual(harness.pendingEnemyLasers, preserved.pendingEnemyLasers);
  assert.strictEqual(harness.player, preserved.player);
  assert.deepEqual(harness.player, preserved.playerSnapshot);
  assert.equal(harness.stats.score, preserved.score);
  assert.equal(harness.stats.bossHp, preserved.bossHp);

  assert.equal(harness.playerShipId, 'biology');
  assert.equal(harness.playerShipUrl, 'biology.png');
  assert.equal(harness.stats.shipAbilityCooldownMax, 90);
  assert.equal(harness.stats.shipAbilityCooldown, 90);
  assert.strictEqual(harness.squadLoadout, nextLoadout);
  assert.strictEqual(harness.squadCompanions, preserved.companionArray);
  assert.equal(harness.squadCompanions.length, 2);
  assert.deepEqual(
    {
      x: harness.squadCompanions[0].x,
      y: harness.squadCompanions[0].y,
      frameIndex: harness.squadCompanions[0].frameIndex,
      fireTimer: harness.squadCompanions[0].fireTimer,
      shotSequence: harness.squadCompanions[0].shotSequence,
      entryProgress: harness.squadCompanions[0].entryProgress
    },
    {
      x: 141,
      y: 604,
      frameIndex: 2,
      fireTimer: 30,
      shotSequence: 8,
      entryProgress: 0.75
    }
  );
  assert.deepEqual(
    {
      x: harness.squadCompanions[1].x,
      y: harness.squadCompanions[1].y,
      frameIndex: harness.squadCompanions[1].frameIndex,
      shotSequence: harness.squadCompanions[1].shotSequence,
      entryProgress: harness.squadCompanions[1].entryProgress
    },
    { x: 267, y: 667, frameIndex: 0, shotSequence: 0, entryProgress: 0 }
  );
  assert.deepEqual(loadedImages, [
    'biology.png',
    'left-new-a.png',
    'left-new-b.png',
    'left-new-c.png',
    'right-a.png',
    'right-b.png',
    'right-c.png'
  ]);
});

test('preview loadout mutation is unavailable outside the preview control boundary', () => {
  const { PreviewLoadoutHarness } = buildExactMethodHarness();
  const harness = new PreviewLoadoutHarness();
  harness.previewAllowed = false;
  Object.assign(harness, {
    playerShipId: 'researchhub',
    playerShipUrl: 'researchhub.png',
    stats: { shipAbilityCooldown: 12, shipAbilityCooldownMax: 90 },
    player: { x: 10, y: 20, width: 30, height: 40 },
    squadLoadout: null,
    squadCompanions: []
  });

  assert.equal(harness.applyPreviewLoadout({ playerShipId: 'biology' }), false);
  assert.equal(harness.playerShipId, 'researchhub');
  assert.equal(harness.playerShipUrl, 'researchhub.png');
  assert.equal(harness.restartCount, 0);
});

test('the engine hot-swap contract cannot restart or replace live encounter state', () => {
  const contractComment = sliceRequired(
    engineSource,
    '/**\n   * Hot-swaps preview-only player equipment',
    '\n  jumpToCampaignWave('
  );

  assert.match(contractComment, /Boss state, active entities\/projectiles, RNG, score, player position/);
  assert.match(contractComment, /current simulation frame deliberately remain untouched/);
  assert.match(applyPreviewLoadoutMethod, /if \(!this\.canUsePreviewControl\(\)\) return false/);
  assert.match(applyPreviewLoadoutMethod, /this\.squadCompanions\.splice\(/);
  assert.doesNotMatch(applyPreviewLoadoutMethod, /restartPreview\s*\(/);
  assert.doesNotMatch(
    applyPreviewLoadoutMethod,
    /this\.(?:frameCount|entities|player|gameplayRandom|currentCampaignIndex|activeBossEventId|bossTimelineFrame|pendingBossStrikes|pendingEnemyLasers)\s*=/
  );
});

test('GameCanvas applies preview loadouts through a narrow effect without reconstructing runtime', () => {
  const loadoutEffect = sliceRequired(
    canvasSource,
    '  useEffect(() => {\n    const engine = engineRef.current;\n    if (!previewMode || !engine) return;\n    if (!engine.applyPreviewLoadout',
    '\n\n  const applyPreviewCommand ='
  );
  const runtimeSetupDependencies = canvasSource
    .split(/\r?\n/)
    .find((line) => (
      line.includes('}, [')
      && line.includes('setupPlayerShipIdDependency')
      && line.includes('setupPlayerShipUrlDependency')
      && line.includes('setupSquadLoadoutDependency')
    ));
  assert.ok(runtimeSetupDependencies, 'runtime setup dependency list is missing');

  const setupDependencies = runtimeSetupDependencies
    .slice(runtimeSetupDependencies.indexOf('[') + 1)
    .replace(/\]\);\s*$/, '')
    .split(',')
    .map((dependency) => dependency.trim());
  assert.ok(setupDependencies.includes('setupPlayerShipIdDependency'));
  assert.ok(setupDependencies.includes('setupPlayerShipUrlDependency'));
  assert.ok(setupDependencies.includes('setupSquadLoadoutDependency'));
  assert.equal(setupDependencies.includes('playerShipId'), false);
  assert.equal(setupDependencies.includes('playerShipUrl'), false);
  assert.equal(setupDependencies.includes('squadLoadout'), false);
  assert.match(loadoutEffect, /playerShipId/);
  assert.match(loadoutEffect, /playerShipUrl/);
  assert.match(loadoutEffect, /squadLoadout/);
  assert.match(loadoutEffect, /publishPreviewEngineState\(engine\)/);
  assert.doesNotMatch(loadoutEffect, /restartPreview\s*\(/);
  assert.match(canvasSource, /const setupPlayerShipIdDependency = previewMode \? null : playerShipId/);
  assert.match(canvasSource, /const setupPlayerShipUrlDependency = previewMode \? null : playerShipUrl/);
  assert.match(canvasSource, /const setupSquadLoadoutDependency = previewMode \? null : squadLoadout/);
  assert.match(canvasSource, /const initialLoadout = runtimeLoadoutRef\.current/);
  assert.match(canvasSource, /playerShipId: initialLoadout\.playerShipId/);
  assert.match(canvasSource, /squadLoadout: initialLoadout\.squadLoadout/);
});

test('fire-rate and speed upgrades synchronize in place instead of restarting the preview', () => {
  const editorUpgradeEffect = sliceRequired(
    editorCanvasSource,
    '  useEffect(() => {\n    const fireRate = previewSettings.upgrades?.fireRate',
    '\n\n  const handlePreviewUpgrade ='
  );
  const engineUpgradeEffect = sliceRequired(
    canvasSource,
    '  // Sync Stats (specifically upgrades/coins modified by React UI) to Engine',
    '  }, [stats.bombCharge, stats.lives, stats.repairsCount, stats.upgrades]);'
  );

  assert.match(editorUpgradeEffect, /setStats\(\(previous\) =>/);
  assert.match(editorUpgradeEffect, /fireRate/);
  assert.match(editorUpgradeEffect, /speed/);
  assert.doesNotMatch(editorUpgradeEffect, /restart|setRestartToken/);
  assert.match(engineUpgradeEffect, /engineStats\.upgrades = \{ \.\.\.stats\.upgrades \}/);
  assert.doesNotMatch(engineUpgradeEffect, /restartPreview\s*\(/);
});

test('local and hosted boss surfaces keep loadout changes out of canvas keys and loading state', () => {
  const localCanvas = sliceRequired(
    localSandboxSource,
    '                  <GameEditorCanvas',
    '\n                  />'
  );
  const remoteCanvas = sliceRequired(
    remoteRunnerSource,
    '          <GameEditorCanvas',
    '\n          />'
  );
  const localLoadoutCallbacks = sliceRequired(
    localSandboxSource,
    '  const announceLiveLoadoutChange = useCallback',
    '\n\n  const spawnBoss = useCallback'
  );
  const localViewportFrame = sliceRequired(
    localSandboxSource,
    'className="boss-sandbox__viewport-frame"',
    '                  <GameEditorCanvas'
  );
  const remoteCompanionCallback = sliceRequired(
    remoteRunnerSource,
    '  const updateCompanion = useCallback',
    '\n\n  const toggleInvincibility = useCallback'
  );

  assert.doesNotMatch(localSandboxSource, /loadoutKey/);
  assert.doesNotMatch(remoteRunnerSource, /loadoutKey/);
  assert.match(localCanvas, /key=\{`\$\{selectedChoice\.id\}:\$\{previewMountToken\}`\}/);
  assert.match(localViewportFrame, /data-viewport-mode="mobile"/);
  assert.match(localViewportFrame, /width: `\$\{previewViewport\.width\}px`/);
  assert.match(localViewportFrame, /height: `\$\{previewViewport\.height\}px`/);
  assert.match(localViewportFrame, /transform: `scale\(\$\{previewScale\}\)`/);
  assert.match(remoteCanvas, /key=\{`\$\{selectedChoice\.id\}:\$\{artworkStatus\}`\}/);
  assert.doesNotMatch(localCanvas, /fireRateLevel|speedLevel|mainShipId|companions/);
  assert.doesNotMatch(remoteCanvas, /fireRateLevel|speedLevel|mainShipId|companions/);
  assert.doesNotMatch(localLoadoutCallbacks, /setPreviewCanvasStatus\('loading'\)|setRestartToken|restart\(/);
  assert.doesNotMatch(remoteCompanionCallback, /setCanvasStatus\('loading'\)|setRestartToken|restart\(/);
  assert.match(localSandboxSource, /without restarting the fight/);
  assert.match(remoteRunnerSource, /without restarting the fight/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '..', '..');
const source = await readFile(
  path.join(repositoryRoot, 'director', 'src', 'tools', 'bosses', 'BossSandboxApp.tsx'),
  'utf8'
);
const styles = await readFile(
  path.join(repositoryRoot, 'director', 'src', 'tools', 'bosses', 'boss-sandbox.css'),
  'utf8'
);
const modelSource = await readFile(
  path.join(repositoryRoot, 'director', 'src', 'tools', 'bosses', 'bossSandboxModel.ts'),
  'utf8'
);
const remoteSource = await readFile(
  path.join(repositoryRoot, 'director', 'remote', 'RemoteBossRunnerApp.tsx'),
  'utf8'
);
const remoteStyles = await readFile(
  path.join(repositoryRoot, 'director', 'remote', 'remote-boss-runner.css'),
  'utf8'
);
const debugPanelSource = await readFile(
  path.join(
    repositoryRoot,
    'director',
    'src',
    'tools',
    'bosses',
    'BossFactoryDebugPanel.tsx'
  ),
  'utf8'
);
const debugPanelStyles = await readFile(
  path.join(
    repositoryRoot,
    'director',
    'src',
    'tools',
    'bosses',
    'boss-factory-debug.css'
  ),
  'utf8'
);

test('local and remote Boss Sandbox previews integrity-check the complete modular atlas list', () => {
  for (const previewSource of [source, remoteSource]) {
    assert.match(previewSource, /getBossSandboxIntegrityAssets/);
    assert.match(
      previewSource,
      /getBossSandboxIntegrityAssets\(artworkRegistration\)\.map\(\(asset\)/
    );
    assert.doesNotMatch(
      previewSource,
      /Promise\.all\(\[\s*verify(?:Local)?Png\(\s*artworkRegistration\.assembled/
    );
  }
});

test('focused Boss Sandbox defaults to mobile and keeps view controls in Debug / Review', () => {
  assert.match(
    modelSource,
    /DEFAULT_BOSS_SANDBOX_VIEWPORT_MODE: BossSandboxViewportMode =\s*'mobile';/,
    'the focused boss workflow should open with the phone-sized arena'
  );
  assert.match(
    source,
    /useState<BossSandboxViewportMode>\(DEFAULT_BOSS_SANDBOX_VIEWPORT_MODE\)/
  );
  assert.match(source, /const previewViewport = BOSS_SANDBOX_VIEWPORTS\[previewViewportMode\];/);
  assert.match(source, /data-viewport-mode=\{previewViewportMode\}/);
  assert.match(source, /viewportMode=\{previewViewportMode\}/);
  assert.match(source, /onViewportModeChange=\{changePreviewViewportMode\}/);
  assert.match(debugPanelSource, /<span>Debug \/ Review<\/span>/);
  assert.match(debugPanelSource, /<legend>Preview viewport<\/legend>/);
  assert.match(debugPanelSource, /\['mobile', 'Mobile canvas'\]/);
  assert.match(debugPanelSource, /\['desktop', 'Desktop canvas'\]/);
  assert.doesNotMatch(source, /Mobile fit|Desktop fit|Reload view/);
  assert.doesNotMatch(source, /boss-sandbox__viewbar/);
  assert.doesNotMatch(styles, /\.boss-sandbox__viewbar/);
});

test('focused Boss Sandbox uses the canonical preview and only essential controls', () => {
  assert.match(source, /<GameEditorCanvas/);
  assert.match(source, /previewBossArtwork=\{previewBossArtwork\}/);
  assert.match(source, /fieldUpgradesEnabled=\{false\}/);
  assert.match(source, /type: 'spawn-event-now'/);
  assert.match(source, /type: 'jump-to-boss-phase'/);
  assert.match(source, /type: 'set-invincibility'/);
  assert.match(source, /href="\/sandbox">Advanced tools/);
  assert.match(source, /Boss to test/);
  assert.match(source, /aria-label="Boss artwork choices"/);
  assert.match(source, /choiceArtworkUrls/);
  assert.match(source, /alt=\{`\$\{selectedChoice\.bossLabel\} boss artwork`\}/);
  assert.match(source, /loading="lazy"/);
  assert.match(source, /tell Codex what to change/i);
  assert.match(source, /previewViewport=\{previewViewport\}/);
  assert.match(source, /onInitializationError=\{handlePreviewInitializationError\}/);
  assert.match(source, /Preview could not start/);
  assert.match(source, /Try preview again/);
  assert.match(source, /new ResizeObserver\(measure\)/);
  assert.match(source, /if \(choiceId === selectedChoiceId\) return/);
  assert.match(styles, /\.boss-sandbox__viewport-frame/);
  assert.match(styles, /transform-origin: top left/);
  assert.match(styles, /\.boss-sandbox__stage\s*\{[\s\S]*?height:\s*100%;/);
  assert.match(source, /Local concept art unavailable/);
  assert.match(source, /crypto\.subtle\.digest\('SHA-256'/);
  assert.match(source, /getSandboxBossArtworkRegistration/);
  assert.match(source, /getBossSandboxIntegrityAssets\(artworkRegistration\)/);
  assert.match(source, /verifyLocalPng\(asset\.url, asset\.contentHash\)/);
  assert.match(source, /Animated modular boss rig connected/);
  assert.match(source, /Ship loadout/);
  assert.match(source, /PLAYABLE_PLAYER_SHIP_IDS\.map/);
  assert.match(source, /Left support ship/);
  assert.match(source, /Right support ship/);
  assert.match(source, /useBossSandboxLoadout/);
  assert.match(source, /boss-sandbox__version/);
  assert.match(source, /BOSS_SANDBOX_VERSION/);
  assert.match(source, /aria-label="Decrease fire rate"/);
  assert.match(source, /aria-label="Increase fire rate"/);
  assert.match(source, /aria-label="Decrease speed"/);
  assert.match(source, /aria-label="Increase speed"/);
  assert.doesNotMatch(source, /loadoutKey/);
  assert.match(
    source,
    /key=\{`\$\{selectedChoice\.id\}:\$\{previewMountToken\}`\}/
  );
  assert.match(source, /announceLiveLoadoutChange/);
  assert.match(source, /without restarting the fight/);
  assert.doesNotMatch(source, /extraLife|Extra Life|heart upgrade/i);
  assert.match(styles, /\.boss-sandbox__ship-tuning/);
  assert.match(styles, /\.boss-sandbox__artwork-strip/);
  assert.match(styles, /image-rendering: pixelated/);
  assert.match(styles, /min-height: 42px/);
  assert.doesNotMatch(
    source,
    /\b(?:saveGameCampaign|saveGameCampaignWorkspace|localStorage|Export JSON|Review draft|Apply to game)\b/
  );
  assert.doesNotMatch(source, /<textarea|Make change/);
});

test('local and hosted runners share one compact closed Boss Factory review panel', () => {
  assert.match(source, /<BossFactoryDebugPanel/);
  assert.match(remoteSource, /<BossFactoryDebugPanel/);
  assert.match(debugPanelSource, /<details className="boss-factory-debug">/);
  assert.doesNotMatch(debugPanelSource, /<details[^>]*\sopen(?:=|\s|>)/);
  assert.match(debugPanelSource, /Step 1 frame/);
  assert.match(debugPanelSource, /Reset fixed seed/);
  assert.match(debugPanelSource, /Boss health/);
  assert.match(debugPanelSource, /Modular pivots/);
  assert.match(debugPanelSource, /Weapon sockets/);
  assert.match(debugPanelSource, /Boss collision \/ hitbox/);
  assert.match(debugPanelSource, /Modular part bounds/);
  assert.match(debugPanelSource, /Intended safe-region guide/);
  assert.match(debugPanelSource, /Download Pixi frame \(PNG\)/);
  assert.match(debugPanelSource, /No supported guide for the current attack/);
  assert.match(source, /type: 'set-debug-overlays'/);
  assert.match(remoteSource, /type: 'set-debug-overlays'/);
  assert.match(source, /type: 'capture-frame'/);
  assert.match(remoteSource, /type: 'capture-frame'/);
  assert.match(debugPanelStyles, /\.boss-factory-debug__body/);
});

test('desktop Boss Sandbox gives the permanent mobile game the full-height center column', () => {
  const mainStart = source.indexOf('<main className="boss-sandbox__main">');
  const mainEnd = source.indexOf('</main>', mainStart);
  const main = source.slice(mainStart, mainEnd);
  const pickerIndex = main.indexOf('<aside className="boss-sandbox__picker">');
  const playIndex = main.indexOf('<section className="boss-sandbox__play"');
  const loadoutIndex = main.indexOf(
    '<aside className="boss-sandbox__loadout" aria-label="Ship and loadout controls">'
  );

  assert.ok(pickerIndex >= 0, 'boss controls need a left rail');
  assert.ok(playIndex > pickerIndex, 'the canonical game belongs after the boss rail');
  assert.ok(loadoutIndex > playIndex, 'ship controls need a right rail');

  const picker = main.slice(pickerIndex, playIndex);
  const play = main.slice(playIndex, loadoutIndex);
  const loadout = main.slice(loadoutIndex);
  assert.match(picker, /aria-label="Boss test controls"/);
  assert.match(picker, /aria-label="Boss attacks"/);
  assert.match(picker, /aria-label="Boss phases"/);
  assert.match(play, /aria-label="Live mobile boss preview"/);
  assert.match(play, /className="boss-sandbox__stage"/);
  assert.doesNotMatch(play, /Boss attacks|Ship loadout|boss-sandbox__viewbar/);
  assert.match(loadout, /aria-label="Ship loadout"/);
  assert.match(loadout, /PLAYABLE_PLAYER_SHIP_IDS\.map/);

  assert.match(
    styles,
    /\.boss-sandbox__main\s*\{[\s\S]*?height:\s*100dvh;[\s\S]*?grid-template-columns:\s*minmax\(210px, 236px\)\s*minmax\(0, 1fr\)\s*minmax\(210px, 236px\);/
  );
  assert.match(
    styles,
    /\.boss-sandbox__play\s*\{[\s\S]*?height:\s*100dvh;[\s\S]*?padding:\s*0;/
  );
  assert.match(
    styles,
    /\.boss-sandbox__stage\s*\{[\s\S]*?height:\s*100%;[\s\S]*?min-height:\s*0;[\s\S]*?padding:\s*0;/
  );
  assert.match(
    styles,
    /\.boss-sandbox__header\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?grid-template-columns:\s*minmax\(210px, 236px\)\s*minmax\(0, 1fr\)\s*minmax\(210px, 236px\);[\s\S]*?pointer-events:\s*none;/
  );
  assert.match(
    styles,
    /\.boss-sandbox__header > div\s*\{[\s\S]*?grid-column:\s*1;[\s\S]*?pointer-events:\s*auto;/
  );
  assert.match(
    styles,
    /\.boss-sandbox__header nav\s*\{[\s\S]*?grid-column:\s*3;[\s\S]*?pointer-events:\s*auto;/
  );
  assert.match(
    styles,
    /\.boss-sandbox__attacks > div\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/
  );
  assert.match(
    styles,
    /\.boss-sandbox__main-ships\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/
  );

  const compactStyles = styles.slice(styles.indexOf('@media (max-width: 820px)'));
  assert.match(
    compactStyles,
    /\.boss-sandbox__main\s*\{[\s\S]*?grid-template-columns:\s*1fr;/
  );
  assert.match(
    compactStyles,
    /\.boss-sandbox__play\s*\{[\s\S]*?height:\s*100dvh;[\s\S]*?min-height:\s*640px;[\s\S]*?padding:\s*0;/
  );
});

test('Boss Sandbox ship and support-ship controls hot-swap without loading or restarting', () => {
  const callbackStart = source.indexOf('  const announceLiveLoadoutChange = useCallback');
  const callbackEnd = source.indexOf('\n\n  const spawnBoss = useCallback', callbackStart);
  assert.notEqual(callbackStart, -1);
  assert.notEqual(callbackEnd, -1);
  const loadoutCallbacks = source.slice(callbackStart, callbackEnd);

  assert.match(loadoutCallbacks, /setMainShipId\(shipId\)/);
  assert.match(loadoutCallbacks, /setCompanion\(slot, selection\)/);
  assert.doesNotMatch(
    loadoutCallbacks,
    /setPreviewCanvasStatus\('loading'\)|setRestartToken|restart\(/
  );
});

test('local and remote Boss Sandbox attack buttons follow the live runtime attack', () => {
  assert.match(source, /getBossSandboxAttacks/);
  assert.match(source, /type: 'trigger-boss-attack'/);
  assert.match(source, /<nav className="boss-sandbox__attacks" aria-label="Boss attacks">/);
  assert.match(source, /\{attacks\.map\(\(attack, index\) => \(/);
  assert.match(
    source,
    /aria-label=\{`Attack \$\{index \+ 1\}: \$\{attack\.sourceLabel\}`\}/
  );
  for (const previewSource of [source, remoteSource]) {
    assert.match(
      previewSource,
      /const performingAttackId = getBossSandboxPerformingAttackId\([\s\S]*previewSnapshot\?\.boss\?\.activeAttack[\s\S]*\);/
    );
    assert.match(previewSource, /aria-pressed=\{performingAttackId === attack\.id\}/);
    assert.match(
      previewSource,
      /className=\{performingAttackId === attack\.id \? 'is-performing' : ''\}/
    );
  }
  assert.match(
    source,
    /triggerAttack\([\s\S]*attack\.id,[\s\S]*attack\.phaseId,[\s\S]*index \+ 1/
  );
  assert.match(source, /Attack \{index \+ 1\}/);
  assert.match(source, /const replaySelectedAttack = useCallback/);
  assert.match(source, /const toggleSelectedAttackLoop = useCallback/);
  assert.match(source, /Restarted selected attack from its first warning/);
  assert.match(source, /loop: attackLoopEnabled/);
  assert.match(source, /aria-label="Selected attack playback"/);
  assert.match(source, /Replay selected/);
  assert.match(source, /\{attackLoopEnabled \? 'Loop on' : 'Loop off'\}/);
  assert.match(styles, /\.boss-sandbox__attacks > div[\s\S]*grid-template-columns:/);
  assert.match(styles, /\.boss-sandbox__attack-playback button\.is-active/);
  assert.match(styles, /\.boss-sandbox__attacks button[\s\S]*min-height: 38px/);
  assert.match(
    styles,
    /\.boss-sandbox__attacks button\[aria-pressed='true'\][\s\S]*#facc15[\s\S]*#fde047/
  );
  assert.match(
    remoteStyles,
    /\.remote-runner__attacks button\[aria-pressed="true"\][\s\S]*#facc15[\s\S]*#fde047/
  );
});

test('generated boss art is selected from the fixed local registry', () => {
  assert.match(source, /getSandboxBossArtworkRegistration\(selectedChoice\?\.prototypeId\)/);
  assert.match(source, /createSandboxOnlyBossArtwork\(preview\)/);
  assert.doesNotMatch(source, /director-data|\.png\?inline/);
});

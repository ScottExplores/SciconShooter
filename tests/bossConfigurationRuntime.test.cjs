const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');

const root = path.resolve(__dirname, '..');

const findCampaignEvent = (campaign, eventId) => {
  const event = campaign.levels
    .flatMap((level) => level.waves)
    .flatMap((wave) => wave.events)
    .find((candidate) => candidate.id === eventId);
  assert.ok(event, `campaign event ${eventId} exists`);
  return event;
};

const loadTypeScriptModule = (relativePath) => {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(
    `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
    { module, require, structuredClone, crypto: webcrypto, Math, Map, Number, Object, Boolean }
  );
  return module.exports;
};

test('authored boss phases switch movement, speed, and active weapon numbers at health thresholds', () => {
  const { resolveBossPhaseConfig } = loadTypeScriptModule('services/bossPhaseConfig.ts');
  const weapons = [
    { id: 'opening-shot', weaponId: 'aimed-shot', attackIntervalSeconds: 1.4, damage: 1, projectileSpeed: 4.5, burstCount: 1 },
    { id: 'critical-volley', weaponId: 'burst-volley', attackIntervalSeconds: 0.45, damage: 3, projectileSpeed: 8.25, burstCount: 6 }
  ];
  const phases = [
    { id: 'opening', label: 'Opening', triggerHealthRatio: 1, movementPatternId: 'track-player', speedMultiplier: 1, weaponSettingIds: ['opening-shot'] },
    { id: 'critical', label: 'Critical', triggerHealthRatio: 0.35, movementPatternId: 'arena-roam', speedMultiplier: 1.6, weaponSettingIds: ['critical-volley'] }
  ];

  const opening = resolveBossPhaseConfig(100, 100, phases, weapons);
  assert.equal(opening.phaseId, 'opening');
  assert.equal(opening.movementPatternId, 'track-player');
  assert.equal(opening.speedMultiplier, 1);
  assert.deepEqual(structuredClone(opening.weaponSettings), [weapons[0]]);

  const critical = resolveBossPhaseConfig(35, 100, phases, weapons);
  assert.equal(critical.phaseId, 'critical');
  assert.equal(critical.phaseIndex, 1);
  assert.equal(critical.movementPatternId, 'arena-roam');
  assert.equal(critical.speedMultiplier, 1.6);
  assert.deepEqual(structuredClone(critical.weaponSettings), [weapons[1]]);

  const firstBarFloor = resolveBossPhaseConfig(
    0,
    100,
    phases,
    weapons,
    { maximumPhaseIndex: 0 }
  );
  assert.equal(firstBarFloor.phaseId, 'opening');
  assert.equal(firstBarFloor.healthRatio, 0);

  const awakenedBarFloor = resolveBossPhaseConfig(
    100,
    100,
    phases,
    weapons,
    { minimumPhaseIndex: 1 }
  );
  assert.equal(awakenedBarFloor.phaseId, 'critical');
  assert.equal(awakenedBarFloor.healthRatio, 1);
});

test('cloning a gatekeeper remaps nested weapons, phases, timeline clips, and timeline references', () => {
  const campaign = JSON.parse(fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8'));
  const source = structuredClone(findCampaignEvent(campaign, 'bastion-protocol-gatekeeper'));
  source.timeline = {
    durationSeconds: 4,
    loop: true,
    clips: [
      {
        id: 'clone-warning',
        label: 'Clone warning',
        track: 'presentation',
        primitiveId: 'telegraph',
        trigger: 'time',
        startSeconds: 0.25,
        durationSeconds: 0.5,
        phaseId: source.phases[0].id
      },
      {
        id: 'clone-burst',
        label: 'Clone burst',
        track: 'attack',
        primitiveId: 'aimed-burst',
        trigger: 'time',
        startSeconds: 0.75,
        durationSeconds: 0.1,
        phaseId: source.phases[0].id,
        telegraphClipId: 'clone-warning'
      }
    ]
  };
  source.revival = {
    phaseId: source.phases[1].id,
    shutdownSeconds: 2.2,
    rebootSeconds: 2.6,
    restoreHealthRatio: 1,
    awakenedSizeMultiplier: 1.25
  };
  const { cloneWaveEvent } = loadTypeScriptModule('director/src/editor/editorOperations.ts');
  const clone = cloneWaveEvent(source);

  assert.notEqual(clone.id, source.id);
  assert.equal(clone.rigId, 'crown-claw');
  assert.equal(clone.weapons.length, source.weapons.length);
  assert.notDeepEqual(clone.weapons.map((weapon) => weapon.id), source.weapons.map((weapon) => weapon.id));
  const clonedWeaponIds = new Set(clone.weapons.map((weapon) => weapon.id));
  clone.phases.forEach((phase) => {
    phase.weaponSettingIds.forEach((weaponId) => assert.equal(clonedWeaponIds.has(weaponId), true));
  });
  assert.ok(clone.timeline);
  assert.notDeepEqual(clone.timeline.clips.map((clip) => clip.id), source.timeline.clips.map((clip) => clip.id));
  const clonedPhaseIds = new Set(clone.phases.map((phase) => phase.id));
  const clonedTimelineIds = new Set(clone.timeline.clips.map((clip) => clip.id));
  clone.timeline.clips.forEach((clip) => {
    if (clip.phaseId) assert.equal(clonedPhaseIds.has(clip.phaseId), true);
    if (clip.telegraphClipId) assert.equal(clonedTimelineIds.has(clip.telegraphClipId), true);
  });
  assert.ok(clone.revival);
  assert.equal(clonedPhaseIds.has(clone.revival.phaseId), true);
  assert.notEqual(clone.revival.phaseId, source.revival.phaseId);
  assert.equal(clone.revival.phaseId, clone.phases[1].id);
});

test('all authored gatekeepers carry stable rigs and runtime prefers them over the legacy event-id fallback', () => {
  const campaign = JSON.parse(fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8'));
  const rigs = Object.fromEntries(campaign.levels.flatMap((level) => level.waves).flatMap((wave) => wave.events)
    .filter((event) => event.kind === 'boss' && event.bossId === 'gatekeeper')
    .map((event) => [event.id, event.rigId]));
  assert.deepEqual({
    'open-orbit-gatekeeper': rigs['open-orbit-gatekeeper'],
    'paywall-siege-gatekeeper': rigs['paywall-siege-gatekeeper'],
    'bastion-protocol-gatekeeper': rigs['bastion-protocol-gatekeeper']
  }, {
    'open-orbit-gatekeeper': 'open-orbit',
    'paywall-siege-gatekeeper': 'paywall-siege',
    'bastion-protocol-gatekeeper': 'crown-claw'
  });
  assert.equal(rigs['helix-convergence-final-boss'], 'citation-storm');
  assert.ok(Object.keys(rigs).length > 3);
  Object.values(rigs).forEach((rigId) => {
    assert.ok(['open-orbit', 'citation-storm', 'paywall-siege', 'crown-claw'].includes(rigId));
  });

  const engine = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
  const browserValidator = fs.readFileSync(path.join(root, 'game-config', 'validate.ts'), 'utf8');
  assert.match(engine, /configured\.rigId \?\? BOSS_RIG_BY_EVENT_ID\[configured\.id\] \?\? 'open-orbit'/);
  assert.match(engine, /applyConfiguredBossPhase\(boss: Entity\)/);
  assert.match(engine, /const resolvedPhase = this\.applyConfiguredBossPhase\(boss\)/);
  assert.match(engine, /const configuredPhase = this\.applyConfiguredBossPhase\(boss\)/);
  assert.match(browserValidator, /const BOSS_RIG_IDS = new Set\(\['open-orbit', 'citation-storm', 'paywall-siege', 'crown-claw'\]\)/);
  assert.match(browserValidator, /'bossId', 'rigId'/);
  assert.match(browserValidator, /Layered boss rigs are supported only by gatekeepers/);
});

test('preview damage and editor collision inspection are explicit engine-only controls', () => {
  const engine = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
  assert.match(engine, /previewInvincible\?: boolean/);
  assert.match(engine, /this\.previewInvincible = options\.previewInvincible \?\? true/);
  assert.match(engine, /setPreviewInvincible\(enabled: boolean\)/);
  assert.match(engine, /this\.previewMode && this\.previewInvincible/);
  assert.match(engine, /readonly collisionBounds:/);
  assert.match(engine, /const collisionBox = this\.getCollisionBox\(entity\)/);
  assert.match(engine, /x: collisionBox\.x \/ width/);
  assert.match(engine, /height: collisionBox\.height \/ height/);
});

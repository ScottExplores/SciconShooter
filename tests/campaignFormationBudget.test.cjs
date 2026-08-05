const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const campaign = require(path.join(root, 'game-config', 'campaign.json'));

const loadPolicy = () => {
  const result = esbuild.buildSync({
    entryPoints: [path.join(root, 'services', 'campaignFormationBudget.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    logLevel: 'silent'
  });
  const module = { exports: {} };
  Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
};

const {
  canStartCampaignFormationPackInstance,
  getCampaignBaseSimultaneousShooterLimit,
  getCampaignFormationRecoveryFrames,
  getCampaignSimultaneousShooterLimit,
  getCampaignWaveSimultaneousShooterLimit,
  isCampaignFormationPattern,
  resolveCampaignFormationPackForSpawn,
  selectCampaignShooterSlotIds
} = loadPolicy();

const makePack = (overrides = {}) => ({
  id: 'pack-helix',
  formationShape: 'sine',
  enemyRoleIds: ['role-conductor', 'role-stalker'],
  maximumSimultaneousInstances: 1,
  recoveryRequiredSeconds: 2.25,
  ...overrides
});

test('only authored grouped patterns participate in formation-pack budgeting', () => {
  assert.equal(isCampaignFormationPattern('sine'), true);
  assert.equal(isCampaignFormationPattern('single-random'), false);
  assert.equal(isCampaignFormationPattern('random-top'), false);
  assert.equal(isCampaignFormationPattern(undefined), false);
});

test('spawn events resolve only to a declared shape-and-role-compatible pack', () => {
  const helix = makePack();
  const unrelated = makePack({
    id: 'pack-grid',
    formationShape: 'grid',
    enemyRoleIds: ['role-conductor']
  });
  const event = {
    patternId: 'sine',
    enemies: [{ roleId: 'role-conductor' }, { roleId: 'role-stalker' }]
  };

  assert.equal(resolveCampaignFormationPackForSpawn(event, [unrelated, helix]), helix);
  assert.equal(
    resolveCampaignFormationPackForSpawn({ ...event, patternId: 'diamond' }, [helix]),
    helix,
    'an explicitly declared role-compatible remix may vary the pack base shape'
  );
  assert.equal(
    resolveCampaignFormationPackForSpawn(event, [makePack({ enemyRoleIds: ['role-conductor'] })]),
    undefined,
    'every referenced role must belong to the declared pack'
  );
  assert.equal(
    resolveCampaignFormationPackForSpawn({ ...event, patternId: 'single-random' }, [helix]),
    undefined,
    'loose support spawns are not fake pack instances'
  );
});

test('formation admission keeps an existing instance alive but gates new starts by count and recovery', () => {
  const pack = makePack();
  const base = {
    pack,
    alreadyStarted: false,
    activeInstanceCount: 0,
    currentFrame: 1000,
    framesPerSecond: 60
  };

  assert.equal(getCampaignFormationRecoveryFrames(2.25, 60), 135);
  assert.equal(canStartCampaignFormationPackInstance(base), true);
  assert.equal(canStartCampaignFormationPackInstance({ ...base, activeInstanceCount: 1 }), false);
  assert.equal(canStartCampaignFormationPackInstance({
    ...base,
    alreadyStarted: true,
    activeInstanceCount: 1,
    lastRetiredFrame: 999
  }), true);
  assert.equal(canStartCampaignFormationPackInstance({ ...base, lastRetiredFrame: 866 }), false);
  assert.equal(canStartCampaignFormationPackInstance({ ...base, lastRetiredFrame: 865 }), true);
});

test('Wave shooter ceiling is derived from unique authored firing-role maxima', () => {
  const roles = [
    { id: 'role-scout', fireBehavior: 'none', maximumSimultaneousCount: 10 },
    { id: 'role-stalker', fireBehavior: 'aimed-burst', maximumSimultaneousCount: 4 },
    { id: 'role-elite', fireBehavior: 'elite-only', maximumSimultaneousCount: 2 }
  ];
  const events = [
    { patternId: 'sine', enemies: [{ roleId: 'role-stalker' }, { roleId: 'role-stalker' }] },
    { patternId: 'grid', enemies: [{ roleId: 'role-elite' }, { roleId: 'role-scout' }] }
  ];

  assert.equal(getCampaignWaveSimultaneousShooterLimit(events, roles), 6);
  assert.equal(
    getCampaignWaveSimultaneousShooterLimit(
      [{ patternId: 'v', enemies: [{ roleId: 'role-scout' }] }],
      roles
    ),
    undefined,
    'legacy/no-fire Waves do not inherit a fabricated global cap'
  );
});

test('global Campaign shooter slots reuse the existing hostile-shot ceiling and stable priority order', () => {
  assert.deepEqual(
    [1, 2, 3, 4, 20].map(getCampaignBaseSimultaneousShooterLimit),
    [6, 8, 10, 12, 12]
  );
  assert.equal(getCampaignSimultaneousShooterLimit(3, 30), 10);
  assert.equal(getCampaignSimultaneousShooterLimit(20, 4), 4);
  assert.equal(getCampaignSimultaneousShooterLimit(20, undefined), undefined);

  const selected = selectCampaignShooterSlotIds([
    { id: 'later', priority: false, spawnFrame: 20, sourceEventId: 'b', formationIndex: 0 },
    { id: 'oldest', priority: false, spawnFrame: 10, sourceEventId: 'a', formationIndex: 2 },
    { id: 'priority-b', priority: true, spawnFrame: 15, sourceEventId: 'b', formationIndex: 1 },
    { id: 'priority-a', priority: true, spawnFrame: 15, sourceEventId: 'a', formationIndex: 1 }
  ], 3);
  assert.deepEqual(selected, ['priority-a', 'priority-b', 'oldest']);
});

test('tracked Campaign resolves every grouped spawn to one declared compatible formation pack', () => {
  const packsById = new Map(campaign.formationPacks.map((pack) => [pack.id, pack]));
  let formationEvents = 0;
  let resolved = 0;
  let noDeclaredPack = 0;
  const incompatibleEventIds = [];
  const unusedDeclarations = [];

  campaign.levels.forEach((level) => {
    level.waves.forEach((wave) => {
      const packs = wave.formationPackIds.map((packId) => packsById.get(packId)).filter(Boolean);
      const usedPackIds = new Set();
      wave.events.forEach((event) => {
        if (event.kind !== 'spawn' || !isCampaignFormationPattern(event.patternId)) return;
        formationEvents++;
        const resolvedPack = resolveCampaignFormationPackForSpawn(event, packs);
        if (resolvedPack) {
          resolved++;
          usedPackIds.add(resolvedPack.id);
        } else if (packs.length === 0) {
          noDeclaredPack++;
        } else {
          incompatibleEventIds.push(event.id);
        }
      });
      wave.formationPackIds.forEach((packId) => {
        if (!usedPackIds.has(packId)) unusedDeclarations.push(`${level.id}/${wave.id}/${packId}`);
      });
    });
  });

  assert.ok(formationEvents >= 386, 'the faster cadence keeps at least the prior formation vocabulary');
  assert.equal(resolved, formationEvents);
  assert.equal(noDeclaredPack, 0);
  assert.deepEqual(incompatibleEventIds, []);
  assert.deepEqual(unusedDeclarations, []);

  const paywall = campaign.levels.find((level) => level.id === 'stage-paywall-siege');
  assert.deepEqual(paywall.waves[1].formationPackIds, ['pack-light-jet-pincer']);
  assert.deepEqual(paywall.waves.at(-1).formationPackIds, ['pack-light-jet-pincer']);
  assert.deepEqual(
    packsById.get('pack-light-jet-pincer').enemyRoleIds,
    ['role-jet-scout', 'role-jet-interceptor', 'role-research-drone', 'role-citation-swarm'],
    'the first elite checkpoint mixes early escorts without inheriting the not-yet-introduced Audit Bulwark role'
  );
});

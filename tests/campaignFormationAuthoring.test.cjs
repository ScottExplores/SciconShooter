const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const campaignPath = path.join(root, 'game-config', 'campaign.json');
const authoringUrl = pathToFileURL(path.join(root, 'tools', 'campaign-formation-authoring.mjs')).href;

const readCampaign = () => JSON.parse(fs.readFileSync(campaignPath, 'utf8'));

const compileBrowserValidator = () => {
  const result = esbuild.buildSync({
    entryPoints: [path.join(root, 'game-config', 'validate.ts')],
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

const { validateGameCampaign } = compileBrowserValidator();
const issueMatches = (result, code) => result.issues.some((issue) => issue.code === code);

test('formation normalization is idempotent and never changes Campaign route topology', async () => {
  const { normalizeCampaignFormationAuthoring } = await import(authoringUrl);
  const campaign = readCampaign();
  const graphBefore = structuredClone(campaign.campaignGraph);
  const sectorsBefore = structuredClone(campaign.sectors);
  const levelsBefore = structuredClone(campaign.levels);

  const first = normalizeCampaignFormationAuthoring(campaign);
  const second = normalizeCampaignFormationAuthoring(campaign);

  // REVAMP_NOTES_B: early waves are regenerated; count actual grouped events.
  assert.equal(first.groupedSpawnCount, campaign.levels.flatMap(level => level.waves).flatMap(wave => wave.events).filter(event => event.kind === 'spawn' && !/single|random/.test(event.patternId)).length);
  assert.equal(second.groupedSpawnCount, first.groupedSpawnCount);
  assert.deepEqual(first.declarationChanges, []);
  assert.deepEqual(first.cooldownChanges, []);
  assert.deepEqual(second.declarationChanges, []);
  assert.deepEqual(second.cooldownChanges, []);
  assert.deepEqual(campaign.campaignGraph, graphBefore);
  assert.deepEqual(campaign.sectors, sectorsBefore);
  assert.deepEqual(campaign.levels, levelsBefore, 'normalization must preserve authored sector choreography and timing');
  assert.equal(campaign.formationPacks.filter((pack) => pack.id.startsWith('pack-breakwater-')).length, 25);
  assert.equal(campaign.formationPacks.filter((pack) => !pack.id.startsWith('pack-breakwater-') && !pack.id.startsWith('pack-revamp-')).length, 16);
});

test('adding a more specific catalog pack never overrides an existing Wave declaration', async () => {
  const { normalizeCampaignFormationAuthoring } = await import(authoringUrl);
  const campaign = readCampaign();
  const wave = campaign.levels.find((level) => level.id === 'stage-last-light-gauntlet').waves
    .find((candidate) => candidate.id === 'stage-last-light-gauntlet-wave-4');
  const declaredBefore = [...wave.formationPackIds];
  assert.ok(declaredBefore.includes('pack-orbit-grid'));
  const event = wave.events.find((candidate) => candidate.kind === 'spawn'
    && candidate.enemies.every((enemy) => enemy.roleId === 'role-research-drone'));
  assert.ok(event, 'fixture is an existing role-bound regular-enemy event');
  campaign.formationPacks.push({
    ...structuredClone(campaign.formationPacks.find((pack) => pack.id === 'pack-orbit-grid')),
    id: 'pack-regression-specific-drone',
    enemyRoleIds: ['role-research-drone'],
    formationShape: event.patternId
  });
  const result = normalizeCampaignFormationAuthoring(campaign);
  assert.deepEqual(wave.formationPackIds, declaredBefore);
  assert.deepEqual(result.declarationChanges, []);
});

test('authored role reuse satisfies every nonzero internal-Wave cooldown', () => {
  const campaign = readCampaign();
  const rolesById = new Map(campaign.enemyRoles.map((role) => [role.id, role]));
  const violations = [];

  campaign.levels.forEach((level) => {
    const previousWaveByRole = new Map();
    [...level.waves].sort((left, right) => left.order - right.order).forEach((wave) => {
      const usedRoleIds = new Set(wave.events
        .filter((event) => event.kind === 'spawn')
        .flatMap((event) => event.enemies)
        .map((enemy) => enemy.roleId)
        .filter(Boolean));
      usedRoleIds.forEach((roleId) => {
        const previousOrder = previousWaveByRole.get(roleId);
        const cooldown = rolesById.get(roleId).reuseCooldownWaves;
        if (previousOrder !== undefined && wave.order - previousOrder - 1 < cooldown) {
          violations.push(`${level.id}/${wave.id}/${roleId}`);
        }
        previousWaveByRole.set(roleId, wave.order);
      });
    });
  });

  assert.deepEqual(violations, []);
  assert.equal(campaign.enemyRoles.filter((role) => role.reuseCooldownWaves > 0).length, 5);
});

test('browser validation rejects missing, unused, and cooldown-conflicting formation authoring', () => {
  const missing = readCampaign();
  const firstGroupedWave = missing.levels
    .flatMap((level) => level.waves)
    .find((wave) => wave.formationPackIds.length > 0);
  firstGroupedWave.formationPackIds = [];
  assert.equal(issueMatches(validateGameCampaign(missing), 'missing_formation_binding'), true);

  const unused = readCampaign();
  const firstWave = unused.levels[0].waves[0];
  firstWave.formationPackIds.push('pack-prism-ring');
  assert.equal(issueMatches(validateGameCampaign(unused), 'unused_formation_binding'), true);

  const cooldown = readCampaign();
  cooldown.enemyRoles.find((role) => role.id === 'role-research-drone').reuseCooldownWaves = 1;
  assert.equal(issueMatches(validateGameCampaign(cooldown), 'reuse_cooldown_violation'), true);
});

test('revamp choreography has the same bounded schema in browser and server validators', async () => {
  // REVAMP(G), category (a): new gameplay vocabulary must survive server round trips.
  const server = await import(pathToFileURL(path.join(root, 'director/server/gameCampaignValidation.mjs')).href);
  const current = readCampaign();
  assert.equal(validateGameCampaign(current).valid, true);
  assert.equal(server.validateGameCampaign(current).valid, true);
  for (const mutate of [
    campaign => { campaign.formationPacks.find(pack => pack.id.startsWith('pack-revamp-')).entryPath = 'revamp-unknown'; },
    campaign => { campaign.levels[1].waves = campaign.levels[1].waves.slice(0, 1); },
    campaign => { campaign.levels[4].waves.push(...structuredClone(campaign.levels[4].waves), ...structuredClone(campaign.levels[4].waves)); }
  ]) {
    const invalid = structuredClone(current);
    mutate(invalid);
    assert.equal(validateGameCampaign(invalid).valid, false);
    assert.equal(server.validateGameCampaign(invalid).valid, false);
  }
});

test('short Missions require dense squadrons and retain lower and upper cadence bounds in both validators', async () => {
  const server = await import(pathToFileURL(path.join(root, 'director/server/gameCampaignValidation.mjs')).href);
  const current = readCampaign();
  const levelIndex = current.levels.findIndex(level => level.id === 'stage-citation-storm');
  assert.equal(current.levels[levelIndex].waves.length, 3);
  for (const [label, mutate] of [
    ['sparse three-wave Mission', level => {
      for (const wave of level.waves) for (const event of wave.events) {
        if (event.kind === 'spawn' && event.count >= 22) event.count = 21;
      }
    }],
    ['two-wave dense Mission', level => { level.waves.pop(); }],
    ['nine-wave dense Mission', level => { level.waves.push(...structuredClone(level.waves), ...structuredClone(level.waves)); }]
  ]) {
    const invalid = structuredClone(current);
    mutate(invalid.levels[levelIndex]);
    assert.ok(validateGameCampaign(invalid).issues.some(issue => issue.code === 'invalid_wave_count'
      && issue.path === `/levels/${levelIndex}/waves`), label);
    assert.ok(server.validateGameCampaign(invalid).errors.some(error => error.startsWith(`/levels/${levelIndex}/waves must contain`)), label);
  }
});

test('browser and server reject the same invalid choreography values at the affected field', async () => {
  const server = await import(pathToFileURL(path.join(root, 'director/server/gameCampaignValidation.mjs')).href);
  const current = readCampaign();
  const fields = [
    ['holdSeconds', .35, 12], ['telegraphSeconds', .2, 4], ['attackDurationSeconds', .3, 8],
    ['attackRecoverySeconds', .35, 12, 'recoverySeconds'], ['attackGroupSize', 1, 48], ['attackCycles', 0, 20]
  ];
  const spawnIndex = current.levels[0].waves[0].events.findIndex(event => event.kind === 'spawn');
  const packIndex = current.formationPacks.findIndex(pack => pack.id === 'pack-revamp-linefighter');
  assert.ok(packIndex >= 0);
  for (const boundaryIndex of [1, 2]) {
    const candidate = structuredClone(current);
    const pack = candidate.formationPacks[packIndex];
    const event = candidate.levels[0].waves[0].events[spawnIndex];
    for (const [packKey, minimum, maximum, eventKey = packKey] of fields) {
      const value = boundaryIndex === 1 ? minimum : maximum;
      pack[packKey] = packKey === 'attackGroupSize' ? Math.min(value, pack.enemyCount) : value;
      event.formationBehavior[eventKey] = packKey === 'attackGroupSize' ? Math.min(value, event.count) : value;
    }
    assert.equal(validateGameCampaign(candidate).valid, true, `accept numeric boundary ${boundaryIndex}`);
    assert.equal(server.validateGameCampaign(candidate).valid, true, `accept numeric boundary ${boundaryIndex}`);
  }
  for (const [packKey, minimum, maximum, eventKey = packKey] of fields) {
    for (const side of ['pack', 'event']) {
      for (const value of [minimum - .01, maximum + 1, '1', null, ...(packKey.startsWith('attackG') || packKey === 'attackCycles' ? [1.5] : [])]) {
        const invalid = structuredClone(current);
        const key = side === 'pack' ? packKey : eventKey;
        const target = side === 'pack' ? invalid.formationPacks[packIndex] : invalid.levels[0].waves[0].events[spawnIndex].formationBehavior;
        target[key] = value;
        const fieldPath = side === 'pack' ? `/formationPacks/${packIndex}/${key}`
          : `/levels/0/waves/0/events/${spawnIndex}/formationBehavior/${key}`;
        assert.ok(validateGameCampaign(invalid).issues.some(issue => issue.path === fieldPath), `${fieldPath}: ${value}`);
        assert.ok(server.validateGameCampaign(invalid).errors.some(error => error.startsWith(fieldPath)), `${fieldPath}: ${value}`);
      }
    }
  }
  for (const side of ['pack', 'event']) {
    const invalid = structuredClone(current);
    const target = side === 'pack' ? invalid.formationPacks[packIndex] : invalid.levels[0].waves[0].events[spawnIndex].formationBehavior;
    target.attackGroupSize = side === 'pack' ? invalid.formationPacks[packIndex].enemyCount + 1
      : invalid.levels[0].waves[0].events[spawnIndex].count + 1;
    assert.ok(validateGameCampaign(invalid).issues.some(issue => issue.path.endsWith('/attackGroupSize')));
    assert.ok(server.validateGameCampaign(invalid).errors.some(error => error.includes('/attackGroupSize cannot exceed')));
  }
});

test('Director editor exposes every typed choreography choice and round trips authored dense flights losslessly', async () => {
  const result = esbuild.buildSync({ entryPoints: [path.join(root, 'director/src/combat-lab/formationBehaviorModel.ts')],
    bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent' });
  const module = { exports: {} };
  Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports);
  const editor = module.exports;
  const typeSource = fs.readFileSync(path.join(root, 'game-config/types.ts'), 'utf8');
  const server = await import(pathToFileURL(path.join(root, 'director/server/gameCampaignValidation.mjs')).href);
  const current = readCampaign();
  for (const [type, options, packField, eventField] of [
    ['FormationEntryPathId', 'FORMATION_ENTRY_OPTIONS', 'entryPath', 'entryPathId'],
    ['FormationMovementId', 'FORMATION_MOVEMENT_OPTIONS', 'movementBehavior', 'movementId'],
    ['FormationAttackBehaviorId', 'FORMATION_ATTACK_OPTIONS', 'attackBehavior', 'attackId'],
    ['FormationFiringBehaviorId', 'FORMATION_FIRING_OPTIONS', 'firingBehavior', 'firingBehavior'],
    ['FormationReturnBehaviorId', 'FORMATION_RETURN_OPTIONS', 'returnBehavior', 'returnId']
  ]) {
    const typedIds = [...typeSource.match(new RegExp(`export type ${type} =([^;]+);`))[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
    assert.deepEqual(editor[options].map(option => option.id).sort(), typedIds.sort(), type);
    for (const { id } of editor[options]) {
      const candidate = structuredClone(current);
      candidate.formationPacks[0][packField] = id;
      const event = candidate.levels[0].waves[0].events.find(event => event.kind === 'spawn');
      const before = structuredClone(event);
      const edited = editor.updateFormationBehavior(event, { [eventField]: id });
      assert.deepEqual(event, before, 'editor must not mutate the authored event');
      assert.deepEqual(edited, { ...before, formationBehavior: { ...before.formationBehavior, [eventField]: id } });
      Object.assign(event, edited);
      assert.equal(validateGameCampaign(candidate).valid, true, `${type}/${id}`);
      assert.equal(server.validateGameCampaign(candidate).valid, true, `${type}/${id}`);
    }
    const invalid = structuredClone(current);
    invalid.formationPacks[0][packField] = 'unknown-choreography';
    const eventIndex = invalid.levels[0].waves[0].events.findIndex(event => event.kind === 'spawn');
    invalid.levels[0].waves[0].events[eventIndex].formationBehavior[eventField] = 'unknown-choreography';
    for (const fieldPath of [`/formationPacks/0/${packField}`, `/levels/0/waves/0/events/${eventIndex}/formationBehavior/${eventField}`]) {
      assert.ok(validateGameCampaign(invalid).issues.some(issue => issue.path === fieldPath));
      assert.ok(server.validateGameCampaign(invalid).errors.some(error => error.startsWith(fieldPath)));
    }
  }
  const editorFields = fs.readFileSync(path.join(root, 'director/src/combat-lab/FormationBehaviorFields.tsx'), 'utf8');
  assert.match(editorFields, /label="Attack cycles \(0 repeats\)"[^\n]+minimum=\{0\} maximum=\{20\}/);
});

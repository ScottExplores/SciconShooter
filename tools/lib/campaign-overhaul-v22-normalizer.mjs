const roundThreat = (value) => Math.round(value * 100) / 100;

const TEACHING_VARIANTS = {
  'sector-open-orbit': {
    introduction: ['v', ['role-orbit-scout'], 'ORBIT BANK'],
    'formation-remix': ['spiral', ['role-citation-swarm', 'role-research-drone'], 'CITATION SPIRAL'],
    'elite-checkpoint': ['pincer', ['role-jet-scout', 'role-jet-interceptor'], 'INTERCEPTOR PINCER'],
    'boss-preparation': ['diamond', ['role-journal-priority', 'role-jet-interceptor'], 'PRIORITY LOCK']
  },
  'sector-redline': {
    introduction: ['sine', ['role-dna-conductor', 'role-laser-stalker', 'role-orbit-disc'], 'HELIX DESCENT'],
    'formation-remix': ['pincer', ['role-wall-sniper-left', 'role-laser-hunter'], 'REDLINE CROSSFIRE'],
    'elite-checkpoint': ['row', ['role-wall-sniper-right', 'role-laser-hunter'], 'DARK LANE AMBUSH'],
    'boss-preparation': ['spiral', ['role-citation-swarm', 'role-jet-heavy'], 'CITATION CROSSCURRENT']
  },
  'sector-gravity': {
    introduction: ['row', ['role-dark-sentinel', 'role-crescent-minelayer'], 'DARK MATTER LANES'],
    'formation-remix': ['sine', ['role-dna-conductor', 'role-orbit-disc', 'role-laser-stalker'], 'GRAVITY HELIX'],
    'elite-checkpoint': ['grid', ['role-jet-heavy', 'role-ring-emitter'], 'ARMORED GRAVITY GRID'],
    'boss-preparation': ['spiral', ['role-prism-artillery', 'role-ring-sentinel'], 'PRISM RING SIGNAL']
  },
  'sector-terminus': {
    introduction: ['pincer', ['role-wall-sniper-left', 'role-laser-hunter'], 'TERMINUS CROSSFIRE'],
    'formation-remix': ['grid', ['role-jet-heavy', 'role-ring-emitter'], 'TRIBUNAL GRID'],
    'elite-checkpoint': ['spiral', ['role-prism-artillery', 'role-ring-sentinel'], 'PRISM JUDGMENT'],
    'boss-preparation': ['diamond', ['role-journal-priority', 'role-ring-sentinel'], 'FINAL PRIORITY LOCK']
  }
};

const PACK_BY_PATTERN = {
  v: 'pack-orbit-v',
  diamond: 'pack-priority-diamond',
  sine: 'pack-dna-helix',
  row: 'pack-dark-lanes'
};

const PACK_ROLE_BLUEPRINTS = {
  'pack-orbit-v': ['role-orbit-scout', 'role-research-drone'],
  'pack-orbit-grid': ['role-research-drone'],
  'pack-citation-spiral': ['role-citation-swarm', 'role-research-drone'],
  'pack-jet-pincer': ['role-jet-scout', 'role-jet-interceptor', 'role-jet-heavy'],
  'pack-priority-diamond': ['role-journal-priority', 'role-jet-interceptor'],
  'pack-dna-helix': ['role-dna-conductor', 'role-laser-stalker', 'role-orbit-disc'],
  'pack-wall-crossfire': ['role-wall-sniper-left', 'role-wall-sniper-right', 'role-laser-hunter'],
  'pack-dark-lanes': ['role-dark-sentinel', 'role-crescent-minelayer', 'role-shield-rammer'],
  'pack-prism-ring': ['role-prism-artillery', 'role-ring-sentinel', 'role-ring-emitter'],
  'pack-heavy-grid': ['role-jet-heavy', 'role-journal-priority', 'role-ring-emitter']
};

const teachingWeights = (count) => {
  if (count === 1) return [1];
  if (count === 2) return [0.58, 0.42];
  return [0.4, 0.34, 0.26];
};

const packIdForSpawn = (event) => {
  if (event.patternId === 'single-random') return null;
  const roleIds = new Set(event.enemies?.map((enemy) => enemy.roleId) ?? []);
  if (event.patternId === 'grid') {
    return [...roleIds].some((id) => ['role-jet-heavy', 'role-dark-sentinel', 'role-ring-sentinel', 'role-ring-emitter'].includes(id))
      ? 'pack-heavy-grid'
      : 'pack-orbit-grid';
  }
  if (event.patternId === 'spiral') {
    return [...roleIds].some((id) => ['role-prism-artillery', 'role-ring-sentinel', 'role-ring-emitter'].includes(id))
      ? 'pack-prism-ring'
      : 'pack-citation-spiral';
  }
  if (event.patternId === 'pincer') {
    return [...roleIds].some((id) => ['role-wall-sniper-left', 'role-wall-sniper-right', 'role-laser-hunter'].includes(id))
      ? 'pack-wall-crossfire'
      : 'pack-jet-pincer';
  }
  return PACK_BY_PATTERN[event.patternId] ?? null;
};

const weightedSpawnThreat = (event, rolesById) => roundThreat(
  Number(event.count ?? 0) * (event.enemies ?? []).reduce((sum, enemy) => (
    sum + Number(enemy.weight ?? 0) * Number(rolesById.get(enemy.roleId)?.threatCost ?? 0)
  ), 0)
);

const dedupeEnemiesByEnemyId = (enemies) => {
  const unique = [];
  const indexByEnemyId = new Map();
  for (const enemy of enemies) {
    const existingIndex = indexByEnemyId.get(enemy.enemyId);
    if (existingIndex === undefined) {
      indexByEnemyId.set(enemy.enemyId, unique.length);
      unique.push(enemy);
      continue;
    }
    unique[existingIndex].weight = roundThreat(
      Number(unique[existingIndex].weight ?? 0) + Number(enemy.weight ?? 0)
    );
  }
  return unique;
};

const conformSpawnToPack = (event, packRoleIds, rolesById) => {
  const uniqueRoles = [];
  const enemyIds = new Set();
  for (const roleId of packRoleIds) {
    const role = rolesById.get(roleId);
    if (!role || enemyIds.has(role.enemyId)) continue;
    enemyIds.add(role.enemyId);
    uniqueRoles.push(role);
  }
  const weights = teachingWeights(uniqueRoles.length);
  event.enemies = uniqueRoles.map((role, index) => {
    const source = event.enemies[index % event.enemies.length];
    const enemy = {
      ...source,
      enemyId: role.enemyId,
      spriteKey: role.spriteKey,
      weight: weights[index],
      roleId: role.id
    };
    delete enemy.spriteStyle;
    return enemy;
  });
};

const applyTeachingVariant = (level, rolesById) => {
  const progression = level.campaignProgression;
  const variant = TEACHING_VARIANTS[progression.sectorId]?.[progression.missionRole];
  const teachingWave = level.waves?.find((wave) => wave.rhythm === 'introduce');
  const event = teachingWave?.events?.find((candidate) => candidate.kind === 'spawn');
  if (!variant || !event || event.enemies.length === 0) return;

  const [patternId, roleIds, label] = variant;
  const weights = teachingWeights(roleIds.length);
  event.label = label;
  event.patternId = patternId;
  event.positionId = 'formation-top';
  delete event.formationSlots;
  event.enemies = roleIds.map((roleId, index) => {
    const role = rolesById.get(roleId);
    const source = event.enemies[index % event.enemies.length];
    const enemy = {
      ...source,
      enemyId: role.enemyId,
      spriteKey: role.spriteKey,
      weight: weights[index],
      roleId
    };
    delete enemy.spriteStyle;
    return enemy;
  });
};

export const repairCampaignOverhaulV22 = (campaign) => {
  if (campaign.revision !== 22 || !Array.isArray(campaign.sectors)) {
    throw new Error('Campaign overhaul v22 normalization requires an authored revision 22 manifest.');
  }

  const rolesById = new Map(campaign.enemyRoles.map((role) => [role.id, role]));
  const rolesBySprite = new Map(campaign.enemyRoles.map((role) => [role.spriteKey, role]));
  const fallbackRoleByEnemyId = new Map([
    ['drone', rolesById.get('role-research-drone')],
    ['swarm', rolesById.get('role-citation-swarm')],
    ['brick', rolesById.get('role-jet-heavy')],
    ['journal', rolesById.get('role-journal-priority')]
  ]);
  const packsById = new Map(campaign.formationPacks.map((pack) => [pack.id, pack]));
  const sectorOrderById = new Map(campaign.sectors.map((sector) => [sector.id, sector.order]));

  for (const level of campaign.levels) {
    for (const wave of level.waves) {
      for (const event of wave.events) {
        if (event.kind !== 'spawn') continue;
        event.enemies = dedupeEnemiesByEnemyId(event.enemies.map((enemy) => {
          const role = rolesBySprite.get(enemy.spriteKey)
            ?? rolesById.get(enemy.roleId)
            ?? fallbackRoleByEnemyId.get(enemy.enemyId);
          if (!role) throw new Error(`No Campaign enemy role maps ${enemy.enemyId}/${enemy.spriteKey}.`);
          return {
            ...enemy,
            enemyId: role.enemyId,
            spriteKey: role.spriteKey,
            roleId: role.id
          };
        }));
      }
    }
    applyTeachingVariant(level, rolesById);
  }

  const usageByPackId = new Map(campaign.formationPacks.map((pack) => [pack.id, {
    sectorIds: new Set(),
    missionRoles: new Set(),
    enemyRoleIds: new Set(),
    maximumEnemyCount: 0,
    maximumThreat: 0,
    maximumSimultaneousInstances: 1
  }]));

  for (const level of campaign.levels) {
    const progression = level.campaignProgression;
    for (const wave of level.waves) {
      const spawnEvents = wave.events.filter((event) => event.kind === 'spawn');
      const packIds = [];
      const instancesByPackId = new Map();
      let weightedThreat = 0;
      for (const event of spawnEvents) {
        const packId = packIdForSpawn(event);
        if (packId) conformSpawnToPack(event, PACK_ROLE_BLUEPRINTS[packId], rolesById);
        const eventThreat = weightedSpawnThreat(event, rolesById);
        weightedThreat += eventThreat;
        if (!packId) continue;
        if (!packsById.has(packId)) throw new Error(`No formation pack exists for ${packId}.`);
        if (!packIds.includes(packId)) packIds.push(packId);
        const usage = usageByPackId.get(packId);
        usage.sectorIds.add(progression.sectorId);
        usage.missionRoles.add(progression.missionRole);
        event.enemies.forEach((enemy) => usage.enemyRoleIds.add(enemy.roleId));
        usage.maximumEnemyCount = Math.max(usage.maximumEnemyCount, Number(event.count));
        usage.maximumThreat = Math.max(usage.maximumThreat, eventThreat);
        const instances = (instancesByPackId.get(packId) ?? 0) + 1;
        instancesByPackId.set(packId, instances);
        usage.maximumSimultaneousInstances = Math.max(usage.maximumSimultaneousInstances, instances);
      }
      wave.formationPackIds = packIds;
      wave.combatBudget = Math.max(Number(wave.combatBudget), roundThreat(weightedThreat));
    }
  }

  for (const pack of campaign.formationPacks) {
    const usage = usageByPackId.get(pack.id);
    if (usage.sectorIds.size === 0) continue;
    pack.compatibleSectorIds = [...usage.sectorIds].sort((left, right) => sectorOrderById.get(left) - sectorOrderById.get(right));
    pack.compatibleMissionRoles = [...usage.missionRoles];
    pack.enemyRoleIds = [...usage.enemyRoleIds];
    pack.enemyCount = usage.maximumEnemyCount;
    pack.totalThreatCost = roundThreat(usage.maximumThreat);
    pack.minimumSector = Math.min(...pack.compatibleSectorIds.map((sectorId) => sectorOrderById.get(sectorId)));
    pack.maximumSimultaneousInstances = usage.maximumSimultaneousInstances;
  }

  for (const role of campaign.enemyRoles) {
    role.compatibleFormationPackIds = campaign.formationPacks
      .filter((pack) => pack.enemyRoleIds.includes(role.id))
      .map((pack) => pack.id);
  }

  for (const level of campaign.levels) {
    for (const wave of level.waves) {
      const declaredPackThreat = wave.formationPackIds.reduce((sum, packId) => (
        sum + Number(packsById.get(packId)?.totalThreatCost ?? 0)
      ), 0);
      wave.combatBudget = Math.max(Number(wave.combatBudget), roundThreat(declaredPackThreat));
    }
    level.campaignProgression.combatBudget = roundThreat(
      level.waves.reduce((sum, wave) => sum + Number(wave.combatBudget), 0)
    );
  }

  const levelsById = new Map(campaign.levels.map((level) => [level.id, level]));
  for (const branch of campaign.campaignBranches) {
    const sourcePosition = levelsById.get(branch.sourceMissionId)?.campaignProgression?.mapPosition;
    if (!sourcePosition || branch.routeControlPoints.length === 0) continue;
    branch.routeControlPoints[0] = { ...sourcePosition };
    branch.routeControlPoints[branch.routeControlPoints.length - 1] = { ...branch.mapPosition };
  }

  return campaign;
};

export const campaignFormationPackIdForSpawn = packIdForSpawn;
export const campaignWeightedSpawnThreat = weightedSpawnThreat;

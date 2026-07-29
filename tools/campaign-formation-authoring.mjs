const normalizeId = (value) => String(value ?? '').trim();

export const isGroupedCampaignFormationPattern = (patternId) => {
  const normalized = normalizeId(patternId).toLowerCase();
  return normalized.length > 0
    && !normalized.includes('single')
    && !normalized.includes('random');
};

const uniqueRoleIdsForEvent = (event) => [...new Set(
  (Array.isArray(event?.enemies) ? event.enemies : [])
    .map((enemy) => normalizeId(enemy?.roleId))
    .filter(Boolean)
)];

/**
 * Resolves one grouped spawn against a bounded pack set. Complete role
 * compatibility is authoritative; the base shape only breaks ambiguity so an
 * explicitly authored remix may keep a different shape.
 */
export const resolveAuthoredFormationPack = (event, packs) => {
  if (!isGroupedCampaignFormationPattern(event?.patternId)) return undefined;
  const roleIds = uniqueRoleIdsForEvent(event);
  if (roleIds.length === 0) return undefined;

  const compatible = (Array.isArray(packs) ? packs : []).filter((pack) => (
    Array.isArray(pack?.enemyRoleIds)
      && roleIds.every((roleId) => pack.enemyRoleIds.includes(roleId))
  ));
  const exactRoleMatches = compatible.filter((pack) => (
    pack.enemyRoleIds.length === roleIds.length
  ));
  if (exactRoleMatches.length === 1) return exactRoleMatches[0];
  const exactShapeMatches = exactRoleMatches.filter((pack) => pack.formationShape === event.patternId);
  if (exactShapeMatches.length === 1) return exactShapeMatches[0];
  if (compatible.length === 1) return compatible[0];
  const shapeMatches = compatible.filter((pack) => pack.formationShape === event.patternId);
  return shapeMatches.length === 1 ? shapeMatches[0] : undefined;
};

const collectWaveRoleIds = (wave) => new Set(
  (Array.isArray(wave?.events) ? wave.events : [])
    .filter((event) => event?.kind === 'spawn')
    .flatMap((event) => Array.isArray(event.enemies) ? event.enemies : [])
    .map((enemy) => normalizeId(enemy?.roleId))
    .filter(Boolean)
);

/**
 * Makes formation declarations and role cooldown metadata match the authored
 * Campaign without touching Mission order, routes, event timing, or enemy
 * choreography. The pass is deterministic and idempotent so the v23 generator
 * and one-shot normalization produce the same checked-in data.
 */
export const normalizeCampaignFormationAuthoring = (campaign) => {
  if (!campaign || !Array.isArray(campaign.levels)) {
    throw new Error('Campaign formation normalization requires Campaign levels.');
  }
  if (!Array.isArray(campaign.formationPacks) || !Array.isArray(campaign.enemyRoles)) {
    throw new Error('Campaign formation normalization requires formation packs and enemy roles.');
  }

  const sectorIds = (Array.isArray(campaign.sectors) ? campaign.sectors : [])
    .map((sector) => normalizeId(sector?.id))
    .filter(Boolean);
  const lightJetPack = {
    id: 'pack-light-jet-pincer',
    label: 'Light Jet Pincer',
    enemyRoleIds: ['role-jet-scout', 'role-jet-interceptor'],
    enemyCount: 24,
    totalThreatCost: 62,
    entryDirection: 'split',
    entryPath: 'paired-flank',
    formationShape: 'pincer',
    firingBehavior: 'priority',
    synergyAdjustment: 2,
    minimumSector: 1,
    maximumSimultaneousInstances: 1,
    recoveryRequiredSeconds: 4,
    compatibleMissionRoles: ['elite-checkpoint', 'boss-preparation', 'formation-remix', 'introduction'],
    compatibleSectorIds: sectorIds,
    mobilePerformanceCost: 14
  };
  const existingLightJetIndex = campaign.formationPacks.findIndex((pack) => pack?.id === lightJetPack.id);
  if (existingLightJetIndex >= 0) {
    campaign.formationPacks[existingLightJetIndex] = lightJetPack;
  } else {
    const heavyJetIndex = campaign.formationPacks.findIndex((pack) => pack?.id === 'pack-jet-pincer');
    campaign.formationPacks.splice(heavyJetIndex >= 0 ? heavyJetIndex : campaign.formationPacks.length, 0, lightJetPack);
  }
  campaign.enemyRoles.forEach((role) => {
    if (!lightJetPack.enemyRoleIds.includes(role.id)) return;
    const compatibleIds = Array.isArray(role.compatibleFormationPackIds)
      ? role.compatibleFormationPackIds
      : [];
    if (!compatibleIds.includes(lightJetPack.id)) compatibleIds.push(lightJetPack.id);
    role.compatibleFormationPackIds = compatibleIds;
  });

  const packsById = new Map(campaign.formationPacks.map((pack) => [pack.id, pack]));
  const declarationChanges = [];
  let groupedSpawnCount = 0;

  campaign.levels.forEach((level) => {
    (Array.isArray(level.waves) ? level.waves : []).forEach((wave) => {
      const previousIds = Array.isArray(wave.formationPackIds) ? wave.formationPackIds : [];
      const declaredPacks = previousIds.map((packId) => packsById.get(packId)).filter(Boolean);
      const requiredIds = [];

      (Array.isArray(wave.events) ? wave.events : []).forEach((event) => {
        if (event?.kind !== 'spawn' || !isGroupedCampaignFormationPattern(event.patternId)) return;
        groupedSpawnCount += 1;
        const resolved = resolveAuthoredFormationPack(event, campaign.formationPacks)
          ?? resolveAuthoredFormationPack(event, declaredPacks);
        if (!resolved) {
          const roleIds = uniqueRoleIdsForEvent(event);
          throw new Error(
            `No unambiguous formation pack for ${level.id}/${wave.id}/${event.id} `
            + `(${event.patternId}; roles: ${roleIds.join(', ') || 'none'}).`
          );
        }
        if (!requiredIds.includes(resolved.id)) requiredIds.push(resolved.id);
      });

      if (JSON.stringify(previousIds) !== JSON.stringify(requiredIds)) {
        declarationChanges.push({
          levelId: level.id,
          waveId: wave.id,
          from: [...previousIds],
          to: [...requiredIds]
        });
      }
      wave.formationPackIds = requiredIds;
    });
  });

  const minimumInterveningWavesByRole = new Map();
  campaign.levels.forEach((level) => {
    const previousWaveOrderByRole = new Map();
    [...(Array.isArray(level.waves) ? level.waves : [])]
      .sort((left, right) => Number(left.order) - Number(right.order))
      .forEach((wave) => {
        collectWaveRoleIds(wave).forEach((roleId) => {
          const previousOrder = previousWaveOrderByRole.get(roleId);
          if (previousOrder !== undefined) {
            const interveningWaves = Math.max(0, Number(wave.order) - previousOrder - 1);
            const priorMinimum = minimumInterveningWavesByRole.get(roleId);
            minimumInterveningWavesByRole.set(
              roleId,
              priorMinimum === undefined ? interveningWaves : Math.min(priorMinimum, interveningWaves)
            );
          }
          previousWaveOrderByRole.set(roleId, Number(wave.order));
        });
      });
  });

  const cooldownChanges = [];
  campaign.enemyRoles.forEach((role) => {
    const currentCooldown = Math.max(0, Math.floor(Number(role.reuseCooldownWaves) || 0));
    const authoredMinimum = minimumInterveningWavesByRole.get(role.id);
    const normalizedCooldown = authoredMinimum === undefined
      ? currentCooldown
      : Math.min(currentCooldown, authoredMinimum);
    if (normalizedCooldown !== currentCooldown) {
      cooldownChanges.push({
        roleId: role.id,
        from: currentCooldown,
        to: normalizedCooldown
      });
    }
    role.reuseCooldownWaves = normalizedCooldown;
  });

  return {
    groupedSpawnCount,
    declarationChanges,
    cooldownChanges
  };
};

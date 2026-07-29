const MINI_BOSS_BLUEPRINTS = Object.freeze({
  'bottleneck-drone': {
    label: 'Bottleneck Drone',
    visualIdentity: 'Articulated research-blocker drone with an exposed central core',
    combatRole: 'Mobile priority target and aimed-burst lane test',
    mainAttacks: ['Tracked Aimed Burst', 'Bounded Lateral Sweep'],
    threatCost: 18,
    usage: 'solo-or-paired',
    spriteKey: 'MINI_BOSS'
  },
  'paywall-wall': {
    label: 'Paywall Wall',
    visualIdentity: 'Segmented armored wall with visible firing lanes',
    combatRole: 'Lane-control checkpoint and boss-pattern foreshadow',
    mainAttacks: ['Telegraphed Wall Bolts', 'Bounded Lane Advance'],
    threatCost: 24,
    usage: 'solo',
    spriteKey: 'PAYWALL_BASTION_FRAMES'
  },
  'fracture-engine-elite': {
    label: 'Fracture Engine Elite',
    visualIdentity: 'Split reactor body with orbiting fracture plates and a bright vulnerable core',
    combatRole: 'Rotating safe-lane pressure with a readable exposed-core punish window',
    mainAttacks: ['Alternating Fracture Crossfire', 'Satellite Shear'],
    threatCost: 22,
    usage: 'solo',
    spriteKey: 'MINI_BOSS'
  },
  'aegis-brood-core': {
    label: 'Aegis Brood Core',
    visualIdentity: 'Shielded brood core encircled by individually animated guardians',
    combatRole: 'Guardian-priority encounter that preserves one announced passage',
    mainAttacks: ['Guardian Halo', 'Aegis Pulse'],
    threatCost: 24,
    usage: 'solo',
    spriteKey: 'CAMPAIGN_ENEMY_RING_SENTINEL'
  },
  'railspine-wallcrawler': {
    label: 'Railspine Wallcrawler',
    visualIdentity: 'Asymmetric armored crawler anchored to the arena edge',
    combatRole: 'Edge-rail lane denial with a stable opposite-side escape route',
    mainAttacks: ['Railspine Traverse', 'Wall-Burst Stitch'],
    threatCost: 25,
    usage: 'solo',
    spriteKey: 'CAMPAIGN_ENEMY_LASER_HUNTER'
  },
  'maw-carrier': {
    label: 'Maw Carrier',
    visualIdentity: 'Heavy carrier with an animated central maw and visible launch sockets',
    combatRole: 'Bounded reinforcement release followed by a staggered lane pair',
    mainAttacks: ['Maw Release', 'Hatchline Volley'],
    threatCost: 26,
    usage: 'solo',
    spriteKey: 'CAMPAIGN_ENEMY_BULLET_RING_EMITTER'
  },
  'twin-meridian-sentinels': {
    label: 'Twin Meridian Sentinels',
    visualIdentity: 'Mirrored sentinels that visibly exchange attacker and guardian roles',
    combatRole: 'Two-target relay duel with alternating vulnerability and firing authority',
    mainAttacks: ['Meridian Role Exchange', 'Sentinel Relay'],
    threatCost: 28,
    usage: 'paired',
    spriteKey: 'CAMPAIGN_ENEMY_RING_SENTINEL'
  },
  'prism-bloom': {
    label: 'Prism Bloom',
    visualIdentity: 'Faceted radial core that opens incomplete projectile petals',
    combatRole: 'Rotating gap-ring navigation with an announced direction reversal',
    mainAttacks: ['Prism Bloom Gap Ring', 'Petal Reversal'],
    threatCost: 28,
    usage: 'solo',
    spriteKey: 'CAMPAIGN_ENEMY_BULLET_RING_EMITTER'
  },
  'aegis-convoy-captain': {
    label: 'Aegis Convoy Captain',
    visualIdentity: 'Command vessel escorted by a transforming defensive formation',
    combatRole: 'Escort-priority convoy fight with a deterministic exit pocket',
    mainAttacks: ['Convoy Shield Transform', 'Captain Command Burst'],
    threatCost: 30,
    usage: 'solo',
    spriteKey: 'CAMPAIGN_ENEMY_LASER_HUNTER'
  },
  'gridline-sentries': {
    label: 'Gridline Sentries',
    visualIdentity: 'Paired orthogonal sentries that project luminous arena boundaries',
    combatRole: 'Quadrant-routing test that always preserves a full player-sized safe zone',
    mainAttacks: ['Safe-Quadrant Grid', 'Sentry Boundary Shift'],
    threatCost: 30,
    usage: 'paired',
    spriteKey: 'CAMPAIGN_ENEMY_RING_SENTINEL'
  }
});

export const CAMPAIGN_MINI_BOSS_SCHEDULE = Object.freeze({
  'sector-open-orbit': Object.freeze(['bottleneck-drone', 'paywall-wall']),
  'sector-redline': Object.freeze(['fracture-engine-elite', 'aegis-brood-core']),
  'sector-gravity': Object.freeze(['railspine-wallcrawler', 'maw-carrier']),
  'sector-terminus': Object.freeze(['twin-meridian-sentinels', 'prism-bloom']),
  'sector-prism-expanse': Object.freeze(['aegis-convoy-captain', 'gridline-sentries']),
  'sector-rail-meridian': Object.freeze(['fracture-engine-elite', 'railspine-wallcrawler']),
  'sector-singularity-reach': Object.freeze(['maw-carrier', 'prism-bloom']),
  'sector-gyroscope-array': Object.freeze(['aegis-brood-core', 'twin-meridian-sentinels']),
  'sector-hammerhead-line': Object.freeze(['gridline-sentries', 'aegis-convoy-captain']),
  'sector-crownclaw-frontier': Object.freeze(['fracture-engine-elite', 'prism-bloom'])
});

const getBossEvents = (level) => (
  (level?.waves ?? []).flatMap((wave) => wave.events ?? []).filter((event) => event.kind === 'boss')
);

const clone = (value) => JSON.parse(JSON.stringify(value));

const createCheckpointEvent = ({ campaign, level, placement, blueprint }) => {
  const sourceEvent = (campaign.levels ?? [])
    .flatMap((candidate) => getBossEvents(candidate))
    .find((event) => event.bossId === 'bottleneck-drone')
    ?? (campaign.levels ?? []).flatMap((candidate) => getBossEvents(candidate))[0];
  if (!sourceEvent) {
    throw new Error(`Cannot author ${placement.bossId}: no compatible checkpoint event template exists`);
  }
  const targetWave = level.waves?.[level.waves.length - 1];
  if (!targetWave) throw new Error(`${level.id} cannot host a mini-boss without a final Wave`);

  const event = clone(sourceEvent);
  event.id = `${targetWave.id}-checkpoint`;
  event.label = blueprint.label.toUpperCase();
  event.bossId = placement.bossId;
  event.count = 1;
  event.spriteKey = blueprint.spriteKey;
  event.positionId = 'center-top';
  event.movementPatternId = 'arena-roam';
  event.startSeconds = Math.min(8, Math.max(0, Number(targetWave.durationSeconds || 14) - 8));
  event.durationSeconds = 14;
  event.delayAfterSeconds = 1.5;
  event.blocksWaveClock = true;
  event.warningSeconds = 1.35;
  event.health = Math.min(340, Math.round(96 + (Number(placement.node.depth) * 4.8)));
  event.speed = Math.min(2.45, 1.8 + (Number(placement.node.depth) * 0.012));
  event.damage = 1;
  event.scoreReward = Math.round(1500 + (Number(placement.node.depth) * 180));
  event.powerupDropChance = 0.2;
  event.shieldCount = 0;
  delete event.spriteStyle;
  targetWave.events.push(event);
  return event;
};

const getScheduledPlacements = (campaign) => {
  const nodes = campaign?.campaignGraph?.nodes ?? [];
  const placements = [];
  for (const sector of campaign.sectors ?? []) {
    const schedule = CAMPAIGN_MINI_BOSS_SCHEDULE[sector.id];
    if (!schedule) throw new Error(`Missing mini-boss schedule for ${sector.id}`);
    const miniBossNodes = nodes
      .filter((node) => node.sectorId === sector.id && Array.isArray(node.miniBossIds) && node.miniBossIds.length > 0)
      .sort((left, right) => left.depth - right.depth);
    if (miniBossNodes.length !== schedule.length) {
      throw new Error(`${sector.id} must expose exactly ${schedule.length} mini-boss nodes; received ${miniBossNodes.length}`);
    }
    schedule.forEach((bossId, index) => placements.push({
      bossId,
      sectorId: sector.id,
      node: miniBossNodes[index]
    }));
  }
  return placements;
};

const buildCatalog = (placements) => Object.keys(MINI_BOSS_BLUEPRINTS).map((bossId) => {
  const blueprint = MINI_BOSS_BLUEPRINTS[bossId];
  const matching = placements.filter((placement) => placement.bossId === bossId);
  if (matching.length === 0) throw new Error(`Campaign mini-boss ${bossId} is not assigned`);
  const recommendedPower = Math.min(...matching.map((placement) => (
    Number(placement.node.recommendedPower?.expected) || 1
  )));
  return {
    id: `mini-boss-${bossId}`,
    bossId,
    label: blueprint.label,
    visualIdentity: blueprint.visualIdentity,
    combatRole: blueprint.combatRole,
    mainAttacks: [...blueprint.mainAttacks],
    suitableSectorIds: [...new Set(matching.map((placement) => placement.sectorId))],
    threatCost: blueprint.threatCost,
    recommendedPower,
    usage: blueprint.usage,
    campaignReady: true,
    validationStatus: 'validated'
  };
});

export const applyCampaignMiniBossAssignments = (campaign) => {
  if (!campaign || typeof campaign !== 'object') throw new Error('Campaign object is required');
  const levelById = new Map((campaign.levels ?? []).map((level) => [level.id, level]));
  const placements = getScheduledPlacements(campaign);

  for (const placement of placements) {
    const blueprint = MINI_BOSS_BLUEPRINTS[placement.bossId];
    if (!blueprint) throw new Error(`Unknown mini-boss blueprint: ${placement.bossId}`);
    placement.node.miniBossIds = [placement.bossId];
    const level = levelById.get(placement.node.missionDefinitionId);
    if (!level) throw new Error(`Missing mission ${placement.node.missionDefinitionId} for ${placement.node.nodeId}`);
    const bossEvents = getBossEvents(level);
    if (bossEvents.length > 1) {
      throw new Error(`${level.id} must contain at most one checkpoint event before assignment; received ${bossEvents.length}`);
    }
    const event = bossEvents[0] ?? createCheckpointEvent({ campaign, level, placement, blueprint });
    event.bossId = placement.bossId;
    event.label = blueprint.label.toUpperCase();
    event.count = 1;
    event.spriteKey = blueprint.spriteKey;
    if (placement.bossId !== 'paywall-wall' && placement.bossId !== 'bottleneck-drone') {
      event.movementPatternId = 'arena-roam';
    }
  }

  campaign.miniBosses = buildCatalog(placements);
  return campaign;
};

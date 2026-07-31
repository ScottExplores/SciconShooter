import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const campaignPath = path.join(repositoryRoot, 'game-config', 'campaign.json');
const migrationPath = path.join(repositoryRoot, 'game-config', 'campaign-migration-v24.json');
const sourceGitRefArgument = process.argv.find((argument) => argument.startsWith('--source-git-ref='));
const sourceGitRef = sourceGitRefArgument?.slice('--source-git-ref='.length);
const sourceCampaignJson = sourceGitRef
  ? execFileSync(
      'git',
      ['show', `${sourceGitRef}:game-config/campaign.json`],
      { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
    )
  : await readFile(campaignPath, 'utf8');
const campaign = JSON.parse(sourceCampaignJson);

if (campaign.revision !== 23) {
  throw new Error(
    'Campaign pacing v24 requires revision 23. Re-run against its source commit with '
    + '--source-git-ref=<revision-23-ref>.'
  );
}

const clone = (value) => JSON.parse(JSON.stringify(value));
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const roleById = new Map(campaign.enemyRoles.map((role) => [role.id, role]));
const packById = new Map(campaign.formationPacks.map((pack) => [pack.id, pack]));
const sectorOrderById = new Map(campaign.sectors.map((sector) => [sector.id, sector.order]));
const waveAliases = {};
const recordWaveAlias = (missionId, sourceWaveId, targetWaveId) => {
  waveAliases[missionId] ??= {};
  waveAliases[missionId][sourceWaveId] = targetWaveId;
};

const isFormationPattern = (patternId) => {
  const normalized = String(patternId || '').toLowerCase();
  return normalized.length > 0
    && !normalized.includes('single')
    && !normalized.includes('random');
};

const FORMATION_PALETTES = Object.freeze({
  4: ['sine', 'pincer', 'diamond', 'spiral', 'v'],
  5: ['spiral', 'v', 'grid', 'pincer', 'diamond'],
  6: ['row', 'diamond', 'sine', 'spiral', 'pincer'],
  7: ['pincer', 'spiral', 'v', 'grid', 'sine'],
  8: ['diamond', 'sine', 'pincer', 'row', 'spiral'],
  9: ['grid', 'v', 'spiral', 'diamond', 'pincer'],
  10: ['spiral', 'pincer', 'diamond', 'sine', 'v', 'grid']
});

const chooseVariedFormationShape = ({
  event,
  packId,
  level,
  waveIndex,
  spawnIndex
}) => {
  const sectorOrder = sectorOrderById.get(level.campaignProgression.sectorId) ?? 1;
  const palette = FORMATION_PALETTES[sectorOrder];
  if (!packId || !palette || !isFormationPattern(event.patternId)) return event.patternId;
  const sector = campaign.sectors.find(
    (candidate) => candidate.id === level.campaignProgression.sectorId
  );
  const mainMissionSlot = sector?.missionIds.indexOf(level.id) ?? -1;
  if (waveIndex === 1 && spawnIndex === 0 && mainMissionSlot >= 0 && mainMissionSlot < 4) {
    return palette[mainMissionSlot % palette.length];
  }
  let paletteIndex = (
    (level.order * 3)
    + (waveIndex * 5)
    + (spawnIndex * 2)
  ) % palette.length;
  if (palette[paletteIndex] === event.patternId) {
    paletteIndex = (paletteIndex + 1) % palette.length;
  }
  return palette[paletteIndex];
};

const eventRolesFitPack = (event, pack) => {
  const roleIds = [...new Set(
    (event.enemies ?? [])
      .map((enemy) => enemy.roleId)
      .filter(Boolean)
  )];
  return roleIds.length > 0 && roleIds.every((roleId) => pack.enemyRoleIds.includes(roleId));
};

const packAllowedForMission = (pack, level) => (
  pack.compatibleMissionRoles.includes(level.campaignProgression.missionRole)
  && pack.compatibleSectorIds.includes(level.campaignProgression.sectorId)
);

const resolveOriginalPackId = (event, wave) => {
  if (event.kind !== 'spawn' || !isFormationPattern(event.patternId)) return null;
  const candidates = wave.formationPackIds
    .map((packId) => packById.get(packId))
    .filter((pack) => pack && eventRolesFitPack(event, pack));
  if (candidates.length === 1) return candidates[0].id;
  const shapeMatches = candidates.filter((pack) => pack.formationShape === event.patternId);
  return shapeMatches.length === 1 ? shapeMatches[0].id : null;
};

const chooseArcadePack = (event, sourceWaves, level, waveIndex) => {
  const declared = [...new Set(sourceWaves.flatMap((wave) => wave.formationPackIds))]
    .map((packId) => packById.get(packId))
    .filter((pack) => pack && eventRolesFitPack(event, pack));
  const compatible = declared.length > 0
    ? declared
    : campaign.formationPacks.filter((pack) => (
        packAllowedForMission(pack, level) && eventRolesFitPack(event, pack)
      ));
  if (compatible.length === 0) return null;
  const eventRoleCount = new Set(event.enemies.map((enemy) => enemy.roleId).filter(Boolean)).size;
  return [...compatible].sort((left, right) => (
    Math.abs(left.enemyRoleIds.length - eventRoleCount)
    - Math.abs(right.enemyRoleIds.length - eventRoleCount)
    || left.totalThreatCost - right.totalThreatCost
    || left.id.localeCompare(right.id)
  ))[0];
};

const calculateWaveCombatBudget = (events, originalBudget, formationPackIds) => {
  const spawnBudget = events
    .filter((event) => event.kind === 'spawn')
    .reduce((total, event) => {
      const maximumThreatCost = Math.max(
        1,
        ...event.enemies.map((enemy) => roleById.get(enemy.roleId)?.threatCost ?? 1)
      );
      return total + event.count * maximumThreatCost;
    }, 0);
  const encounterBudget = events.reduce((total, event) => {
    if (event.kind === 'boss') return total + Math.max(6, Number(event.count) || 1) * 12;
    if (event.kind === 'asteroid-belt') return total + Math.max(1, Number(event.count) || 1);
    return total;
  }, 0);
  const formationPackBudget = formationPackIds.reduce(
    (total, packId) => total + (packById.get(packId)?.totalThreatCost ?? 0),
    0
  );
  return Math.max(originalBudget, formationPackBudget, Math.ceil(spawnBudget + encounterBudget));
};

const nonBossGroups = (waves) => {
  if (waves.length === 4) return waves.map((wave) => [wave]);
  if (waves.length === 5) return [[waves[0]], [waves[1]], [waves[2]], [waves[3], waves[4]]];
  if (waves.length === 6) return [[waves[0]], [waves[1]], [waves[2], waves[3]], [waves[4], waves[5]]];
  if (waves.length === 7) return [[waves[0]], [waves[1], waves[2]], [waves[3], waves[4]], [waves[5], waves[6]]];
  throw new Error(`Unsupported non-boss Wave count ${waves.length}.`);
};

const getSpawnStarts = ({
  sectorOrder,
  waveIndex,
  groupedSpawnCount,
  majorBossFinale
}) => {
  const authorsLateTripleFormationBurst = (
    !majorBossFinale
    && sectorOrder >= 7
    && waveIndex >= 2
    && groupedSpawnCount >= 3
  );
  if (authorsLateTripleFormationBurst) {
    // The first group is still entering at 1.9 seconds, so the third arrival
    // reads as an intentional layered swarm. Later traffic stays separated
    // enough to preserve silhouettes and mobile spawn admission headroom.
    return [0, 0.95, 1.9, 4.25, 6.3];
  }
  if (sectorOrder <= 2) return [0, 1.9, 4, 6, 7.8];
  if (sectorOrder <= 5) return [0, 1.7, 3.5, 5.3, 7];
  return [0, 1.5, 3.1, 4.7, 6.3];
};

const retimeWaveEvents = ({
  level,
  sourceWaves,
  waveIndex,
  durationSeconds,
  majorBossFinale = false
}) => {
  const transformed = [];
  const usedPackIds = new Set();
  const sectorOrder = sectorOrderById.get(level.campaignProgression.sectorId) ?? 1;
  const groupedSpawnCount = sourceWaves.reduce((count, wave) => (
    count + wave.events.filter((event) => (
      event.kind === 'spawn' && isFormationPattern(event.patternId)
    )).length
  ), 0);
  const spawnStarts = getSpawnStarts({
    sectorOrder,
    waveIndex,
    groupedSpawnCount,
    majorBossFinale
  });
  let spawnIndex = 0;

  for (const sourceWave of sourceWaves) {
    for (const sourceEvent of sourceWave.events) {
      const event = clone(sourceEvent);

      if (event.kind === 'spawn') {
        const originalPackId = resolveOriginalPackId(event, sourceWave);
        const shouldPromoteOpeningTraffic = waveIndex === 0
          && spawnIndex === 0
          && !isFormationPattern(event.patternId)
          && event.count >= 4;
        const promotedPack = shouldPromoteOpeningTraffic
          ? chooseArcadePack(event, sourceWaves, level, waveIndex)
          : null;
        const packId = originalPackId ?? promotedPack?.id ?? null;

        if (promotedPack) {
          event.patternId = promotedPack.formationShape;
          event.positionId = 'formation-top';
          event.count = Math.max(6, event.count);
          delete event.spawnAnchor;
          delete event.formationSlots;
        }
        if (packId) usedPackIds.add(packId);
        if (isFormationPattern(event.patternId)) {
          event.patternId = chooseVariedFormationShape({
            event,
            packId,
            level,
            waveIndex,
            spawnIndex
          });
          const minimumFormationCount = clamp(
            4 + Math.floor((sectorOrder - 1) / 3),
            4,
            6
          );
          event.count = Math.max(minimumFormationCount, event.count);
        }

        event.startSeconds = spawnStarts[Math.min(spawnIndex, spawnStarts.length - 1)]
          + Math.max(0, spawnIndex - spawnStarts.length + 1) * 1.3;
        const intervalMaximum = isFormationPattern(event.patternId)
          ? sectorOrder <= 2 ? 0.54 : sectorOrder <= 5 ? 0.48 : 0.44
          : sectorOrder <= 2 ? 0.78 : sectorOrder <= 5 ? 0.68 : 0.62;
        event.spawnIntervalSeconds = clamp(event.spawnIntervalSeconds * 0.68, 0.2, intervalMaximum);
        event.durationSeconds = Math.max(0.25, durationSeconds - event.startSeconds);
        const requiredSpawnWindow = Math.max(0, event.count - 1) * event.spawnIntervalSeconds + 0.1;
        if (requiredSpawnWindow > event.durationSeconds && event.count > 1) {
          event.spawnIntervalSeconds = Math.max(
            0.12,
            (event.durationSeconds - 0.1) / (event.count - 1)
          );
        }
        event.delayAfterSeconds = 0;
        event.blocksWaveClock = false;
        spawnIndex++;
      } else if (event.kind === 'powerup') {
        event.startSeconds = 0.9;
        event.durationSeconds = Math.min(4, durationSeconds - event.startSeconds);
        event.delayAfterSeconds = 0;
      } else if (event.kind === 'recovery') {
        event.startSeconds = Math.min(4.2, Math.max(2.5, durationSeconds * 0.38));
        event.durationSeconds = Math.min(3.5, durationSeconds - event.startSeconds);
        event.delayAfterSeconds = 0;
      } else if (event.kind === 'boss' || event.kind === 'asteroid-belt') {
        if (majorBossFinale) {
          event.startSeconds = 0;
          event.warningSeconds = Math.min(1.5, Math.max(1.2, Number(event.warningSeconds) || 1.2));
        } else {
          const finalScheduledSpawn = transformed
            .filter((candidate) => candidate.kind === 'spawn')
            .reduce((latest, candidate) => Math.max(
              latest,
              candidate.startSeconds
                + Math.max(0, candidate.count - 1) * candidate.spawnIntervalSeconds
            ), 0);
          event.startSeconds = Math.min(
            durationSeconds - 0.5,
            Math.max(4.6, finalScheduledSpawn + 1.1)
          );
          event.warningSeconds = Math.min(1.4, Math.max(0.9, Number(event.warningSeconds) || 0.9));
        }
        event.delayAfterSeconds = 0;
      }

      transformed.push(event);
    }
  }

  transformed.sort((left, right) => (
    left.startSeconds - right.startSeconds
    || Number(left.kind === 'boss') - Number(right.kind === 'boss')
  ));

  return {
    events: transformed,
    formationPackIds: [...usedPackIds]
  };
};

const buildNonBossWaves = (level, originalWaves) => {
  const groups = nonBossGroups(originalWaves);
  const durations = [9, 9.5, 10.5, 11.5];
  const names = ['INTERCEPT', 'FORMATION LOCK', 'PRESSURE RUN', 'CLIMAX'];
  const rhythms = ['warm-up', 'introduce', 'variation', originalWaves.at(-1).rhythm];

  return groups.map((sourceWaves, waveIndex) => {
    const durationSeconds = durations[waveIndex];
    const sourceWave = waveIndex === groups.length - 1 ? sourceWaves.at(-1) : sourceWaves[0];
    const { events, formationPackIds } = retimeWaveEvents({
      level,
      sourceWaves,
      waveIndex,
      durationSeconds
    });
    const originalBudget = sourceWaves.reduce((total, wave) => total + wave.combatBudget, 0);
    const wave = {
      ...clone(sourceWave),
      name: names[waveIndex],
      order: waveIndex + 1,
      rhythm: rhythms[waveIndex],
      durationSeconds,
      introSeconds: waveIndex === 0 ? 1 : 0.2,
      delayAfterSeconds: waveIndex === groups.length - 1 ? 1 : 0,
      threatCap: Math.max(...sourceWaves.map((candidate) => candidate.threatCap)),
      combatBudget: calculateWaveCombatBudget(events, originalBudget, formationPackIds),
      formationPackIds,
      events
    };
    sourceWaves.forEach((candidate) => {
      recordWaveAlias(level.id, candidate.id, wave.id);
    });
    return wave;
  });
};

const buildMajorBossWaves = (level, originalWaves) => {
  const runwayWaves = originalWaves.slice(0, -1);
  const bossSourceWave = originalWaves.at(-1);
  const runwayDurationSeconds = 12;
  const runwayResult = retimeWaveEvents({
    level,
    sourceWaves: runwayWaves,
    waveIndex: 0,
    durationSeconds: runwayDurationSeconds
  });
  const runwaySource = runwayWaves[0];
  const runwayWave = {
    ...clone(runwaySource),
    name: 'BOSS INTERCEPT',
    order: 1,
    rhythm: 'variation',
    completionRule: 'clear-after-duration',
    durationSeconds: runwayDurationSeconds,
    introSeconds: 1,
    delayAfterSeconds: 0,
    threatCap: Math.max(...runwayWaves.map((wave) => wave.threatCap)),
    combatBudget: calculateWaveCombatBudget(
      runwayResult.events,
      runwayWaves.reduce((total, wave) => total + wave.combatBudget, 0),
      runwayResult.formationPackIds
    ),
    formationPackIds: runwayResult.formationPackIds,
    events: runwayResult.events
  };
  runwayWaves.forEach((wave) => {
    recordWaveAlias(level.id, wave.id, runwayWave.id);
  });

  const bossResult = retimeWaveEvents({
    level,
    sourceWaves: [bossSourceWave],
    waveIndex: 1,
    durationSeconds: bossSourceWave.durationSeconds,
    majorBossFinale: true
  });
  const bossWave = {
    ...clone(bossSourceWave),
    name: bossSourceWave.name,
    order: 2,
    introSeconds: 0.2,
    formationPackIds: bossResult.formationPackIds,
    events: bossResult.events
  };
  recordWaveAlias(level.id, bossSourceWave.id, bossWave.id);
  return [runwayWave, bossWave];
};

for (const pack of campaign.formationPacks) {
  pack.maximumSimultaneousInstances = Math.max(3, pack.maximumSimultaneousInstances);
  pack.recoveryRequiredSeconds = Math.min(0.4, pack.recoveryRequiredSeconds);
}

for (const level of campaign.levels) {
  const originalWaves = clone(level.waves);
  const originalWaveCount = originalWaves.length;
  level.waves = level.campaignProgression.missionRole === 'major-boss'
    ? buildMajorBossWaves(level, originalWaves)
    : buildNonBossWaves(level, originalWaves);

  level.durationSeconds = level.waves.reduce((total, wave) => (
    total + wave.durationSeconds + wave.introSeconds + wave.delayAfterSeconds
  ), 0);
  level.campaignProgression.combatBudget = level.waves.reduce(
    (total, wave) => total + wave.combatBudget,
    0
  );

  const originalWaveClearCoins = level.campaignProgression.reward.waveClearCoins;
  level.campaignProgression.reward.waveClearCoins = Math.ceil(
    (originalWaveClearCoins * originalWaveCount) / level.waves.length
  );
  const performanceObjective = level.campaignProgression.masteryObjectives.find(
    (objective) => objective.kind === 'time-at-most'
  );
  if (performanceObjective) {
    performanceObjective.target = Math.ceil(level.durationSeconds * 1.1);
    performanceObjective.label = `Clear in ${performanceObjective.target} seconds or less`;
  }
}

const levelsById = new Map(campaign.levels.map((level) => [level.id, level]));
for (const node of campaign.campaignGraph.nodes) {
  const level = levelsById.get(node.missionDefinitionId);
  if (level) node.routeSummary.estimatedWaveCount = level.waves.length;
}

campaign.revision = 24;
campaign.updatedAt = '2026-07-31T02:20:00.000Z';

const migration = {
  id: 'campaign-revision-23-to-24',
  fromRevision: 23,
  toRevision: 24,
  generatedAt: campaign.updatedAt,
  preservedMissionIds: campaign.levels.map((level) => level.id),
  waveAliases,
  notes: [
    'Mission IDs, graph nodes, mastery records, boss event IDs, and Boss Archive unlocks are preserved.',
    'Regular Missions now use four continuous tactical Waves; major-boss Missions use one intercept Wave and the boss.',
    'Dedicated recovery Waves were folded into active combat so pickups arrive without pausing the action.',
    'Formation packs allow three concurrent groups with a short recovery while mobile threat and shooter caps remain authoritative.',
    'Sector 7-10 pressure and climax Waves with enough grouped traffic now stagger three formations across the first 1.9 seconds; earlier sectors retain wider two-group teaching windows.',
    'Later sectors rotate formation silhouettes and entry choreography instead of repeating the same five-Mission script.',
    'Every grouped entry contains at least four to six enemies, scaling by sector, with overlapping arrival windows.'
  ]
};

await writeFile(campaignPath, `${JSON.stringify(campaign, null, 2)}\n`);
await writeFile(migrationPath, `${JSON.stringify(migration, null, 2)}\n`);

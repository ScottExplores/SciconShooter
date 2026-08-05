import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CAMPAIGN_REVISION = 24;
const CAMPAIGN_UPDATED_AT = '2026-08-02T12:00:00.000Z';

const PACK_CHOREOGRAPHY = Object.freeze({
  'pack-orbit-v': {
    movementBehavior: 'gentle-drift', attackBehavior: 'paired-dive', firingBehavior: 'post-formation', returnBehavior: 'reform',
    holdSeconds: 1.8, telegraphSeconds: 0.7, attackDurationSeconds: 1.3, attackRecoverySeconds: 1.15, attackGroupSize: 2, attackCycles: 3
  },
  'pack-orbit-grid': {
    movementBehavior: 'lateral-sweep', attackBehavior: 'row-sequence', firingBehavior: 'staggered', returnBehavior: 'reform',
    holdSeconds: 1.6, telegraphSeconds: 0.75, attackDurationSeconds: 1.5, attackRecoverySeconds: 1.3, attackGroupSize: 3, attackCycles: 3
  },
  'pack-citation-spiral': {
    movementBehavior: 'rotating-wheel', attackBehavior: 'alternating-wings', firingBehavior: 'staggered', returnBehavior: 'transform',
    holdSeconds: 1.45, telegraphSeconds: 0.7, attackDurationSeconds: 1.35, attackRecoverySeconds: 1.15, attackGroupSize: 3, attackCycles: 3
  },
  'pack-light-jet-pincer': {
    movementBehavior: 'lateral-sweep', attackBehavior: 'pincer-pass', firingBehavior: 'priority', returnBehavior: 'reform',
    holdSeconds: 1.35, telegraphSeconds: 0.75, attackDurationSeconds: 1.45, attackRecoverySeconds: 1.25, attackGroupSize: 2, attackCycles: 3
  },
  'pack-jet-pincer': {
    movementBehavior: 'lateral-sweep', attackBehavior: 'pincer-pass', firingBehavior: 'priority', returnBehavior: 'reform',
    holdSeconds: 1.25, telegraphSeconds: 0.7, attackDurationSeconds: 1.55, attackRecoverySeconds: 1.2, attackGroupSize: 3, attackCycles: 3
  },
  'pack-priority-diamond': {
    movementBehavior: 'expand-collapse', attackBehavior: 'leader-escorts', firingBehavior: 'priority', returnBehavior: 'reform',
    holdSeconds: 1.6, telegraphSeconds: 0.85, attackDurationSeconds: 1.45, attackRecoverySeconds: 1.4, attackGroupSize: 3, attackCycles: 3
  },
  'pack-dna-helix': {
    movementBehavior: 'snake-weave', attackBehavior: 'alternating-wings', firingBehavior: 'priority', returnBehavior: 'transform',
    holdSeconds: 1.45, telegraphSeconds: 0.8, attackDurationSeconds: 1.65, attackRecoverySeconds: 1.35, attackGroupSize: 3, attackCycles: 3
  },
  'pack-wall-crossfire': {
    movementBehavior: 'lane-shift', attackBehavior: 'aimed-volley', firingBehavior: 'staggered', returnBehavior: 'retreat',
    holdSeconds: 1.8, telegraphSeconds: 0.9, attackDurationSeconds: 1.8, attackRecoverySeconds: 1.6, attackGroupSize: 2, attackCycles: 2
  },
  'pack-dark-lanes': {
    movementBehavior: 'lane-shift', attackBehavior: 'lane-pass', firingBehavior: 'priority', returnBehavior: 'reform',
    holdSeconds: 1.65, telegraphSeconds: 0.9, attackDurationSeconds: 1.75, attackRecoverySeconds: 1.5, attackGroupSize: 3, attackCycles: 3
  },
  'pack-prism-ring': {
    movementBehavior: 'rotating-wheel', attackBehavior: 'ring-collapse', firingBehavior: 'priority', returnBehavior: 'transform',
    holdSeconds: 1.55, telegraphSeconds: 0.95, attackDurationSeconds: 1.85, attackRecoverySeconds: 1.6, attackGroupSize: 3, attackCycles: 3
  },
  'pack-heavy-grid': {
    movementBehavior: 'gentle-drift', attackBehavior: 'row-sequence', firingBehavior: 'staggered', returnBehavior: 'reform',
    holdSeconds: 1.8, telegraphSeconds: 1, attackDurationSeconds: 1.9, attackRecoverySeconds: 1.7, attackGroupSize: 4, attackCycles: 3
  }
});

const EVENT_CHOREOGRAPHY = Object.freeze({
  'stage-citation-storm-wave-2-primary': {
    levelId: 'stage-citation-storm', waveId: 'stage-citation-storm-wave-2', patternId: 'spiral', count: 8,
    roleIds: ['role-citation-swarm', 'role-research-drone'],
    formationBehavior: {
      entryPathId: 'spiral-entry', movementId: 'rotating-wheel', attackId: 'ring-collapse', firingBehavior: 'staggered',
      returnId: 'transform', holdSeconds: 1.5, telegraphSeconds: 0.75, attackDurationSeconds: 1.4,
      recoverySeconds: 1.2, attackGroupSize: 3, attackCycles: 3
    }
  },
  'stage-citation-storm-wave-6-primary': {
    levelId: 'stage-citation-storm', waveId: 'stage-citation-storm-wave-6', patternId: 'grid', count: 5,
    roleIds: ['role-research-drone'],
    formationBehavior: {
      entryPathId: 'formation-drop', movementId: 'lateral-sweep', attackId: 'row-sequence', firingBehavior: 'staggered',
      returnId: 'reform', holdSeconds: 1.5, telegraphSeconds: 0.75, attackDurationSeconds: 1.4,
      recoverySeconds: 1.2, attackGroupSize: 3, attackCycles: 3
    }
  },
  'stage-paywall-siege-wave-2-primary': {
    levelId: 'stage-paywall-siege', waveId: 'stage-paywall-siege-wave-2', patternId: 'pincer', count: 8,
    roleIds: ['role-jet-interceptor', 'role-jet-scout', 'role-research-drone'],
    formationBehavior: {
      entryPathId: 'paired-flank', movementId: 'lateral-sweep', attackId: 'pincer-pass', firingBehavior: 'priority',
      returnId: 'reform', holdSeconds: 1.5, telegraphSeconds: 0.75, attackDurationSeconds: 1.4,
      recoverySeconds: 1.2, attackGroupSize: 2, attackCycles: 3
    }
  },
  'stage-open-galaxy-wave-2-primary': {
    levelId: 'stage-open-galaxy', waveId: 'stage-open-galaxy-wave-2', patternId: 'diamond', count: 8,
    roleIds: ['role-jet-interceptor', 'role-protocol-vanguard'],
    formationBehavior: {
      entryPathId: 'diamond-lock', movementId: 'expand-collapse', attackId: 'leader-escorts', firingBehavior: 'priority',
      returnId: 'reform', holdSeconds: 1.7, telegraphSeconds: 0.9, attackDurationSeconds: 1.4,
      recoverySeconds: 1.2, attackGroupSize: 3, attackCycles: 3
    }
  },
  'stage-open-orbit-route-b-wave-2-event-1': {
    levelId: 'stage-open-orbit-route-b', waveId: 'stage-open-orbit-route-b-wave-2', patternId: 'spiral', count: 8,
    roleIds: ['role-citation-swarm', 'role-research-drone'],
    formationBehavior: {
      entryPathId: 'spiral-entry', movementId: 'rotating-wheel', attackId: 'ring-collapse', firingBehavior: 'staggered',
      returnId: 'transform', holdSeconds: 1.5, telegraphSeconds: 0.75, attackDurationSeconds: 1.4,
      recoverySeconds: 1.2, attackGroupSize: 3, attackCycles: 3
    }
  },
  'stage-open-orbit-route-b-wave-6-event-1': {
    levelId: 'stage-open-orbit-route-b', waveId: 'stage-open-orbit-route-b-wave-6', patternId: 'grid', count: 5,
    roleIds: ['role-research-drone'],
    formationBehavior: {
      entryPathId: 'formation-drop', movementId: 'lateral-sweep', attackId: 'row-sequence', firingBehavior: 'staggered',
      returnId: 'reform', holdSeconds: 1.5, telegraphSeconds: 0.75, attackDurationSeconds: 1.4,
      recoverySeconds: 1.2, attackGroupSize: 3, attackCycles: 3
    }
  }
});

const clone = (value) => structuredClone(value);

const findRequired = (items, id, label) => {
  const match = items.find((item) => item.id === id);
  if (!match) throw new Error(`Missing ${label}: ${id}`);
  return match;
};

const assignObject = (target, source) => {
  let changed = false;
  Object.entries(source).forEach(([key, value]) => {
    if (JSON.stringify(target[key]) === JSON.stringify(value)) return;
    target[key] = clone(value);
    changed = true;
  });
  return changed;
};

const sortedRoleIds = (event) => event.enemies.map((enemy) => enemy.roleId).sort();

export const authorCampaignFormationChoreography = (campaign) => {
  if (!campaign || !Array.isArray(campaign.levels) || !Array.isArray(campaign.formationPacks)) {
    throw new Error('Campaign choreography authoring requires levels and formation packs.');
  }

  const initial = JSON.stringify(campaign);
  let packsUpdated = 0;
  let spawnEventsUpdated = 0;

  Object.entries(PACK_CHOREOGRAPHY).forEach(([packId, choreography]) => {
    const pack = findRequired(campaign.formationPacks, packId, 'formation pack');
    if (assignObject(pack, choreography)) packsUpdated += 1;
  });

  Object.entries(EVENT_CHOREOGRAPHY).forEach(([eventId, authored]) => {
    const level = findRequired(campaign.levels, authored.levelId, 'Mission');
    const wave = findRequired(level.waves, authored.waveId, 'Wave');
    const event = findRequired(wave.events, eventId, 'spawn event');
    if (event.kind !== 'spawn') throw new Error(`Expected spawn event: ${eventId}`);
    const actualSignature = JSON.stringify({
      patternId: event.patternId,
      count: event.count,
      roleIds: sortedRoleIds(event)
    });
    const expectedSignature = JSON.stringify({
      patternId: authored.patternId,
      count: authored.count,
      roleIds: [...authored.roleIds].sort()
    });
    if (actualSignature !== expectedSignature) {
      throw new Error(`Refusing to author changed spawn event: ${eventId}`);
    }
    if (assignObject(event, { formationBehavior: authored.formationBehavior })) spawnEventsUpdated += 1;
  });

  const changed = JSON.stringify(campaign) !== initial;
  if (changed) {
    campaign.revision = Math.max(Number(campaign.revision) || 0, CAMPAIGN_REVISION);
    campaign.updatedAt = CAMPAIGN_UPDATED_AT;
  }

  return { changed: JSON.stringify(campaign) !== initial, packsUpdated, spawnEventsUpdated };
};

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const campaignPath = path.join(repositoryRoot, 'game-config', 'campaign.json');
  const campaign = JSON.parse(await readFile(campaignPath, 'utf8'));
  const summary = authorCampaignFormationChoreography(campaign);
  if (summary.changed) await writeFile(campaignPath, `${JSON.stringify(campaign, null, 2)}\n`, 'utf8');
  console.log(
    `Campaign choreography v${CAMPAIGN_REVISION}: ${summary.packsUpdated} packs and `
    + `${summary.spawnEventsUpdated} spawn events updated. `
    + (summary.changed ? 'campaign.json written.' : 'No changes required.')
  );
}

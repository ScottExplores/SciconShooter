const isRecord = (value) => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const LEGACY_RESEARCH_FRONTIER_WAVE_IDS = Object.freeze([
  'open-orbit',
  'citation-storm',
  'paywall-siege',
  'open-galaxy',
  'bastion-protocol'
]);

const STAGE_BLUEPRINTS = Object.freeze([
  Object.freeze({
    id: 'operation-open-galaxy',
    description: 'Break through Open Orbit, its paywall checkpoint, and Gatekeeper Prime.',
    waves: Object.freeze([
      Object.freeze({ id: 'open-orbit', name: 'ORBITAL APPROACH', durationSeconds: 20, eventIds: Object.freeze([
        'open-orbit-opening-drifters', 'open-orbit-phase-1', 'open-orbit-powerups',
        'open-orbit-drifters-before-mini', 'open-orbit-mini-boss'
      ]) }),
      Object.freeze({ id: 'open-orbit-checkpoint', name: 'PAYWALL CHECKPOINT', durationSeconds: 18, eventIds: Object.freeze([
        'open-orbit-drifters-after-mini', 'open-orbit-phase-2',
        'open-orbit-drifters-before-checkpoint', 'open-orbit-paywall-wall'
      ]) }),
      Object.freeze({ id: 'open-orbit-final', name: 'GATEKEEPER PRIME', durationSeconds: 20, completionRule: 'boss-defeat', delayAfterSeconds: 5, eventIds: Object.freeze([
        'open-orbit-drifters-after-checkpoint', 'open-orbit-phase-3',
        'open-orbit-drifters-before-gatekeeper', 'open-orbit-gatekeeper'
      ]) })
    ])
  }),
  Object.freeze({
    id: 'stage-citation-storm',
    description: 'Survive citation hunters and escape a massive dark-asteroid maelstrom.',
    waves: Object.freeze([
      Object.freeze({
        id: 'citation-storm',
        name: 'HUNTER CELL',
        durationSeconds: 20,
        eventIds: Object.freeze([
          'citation-storm-opening-drifters', 'citation-storm-phase-1', 'citation-storm-powerups',
          'citation-storm-drifters-before-mini', 'citation-storm-elite-hunter-cell'
        ]),
        eventOverrides: Object.freeze({
          'citation-storm-elite-hunter-cell': Object.freeze({ startSeconds: 19.6, durationSeconds: 0.4 })
        })
      }),
      Object.freeze({ id: 'citation-storm-pressure', name: 'CITATION PRESSURE', durationSeconds: 15, eventIds: Object.freeze([
        'citation-storm-drifters-after-mini', 'citation-storm-phase-2',
        'citation-storm-drifters-before-checkpoint'
      ]) }),
      Object.freeze({
        id: 'citation-storm-maelstrom',
        name: 'DARK ASTEROID STORM',
        durationSeconds: 21,
        delayAfterSeconds: 1.5,
        eventIds: Object.freeze([
          'citation-storm-drifters-after-checkpoint', 'citation-storm-phase-3',
          'citation-storm-elite-reviewers', 'citation-storm-drifters-before-gatekeeper',
          'citation-storm-asteroid-belt'
        ]),
        eventOverrides: Object.freeze({
          'citation-storm-asteroid-belt': Object.freeze({ startSeconds: 21 })
        })
      })
    ])
  }),
  Object.freeze({
    id: 'stage-paywall-siege',
    description: 'Breach the Paywall Siege and destroy the reinforced Paywall Core.',
    waves: Object.freeze([
      Object.freeze({ id: 'paywall-siege', name: 'TWIN BOTTLENECK', durationSeconds: 20, eventIds: Object.freeze([
        'paywall-siege-opening-drifters', 'paywall-siege-phase-1', 'paywall-siege-powerups',
        'paywall-siege-drifters-before-mini', 'paywall-siege-mini-boss'
      ]) }),
      Object.freeze({ id: 'paywall-siege-checkpoint', name: 'SIEGE CHECKPOINT', durationSeconds: 18, eventIds: Object.freeze([
        'paywall-siege-drifters-after-mini', 'paywall-siege-phase-2',
        'paywall-siege-drifters-before-checkpoint', 'paywall-siege-paywall-wall'
      ]) }),
      Object.freeze({ id: 'paywall-siege-core', name: 'PAYWALL CORE', durationSeconds: 20, completionRule: 'boss-defeat', delayAfterSeconds: 5, eventIds: Object.freeze([
        'paywall-siege-drifters-after-checkpoint', 'paywall-siege-phase-3',
        'paywall-siege-drifters-before-gatekeeper', 'paywall-siege-gatekeeper'
      ]) })
    ])
  }),
  Object.freeze({
    id: 'stage-open-galaxy',
    description: 'Cross the Open Galaxy and outlast its full frontier assault.',
    waves: Object.freeze([
      Object.freeze({
        id: 'open-galaxy',
        name: 'DATA HUNTERS',
        durationSeconds: 20,
        eventIds: Object.freeze([
          'open-galaxy-opening-drifters', 'open-galaxy-phase-1', 'open-galaxy-powerups',
          'open-galaxy-drifters-before-mini', 'open-galaxy-elite-data-hunters'
        ]),
        eventOverrides: Object.freeze({
          'open-galaxy-elite-data-hunters': Object.freeze({ startSeconds: 19.6, durationSeconds: 0.4 })
        })
      }),
      Object.freeze({ id: 'open-galaxy-ambush', name: 'RIVER AMBUSH', durationSeconds: 18, eventIds: Object.freeze([
        'open-galaxy-drifters-after-mini', 'open-galaxy-phase-2',
        'open-galaxy-drifters-before-checkpoint', 'open-galaxy-river-ambush'
      ]) }),
      Object.freeze({
        id: 'open-galaxy-onslaught',
        name: 'FRONTIER ONSLAUGHT',
        durationSeconds: 21.1,
        delayAfterSeconds: 1.5,
        eventIds: Object.freeze([
          'open-galaxy-drifters-after-checkpoint', 'open-galaxy-phase-3',
          'open-galaxy-drifters-before-gatekeeper', 'open-galaxy-elite-frontier-pack'
        ]),
        eventOverrides: Object.freeze({
          'open-galaxy-elite-frontier-pack': Object.freeze({
            startSeconds: 21.1,
            durationSeconds: 0.5,
            blocksWaveClock: true
          })
        })
      })
    ])
  }),
  Object.freeze({
    id: 'stage-bastion-protocol',
    description: 'Break five escalating bastion lines and defeat the Frontier Crownclaw.',
    waves: Object.freeze([
      Object.freeze({ id: 'bastion-protocol', name: 'BASTION VANGUARD', durationSeconds: 0.6, eventIds: Object.freeze([
        'bastion-protocol-powerups', 'bastion-protocol-line-1'
      ]) }),
      Object.freeze({ id: 'bastion-protocol-phalanx', name: 'BASTION PHALANX', durationSeconds: 0.4, eventIds: Object.freeze(['bastion-protocol-line-2']) }),
      Object.freeze({ id: 'bastion-protocol-lockdown', name: 'BASTION LOCKDOWN', durationSeconds: 0.4, eventIds: Object.freeze(['bastion-protocol-line-3']) }),
      Object.freeze({ id: 'bastion-protocol-core', name: 'BASTION CORE', durationSeconds: 0.4, eventIds: Object.freeze(['bastion-protocol-line-4']) }),
      Object.freeze({ id: 'bastion-protocol-crownclaw', name: 'FRONTIER CROWNCLAW', durationSeconds: 0.4, completionRule: 'boss-defeat', delayAfterSeconds: 5, eventIds: Object.freeze(['bastion-protocol-gatekeeper']) })
    ])
  })
]);

const roundSeconds = (value) => Math.round(Math.max(0, Number(value) || 0) * 1000) / 1000;

const isLegacyResearchFrontier = (levels) => (
  levels.length === 1
  && isRecord(levels[0])
  && levels[0].id === 'operation-open-galaxy'
  && Array.isArray(levels[0].waves)
  && levels[0].waves.length === LEGACY_RESEARCH_FRONTIER_WAVE_IDS.length
  && LEGACY_RESEARCH_FRONTIER_WAVE_IDS.every((id, index) => {
    const wave = levels[0].waves[index];
    const blueprint = STAGE_BLUEPRINTS[index];
    if (!isRecord(wave) || wave.id !== id || !Array.isArray(wave.events)) return false;
    const expectedEventIds = blueprint.waves.flatMap((internalWave) => internalWave.eventIds);
    const actualEventIds = wave.events.map((event) => event?.id);
    return actualEventIds.length === expectedEventIds.length
      && expectedEventIds.every((eventId) => actualEventIds.includes(eventId));
  })
);

const buildInternalWave = (sourceWave, blueprint, waveIndex) => {
  const sourceEvents = new Map(sourceWave.events.map((event) => [event.id, event]));
  const selectedEvents = blueprint.eventIds.map((eventId) => sourceEvents.get(eventId)).filter(Boolean);
  const baseline = selectedEvents.length > 0
    ? Math.min(...selectedEvents.map((event) => Number(event.startSeconds) || 0))
    : 0;
  const overrides = blueprint.eventOverrides ?? {};
  const events = selectedEvents.map((event) => {
    const override = overrides[event.id] ?? {};
    const startSeconds = hasOwn(override, 'startSeconds')
      ? roundSeconds(override.startSeconds)
      : roundSeconds((Number(event.startSeconds) || 0) - baseline);
    const migrated = { ...event, ...override, startSeconds };
    if (!migrated.blocksWaveClock) {
      migrated.durationSeconds = roundSeconds(Math.min(
        Number(migrated.durationSeconds) || 0,
        Math.max(0, blueprint.durationSeconds - startSeconds)
      ));
    }
    return migrated;
  }).sort((left, right) => left.startSeconds - right.startSeconds);

  return {
    id: blueprint.id,
    name: blueprint.name,
    order: waveIndex + 1,
    accent: sourceWave.accent,
    backgroundId: sourceWave.backgroundId,
    completionRule: blueprint.completionRule ?? 'clear-after-duration',
    difficultyMultiplier: 1,
    durationSeconds: blueprint.durationSeconds,
    introSeconds: waveIndex === 0 ? sourceWave.introSeconds : 0,
    delayAfterSeconds: blueprint.delayAfterSeconds ?? 0,
    scoreMultiplier: sourceWave.scoreMultiplier,
    threatCap: sourceWave.threatCap,
    events
  };
};

/**
 * Converts the original single Research Frontier level, whose five "waves"
 * were actually complete stages, into five stages with tactical internal
 * waves. The exact legacy fingerprint prevents unrelated custom campaigns
 * from being rewritten.
 *
 * @template T
 * @param {T} value
 * @returns {T}
 */
export const migrateLegacyStageWaveHierarchy = (value) => {
  if (!isRecord(value) || !Array.isArray(value.levels) || !isLegacyResearchFrontier(value.levels)) return value;
  const sourceLevel = value.levels[0];
  const sourceWaves = sourceLevel.waves;
  const levels = STAGE_BLUEPRINTS.map((stage, stageIndex) => {
    const sourceWave = sourceWaves[stageIndex];
    return {
      ...sourceLevel,
      id: stage.id,
      name: sourceWave.name,
      description: stage.description,
      order: stageIndex + 1,
      backgroundId: sourceWave.backgroundId,
      startingDifficulty: sourceLevel.startingDifficulty * sourceWave.difficultyMultiplier,
      loopWaves: false,
      waves: stage.waves.map((wave, waveIndex) => buildInternalWave(sourceWave, wave, waveIndex))
    };
  });
  return /** @type {T} */ ({ ...value, levels });
};

/**
 * Adds the completion rule omitted by schema-v1 waves authored before the
 * field existed. Explicit values, including invalid ones, are never replaced
 * so current authoring still passes through strict validation unchanged.
 *
 * @template T
 * @param {T} value
 * @returns {T}
 */
export const migrateLegacyWaveCompletionRule = (value) => {
  if (!isRecord(value) || hasOwn(value, 'completionRule')) return value;
  const hasGatekeeper = Array.isArray(value.events) && value.events.some((event) => (
    isRecord(event) && event.kind === 'boss' && event.bossId === 'gatekeeper'
  ));
  return /** @type {T} */ ({
    ...value,
    completionRule: hasGatekeeper ? 'boss-defeat' : 'clear-after-duration'
  });
};

/**
 * Read-time compatibility for immutable schema-v1 campaigns and browser
 * drafts. The returned object shares untouched branches and never mutates the
 * stored payload.
 *
 * @template T
 * @param {T} value
 * @returns {T}
 */
export const migrateLegacyGameCampaign = (value) => {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.levels)) return value;

  const hierarchyMigrated = migrateLegacyStageWaveHierarchy(value);
  const hierarchyValue = isRecord(hierarchyMigrated) && Array.isArray(hierarchyMigrated.levels)
    ? hierarchyMigrated
    : value;

  let campaignChanged = false;
  const levels = hierarchyValue.levels.map((level) => {
    if (!isRecord(level) || !Array.isArray(level.waves)) return level;
    let levelChanged = false;
    const waves = level.waves.map((wave) => {
      const migrated = migrateLegacyWaveCompletionRule(wave);
      if (migrated !== wave) levelChanged = true;
      return migrated;
    });
    if (!levelChanged) return level;
    campaignChanged = true;
    return { ...level, waves };
  });

  if (hierarchyValue !== value) campaignChanged = true;
  return campaignChanged ? /** @type {T} */ ({ ...hierarchyValue, levels }) : value;
};

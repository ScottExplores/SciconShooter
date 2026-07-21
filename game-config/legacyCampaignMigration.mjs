const isRecord = (value) => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

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

  let campaignChanged = false;
  const levels = value.levels.map((level) => {
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

  return campaignChanged ? /** @type {T} */ ({ ...value, levels }) : value;
};

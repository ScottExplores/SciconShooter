// Shared browser/server authority. Campaign registrations are the extension point;
// adding a boss to a sector, miniBosses, graph or authored wave needs no weekly list.
const createWeeklyBossRotation = () => {
  const ids = (values) => [...new Set(values.filter((id) => typeof id === 'string' && id.trim()))];
  const getCampaignWeeklyBossPool = (campaign = {}) => {
    const authored = (campaign.levels || []).flatMap((level) => (level.waves || [])
      .flatMap((wave) => (wave.events || []).filter((event) => event.kind === 'boss').map((event) => event.bossId)));
    const playable = new Set(ids(authored));
    const eliteBossIds = ids([...(campaign.miniBosses || [])]
      .sort((a, b) => a.recommendedPower - b.recommendedPower || a.threatCost - b.threatCost || a.bossId.localeCompare(b.bossId))
      .map((entry) => entry.bossId));
    const majors = [...(campaign.sectors || [])]
      .sort((a, b) => a.order - b.order || a.majorBossId.localeCompare(b.majorBossId))
      .map((sector) => sector.majorBossId);
    const nodes = campaign.campaignGraph?.nodes || [];
    const extraElites = ids(nodes.flatMap((node) => node.miniBossIds || [])).sort();
    eliteBossIds.push(...extraElites.filter((id) => !eliteBossIds.includes(id)));
    const majorBossIds = ids([...majors, ...ids([...nodes.map((node) => node.bossId), ...authored]).sort()])
      .filter((id) => !eliteBossIds.includes(id));
    // A registration becomes playable when its authored encounter is included.
    // Incomplete content imports must not break a whole week's route.
    return { eliteBossIds: eliteBossIds.filter((id) => playable.has(id)), majorBossIds: majorBossIds.filter((id) => playable.has(id)) };
  };

  // Persisted competition keys are Sundays at noon PT. Map that opening to
  // the following ISO Monday, keeping a route stable through the entire contest.
  const getWeeklyRotationOrdinal = (weekKey) => {
    let monday;
    const iso = /^(\d{4})-W(\d{2})$/.exec(String(weekKey));
    if (iso) {
      const jan4 = new Date(Date.UTC(Number(iso[1]), 0, 4));
      monday = jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86400000 + (Number(iso[2]) - 1) * 604800000;
    } else {
      const date = new Date(`${weekKey}T12:00:00Z`);
      if (!Number.isFinite(date.getTime())) throw new Error('Invalid weekly rotation key');
      const day = date.getUTCDay();
      monday = date.getTime() + (day === 0 ? 1 : 1 - day) * 86400000;
    }
    return Math.floor(monday / 604800000);
  };

  const selectWeeklyBossRotation = (weekKey, { eliteBossIds = [], majorBossIds = [] } = {}) => {
    const elites = ids(eliteBossIds);
    const majors = ids(majorBossIds).filter((id) => !elites.includes(id));
    const ordinal = getWeeklyRotationOrdinal(weekKey);
    const pick = (pool, count, offset) => Array.from({ length: Math.min(count, pool.length) }, (_, i) =>
      pool[((offset + i) % pool.length + pool.length) % pool.length]);
    // Two elites and one major maintain the existing stage cadence. Small
    // catalogs borrow the remaining slots from whichever class has capacity.
    const selectedElites = pick(elites, majors.length ? 2 : 3, ordinal * 2);
    const selectedMajors = pick(majors, 3 - selectedElites.length, ordinal);
    if (selectedElites.length + selectedMajors.length < 3) {
      for (const id of pick(elites, 3, ordinal * 2)) {
        if (!selectedElites.includes(id)) selectedElites.push(id);
        if (selectedElites.length + selectedMajors.length === 3) break;
      }
    }
    return {
      eliteBossIds: elites.filter((id) => selectedElites.includes(id)),
      majorBossIds: majors.filter((id) => selectedMajors.includes(id))
    };
  };
  return { getCampaignWeeklyBossPool, getWeeklyRotationOrdinal, selectWeeklyBossRotation };
};
const weeklyBossRotation = createWeeklyBossRotation();
if (typeof module !== 'undefined' && module.exports) module.exports = weeklyBossRotation;
globalThis.__SCICON_WEEKLY_BOSS_ROTATION__ = weeklyBossRotation;

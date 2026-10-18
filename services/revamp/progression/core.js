/* Shared UMD module: browser side effect + Node CommonJS, matching shared/*.js. */
(() => {
/**
 * REVAMP(D): Pure progression rules shared by the browser and wallet API.
 * Science Credits are passed in/out; this module never touches RSC, storage,
 * networking, or competitive Weekly Run configuration.
 *
 * @typedef {import('./types').RevampProgress} RevampProgress
 * @typedef {import('./types').RevampBranch} RevampBranch
 * @typedef {import('./types').RevampMedal} RevampMedal
 * @typedef {import('./types').RevampEventKind} RevampEventKind
 * @typedef {import('./types').RevampEventReceipt} RevampEventReceipt
 * @typedef {import('./types').RevampGoal} RevampGoal
 * @typedef {import('./types').RevampUnlock} RevampUnlock
 */

const REVAMP_PROGRESS_VERSION = 1;
/** @type {readonly RevampBranch[]} */
const REVAMP_BRANCHES = Object.freeze(['firepower', 'survival', 'support', 'fortune', 'overdrive']);
/** @type {readonly RevampEventKind[]} */
const REVAMP_EVENT_KINDS = Object.freeze(['kills', 'noHitClears', 'bossParts', 'powerups', 'clears']);
/** @type {readonly RevampMedal[]} */
const REVAMP_MEDALS = Object.freeze(['clear', 'kills', 'noHit']);
const REVAMP_CREDIT_COSTS = Object.freeze([40, 100, 210, 420, 750]);
const REVAMP_RESEARCH_COSTS = Object.freeze([1, 2, 3, 5, 8]);
const REVAMP_TREE_UNLOCK_MINUTES = Object.freeze([0, 10, 25, 40, 55]);
const REVAMP_MEDAL_DATA = Object.freeze({ clear: 1, kills: 1, noHit: 2 });
const MINUTE = 60_000;
const DAY = 86_400_000;
const MAX_COUNTER = 1_000_000_000;
const MAX_RUN_MS = 4 * 60 * MINUTE;
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9:._/-]{0,199}$/;
const record = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const count = (value, max = MAX_COUNTER) => typeof value === 'number' && Number.isFinite(value)
  ? Math.max(0, Math.min(max, Math.floor(value))) : 0;
const validId = (value) => typeof value === 'string' && SAFE_ID.test(value)
  && value !== '__proto__' && value !== 'constructor' && value !== 'prototype';
const ids = (value) => [...new Set((Array.isArray(value) ? value : []).filter(validId))].sort();
const union = (left, right) => [...new Set([...left, ...right])].sort();
const pad = (number) => String(number).padStart(2, '0');

/** Calendar keys intentionally follow the pilot's local date, not UTC midnight. */
const getRevampLocalDateKey = (date = new Date()) => {
  const value = date instanceof Date && Number.isFinite(date.getTime()) ? date : new Date(2000, 0, 1);
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
};

const dateFromKey = (key) => {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  return getRevampLocalDateKey(date) === key ? date : null;
};
const ordinal = (key) => {
  const date = dateFromKey(key);
  return date ? Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY) : null;
};

/** ISO week number, computed from local calendar components; independent of DST. */
const getRevampIsoWeekKey = (date = new Date()) => {
  const local = dateFromKey(getRevampLocalDateKey(date));
  const day = new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7));
  const year = day.getUTCFullYear();
  const week = Math.ceil((((day.getTime() - Date.UTC(year, 0, 1)) / DAY) + 1) / 7);
  return `${year}-W${pad(week)}`;
};

const validWeek = (key) => {
  if (typeof key !== 'string' || !/^\d{4}-W\d{2}$/.test(key)) return false;
  const year = Number(key.slice(0, 4));
  const week = Number(key.slice(-2));
  if (year < 1000 || week < 1 || week > 53) return false;
  const jan4 = new Date(year, 0, 4, 12);
  jan4.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (week - 1) * 7);
  return getRevampIsoWeekKey(jan4) === key;
};

const seed = (key) => {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  return hash >>> 0;
};
const shuffledKinds = (key) => [...REVAMP_EVENT_KINDS].sort((a, b) => seed(`${key}:${a}`) - seed(`${key}:${b}`) || a.localeCompare(b));
const GOAL_TEXT = Object.freeze({
  kills: ['Destroy', 'enemies'],
  noHitClears: ['Clear', 'missions without taking a hit'],
  bossParts: ['Break', 'boss parts'],
  powerups: ['Collect', 'power-ups'],
  clears: ['Clear', 'missions']
});
const DAILY_TARGETS = Object.freeze({ kills: [100, 150, 200], noHitClears: [1], bossParts: [1, 2], powerups: [6, 8, 10], clears: [2, 3] });
const WEEKLY_TARGETS = Object.freeze({ kills: [1200, 1500, 1800], noHitClears: [3, 4], bossParts: [6, 8], powerups: [40, 50], clears: [10, 12] });
const DAILY_REWARDS = Object.freeze({ kills: [45, 1], noHitClears: [60, 2], bossParts: [55, 2], powerups: [40, 1], clears: [60, 2] });
const WEEKLY_REWARDS = Object.freeze({ kills: [200, 4], noHitClears: [250, 5], bossParts: [225, 4], powerups: [175, 3], clears: [250, 5] });

/** @returns {RevampGoal[]} */
const goalDefinitions = (period, key) => {
  const weekly = period === 'weekly';
  const kinds = weekly ? shuffledKinds(key) : shuffledKinds(key).slice(0, 3);
  return kinds.map((kind) => {
    const targets = (weekly ? WEEKLY_TARGETS : DAILY_TARGETS)[kind];
    const target = targets[seed(`${key}:${kind}:target`) % targets.length];
    const [creditReward, researchReward] = (weekly ? WEEKLY_REWARDS : DAILY_REWARDS)[kind];
    const [verb, noun] = GOAL_TEXT[kind];
    const label = target === 1 && kind === 'noHitClears' ? 'Clear 1 mission without taking a hit'
      : target === 1 && kind === 'bossParts' ? 'Break 1 boss part' : `${verb} ${target} ${noun}`;
    return { id: `${period}:${key}:${kind}`, period, periodKey: key, kind, label, target,
      progress: 0, complete: false, claimed: false, creditReward, researchReward };
  });
};

const goalFromId = (id) => {
  if (typeof id !== 'string') return null;
  const [period, key, kind, extra] = id.split(':');
  if (extra !== undefined || !REVAMP_EVENT_KINDS.includes(kind)) return null;
  if ((period === 'daily' && dateFromKey(key)) || (period === 'weekly' && validWeek(key))) {
    return goalDefinitions(period, key).find((goal) => goal.kind === kind) ?? null;
  }
  return null;
};

/** Every five minutes yields an entitlement; all use existing art or procedural color effects. */
/** @type {readonly RevampUnlock[]} */
const REVAMP_UNLOCK_CADENCE = Object.freeze([
  { id: 'wing-left', label: 'Citation Dart · offense wing', kind: 'wing', atMinutes: 0, assetId: 'citation-dart' },
  { id: 'wing-right', label: 'Quorum Crab · utility wing', kind: 'wing', atMinutes: 1, assetId: 'quorum-crab' },
  { id: 'trail-ion', label: 'Ion wake trail', kind: 'trail', atMinutes: 5, assetId: 'revamp-trail-ion' },
  { id: 'tree-rank-2', label: 'Upgrade tree · rank II', kind: 'tree', atMinutes: 10 },
  { id: 'wing-photon', label: 'Photon Manta · laser lance', kind: 'wing', atMinutes: 15, assetId: 'photon-manta' },
  { id: 'skin-frontier', label: 'Frontier cyan accent', kind: 'skin', atMinutes: 20, assetId: 'revamp-skin-frontier' },
  { id: 'tree-rank-3', label: 'Upgrade tree · rank III', kind: 'tree', atMinutes: 25 },
  { id: 'story-vega', label: 'Dr. Vega · field log', kind: 'story', atMinutes: 30, assetId: 'frontier-vega-log' },
  { id: 'wing-axiom', label: 'Axiom Orbiter · shield pulse', kind: 'wing', atMinutes: 35, assetId: 'axiom-orbiter' },
  { id: 'tree-rank-4', label: 'Upgrade tree · rank IV', kind: 'tree', atMinutes: 40 },
  { id: 'trail-aurora', label: 'Aurora research trail', kind: 'trail', atMinutes: 45, assetId: 'revamp-trail-aurora' },
  { id: 'wing-archive', label: 'Archive Beetle · homing swarm', kind: 'wing', atMinutes: 50, assetId: 'archive-beetle' },
  { id: 'tree-rank-5', label: 'Upgrade tree · evolution rank', kind: 'tree', atMinutes: 55 },
  { id: 'story-frontier', label: 'Explorer · open frontier log', kind: 'story', atMinutes: 60, assetId: 'frontier-explorer-log' }
]);
const UNLOCK_IDS = new Set(REVAMP_UNLOCK_CADENCE.map((entry) => entry.id));
const BRANCH_LABELS = Object.freeze({ firepower: 'Firepower', survival: 'Survival', support: 'Support', fortune: 'Fortune', overdrive: 'Overdrive' });
const NODE_NAMES = Object.freeze({
  firepower: ['Focused pulses', 'Coherent beam', 'Emitter array', 'Fusion chamber', 'Twin frontier'],
  survival: ['Shield lining', 'Recovery window', 'Shield lattice', 'Safe passage', 'Second chance'],
  support: ['Wing calibration', 'Rapid relay', 'Linked emitters', 'Quick recharge', 'Perfect formation'],
  fortune: ['Wide collector', 'Salvage study', 'Field magnet', 'Open funding', 'Science dividend'],
  overdrive: ['Fast capacitor', 'Long pulse', 'Charge recovery', 'Steady ignition', 'Frontier surge']
});
const NODE_TEXT = Object.freeze({
  firepower: ['Main damage +4%.', 'Main damage +4%.', 'Main damage +4%.', 'Main damage +4%.', 'Adds one shot; main damage +4%.'],
  survival: ['Starting shield +1.', 'Hit recovery +10%.', 'Starting shield +1.', 'Hit recovery +10%.', 'One extra starting life.'],
  support: ['Campaign wings reach level 2; wing damage +4%.', 'Campaign wings reach level 3; special cooldown −4%.', 'Campaign wings reach level 4; wing damage +4%.', 'Campaign wings evolve at level 5; special cooldown −4%.', 'Wing damage +4%; special cooldown −4%.'],
  fortune: ['Collection radius +10%.', 'Science Credits +4%.', 'Collection radius +10%.', 'Science Credits +4%.', 'Collection radius +10%; Science Credits +4%.'],
  overdrive: ['Overdrive charge +8%.', 'Overdrive duration +10%.', 'Overdrive charge +8%.', 'Overdrive duration +10%.', 'Overdrive charge +8%; duration +10%.']
});
const parseNode = (id) => {
  const [branch, levelText, extra] = typeof id === 'string' ? id.split(':') : [];
  const level = Number(levelText);
  return !extra && REVAMP_BRANCHES.includes(branch) && level >= 1 && level <= 5 && String(level) === levelText
    ? { branch, level } : null;
};

const sanitizeLogin = (value) => {
  const input = record(value);
  const visitDates = ids(input.visitDates).filter((key) => dateFromKey(key));
  // A legacy visit is retained, but no positive streak can be fabricated from a counter alone.
  if (dateFromKey(input.lastDateKey) && !visitDates.includes(input.lastDateKey)) visitDates.push(input.lastDateKey);
  visitDates.sort();
  let longest = 0;
  let current = 0;
  let previous = null;
  for (const key of visitDates) {
    const day = ordinal(key);
    current = previous !== null && day - previous === 1 ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = day;
  }
  return { lastDateKey: visitDates.at(-1) ?? null, currentStreak: current, longestStreak: longest, visitDates };
};

/** @returns {RevampEventReceipt | null} */
const sanitizeEvent = (value) => {
  const input = record(value);
  if (!validId(input.id) || !REVAMP_EVENT_KINDS.includes(input.kind) || !dateFromKey(input.dateKey)) return null;
  const amount = count(input.amount);
  if (amount <= 0) return null;
  return { id: input.id, kind: input.kind, amount, dateKey: input.dateKey,
    weekKey: getRevampIsoWeekKey(dateFromKey(input.dateKey)),
    ...(validId(input.runId) ? { runId: input.runId } : {}),
    ...(input.mode === 'total' ? { mode: 'total' } : {}) };
};

/** @param {unknown} input @returns {RevampProgress} */
const sanitizeRevampProgress = (input) => {
  const value = record(input);
  const missionMedals = Object.fromEntries(Object.entries(record(value.missionMedals))
    .filter(([id]) => validId(id)).map(([id, raw]) => {
      const medals = REVAMP_MEDALS.filter((medal) => Array.isArray(raw) && raw.includes(medal));
      // Accuracy/no-hit medals only exist for a completed mission.
      return [id, medals.includes('clear') ? medals : []];
    }).filter(([, medals]) => medals.length));
  const candidateNodes = new Set(ids(value.purchasedNodeIds).filter(parseNode));
  // Incomplete/corrupt chains retain their spending receipts but grant only
  // the contiguous purchased prefix. Repairing a missing node cannot refund
  // an already-paid higher node or activate it before its predecessor.
  const purchasedNodeIds = REVAMP_BRANCHES.flatMap((branch) => Array.from({ length: 5 }, (_, index) => `${branch}:${index + 1}`).filter((id) => candidateNodes.has(id)));
  const upgrades = Object.fromEntries(REVAMP_BRANCHES.map((branch) => {
    let level = 0;
    while (level < 5 && candidateNodes.has(`${branch}:${level + 1}`)) level += 1;
    return [branch, level];
  }));
  const claimedGoalIds = ids(value.claimedGoalIds).filter((id) => goalFromId(id));
  const settledRunIds = ids(value.settledRunIds);
  const settledRunSet = new Set(settledRunIds);
  const earnedCreditsByRunId = Object.fromEntries(Object.entries(record(value.earnedCreditsByRunId))
    .filter(([id, amount]) => validId(id) && settledRunSet.has(id) && count(amount) > 0)
    .map(([id, amount]) => [id, count(amount)]).sort(([a], [b]) => a.localeCompare(b)));
  const scienceCreditsEarned = Math.min(MAX_COUNTER,
    Object.values(earnedCreditsByRunId).reduce((total, amount) => total + amount, 0)
    + claimedGoalIds.reduce((total, id) => total + goalFromId(id).creditReward, 0));
  const scienceCreditsSpent = purchasedNodeIds.reduce((total, id) => total + REVAMP_CREDIT_COSTS[parseNode(id).level - 1], 0);
  // Migration: older optional meta blobs may have a simple Data balance. Only
  // version 0/unversioned data can migrate it, so v1 derived fields cannot mint.
  const legacyResearchData = count(value.legacyResearchData ?? (value.version === 1 ? 0 : value.researchData), 100_000);
  const earned = legacyResearchData
    + Object.values(missionMedals).reduce((total, medals) => total + medals.reduce((sum, medal) => sum + REVAMP_MEDAL_DATA[medal], 0), 0)
    + claimedGoalIds.reduce((total, id) => total + goalFromId(id).researchReward, 0);
  const spent = purchasedNodeIds.reduce((total, id) => total + REVAMP_RESEARCH_COSTS[parseNode(id).level - 1], 0);
  const eventMap = new Map();
  for (const raw of Array.isArray(value.events) ? value.events : []) {
    const event = sanitizeEvent(raw);
    if (!event) continue;
    const previous = eventMap.get(event.id);
    // A total receipt grows monotonically; conflicting delta receipts choose
    // the smaller amount. Neither case credits the same receipt twice.
    if (!previous) eventMap.set(event.id, event);
    else if (previous.kind === event.kind && previous.dateKey === event.dateKey && previous.runId === event.runId) {
      eventMap.set(event.id, { ...previous, amount: previous.mode === 'total' && event.mode === 'total'
        ? Math.max(previous.amount, event.amount) : Math.min(previous.amount, event.amount) });
    } else if (JSON.stringify(event) < JSON.stringify(previous)) eventMap.set(event.id, event);
  }
  const playTimeMs = count(value.playTimeMs, Number.MAX_SAFE_INTEGER);
  const unlockIds = ids(value.unlockIds).filter((id) => UNLOCK_IDS.has(id));
  if (!unlockIds.includes('wing-left')) unlockIds.push('wing-left');
  // Reconcile lost display entitlements from the durable playtime/medal state.
  for (const unlock of REVAMP_UNLOCK_CADENCE) {
    const eligible = unlock.id === 'wing-right' ? Object.keys(missionMedals).length > 0
      : playTimeMs >= unlock.atMinutes * MINUTE;
    if (eligible && !unlockIds.includes(unlock.id)) unlockIds.push(unlock.id);
  }
  // Weekly cosmetics use the same procedural cosmetic catalog as cadence
  // rewards. Claiming all five can unlock one early without any combat bonus.
  const claimedWeeks = [...new Set(claimedGoalIds.filter((id) => id.startsWith('weekly:')).map((id) => id.split(':')[1]))];
  for (const weekKey of claimedWeeks) {
    if (goalDefinitions('weekly', weekKey).every((goal) => claimedGoalIds.includes(goal.id))) {
      const cosmetic = seed(weekKey) % 2 ? 'skin-frontier' : 'trail-aurora';
      if (!unlockIds.includes(cosmetic)) unlockIds.push(cosmetic);
    }
  }
  const equippedCosmeticId = typeof value.equippedCosmeticId === 'string'
    && REVAMP_UNLOCK_CADENCE.some((entry) => entry.assetId === value.equippedCosmeticId
      && (entry.kind === 'trail' || entry.kind === 'skin') && unlockIds.includes(entry.id))
    ? value.equippedCosmeticId : null;
  return {
    version: 1, researchData: Math.max(0, earned - spent), researchDebt: Math.max(0, spent - earned),
    legacyResearchData, scienceCreditsEarned, scienceCreditsSpent, earnedCreditsByRunId,
    paidCreditReserve: count(value.paidCreditReserve),
    upgrades, purchasedNodeIds, missionMedals,
    settledRunIds, events: [...eventMap.values()].sort((a, b) => a.id.localeCompare(b.id)),
    claimedGoalIds, playTimeMs, unlockIds: unlockIds.sort(), login: sanitizeLogin(value.login),
    wingAutoCast: value.wingAutoCast !== false, equippedCosmeticId
  };
};

/** @returns {RevampProgress} */
const createRevampProgress = (date = new Date()) => touchRevampLogin(sanitizeRevampProgress({ version: 1 }), date);

/** @param {RevampProgress} state @returns {RevampProgress} */
const touchRevampLogin = (state, date = new Date()) => {
  const current = sanitizeRevampProgress(state);
  const key = getRevampLocalDateKey(date);
  return { ...current, login: sanitizeLogin({ ...current.login, visitDates: union(current.login.visitDates, [key]) }) };
};

/**
 * Durable receipts merge by identity, never by summing balances. Concurrent
 * offline purchases retain all debits; researchDebt blocks further purchases
 * until earned Data covers them. The host's wallet conflict UI owns coin-state
 * reconciliation (getRevampCreditLedger exposes the required totals).
 * @param {unknown} left @param {unknown} right @returns {RevampProgress}
 */
const mergeRevampProgress = (left, right) => {
  const a = sanitizeRevampProgress(left);
  const b = sanitizeRevampProgress(right);
  const missions = union(Object.keys(a.missionMedals), Object.keys(b.missionMedals));
  const earnedRuns = union(Object.keys(a.earnedCreditsByRunId), Object.keys(b.earnedCreditsByRunId));
  return sanitizeRevampProgress({
    ...a,
    legacyResearchData: Math.max(a.legacyResearchData, b.legacyResearchData),
    // Only the host's authoritative wallet settlement may reduce this reserve.
    paidCreditReserve: Math.max(a.paidCreditReserve, b.paidCreditReserve),
    purchasedNodeIds: union(a.purchasedNodeIds, b.purchasedNodeIds),
    missionMedals: Object.fromEntries(missions.map((id) => [id, union(a.missionMedals[id] ?? [], b.missionMedals[id] ?? [])])),
    settledRunIds: union(a.settledRunIds, b.settledRunIds), events: [...a.events, ...b.events],
    earnedCreditsByRunId: Object.fromEntries(earnedRuns.map((id) => [id,
      id in a.earnedCreditsByRunId && id in b.earnedCreditsByRunId
        ? Math.min(a.earnedCreditsByRunId[id], b.earnedCreditsByRunId[id])
        : a.earnedCreditsByRunId[id] ?? b.earnedCreditsByRunId[id]
    ])),
    claimedGoalIds: union(a.claimedGoalIds, b.claimedGoalIds),
    // Choosing max rather than adding prevents a synced run being counted twice.
    playTimeMs: Math.max(a.playTimeMs, b.playTimeMs), unlockIds: union(a.unlockIds, b.unlockIds),
    login: { visitDates: union(a.login.visitDates, b.login.visitDates) },
    wingAutoCast: a.wingAutoCast && b.wingAutoCast,
    equippedCosmeticId: [a.equippedCosmeticId, b.equippedCosmeticId].filter(Boolean).sort()[0] ?? null
  });
};

/** @param {RevampProgress} state */
const getRevampCreditLedger = (state) => {
  const current = sanitizeRevampProgress(state);
  return {
    spent: current.scienceCreditsSpent,
    earned: current.scienceCreditsEarned
  };
};

/** Purchased Tokens cannot unlock combat upgrades. Legacy mixed balances carry no proven allowance. */
/** @param {RevampProgress} state @param {number} balance */
const getRevampSpendableCredits = (state, balance) => {
  const current = sanitizeRevampProgress(state);
  return Math.min(Math.max(0, count(balance) - current.paidCreditReserve),
    Math.max(0, current.scienceCreditsEarned - current.scienceCreditsSpent));
};

/** Record currency the host has actually granted (e.g. post-victory coin sweep).
 * This never grants coins, medals, playtime, or goals by itself. A zero/duplicate
 * callback cannot erase or add to the original earning receipt.
 * @param {RevampProgress} state @param {string} receiptId @param {number} amount
 * @returns {RevampProgress}
 */
const recordRevampEarnedCredits = (state, receiptId, amount) => {
  const current = sanitizeRevampProgress(state);
  const id = `earning:${receiptId}`;
  if (!validId(id) || !Number.isFinite(amount) || amount <= 0 || current.settledRunIds.includes(id)) return current;
  return sanitizeRevampProgress({ ...current,
    settledRunIds: [...current.settledRunIds, id],
    earnedCreditsByRunId: { ...current.earnedCreditsByRunId, [id]: count(amount) }
  });
};

/** @param {RevampProgress} state @returns {import('./types').RevampUpgradeNode[]} */
const getUpgradeNodes = (state) => {
  const current = sanitizeRevampProgress(state);
  return REVAMP_BRANCHES.flatMap((branch) => Array.from({ length: 5 }, (_, index) => ({
    id: `${branch}:${index + 1}`, branch, branchLabel: BRANCH_LABELS[branch], level: index + 1,
    name: NODE_NAMES[branch][index], description: NODE_TEXT[branch][index],
    creditCost: REVAMP_CREDIT_COSTS[index], researchCost: REVAMP_RESEARCH_COSTS[index],
    purchased: current.upgrades[branch] > index,
    available: current.upgrades[branch] === index && current.playTimeMs >= REVAMP_TREE_UNLOCK_MINUTES[index] * MINUTE,
    unlockMinutes: REVAMP_TREE_UNLOCK_MINUTES[index]
  })));
};

/** @param {RevampProgress} state @param {RevampBranch} branch @param {number} availableCredits @returns {import('./types').RevampPurchaseResult} */
const purchaseRevampUpgrade = (state, branch, availableCredits) => {
  const current = sanitizeRevampProgress(state);
  const credits = count(availableCredits);
  const rejected = (reason) => ({ state: current, credits, accepted: false, reason });
  if (!REVAMP_BRANCHES.includes(branch) || !Number.isFinite(availableCredits) || availableCredits < 0) return rejected('invalid');
  const level = current.upgrades[branch];
  if (level >= 5) return rejected('max-level');
  if (current.playTimeMs < REVAMP_TREE_UNLOCK_MINUTES[level] * MINUTE) return rejected('locked');
  if (getRevampSpendableCredits(current, credits) < REVAMP_CREDIT_COSTS[level]) return rejected('credits');
  if (current.researchDebt || current.researchData < REVAMP_RESEARCH_COSTS[level]) return rejected('research');
  return { state: sanitizeRevampProgress({ ...current, purchasedNodeIds: [...current.purchasedNodeIds, `${branch}:${level + 1}`] }),
    credits: credits - REVAMP_CREDIT_COSTS[level], accepted: true, reason: 'purchased' };
};

/** Bonuses apply only to normal Campaign/arcade. Callers must bypass these for Weekly Run. */
/** @param {RevampProgress} state @returns {import('./types').RevampBonuses} */
const getRevampBonuses = (state) => {
  const levels = sanitizeRevampProgress(state).upgrades;
  return {
    mainDamageMultiplier: 1 + levels.firepower * 0.04,
    extraProjectiles: levels.firepower >= 5 ? 1 : 0,
    shieldBonus: Number(levels.survival >= 1) + Number(levels.survival >= 3),
    invulnerabilityMultiplier: 1 + Number(levels.survival >= 2) * 0.1 + Number(levels.survival >= 4) * 0.1,
    extraLives: Number(levels.survival >= 5),
    wingDamageMultiplier: 1 + (Number(levels.support >= 1) + Number(levels.support >= 3) + Number(levels.support >= 5)) * 0.04,
    wingCooldownMultiplier: 1 - (Number(levels.support >= 2) + Number(levels.support >= 4) + Number(levels.support >= 5)) * 0.04,
    magnetRadiusMultiplier: 1 + (Number(levels.fortune >= 1) + Number(levels.fortune >= 3) + Number(levels.fortune >= 5)) * 0.1,
    creditGainMultiplier: 1 + (Number(levels.fortune >= 2) + Number(levels.fortune >= 4) + Number(levels.fortune >= 5)) * 0.04,
    overdriveChargeMultiplier: 1 + (Number(levels.overdrive >= 1) + Number(levels.overdrive >= 3) + Number(levels.overdrive >= 5)) * 0.08,
    overdriveDurationMultiplier: 1 + (Number(levels.overdrive >= 2) + Number(levels.overdrive >= 4) + Number(levels.overdrive >= 5)) * 0.1
  };
};

/** @param {RevampProgress} state */
const getRevampGoals = (state, date = new Date()) => {
  const current = sanitizeRevampProgress(state);
  const dailyKey = getRevampLocalDateKey(date);
  const weeklyKey = getRevampIsoWeekKey(date);
  const populate = (goal) => {
    const progress = Math.min(goal.target, current.events.reduce((total, event) => total + (
      event.kind === goal.kind && (goal.period === 'daily' ? event.dateKey === dailyKey : event.weekKey === weeklyKey) ? event.amount : 0
    ), 0));
    return { ...goal, progress, complete: progress >= goal.target, claimed: current.claimedGoalIds.includes(goal.id) };
  };
  return {
    daily: goalDefinitions('daily', dailyKey).map(populate),
    weekly: goalDefinitions('weekly', weeklyKey).map(populate),
    streak: current.login.currentStreak,
    bestStreak: current.login.longestStreak,
    weeklyCosmeticId: `revamp-${seed(weeklyKey) % 2 ? 'skin-frontier' : 'trail-aurora'}`
  };
};

/** @param {RevampProgress} state @param {import('./types').RevampEvent} event @returns {RevampProgress} */
const recordRevampEvent = (state, event, date = new Date()) => {
  const current = sanitizeRevampProgress(state);
  if (!validId(event?.id) || !REVAMP_EVENT_KINDS.includes(event?.kind) || !Number.isFinite(event?.amount) || event.amount <= 0) return current;
  if (event.runId && current.settledRunIds.includes(event.runId)) return current;
  const previous = current.events.find((entry) => entry.id === event.id);
  if (previous && !(event.mode === 'total' && previous.mode === 'total' && previous.kind === event.kind && event.amount > previous.amount)) return current;
  const dateKey = previous?.dateKey ?? getRevampLocalDateKey(date);
  const receipt = sanitizeEvent({ ...event, dateKey });
  if (!receipt) return current;
  // Keep this week and the previous week. Permanent claim and run receipts
  // survive pruning, so neither rewards nor settled gameplay can be replayed.
  const today = ordinal(getRevampLocalDateKey(date));
  const retained = current.events.filter((entry) => entry.id !== event.id && ordinal(entry.dateKey) >= today - 14);
  return { ...current, events: [...retained, receipt].sort((a, b) => a.id.localeCompare(b.id)) };
};

/** @param {RevampProgress} state @param {string} goalId @param {number} availableCredits @returns {import('./types').RevampGoalClaimResult} */
const claimRevampGoal = (state, goalId, availableCredits, date = new Date()) => {
  const current = sanitizeRevampProgress(state);
  const credits = count(availableCredits);
  const empty = { state: current, credits, accepted: false, reward: { credits: 0, researchData: 0 } };
  if (!Number.isFinite(availableCredits) || availableCredits < 0) return empty;
  const goals = getRevampGoals(current, date);
  const goal = [...goals.daily, ...goals.weekly].find((entry) => entry.id === goalId);
  if (!goal || !goal.complete || goal.claimed) return empty;
  const next = sanitizeRevampProgress({ ...current, claimedGoalIds: [...current.claimedGoalIds, goalId] });
  const cosmeticId = goal.period === 'weekly' && goals.weekly.every((entry) => next.claimedGoalIds.includes(entry.id))
    ? goals.weeklyCosmeticId : undefined;
  return { state: next, credits: Math.min(MAX_COUNTER, credits + goal.creditReward), accepted: true,
    reward: { credits: goal.creditReward, researchData: goal.researchReward, ...(cosmeticId ? { cosmeticId } : {}) } };
};

/** @param {RevampProgress} state @param {import('./types').RevampMissionInput} input @returns {import('./types').RevampMissionSettlement} */
const settleRevampMission = (state, input, date = new Date()) => {
  let current = sanitizeRevampProgress(state);
  const empty = { state: current, medals: [], newMedals: [], researchAwarded: 0, unlocks: [], accepted: false };
  if (!validId(input?.runId) || !validId(input?.missionId) || current.settledRunIds.includes(input.runId)) return empty;
  if (![input.kills, input.spawned, input.damageTaken, input.durationMs].every((value) => Number.isFinite(value) && value >= 0)) return empty;
  if (input.scienceCreditsEarned !== undefined && (!Number.isFinite(input.scienceCreditsEarned) || input.scienceCreditsEarned < 0)) return empty;
  const kills = count(input.kills);
  const spawned = count(input.spawned);
  /** @type {RevampMedal[]} */
  const medals = input.cleared === true ? ['clear'] : [];
  if (input.cleared === true && spawned > 0 && kills / spawned >= 0.9 && kills <= spawned) medals.push('kills');
  if (input.cleared === true && input.damageTaken === 0) medals.push('noHit');
  const previousMedals = current.missionMedals[input.missionId] ?? [];
  const newMedals = medals.filter((medal) => !previousMedals.includes(medal));
  const eventValues = { clears: Number(input.cleared === true), noHitClears: Number(medals.includes('noHit')),
    ...(input.recordCombatEvents === true ? { kills, bossParts: count(input.bossParts), powerups: count(input.powerups) } : {}) };
  for (const [kind, amount] of Object.entries(eventValues)) {
    if (amount > 0) current = recordRevampEvent(current, { id: `${input.runId}:${kind}`, runId: input.runId,
      kind, amount, mode: 'total' }, date);
  }
  const previousUnlocks = new Set(current.unlockIds);
  const next = sanitizeRevampProgress({ ...current,
    missionMedals: { ...current.missionMedals, ...(medals.length ? { [input.missionId]: union(previousMedals, medals) } : {}) },
    settledRunIds: [...current.settledRunIds, input.runId],
    earnedCreditsByRunId: { ...current.earnedCreditsByRunId, [input.runId]: count(input.scienceCreditsEarned) },
    playTimeMs: current.playTimeMs + count(input.durationMs, MAX_RUN_MS)
  });
  return { state: next, medals, newMedals,
    researchAwarded: newMedals.reduce((total, medal) => total + REVAMP_MEDAL_DATA[medal], 0),
    unlocks: REVAMP_UNLOCK_CADENCE.filter((entry) => next.unlockIds.includes(entry.id) && !previousUnlocks.has(entry.id)), accepted: true };
};

const api = { REVAMP_PROGRESS_VERSION, REVAMP_BRANCHES, REVAMP_EVENT_KINDS, REVAMP_MEDALS, REVAMP_CREDIT_COSTS, REVAMP_RESEARCH_COSTS, REVAMP_TREE_UNLOCK_MINUTES, REVAMP_MEDAL_DATA, getRevampLocalDateKey, getRevampIsoWeekKey, REVAMP_UNLOCK_CADENCE, sanitizeRevampProgress, createRevampProgress, touchRevampLogin, mergeRevampProgress, getRevampCreditLedger, getRevampSpendableCredits, recordRevampEarnedCredits, getUpgradeNodes, purchaseRevampUpgrade, getRevampBonuses, getRevampGoals, recordRevampEvent, claimRevampGoal, settleRevampMission };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.__SCICON_REVAMP_PROGRESSION__ = api;
})();

const { fetchSupabaseJson, supabaseHeaders } = require('./supabase');
const { normalizeWalletAddress } = require('./walletProfileAuth');
const {
  campaignMasteryStatus,
  fetchWalletProfile,
  sanitizePlayerShipEntitlements,
  sanitizeWalletSnapshot
} = require('./walletProfiles');

const APPLY_TOKEN_SPEND_RPC = process.env.SUPABASE_APPLY_WALLET_TOKEN_SPEND_RPC
  || 'scicon_apply_wallet_token_spend';
const TOKEN_SPENDS_TABLE = process.env.SUPABASE_WALLET_TOKEN_SPENDS_TABLE
  || 'scicon_wallet_token_spends';
const MAX_PROFILE_TOKENS = 1_000_000_000;
const LEFT_SLOT_UNLOCK_COST = 50;
const MINI_SHIP_MAX_LEVEL = 5;
const MINI_SHIP_UPGRADE_COST_CURVE = Object.freeze([0, 160, 360, 650, 1050]);
const PLAYER_SHIP_IDS = Object.freeze(['researchhub', 'bio', 'eth', 'btc']);
const MAIN_SHIP_UPGRADE_COSTS = Object.freeze({
  fireRate: Object.freeze([
    60, 90, 130, 190, 270, 360, 480,
    630, 810, 1020, 1260, 1530, 1830, 2190,
    2600, 3050, 3550, 4100, 4700, 5350, 6050,
    6800, 7300, 7800, 8400, 9000, 9700, 10400,
    11200, 12000, 12800, 13600, 14500, 15400, 16400,
    17400, 18400, 19500, 20600, 21800, 23000, 24300,
    25600, 27000, 28500, 30000, 31600, 33200, 34900
  ]),
  speed: Object.freeze([55, 85, 130, 200, 300, 440, 625]),
  ability: Object.freeze([220, 480, 900, 1600, 2600, 4000]),
  startingHearts: Object.freeze([180, 320, 560, 900, 1400, 2100, 3000])
});
const MINI_SHIP_PURCHASE_COSTS = Object.freeze({
  'citation-dart': 0,
  'helix-wasp': 90,
  'photon-manta': 140,
  'quorum-crab': 200,
  'axiom-orbiter': 260,
  'archive-beetle': 330,
  'beacon-kite': 410,
  'prism-skimmer': 500,
  'ledger-hammer': 620,
  'nebula-tern': 760
});
const SPEND_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const apiError = (message, statusCode = 400, code = '') => Object.assign(
  new Error(message),
  { statusCode, code, isPublicWalletTokenSpendError: true }
);

const asObject = (value) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
);

const boundedTokenInteger = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= MAX_PROFILE_TOKENS
    ? parsed
    : 0;
};

const cloneSnapshot = (snapshot) => JSON.parse(JSON.stringify(snapshot));

const profilePlayerShipUpgradeAccess = (profile, bioStatus = null) => {
  const rawEntitlements = asObject(
    profile?.snapshot?.permanentState?.playerShipEntitlements
  );
  const entitlements = typeof sanitizePlayerShipEntitlements === 'function'
    ? sanitizePlayerShipEntitlements(rawEntitlements)
    : rawEntitlements;
  const mastery = typeof campaignMasteryStatus === 'function'
    ? campaignMasteryStatus(profile?.snapshot)
    : { complete: false };
  return {
    researchhub: true,
    bio: bioStatus?.verificationStatus === 'verified' && bioStatus.unlocked === true,
    eth: Boolean(entitlements.eth),
    btc: Boolean(entitlements.btc) || mastery.complete === true
  };
};

const spendSnapshotTokens = (weeklyState, cost) => {
  const coins = boundedTokenInteger(weeklyState.coins);
  const durableTokens = Math.min(
    coins,
    boundedTokenInteger(weeklyState.durableCampaignCoins)
  );
  if (coins < cost) {
    throw apiError(
      `This Hangar purchase requires ${cost.toLocaleString('en-US')} Tokens.`,
      409,
      'wallet_token_balance_insufficient'
    );
  }
  const seasonalTokens = coins - durableTokens;
  const durableTokensSpent = Math.max(0, cost - seasonalTokens);
  weeklyState.coins = coins - cost;
  weeklyState.durableCampaignCoins = durableTokens - durableTokensSpent;
};

const normalizeAction = (rawAction) => {
  const action = asObject(rawAction);
  const kind = typeof action.kind === 'string' ? action.kind : '';
  if (kind === 'unlock-left-slot') return { kind };
  if (kind === 'purchase-mini-ship' || kind === 'upgrade-mini-ship') {
    const miniShipId = typeof action.miniShipId === 'string' ? action.miniShipId : '';
    if (!Object.hasOwn(MINI_SHIP_PURCHASE_COSTS, miniShipId)) return null;
    return { kind, miniShipId };
  }
  if (kind === 'upgrade-main-ship') {
    const shipId = typeof action.shipId === 'string' ? action.shipId : '';
    const upgradeId = typeof action.upgradeId === 'string' ? action.upgradeId : '';
    if (!PLAYER_SHIP_IDS.includes(shipId) || !Object.hasOwn(MAIN_SHIP_UPGRADE_COSTS, upgradeId)) {
      return null;
    }
    return { kind, shipId, upgradeId };
  }
  return null;
};

const canonicalWalletTokenSpend = ({
  profile,
  action,
  now = Date.now(),
  playerShipAccess = null
}) => {
  const normalizedAction = normalizeAction(action);
  if (!normalizedAction) {
    throw apiError(
      'This Hangar Token purchase is not available.',
      400,
      'wallet_token_action_invalid'
    );
  }

  const nextSnapshot = cloneSnapshot(profile.snapshot);
  const weeklyState = asObject(nextSnapshot.weeklyState);
  const permanentState = asObject(nextSnapshot.permanentState);
  const unlockedSlots = asObject(weeklyState.unlockedSlots);
  const ownedMiniShips = asObject(weeklyState.ownedMiniShips);
  const shipUpgrades = asObject(weeklyState.shipUpgrades);
  const nowIso = new Date(now).toISOString();
  let cost = 0;
  let reason = '';

  if (normalizedAction.kind === 'unlock-left-slot') {
    if (unlockedSlots.left) {
      throw apiError('Left support is already unlocked.', 409, 'wallet_token_action_already_applied');
    }
    cost = LEFT_SLOT_UNLOCK_COST;
    reason = 'hangar:left-slot';
    unlockedSlots.left = true;
    ownedMiniShips['citation-dart'] = Math.max(
      1,
      boundedTokenInteger(ownedMiniShips['citation-dart'])
    );
    weeklyState.equipped = {
      ...asObject(weeklyState.equipped),
      left: 'citation-dart'
    };
  } else if (normalizedAction.kind === 'purchase-mini-ship') {
    const { miniShipId } = normalizedAction;
    if (boundedTokenInteger(ownedMiniShips[miniShipId]) > 0) {
      throw apiError('This support ship is already owned.', 409, 'wallet_token_action_already_applied');
    }
    cost = MINI_SHIP_PURCHASE_COSTS[miniShipId];
    reason = `hangar:mini-purchase:${miniShipId}`;
    ownedMiniShips[miniShipId] = 1;
  } else if (normalizedAction.kind === 'upgrade-mini-ship') {
    const { miniShipId } = normalizedAction;
    const level = boundedTokenInteger(ownedMiniShips[miniShipId]);
    if (level < 1) {
      throw apiError('Own this support ship before upgrading it.', 409, 'wallet_token_action_locked');
    }
    if (level >= MINI_SHIP_MAX_LEVEL) {
      throw apiError('This support ship is already at maximum level.', 409, 'wallet_token_action_already_applied');
    }
    const curveCost = MINI_SHIP_UPGRADE_COST_CURVE[level];
    const shipPremium = MINI_SHIP_PURCHASE_COSTS[miniShipId] * (0.55 + level * 0.15);
    cost = Math.round(curveCost + shipPremium);
    reason = `hangar:mini-upgrade:${miniShipId}:${level}-${level + 1}`;
    ownedMiniShips[miniShipId] = level + 1;
  } else {
    const { shipId, upgradeId } = normalizedAction;
    const verifiedPlayerShipAccess = playerShipAccess || profilePlayerShipUpgradeAccess(profile);
    if (verifiedPlayerShipAccess[shipId] !== true) {
      throw apiError(
        'Unlock this player ship before purchasing its upgrades.',
        409,
        'wallet_token_action_locked'
      );
    }
    const currentUpgrades = asObject(shipUpgrades[shipId]);
    const level = boundedTokenInteger(currentUpgrades[upgradeId]);
    const costs = MAIN_SHIP_UPGRADE_COSTS[upgradeId];
    if (level >= costs.length) {
      throw apiError('This ship upgrade is already at maximum level.', 409, 'wallet_token_action_already_applied');
    }
    cost = costs[level];
    reason = `hangar:main-upgrade:${shipId}:${upgradeId}:${level}-${level + 1}`;
    shipUpgrades[shipId] = { ...currentUpgrades, [upgradeId]: level + 1 };
    const lifetimeStats = asObject(permanentState.lifetimeStats);
    permanentState.lifetimeStats = {
      ...lifetimeStats,
      hangarUpgradesPurchased: boundedTokenInteger(lifetimeStats.hangarUpgradesPurchased) + 1
    };
    permanentState.updatedAt = nowIso;
  }

  spendSnapshotTokens(weeklyState, cost);
  weeklyState.unlockedSlots = unlockedSlots;
  weeklyState.ownedMiniShips = ownedMiniShips;
  weeklyState.shipUpgrades = shipUpgrades;
  weeklyState.updatedAt = nowIso;
  nextSnapshot.weeklyState = weeklyState;
  nextSnapshot.permanentState = permanentState;

  return {
    action: normalizedAction,
    cost,
    reason,
    nextSnapshot: sanitizeWalletSnapshot(
      nextSnapshot,
      profile.walletAddress,
      now
    )
  };
};

const rpcError = (error) => {
  const message = String(error?.message || '');
  if (/wallet_token_spend_revision_conflict/i.test(message)) {
    return apiError(
      'This wallet profile changed on another device. Reload it before spending Tokens.',
      409,
      'wallet_token_spend_revision_conflict'
    );
  }
  if (/wallet_token_spend_(balance_insufficient|insufficient)/i.test(message)) {
    return apiError(
      'The server-owned purchased Token balance is lower than this device expected. Reload and try again.',
      409,
      'wallet_token_spend_balance_insufficient'
    );
  }
  if (/wallet_token_spend_(invalid|snapshot_invalid|balance_invalid)/i.test(message)) {
    return apiError(
      'The Hangar purchase failed its server integrity checks.',
      409,
      'wallet_token_spend_integrity_failed'
    );
  }
  return error;
};

const fetchWalletTokenSpendReceipt = async ({ walletAddress, spendId }) => {
  const rows = await fetchSupabaseJson(
    `${TOKEN_SPENDS_TABLE}?select=spend_id,wallet_address,amount,reason,purchased_tokens_spent,purchased_tokens_available_after,profile_revision_after`
      + `&spend_id=eq.${encodeURIComponent(spendId)}`
      + `&wallet_address=eq.${encodeURIComponent(walletAddress)}&limit=1`,
    { headers: supabaseHeaders() }
  );
  return Array.isArray(rows) ? rows[0] || null : null;
};

const receiptMatchesAction = (receipt, action) => {
  const reason = String(receipt?.reason || '');
  if (action.kind === 'unlock-left-slot') return reason === 'hangar:left-slot';
  if (action.kind === 'purchase-mini-ship') {
    return reason === `hangar:mini-purchase:${action.miniShipId}`;
  }
  if (action.kind === 'upgrade-mini-ship') {
    return reason.startsWith(`hangar:mini-upgrade:${action.miniShipId}:`);
  }
  return reason.startsWith(
    `hangar:main-upgrade:${action.shipId}:${action.upgradeId}:`
  );
};

const duplicateSettlementFromReceipt = async ({
  walletAddress,
  action,
  receipt,
  now
}) => {
  if (!receiptMatchesAction(receipt, action)) {
    throw apiError(
      'This Hangar spend receipt belongs to a different action.',
      409,
      'wallet_token_spend_replayed'
    );
  }
  const profile = await fetchWalletProfile(walletAddress, now);
  if (!profile) {
    throw apiError('The updated wallet profile could not be loaded.', 503, 'wallet_token_profile_unavailable');
  }
  if (profile.revision < Number(receipt.profile_revision_after)) {
    throw apiError(
      'The Hangar spend receipt is newer than the available wallet profile.',
      503,
      'wallet_token_profile_unavailable'
    );
  }
  return {
    accepted: true,
    duplicate: true,
    spendId: String(receipt.spend_id),
    action,
    cost: Math.max(0, Math.floor(Number(receipt.amount) || 0)),
    purchasedTokensSpent: Math.max(0, Math.floor(Number(receipt.purchased_tokens_spent) || 0)),
    purchasedTokensAvailable: Math.max(
      0,
      Math.floor(Number(receipt.purchased_tokens_available_after) || 0)
    ),
    profile
  };
};

const applyWalletTokenSpend = async ({
  address,
  spendId,
  expectedRevision,
  action,
  now = Date.now(),
  publicClient = null
}) => {
  const walletAddress = normalizeWalletAddress(address);
  const normalizedSpendId = String(spendId || '').trim().toLowerCase();
  const revision = Number(expectedRevision);
  if (!walletAddress || !SPEND_ID_PATTERN.test(normalizedSpendId)) {
    throw apiError('Valid wallet Token spend details are required.', 400, 'wallet_token_spend_invalid');
  }
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw apiError('A valid wallet profile revision is required.', 400, 'wallet_token_spend_revision_invalid');
  }

  const normalizedAction = normalizeAction(action);
  if (!normalizedAction) {
    throw apiError(
      'This Hangar Token purchase is not available.',
      400,
      'wallet_token_action_invalid'
    );
  }

  const existingReceipt = await fetchWalletTokenSpendReceipt({
    walletAddress,
    spendId: normalizedSpendId
  });
  if (existingReceipt) {
    return duplicateSettlementFromReceipt({
      walletAddress,
      action: normalizedAction,
      receipt: existingReceipt,
      now
    });
  }

  const profile = await fetchWalletProfile(walletAddress, now);
  if (!profile) {
    throw apiError('The wallet profile was not found.', 404, 'wallet_token_profile_missing');
  }
  if (profile.revision !== revision) {
    throw apiError(
      'This wallet profile changed on another device. Reload it before spending Tokens.',
      409,
      'wallet_token_spend_revision_conflict'
    );
  }

  let verifiedPlayerShipAccess = profilePlayerShipUpgradeAccess(profile);
  if (
    normalizedAction.kind === 'upgrade-main-ship'
    && normalizedAction.shipId === 'bio'
  ) {
    const { getBioHoldingStatus } = require('./playerShipAccess');
    const bioStatus = await getBioHoldingStatus({
      address: walletAddress,
      publicClient
    });
    if (bioStatus.verificationStatus !== 'verified') {
      throw apiError(
        'BIO holding verification is temporarily unavailable. No Tokens were spent.',
        503,
        'wallet_token_bio_verification_unavailable'
      );
    }
    verifiedPlayerShipAccess = profilePlayerShipUpgradeAccess(profile, bioStatus);
  }
  const canonical = canonicalWalletTokenSpend({
    profile,
    action: normalizedAction,
    now,
    playerShipAccess: verifiedPlayerShipAccess
  });
  let rawResult;
  try {
    rawResult = await fetchSupabaseJson(`rpc/${APPLY_TOKEN_SPEND_RPC}`, {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify({
        p_wallet_address: walletAddress,
        p_spend_id: normalizedSpendId,
        p_expected_revision: revision,
        p_amount: canonical.cost,
        p_reason: canonical.reason,
        p_next_snapshot: canonical.nextSnapshot
      })
    });
  } catch (error) {
    throw rpcError(error);
  }

  const result = Array.isArray(rawResult) ? rawResult[0] : rawResult;
  if (!result?.accepted) {
    throw apiError('The Hangar Token purchase could not be applied.', 409, 'wallet_token_spend_not_applied');
  }
  const updatedProfile = await fetchWalletProfile(walletAddress, now);
  if (!updatedProfile) {
    throw apiError('The updated wallet profile could not be loaded.', 503, 'wallet_token_profile_unavailable');
  }

  return {
    accepted: true,
    duplicate: Boolean(result.duplicate),
    spendId: normalizedSpendId,
    action: canonical.action,
    cost: canonical.cost,
    purchasedTokensSpent: Math.max(0, Math.floor(Number(result.purchasedTokensSpent) || 0)),
    purchasedTokensAvailable: Math.max(0, Math.floor(Number(result.purchasedTokensAvailable) || 0)),
    profile: updatedProfile
  };
};

module.exports = {
  APPLY_TOKEN_SPEND_RPC,
  LEFT_SLOT_UNLOCK_COST,
  MAIN_SHIP_UPGRADE_COSTS,
  MINI_SHIP_PURCHASE_COSTS,
  MINI_SHIP_UPGRADE_COST_CURVE,
  PLAYER_SHIP_IDS,
  TOKEN_SPENDS_TABLE,
  applyWalletTokenSpend,
  canonicalWalletTokenSpend,
  fetchWalletTokenSpendReceipt,
  normalizeAction
};

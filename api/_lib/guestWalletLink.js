const { isFounderWalletAddress } = require('./founderWallet');
const {
  campaignMasteryStatus,
  fetchWalletProfile,
  sanitizeGuestImports,
  sanitizeWalletSnapshot,
  saveWalletProfile
} = require('./walletProfiles');

const GUEST_PROFILE_ID_PATTERN = /^pilot:[a-z0-9-]{8,80}$/;

const linkError = (message, statusCode, code) => Object.assign(new Error(message), {
  statusCode,
  code
});

const normalizeGuestProfileId = (value) => {
  const guestProfileId = String(value || '').trim().toLowerCase();
  return GUEST_PROFILE_ID_PATTERN.test(guestProfileId) ? guestProfileId : null;
};

const progressSignature = (snapshot) => {
  const clone = JSON.parse(JSON.stringify(snapshot));
  delete clone.guestImports;
  delete clone.selectedShipId;
  if (clone.stats) delete clone.stats.playerName;
  if (clone.weeklyState) {
    delete clone.weeklyState.updatedAt;
    delete clone.weeklyState.weekKey;
  }
  if (clone.permanentState) {
    delete clone.permanentState.updatedAt;
    if (clone.permanentState.campaignProgress) {
      delete clone.permanentState.campaignProgress.updatedAt;
      if (clone.permanentState.campaignProgress.branchProgress) {
        delete clone.permanentState.campaignProgress.branchProgress.updatedAt;
      }
    }
    if (clone.permanentState.bossArchive) {
      delete clone.permanentState.bossArchive.version;
    }
  }
  return JSON.stringify(clone);
};

const isEmptyWalletProgress = (snapshot, walletAddress, now) => (
  progressSignature(snapshot) === progressSignature(sanitizeWalletSnapshot({}, walletAddress, now))
);

const lockPaidFields = (snapshot) => {
  const next = JSON.parse(JSON.stringify(snapshot));
  next.weeklyState.unlockedSlots = {
    ...next.weeklyState.unlockedSlots,
    right: false
  };
  next.weeklyState.weeklyStats = {
    ...next.weeklyState.weeklyStats,
    score: 0,
    weeklyRunAttempts: 0
  };
  const ships = ['researchhub'];
  if (campaignMasteryStatus(next).complete) ships.push('btc');
  next.permanentState.unlockedPlayerShips = ships;
  next.permanentState.playerShipEntitlements = { eth: null, btc: null };
  if (!ships.includes(next.selectedShipId)) next.selectedShipId = 'researchhub';
  return next;
};

const withPersonalBest = (snapshot, guestHighScore, guestBestScore, guestName) => {
  const nextHigh = Math.max(snapshot.stats.highScore, guestHighScore);
  const nextBest = Math.max(snapshot.permanentState.lifetimeStats.bestScore, guestBestScore, nextHigh);
  return {
    ...snapshot,
    stats: {
      ...snapshot.stats,
      highScore: nextHigh,
      playerName: snapshot.stats.playerName || guestName
    },
    permanentState: {
      ...snapshot.permanentState,
      lifetimeStats: {
        ...snapshot.permanentState.lifetimeStats,
        bestScore: nextBest
      }
    }
  };
};

/**
 * Reconcile one device guest profile into a verified wallet profile.
 * Ranked rows are not touched. Coins are never added together. A guest import
 * receipt is written once so the same device cannot replay currencies or
 * paid loadout onto this wallet. An existing wallet keeps its own coins,
 * weekly score, hangar, and paid ships; only a higher personal best moves.
 * An empty wallet may adopt the guest gameplay snapshot once, with RSC and
 * paid-ship fields removed.
 */
const planGuestWalletLink = ({
  walletAddress,
  currentSnapshot = null,
  guestSnapshot,
  guestProfileId,
  now = Date.now()
}) => {
  const guestId = normalizeGuestProfileId(guestProfileId);
  if (!guestId) {
    throw linkError('A device guest profile is required.', 400, 'guest_link_invalid');
  }
  if (isFounderWalletAddress(walletAddress)) {
    return {
      changed: false,
      applied: false,
      reason: 'founder',
      snapshot: currentSnapshot
    };
  }

  const base = currentSnapshot
    ? sanitizeWalletSnapshot(currentSnapshot, walletAddress, now)
    : sanitizeWalletSnapshot({}, walletAddress, now);
  const guest = lockPaidFields(sanitizeWalletSnapshot(guestSnapshot, walletAddress, now));
  const guestHighScore = guest.stats.highScore;
  const guestBestScore = guest.permanentState.lifetimeStats.bestScore;
  const existingImports = sanitizeGuestImports(base.guestImports);
  const alreadyLinked = existingImports.some((entry) => entry.id === guestId);
  const empty = !currentSnapshot || isEmptyWalletProgress(base, walletAddress, now);
  const importedAt = new Date(now).toISOString();
  const nextLedger = alreadyLinked
    ? existingImports.map((entry) => (
      entry.id === guestId && guestHighScore > entry.highScore
        ? { ...entry, highScore: guestHighScore, at: importedAt }
        : entry
    ))
    : existingImports.concat({
      id: guestId,
      at: importedAt,
      highScore: guestHighScore
    }).slice(0, 24);

  if (alreadyLinked || !empty) {
    const merged = withPersonalBest(base, guestHighScore, guestBestScore, guest.stats.playerName);
    merged.guestImports = nextLedger;
    const changed = merged.stats.highScore !== base.stats.highScore
      || merged.permanentState.lifetimeStats.bestScore !== base.permanentState.lifetimeStats.bestScore
      || merged.stats.playerName !== base.stats.playerName
      || JSON.stringify(merged.guestImports) !== JSON.stringify(base.guestImports);
    return {
      changed,
      applied: changed,
      reason: alreadyLinked ? 'already-linked' : 'keep-wallet-progress',
      snapshot: changed ? merged : base
    };
  }

  const adopted = withPersonalBest(guest, guestHighScore, guestBestScore, guest.stats.playerName);
  adopted.guestImports = nextLedger;
  adopted.stats.totalCoins = guest.stats.totalCoins;
  adopted.weeklyState = {
    ...guest.weeklyState,
    profileId: base.weeklyState.profileId,
    coins: guest.weeklyState.coins,
    durableCampaignCoins: Math.min(guest.weeklyState.coins, guest.weeklyState.durableCampaignCoins)
  };
  return {
    changed: true,
    applied: true,
    reason: 'adopt-empty-wallet',
    snapshot: adopted
  };
};

const linkGuestWalletProfile = async ({
  address,
  guestProfileId,
  guestSnapshot,
  now = Date.now()
}) => {
  const current = await fetchWalletProfile(address, now);
  const plan = planGuestWalletLink({
    walletAddress: address,
    currentSnapshot: current?.snapshot ?? null,
    guestSnapshot,
    guestProfileId,
    now
  });
  if (!plan.changed || !plan.snapshot) {
    return {
      profile: current,
      guestLink: { applied: false, reason: plan.reason }
    };
  }
  const profile = await saveWalletProfile({
    address,
    expectedRevision: current?.revision ?? 0,
    snapshot: plan.snapshot,
    guestImportLedger: plan.snapshot.guestImports,
    now
  });
  return {
    profile,
    guestLink: { applied: true, reason: plan.reason }
  };
};

module.exports = {
  isEmptyWalletProgress,
  linkGuestWalletProfile,
  normalizeGuestProfileId,
  planGuestWalletLink
};

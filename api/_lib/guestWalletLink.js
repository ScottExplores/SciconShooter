const { fetchWalletProfile } = require('./walletProfiles');

const GUEST_PROFILE_ID_PATTERN = /^pilot:[a-z0-9-]{8,80}$/;

const linkError = (message, statusCode, code) => Object.assign(new Error(message), {
  statusCode,
  code
});

const normalizeGuestProfileId = (value) => {
  const guestProfileId = String(value || '').trim().toLowerCase();
  return GUEST_PROFILE_ID_PATTERN.test(guestProfileId) ? guestProfileId : null;
};

/**
 * Device guest saves are not authenticated gameplay. This plan never copies
 * them into a wallet profile: no coins, unlocks, campaign, weekly score, or
 * personal best. Ranked rows are not touched. The guest save stays on device.
 * An empty authenticated profile is left empty rather than seeded by a guest id.
 */
const planGuestWalletLink = ({
  currentSnapshot = null,
  guestSnapshot,
  guestProfileId
}) => {
  const guestId = normalizeGuestProfileId(guestProfileId);
  if (!guestId) {
    throw linkError('A device guest profile is required.', 400, 'guest_link_invalid');
  }
  void guestSnapshot;
  return {
    changed: false,
    applied: false,
    reason: 'guest-stays-on-device',
    snapshot: currentSnapshot
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
    currentSnapshot: current?.snapshot ?? null,
    guestSnapshot,
    guestProfileId
  });
  return {
    profile: current,
    guestLink: { applied: false, reason: plan.reason }
  };
};

module.exports = {
  linkGuestWalletProfile,
  normalizeGuestProfileId,
  planGuestWalletLink
};

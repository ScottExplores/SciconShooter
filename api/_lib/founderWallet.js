// The project treasury wallet. Client unlocks compare DONATION_CONFIG.RECIPIENT_ADDRESS
// to the connected account. Server score admission uses the same address, overridable
// only through PILOT_TEST_WALLET so a deployment can rotate the founder key.
const DEFAULT_FOUNDER_WALLET = '0x3a8d692aabdd4981080a8f6af8375a21359464bf';

const founderWalletAddress = () => String(
  process.env.PILOT_TEST_WALLET || DEFAULT_FOUNDER_WALLET
).trim().toLowerCase();

const isFounderWalletAddress = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(normalized) && normalized === founderWalletAddress();
};

module.exports = {
  DEFAULT_FOUNDER_WALLET,
  founderWalletAddress,
  isFounderWalletAddress
};

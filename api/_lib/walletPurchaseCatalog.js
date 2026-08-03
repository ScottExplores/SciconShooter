const BASE_CHAIN_ID = 8453;
const RSC_DECIMALS = 18;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const RSC_CONTRACT_ADDRESS = '0xfbb75a59193a3525a8825bebe7d4b56899e2f7e1';
const RSC_CONTINUE_RECIPIENT_ADDRESS = '0x3a8d692aabdd4981080a8f6af8375a21359464bf';
const MAX_WALLET_PROFILE_TOKENS = 1_000_000_000;
const WALLET_PURCHASE_ORDER_LIFETIME_MS = 15 * 60 * 1000;
const addressPattern = /^0x[0-9a-f]{40}$/;
const RSC_TOKEN_EXCHANGE_ENABLED = (
  String(process.env.ENABLE_RSC_TOKEN_EXCHANGE || '').trim().toLowerCase() === 'true'
);

const configuredStoreRecipient = (purchaserAddress = '') => {
  const address = String(process.env.RSC_STORE_RECIPIENT_ADDRESS || '').trim().toLowerCase();
  const purchaser = String(purchaserAddress || '').trim().toLowerCase();
  if (
    !addressPattern.test(address)
    || address === ZERO_ADDRESS
    || address === RSC_CONTRACT_ADDRESS
    || address === RSC_CONTINUE_RECIPIENT_ADDRESS
    || (addressPattern.test(purchaser) && address === purchaser)
  ) return null;
  return address;
};

const WALLET_PURCHASE_SKUS = Object.freeze({
  'right-support': Object.freeze({
    id: 'right-support',
    rscAmount: '10',
    rscAmountRaw: '10000000000000000000',
    tokenReward: 0,
    grantsRightSupport: true,
    weeklyAttemptReward: 0,
    enabled: true
  }),
  'weekly-run-attempt': Object.freeze({
    id: 'weekly-run-attempt',
    rscAmount: '3',
    rscAmountRaw: '3000000000000000000',
    tokenReward: 0,
    grantsRightSupport: false,
    weeklyAttemptReward: 1,
    enabled: true
  }),
  'tokens-500': Object.freeze({
    id: 'tokens-500',
    rscAmount: '1',
    rscAmountRaw: '1000000000000000000',
    tokenReward: 500,
    grantsRightSupport: false,
    weeklyAttemptReward: 0,
    enabled: RSC_TOKEN_EXCHANGE_ENABLED
  }),
  'tokens-2500': Object.freeze({
    id: 'tokens-2500',
    rscAmount: '5',
    rscAmountRaw: '5000000000000000000',
    tokenReward: 2500,
    grantsRightSupport: false,
    weeklyAttemptReward: 0,
    enabled: RSC_TOKEN_EXCHANGE_ENABLED
  }),
  'tokens-5000': Object.freeze({
    id: 'tokens-5000',
    rscAmount: '10',
    rscAmountRaw: '10000000000000000000',
    tokenReward: 5000,
    grantsRightSupport: false,
    weeklyAttemptReward: 0,
    enabled: RSC_TOKEN_EXCHANGE_ENABLED
  })
});

const walletPurchaseSku = (value) => (
  typeof value === 'string' ? WALLET_PURCHASE_SKUS[value] || null : null
);

module.exports = {
  BASE_CHAIN_ID,
  MAX_WALLET_PROFILE_TOKENS,
  RSC_CONTINUE_RECIPIENT_ADDRESS,
  RSC_CONTRACT_ADDRESS,
  RSC_DECIMALS,
  RSC_TOKEN_EXCHANGE_ENABLED,
  ZERO_ADDRESS,
  WALLET_PURCHASE_ORDER_LIFETIME_MS,
  WALLET_PURCHASE_SKUS,
  configuredStoreRecipient,
  walletPurchaseSku
};

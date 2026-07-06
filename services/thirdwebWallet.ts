import { createThirdwebClient } from 'thirdweb';
import { base } from 'thirdweb/chains';
import { darkTheme } from 'thirdweb/react';
import { createWallet, inAppWallet } from 'thirdweb/wallets';
import { ASSETS, DONATION_CONFIG } from '../constants';

// thirdweb client IDs are public browser identifiers. Keep Vercel env support,
// but ship a fallback so wallet connect does not disappear if env vars are missed.
const fallbackThirdwebClientId = '23842a2bdbe53652f0cae531907a3530';

export const thirdwebClientId = (
  (import.meta.env.VITE_THIRDWEB_CLIENT_ID as string | undefined)?.trim() ||
  fallbackThirdwebClientId
);

export const thirdwebClient = thirdwebClientId
  ? createThirdwebClient({ clientId: thirdwebClientId })
  : null;

export const thirdwebBaseChain = base;

const baseAccountWallet = createWallet('org.base.account');
const thirdwebAuthRedirectUrl =
  typeof window === 'undefined'
    ? DONATION_CONFIG.GAME_URL
    : `${window.location.origin}${window.location.pathname}`;

export const thirdwebWallets = [
  inAppWallet({
    auth: {
      mode: 'redirect',
      redirectUrl: thirdwebAuthRedirectUrl,
      options: ['google', 'discord', 'telegram', 'farcaster', 'email', 'x']
    }
  }),
  baseAccountWallet,
  createWallet('io.metamask'),
  createWallet('me.rainbow'),
  createWallet('io.rabby'),
  createWallet('com.binance.wallet'),
  createWallet('com.coinbase.wallet'),
  createWallet('com.ledger'),
  createWallet('com.trustwallet.app')
];

export const thirdwebRecommendedWallets = [baseAccountWallet];

export const thirdwebTheme = darkTheme({
  colors: {
    accentText: 'hsl(190, 58%, 56%)',
    accentButtonBg: 'hsl(168, 84%, 36%)',
    modalBg: 'hsl(220, 38%, 8%)',
    borderColor: 'hsla(188, 72%, 62%, 0.22)'
  }
});

export const thirdwebAppMetadata = {
  name: 'SciCon Shooter',
  url: DONATION_CONFIG.GAME_URL,
  description: 'Upgrade with RSC. Fight bottlenecks. Steer funding credits.',
  logoUrl: `${DONATION_CONFIG.GAME_URL}/icon.png`
};

export const thirdwebConnectModal = {
  showThirdwebBranding: false,
  size: 'compact' as const,
  title: 'Connect Wallet',
  titleIcon: ASSETS.REAL_RSC_ICON
};

export const rscTokenInfo = {
  address: DONATION_CONFIG.RSC_CONTRACT_ADDRESS,
  name: 'ResearchCoin',
  symbol: 'RSC',
  icon: ASSETS.REAL_RSC_ICON
};

export const usdcTokenInfo = {
  address: DONATION_CONFIG.USDC_CONTRACT_ADDRESS,
  name: 'USD Coin',
  symbol: 'USDC',
  icon: 'https://assets.coingecko.com/coins/images/6319/standard/usdc.png?1696506694'
};

export const thirdwebSupportedTokens = {
  [thirdwebBaseChain.id]: [
    rscTokenInfo,
    usdcTokenInfo
  ]
};

export const thirdwebPaymentConnectOptions = {
  wallets: thirdwebWallets,
  recommendedWallets: thirdwebRecommendedWallets,
  chain: thirdwebBaseChain,
  appMetadata: thirdwebAppMetadata,
  connectModal: thirdwebConnectModal,
  autoConnect: { timeout: 10000 },
  showAllWallets: true
};

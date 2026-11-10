import { connectorsForWallets, type WalletList } from '@rainbow-me/rainbowkit';
import {
  baseAccount,
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  okxWallet,
  phantomWallet,
  rabbyWallet,
  rainbowWallet,
  trustWallet,
  walletConnectWallet
} from '@rainbow-me/rainbowkit/wallets';
import { createConfig, http } from 'wagmi';
import { base } from 'wagmi/chains';
import { DONATION_CONFIG } from '../constants';
import { walletConnectProjectId } from './evmWalletDiscovery';

type RainbowWallet = {
  id: string;
  installed?: boolean;
  qrCode?: unknown;
  mobile?: unknown;
  hidden?: boolean | (() => boolean);
};

type RainbowWalletFactory = (params: {
  appName: string;
  projectId: string;
  appIcon?: string;
  walletConnectParameters?: object;
}) => RainbowWallet;

const POPULAR_WALLETS: RainbowWalletFactory[] = [
  rabbyWallet,
  metaMaskWallet,
  baseAccount,
  coinbaseWallet,
  rainbowWallet,
  phantomWallet,
  trustWallet,
  okxWallet,
  injectedWallet
];

const INJECTED_WITHOUT_WALLETCONNECT = new Set([
  'rabby',
  'phantom',
  'baseAccount',
  'coinbase',
  'injected'
]);

/**
 * Without a WalletConnect project id, drop QR and mobile deep links that would
 * call WalletConnect. Injected wallets and the Base Account / Coinbase SDK
 * connectors stay available.
 */
const hideWalletConnectQr = (factory: RainbowWalletFactory): RainbowWalletFactory => (params) => {
  const wallet = factory(params);
  if (INJECTED_WITHOUT_WALLETCONNECT.has(wallet.id)) {
    return { ...wallet, qrCode: undefined };
  }
  return {
    ...wallet,
    qrCode: undefined,
    mobile: undefined,
    hidden: () => wallet.installed !== true
  };
};

export const sciconRainbowWallets = (projectId: string): RainbowWalletFactory[] => {
  const wallets = projectId
    ? POPULAR_WALLETS
    : POPULAR_WALLETS.map(hideWalletConnectQr);
  return projectId ? [...wallets, walletConnectWallet] : wallets;
};

const projectId = walletConnectProjectId();

export const sciconWagmiConfig = createConfig({
  chains: [base],
  connectors: connectorsForWallets(
    [{
      groupName: 'Wallets',
      wallets: sciconRainbowWallets(projectId) as WalletList[number]['wallets']
    }],
    {
      appName: 'SciCon Shooter',
      appDescription: 'SciCon Shooter on Base',
      appUrl: 'https://www.sciconshooter.xyz',
      appIcon: `${DONATION_CONFIG.GAME_URL}/icon.png`,
      projectId: projectId || 'unconfigured'
    }
  ),
  transports: {
    [base.id]: http(DONATION_CONFIG.BASE_RPC_URL)
  },
  ssr: false,
  multiInjectedProviderDiscovery: true
});

export type EvmWalletMethod = 'base-account' | 'injected' | 'walletconnect' | 'handoff';

export interface AnnouncedEvmProvider {
  uuid: string;
  name: string;
  rdns: string;
  icon?: string;
}

export interface WalletChoice {
  id: string;
  method: EvmWalletMethod;
  title: string;
  detail: string;
  rdns?: string;
  icon?: string;
  handoffUrl?: string;
}

const KNOWN_WALLET_NAMES: Record<string, string> = {
  'io.metamask': 'MetaMask',
  'io.rabby': 'Rabby',
  'com.coinbase.wallet': 'Coinbase Wallet'
};

export const walletConnectProjectId = () => {
  const projectId = (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined)?.trim() || '';
  return projectId.length >= 8 ? projectId : '';
};

export const walletConnectConfigured = (projectId?: string | null) => (
  Boolean(projectId && projectId.trim().length >= 8)
);

export const buildMobileHandoffUrl = (
  kind: 'metamask' | 'coinbase',
  pageUrl: string
) => {
  const url = new URL(pageUrl);
  if (kind === 'metamask') {
    return `https://metamask.app.link/dapp/${url.host}${url.pathname}${url.search}`;
  }
  return `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url.toString())}`;
};

export const buildWalletChoices = ({
  announced,
  mobile,
  pageUrl,
  walletConnectProjectId: projectId
}: {
  announced: AnnouncedEvmProvider[];
  mobile: boolean;
  pageUrl: string;
  walletConnectProjectId?: string | null;
}): WalletChoice[] => {
  const choices: WalletChoice[] = [{
    id: 'base-account',
    method: 'base-account',
    title: 'Base Account',
    detail: 'Coinbase Base'
  }];
  const seen = new Set<string>();
  announced.forEach((provider) => {
    const rdns = provider.rdns?.trim().toLowerCase();
    if (!rdns || seen.has(rdns)) return;
    seen.add(rdns);
    choices.push({
      id: `injected:${rdns}`,
      method: 'injected',
      title: KNOWN_WALLET_NAMES[rdns] || provider.name?.trim() || 'Browser wallet',
      detail: 'Installed wallet',
      rdns,
      icon: provider.icon
    });
  });
  if (mobile && !seen.has('io.metamask')) {
    choices.push({
      id: 'handoff:metamask',
      method: 'handoff',
      title: 'MetaMask',
      detail: 'Open in the app',
      handoffUrl: buildMobileHandoffUrl('metamask', pageUrl)
    });
  }
  if (mobile && !seen.has('com.coinbase.wallet')) {
    choices.push({
      id: 'handoff:coinbase',
      method: 'handoff',
      title: 'Coinbase Wallet',
      detail: 'Open in the app',
      handoffUrl: buildMobileHandoffUrl('coinbase', pageUrl)
    });
  }
  if (walletConnectConfigured(projectId)) {
    choices.push({
      id: 'walletconnect',
      method: 'walletconnect',
      title: 'WalletConnect',
      detail: mobile ? 'Phone wallet' : 'QR code'
    });
  }
  return choices;
};

export const shouldApplyWalletResult = (
  requestGeneration: number,
  currentGeneration: number
) => requestGeneration === currentGeneration;

/**
 * The committed provider stays in place until a signature succeeds.
 * Reject and cancel restore it, including when nothing was committed.
 */
export const providerAfterAttempt = <T>(
  committed: T | null,
  pending: T,
  outcome: 'authorized' | 'rejected' | 'cancelled'
): T | null => (
  outcome === 'authorized' ? pending : committed
);

/** Base Account keeps its SDK listeners. Injected and WalletConnect need theirs. */
export const accountEventProvider = <T extends { method: string; provider: unknown }>(
  session: T | null
): T['provider'] | null => {
  if (!session || session.method === 'base-account') return null;
  if (session.method !== 'injected' && session.method !== 'walletconnect') return null;
  return session.provider;
};

import type { Address, Hex } from 'viem';
import { stringToHex } from 'viem';
import { DONATION_CONFIG, STORAGE_KEYS } from '../constants';

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export type EvmConnectorMethod = 'base-account' | 'injected' | 'walletconnect';

export interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
  disconnect?: () => Promise<void>;
}

export interface ActiveEvmSession {
  method: EvmConnectorMethod;
  name: string;
  rdns?: string;
  provider: Eip1193Provider;
}

export interface CachedWalletConnector {
  method: EvmConnectorMethod;
  name: string;
  rdns?: string;
}

const BASE_CHAIN_PARAMS = {
  chainId: DONATION_CONFIG.BASE_CHAIN_ID_HEX,
  chainName: 'Base',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: [DONATION_CONFIG.BASE_RPC_URL],
  blockExplorerUrls: [DONATION_CONFIG.EXPLORER_BASE_URL]
};

let activeSession: ActiveEvmSession | null = null;

const storage = () => (typeof window === 'undefined' ? null : window.localStorage);

export const getActiveEvmSession = () => activeSession;

export const setActiveEvmSession = (session: ActiveEvmSession | null) => {
  activeSession = session;
  if (!session) return;
  try {
    storage()?.setItem(STORAGE_KEYS.WALLET_CONNECTOR, JSON.stringify({
      method: session.method,
      name: session.name,
      rdns: session.rdns || ''
    }));
  } catch {
    // The address cache remains the reload hint when connector metadata cannot be stored.
  }
};

export const clearActiveEvmSession = () => {
  activeSession = null;
  try {
    storage()?.removeItem(STORAGE_KEYS.WALLET_CONNECTOR);
  } catch {
    // Disconnect still clears the in-memory provider.
  }
};

export const readCachedWalletConnector = (): CachedWalletConnector | null => {
  try {
    const raw = storage()?.getItem(STORAGE_KEYS.WALLET_CONNECTOR);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedWalletConnector>;
    if (
      parsed.method !== 'base-account'
      && parsed.method !== 'injected'
      && parsed.method !== 'walletconnect'
    ) return null;
    const name = typeof parsed.name === 'string' ? parsed.name.trim().slice(0, 48) : '';
    if (!name) return null;
    return {
      method: parsed.method,
      name,
      rdns: typeof parsed.rdns === 'string' ? parsed.rdns.trim().toLowerCase() : undefined
    };
  } catch {
    return null;
  }
};

const parseAddress = (value: unknown): Address | null => {
  const raw = typeof value === 'string' && value.includes(':')
    ? value.split(':').at(-1)
    : value;
  if (typeof raw !== 'string') return null;
  const address = raw.trim();
  return ADDRESS_PATTERN.test(address) ? address as Address : null;
};

export const readProviderAccounts = (value: unknown): Address[] | null => {
  if (!Array.isArray(value)) return null;
  const accounts = value.map(parseAddress);
  return accounts.every((address): address is Address => Boolean(address)) ? accounts : null;
};

export const ensureBaseChain = async (provider: Eip1193Provider) => {
  const reported = await provider.request({ method: 'eth_chainId' });
  let chainId: bigint;
  try {
    chainId = BigInt(String(reported));
  } catch {
    throw new Error('The wallet returned an invalid network.');
  }
  if (chainId === BigInt(DONATION_CONFIG.BASE_CHAIN_ID)) return;
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: DONATION_CONFIG.BASE_CHAIN_ID_HEX }]
    });
  } catch (error) {
    const code = (error as { code?: number })?.code;
    if (code !== 4902) throw error;
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [BASE_CHAIN_PARAMS]
    });
  }
};

export const signInjectedWalletMessage = async (
  provider: Eip1193Provider,
  address: Address,
  message: string
): Promise<Hex> => {
  const response = await provider.request({
    method: 'personal_sign',
    params: [stringToHex(message), address]
  });
  const signature = typeof response === 'string'
    ? response
    : (response as { signature?: string; result?: string } | null)?.signature
      || (response as { result?: string } | null)?.result;
  if (!signature || !signature.startsWith('0x')) {
    throw new Error('The wallet did not return a message signature.');
  }
  return signature as Hex;
};

export const sendBaseTransaction = async (
  provider: Eip1193Provider,
  call: { from: Address; to: Address; data?: Hex; value?: Hex }
): Promise<Hex> => {
  await ensureBaseChain(provider);
  const hash = await provider.request({
    method: 'eth_sendTransaction',
    params: [{
      from: call.from,
      to: call.to,
      data: call.data || '0x',
      value: call.value || '0x0'
    }]
  });
  if (typeof hash !== 'string' || !hash.startsWith('0x')) {
    throw new Error('The wallet did not return a Base transaction.');
  }
  return hash as Hex;
};

const walletConnectMetadata = () => {
  const page = typeof window === 'undefined'
    ? DONATION_CONFIG.GAME_URL
    : window.location.origin;
  const origin = page.startsWith('http') ? page : `https://${page}`;
  return {
    name: 'Scicon Shooter',
    description: 'Scicon Shooter on Base',
    url: origin,
    icons: [`${origin}/icon.png`]
  };
};

const initWalletConnect = async (projectId: string) => {
  const { EthereumProvider } = await import('@walletconnect/ethereum-provider');
  return EthereumProvider.init({
    projectId,
    chains: [DONATION_CONFIG.BASE_CHAIN_ID],
    showQrModal: false,
    rpcMap: { [DONATION_CONFIG.BASE_CHAIN_ID]: DONATION_CONFIG.BASE_RPC_URL },
    metadata: walletConnectMetadata(),
    methods: [
      'eth_sendTransaction',
      'personal_sign',
      'eth_signTypedData_v4',
      'wallet_switchEthereumChain',
      'wallet_addEthereumChain'
    ],
    events: ['accountsChanged', 'chainChanged', 'disconnect']
  });
};

export const connectWalletConnect = async ({
  projectId,
  onDisplayUri
}: {
  projectId: string;
  onDisplayUri: (uri: string) => void;
}) => {
  const provider = await initWalletConnect(projectId);
  const handleUri = (uri: string) => onDisplayUri(uri);
  provider.on('display_uri', handleUri);
  try {
    if (!provider.session) await provider.connect();
    const accounts = readProviderAccounts(await provider.request({ method: 'eth_accounts' }));
    const address = accounts?.[0];
    if (!address) throw new Error('WalletConnect connected without a valid address.');
    return { provider: provider as Eip1193Provider, address };
  } finally {
    provider.removeListener('display_uri', handleUri);
  }
};

export const restoreWalletConnectSession = async (projectId: string) => {
  const provider = await initWalletConnect(projectId);
  if (!provider.session) {
    await provider.disconnect().catch(() => undefined);
    return null;
  }
  const accounts = readProviderAccounts(provider.accounts);
  const address = accounts?.[0];
  if (!address) return null;
  return { provider: provider as Eip1193Provider, address };
};

export const connectInjectedProvider = async (provider: Eip1193Provider): Promise<Address> => {
  const response = await provider.request({ method: 'eth_requestAccounts' });
  const accounts = readProviderAccounts(response);
  if (!accounts?.[0]) throw new Error('The wallet connected without a valid address.');
  await ensureBaseChain(provider);
  return accounts[0];
};

import type { EvmConnectorMethod } from './evmWalletSession';

const INJECTED_RDNS: Record<string, string> = {
  metamask: 'io.metamask',
  rabby: 'io.rabby',
  coinbase: 'com.coinbase.wallet',
  coinbasewalletsdk: 'com.coinbase.wallet',
  rainbow: 'me.rainbow',
  phantom: 'app.phantom',
  trust: 'com.trustwallet.app',
  okx: 'com.okex.wallet'
};

/**
 * RainbowKit chooses the wallet. The game still classifies the provider so
 * Base Account keeps wallet_sendCalls and every other wallet keeps
 * eth_sendTransaction.
 */
export const rainbowConnectorMethod = (
  connector: { id?: string; type?: string }
): EvmConnectorMethod => {
  const id = (connector.id || '').replace(/\s+/g, '').toLowerCase();
  const type = (connector.type || '').toLowerCase();
  if (id === 'baseaccount' || type === 'baseaccount') return 'base-account';
  if (id === 'walletconnect' || type === 'walletconnect' || id.includes('walletconnect')) {
    return 'walletconnect';
  }
  return 'injected';
};

export const rainbowConnectorRdns = (
  connector: { id?: string; rdns?: string | readonly string[] }
): string | undefined => {
  const rdnsValue = Array.isArray(connector.rdns) ? connector.rdns[0] : connector.rdns;
  const explicit = rdnsValue?.trim().toLowerCase();
  if (explicit) return explicit;
  const id = (connector.id || '').replace(/\s+/g, '').toLowerCase();
  return INJECTED_RDNS[id];
};

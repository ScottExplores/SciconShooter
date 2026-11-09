import type { Hex } from 'viem';

export type PendingPurchaseConfirmation =
  | { kind: 'receipt'; transactionHash: Hex }
  | { kind: 'calls'; callsId: Hex }
  | { kind: 'hash'; transactionHash: Hex }
  | { kind: 'none' };

/**
 * Reload confirmation for a Hangar Research Coin purchase.
 * An injected or WalletConnect submission stores only the transaction hash and
 * must wait for that receipt. A Base Account wallet_sendCalls submission stores
 * the calls id until the batch reports its hash. A hash recorded after the
 * calls batch completed is already confirmed.
 */
export const selectPendingPurchaseConfirmation = (pending: {
  callsId?: Hex;
  transactionHash?: Hex;
}): PendingPurchaseConfirmation => {
  if (pending.transactionHash && !pending.callsId) {
    return { kind: 'receipt', transactionHash: pending.transactionHash };
  }
  if (pending.callsId && !pending.transactionHash) {
    return { kind: 'calls', callsId: pending.callsId };
  }
  if (pending.transactionHash) {
    return { kind: 'hash', transactionHash: pending.transactionHash };
  }
  return { kind: 'none' };
};

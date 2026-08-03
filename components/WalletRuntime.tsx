import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Address } from 'viem';
import {
  DONATION_CONFIG,
  STORAGE_KEYS,
  type RscPurchaseSkuId
} from '../constants';
import { DonationStatus, WalletSession } from '../types';
import {
  baseAccountProvider,
  connectBaseAccount,
  disconnectBaseAccount,
  getRscBalance,
  sendRscContinuePayment,
  signBaseAccountMessage,
  switchBaseAccount,
  type RscBalanceSnapshot
} from '../services/baseAccountWallet';
import {
  executeWalletPurchase,
  resumePendingWalletPurchase,
  type WalletPurchaseSettlement
} from '../services/walletPurchaseService';
import { readPendingWalletPurchase } from '../services/walletPurchasePendingStore';
import type { RunReceipt } from '../services/runReceiptService';
import { claimWeeklyChampionProposal } from '../services/weeklyClaimService';
import type { ResearchHubProposal } from '../services/researchHubProposals';
import { mintMissionRecord } from '../services/recordMintService';

export type WalletRuntimeAction =
  | { nonce: number; type: 'connect' }
  | { nonce: number; type: 'switch-account' }
  | { nonce: number; type: 'disconnect' }
  | { nonce: number; type: 'continue' }
  | { nonce: number; type: 'refresh-rsc-balance' }
  | { nonce: number; type: 'purchase-rsc'; skuId: RscPurchaseSkuId }
  | { nonce: number; type: 'claim-champion'; weekKey: string; proposal: ResearchHubProposal }
  | { nonce: number; type: 'mint-mission'; receipt: RunReceipt };

interface ContinueStatusUpdate {
  status: DonationStatus;
  error?: string;
  hash?: string;
}

export interface RscBalanceUpdate {
  status: 'idle' | 'loading' | 'ready' | 'error';
  balance: RscBalanceSnapshot | null;
  error?: string;
}

export interface WalletPurchaseStatusUpdate {
  status: 'idle' | 'connecting' | 'authorizing' | 'confirming' | 'settling' | 'confirmed' | 'error';
  skuId?: RscPurchaseSkuId;
  transactionHash?: string;
  error?: string;
}

interface WalletRuntimeProps {
  action: WalletRuntimeAction | null;
  continueCost: number;
  donatedWallets: Record<string, boolean>;
  isContinuePaymentBusy: boolean;
  walletError: string;
  onActionHandled: (nonce: number) => void;
  onContinueStatusChange: (update: ContinueStatusUpdate) => void;
  onContinueSuccess: (transactionHash: string) => void;
  onWalletChange: (wallet: WalletSession) => void;
  onWalletError: (message: string) => void;
  /** Optional until App wires the Hangar's Research Coin rail. */
  onRscBalanceChange?: (update: RscBalanceUpdate) => void;
  /** Optional purchase lifecycle callback for right-support and Token packs. */
  onWalletPurchaseStatus?: (update: WalletPurchaseStatusUpdate) => void;
  /** Apply the returned authoritative profile; do not recreate the reward client-side. */
  onWalletPurchaseSuccess?: (settlement: WalletPurchaseSettlement) => void;
  onChampionClaimStatus: (status: 'idle' | 'connecting' | 'signing' | 'confirmed' | 'error', message?: string) => void;
  onMissionMintStatus: (status: 'idle' | 'authorizing' | 'confirming' | 'confirmed' | 'error', message?: string, hash?: string) => void;
}

const getCachedBaseAccount = (): Address | null => {
  try {
    const address = localStorage.getItem(STORAGE_KEYS.WALLET_ADDRESS);
    return address && /^0x[a-fA-F0-9]{40}$/.test(address)
      ? address as Address
      : null;
  } catch {
    return null;
  }
};

const getUserFacingMessage = (error: any, fallback: string, tokenLabel = 'RSC') => {
  const message = error?.shortMessage || error?.message || fallback;

  // A blocked popup surfaces as a generic open/close failure. Reporting it as
  // "cancelled" tells a desktop player nothing actionable, and this is the most
  // common reason connecting appears to do nothing on desktop.
  if (/popup|pop-up|blocked|window\.open|failed to open/i.test(message)) {
    return 'Your browser blocked the Base sign-in window. Allow pop-ups for this site, then connect again.';
  }

  if (/rejected|denied|cancelled|canceled|closed modal|request rejected/i.test(message)) {
    return fallback;
  }

  if (/insufficient|not enough/i.test(message)) {
    return `Not enough ${tokenLabel} or gas for that action.`;
  }

  if (/cannot unmarshal|invalid argument|invalid params|json:/i.test(message)) {
    return 'Base could not finish syncing that transaction. Check wallet activity before retrying.';
  }

  return message;
};

const WalletRuntime: React.FC<WalletRuntimeProps> = ({
  action,
  continueCost,
  donatedWallets,
  isContinuePaymentBusy,
  walletError,
  onActionHandled,
  onContinueStatusChange,
  onContinueSuccess,
  onWalletChange,
  onWalletError,
  onRscBalanceChange,
  onWalletPurchaseStatus,
  onWalletPurchaseSuccess,
  onChampionClaimStatus,
  onMissionMintStatus
}) => {
  const [activeWalletAddress, setActiveWalletAddress] = useState<Address | null>(getCachedBaseAccount);
  const [isConnecting, setIsConnecting] = useState(false);
  const startedActionNonceRef = useRef<number | null>(null);
  const purchaseBusyRef = useRef(false);
  const activeWalletAddressRef = useRef<Address | null>(activeWalletAddress);
  const resumedPurchaseOrdersRef = useRef(new Set<string>());

  useEffect(() => {
    activeWalletAddressRef.current = activeWalletAddress;
  }, [activeWalletAddress]);

  const wallet = useMemo<WalletSession>(() => ({
    address: activeWalletAddress,
    chainId: activeWalletAddress ? DONATION_CONFIG.BASE_CHAIN_ID : null,
    status: isConnecting ? 'connecting' : activeWalletAddress ? 'connected' : walletError ? 'error' : 'idle',
    error: walletError,
    connectorName: activeWalletAddress ? 'Base Account' : undefined,
    hasDonated: activeWalletAddress ? Boolean(donatedWallets[activeWalletAddress.toLowerCase()]) : false
  }), [activeWalletAddress, donatedWallets, isConnecting, walletError]);

  useEffect(() => {
    onWalletChange(wallet);
  }, [onWalletChange, wallet]);

  useEffect(() => {
    let active = true;
    const handleAccountsChanged = (accounts: string[]) => {
      if (active) {
        const nextAddress = (accounts[0] as Address | undefined) || null;
        if (!nextAddress) localStorage.removeItem(STORAGE_KEYS.WALLET_ADDRESS);
        activeWalletAddressRef.current = nextAddress;
        setActiveWalletAddress(nextAddress);
      }
    };
    const handleDisconnect = () => {
      if (!active) return;
      localStorage.removeItem(STORAGE_KEYS.WALLET_ADDRESS);
      activeWalletAddressRef.current = null;
      setActiveWalletAddress(null);
    };

    // A provider request during mount can queue the Base Account popup until
    // the next trusted tap. That steals Start Mission / Boss Archive button
    // presses. Restore the last explicit connection from storage and let
    // provider events or an explicit wallet action reconcile it instead.
    baseAccountProvider.on('accountsChanged', handleAccountsChanged);
    baseAccountProvider.on('disconnect', handleDisconnect);
    return () => {
      active = false;
      baseAccountProvider.removeListener('accountsChanged', handleAccountsChanged);
      baseAccountProvider.removeListener('disconnect', handleDisconnect);
    };
  }, []);

  const connectWallet = useCallback(async () => {
    if (activeWalletAddress) {
      onWalletError('');
      return activeWalletAddress;
    }

    setIsConnecting(true);
    try {
      onWalletError('');
      const address = await connectBaseAccount();
      activeWalletAddressRef.current = address;
      setActiveWalletAddress(address);
      return address;
    } catch (error: any) {
      console.error('Base Account connection failed', error);
      onWalletError(getUserFacingMessage(error, 'Base Account connection was cancelled.'));
      return null;
    } finally {
      setIsConnecting(false);
    }
  }, [activeWalletAddress, onWalletError]);

  const switchWallet = useCallback(async () => {
    setIsConnecting(true);
    try {
      onWalletError('');
      const address = await switchBaseAccount();
      activeWalletAddressRef.current = address;
      setActiveWalletAddress(address);
      if (activeWalletAddress && address.toLowerCase() === activeWalletAddress.toLowerCase()) {
        onWalletError('Base kept the same account. Disconnect, then sign out of Base Account before reconnecting with a different identity.');
      }
      return address;
    } catch (error: any) {
      console.error('Base Account switch failed', error);
      onWalletError(getUserFacingMessage(error, 'Wallet switch was cancelled.'));
      return null;
    } finally {
      setIsConnecting(false);
    }
  }, [activeWalletAddress, onWalletError]);

  const disconnectWallet = useCallback(async () => {
    try {
      await disconnectBaseAccount();
      localStorage.removeItem(STORAGE_KEYS.WALLET_ADDRESS);
      activeWalletAddressRef.current = null;
      setActiveWalletAddress(null);
      onRscBalanceChange?.({ status: 'idle', balance: null });
      onWalletError('');
    } catch (error: any) {
      console.error('Base Account disconnect failed', error);
      onWalletError(getUserFacingMessage(error, 'Base Account could not disconnect.'));
    }
  }, [onRscBalanceChange, onWalletError]);

  const refreshRscBalance = useCallback(async (requestedAddress?: Address | null) => {
    const address = requestedAddress || activeWalletAddress;
    if (!address) {
      onRscBalanceChange?.({ status: 'idle', balance: null });
      return null;
    }
    onRscBalanceChange?.({ status: 'loading', balance: null });
    try {
      const balance = await getRscBalance(address);
      // Ignore a late response from an account that was switched while the RPC
      // read was in flight. The next account event starts its own refresh.
      if (
        activeWalletAddressRef.current
        && activeWalletAddressRef.current.toLowerCase() !== address.toLowerCase()
      ) {
        return null;
      }
      onRscBalanceChange?.({ status: 'ready', balance });
      return balance;
    } catch (error: any) {
      onRscBalanceChange?.({
        status: 'error',
        balance: null,
        error: getUserFacingMessage(error, 'Research Coin balance could not be loaded.')
      });
      return null;
    }
  }, [activeWalletAddress, onRscBalanceChange]);

  useEffect(() => {
    if (!onRscBalanceChange) return;
    void refreshRscBalance(activeWalletAddress);
  }, [activeWalletAddress, onRscBalanceChange, refreshRscBalance]);

  const purchaseWithRsc = useCallback(async (skuId: RscPurchaseSkuId) => {
    if (purchaseBusyRef.current) return;
    purchaseBusyRef.current = true;
    try {
      onWalletPurchaseStatus?.({ status: 'connecting', skuId });
      const address = activeWalletAddress || await connectWallet();
      if (!address) {
        onWalletPurchaseStatus?.({
          status: 'error',
          skuId,
          error: 'Connect a Base Account before purchasing with Research Coin.'
        });
        return;
      }
      onWalletPurchaseStatus?.({ status: 'authorizing', skuId });
      const settlement = await executeWalletPurchase({
        walletAddress: address,
        skuId,
        onQuote: () => {
          onWalletPurchaseStatus?.({ status: 'confirming', skuId });
        },
        onSubmitted: (transactionHash) => {
          onWalletPurchaseStatus?.({
            status: 'settling',
            skuId,
            transactionHash
          });
        }
      });
      if (activeWalletAddressRef.current?.toLowerCase() !== address.toLowerCase()) {
        onWalletPurchaseStatus?.({
          status: 'error',
          skuId,
          transactionHash: settlement.transactionHash,
          error: 'Purchase confirmed for the previous Base Account. Reconnect that account to load its reward.'
        });
        return;
      }
      onWalletPurchaseSuccess?.(settlement);
      onWalletPurchaseStatus?.({
        status: 'confirmed',
        skuId,
        transactionHash: settlement.transactionHash
      });
      await refreshRscBalance(address);
    } catch (error: any) {
      onWalletPurchaseStatus?.({
        status: 'error',
        skuId,
        error: getUserFacingMessage(error, 'Research Coin purchase was cancelled.')
      });
    } finally {
      purchaseBusyRef.current = false;
    }
  }, [activeWalletAddress, connectWallet, onWalletPurchaseStatus, onWalletPurchaseSuccess, refreshRscBalance]);

  useEffect(() => {
    if (!activeWalletAddress) return;
    const pending = readPendingWalletPurchase(activeWalletAddress);
    if (!pending || (!pending.callsId && !pending.transactionHash)) return;
    const recoveryKey = `${pending.walletAddress}:${pending.orderId}`;
    if (resumedPurchaseOrdersRef.current.has(recoveryKey)) return;
    resumedPurchaseOrdersRef.current.add(recoveryKey);
    let active = true;
    onWalletPurchaseStatus?.({
      status: 'settling',
      skuId: pending.skuId,
      transactionHash: pending.transactionHash
    });
    void resumePendingWalletPurchase(activeWalletAddress)
      .then(async (settlement) => {
        if (!active || !settlement) return;
        onWalletPurchaseSuccess?.(settlement);
        onWalletPurchaseStatus?.({
          status: 'confirmed',
          skuId: settlement.skuId,
          transactionHash: settlement.transactionHash
        });
        await refreshRscBalance(activeWalletAddress);
      })
      .catch((error: any) => {
        if (!active) return;
        onWalletPurchaseStatus?.({
          status: 'error',
          skuId: pending.skuId,
          transactionHash: pending.transactionHash,
          error: getUserFacingMessage(error, 'The pending Research Coin purchase could not be restored.')
        });
      });
    return () => {
      active = false;
    };
  }, [activeWalletAddress, onWalletPurchaseStatus, onWalletPurchaseSuccess, refreshRscBalance]);

  const continueWithRsc = useCallback(async () => {
    if (isContinuePaymentBusy) return;

    const address = activeWalletAddress || await connectWallet();
    if (!address) {
      onContinueStatusChange({
        status: 'error',
        error: 'Connect a Base Account before continuing this run.'
      });
      return;
    }

    try {
      onContinueStatusChange({ status: 'confirming', error: '', hash: '' });
      const transactionHash = await sendRscContinuePayment({
        from: address,
        amount: continueCost
      });
      onContinueSuccess(transactionHash);
    } catch (error: any) {
      onContinueStatusChange({
        status: 'error',
        error: getUserFacingMessage(error, 'RSC continue payment was cancelled.')
      });
    }
  }, [activeWalletAddress, connectWallet, continueCost, isContinuePaymentBusy, onContinueStatusChange, onContinueSuccess]);

  const claimChampion = useCallback(async (weekKey: string, proposal: ResearchHubProposal) => {
    onChampionClaimStatus('connecting');
    const address = activeWalletAddress || await connectWallet();
    if (!address) {
      onChampionClaimStatus('error', 'Connect the Base Account associated with the winning run.');
      return;
    }
    try {
      onChampionClaimStatus('signing');
      await claimWeeklyChampionProposal({ weekKey, proposal, address, signMessage: signBaseAccountMessage });
      onChampionClaimStatus('confirmed');
    } catch (error: any) {
      onChampionClaimStatus('error', getUserFacingMessage(error, 'Champion claim was cancelled.'));
    }
  }, [activeWalletAddress, connectWallet, onChampionClaimStatus]);

  const mintMission = useCallback(async (receipt: RunReceipt) => {
    const address = activeWalletAddress || await connectWallet();
    if (!address) {
      onMissionMintStatus('error', 'Connect the Base Account attached to this run.');
      return;
    }
    try {
      onMissionMintStatus('authorizing');
      const result = await mintMissionRecord({ address, receipt });
      onMissionMintStatus('confirmed', result.tokenId ? `Mission Record #${result.tokenId} minted.` : 'Mission Record minted.', result.transactionHash);
    } catch (error: any) {
      onMissionMintStatus('error', getUserFacingMessage(error, 'Mission Record mint was cancelled.'));
    }
  }, [activeWalletAddress, connectWallet, onMissionMintStatus]);

  useEffect(() => {
    if (!action || startedActionNonceRef.current === action.nonce) return;

    const currentAction = action;
    startedActionNonceRef.current = currentAction.nonce;
    onActionHandled(currentAction.nonce);

    const runAction = async () => {
      if (currentAction.type === 'connect') {
        await connectWallet();
      } else if (currentAction.type === 'switch-account') {
        await switchWallet();
      } else if (currentAction.type === 'disconnect') {
        await disconnectWallet();
      } else if (currentAction.type === 'continue') {
        await continueWithRsc();
      } else if (currentAction.type === 'refresh-rsc-balance') {
        await refreshRscBalance();
      } else if (currentAction.type === 'purchase-rsc') {
        await purchaseWithRsc(currentAction.skuId);
      } else if (currentAction.type === 'claim-champion') {
        await claimChampion(currentAction.weekKey, currentAction.proposal);
      } else if (currentAction.type === 'mint-mission') {
        await mintMission(currentAction.receipt);
      }
    };

    void runAction();
  }, [action, claimChampion, connectWallet, continueWithRsc, disconnectWallet, mintMission, onActionHandled, purchaseWithRsc, refreshRscBalance, switchWallet]);

  return null;
};

export default WalletRuntime;

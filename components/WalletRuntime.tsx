import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Address } from 'viem';
import {
  DONATION_CONFIG,
  STORAGE_KEYS,
  type PlayerShipPurchaseSkuId,
  type RscPurchaseSkuId
} from '../constants';
import { DonationStatus, WalletSession } from '../types';
import {
  baseAccountProvider,
  connectBaseAccount,
  disconnectBaseAccount,
  getRscBalance,
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
import {
  executePlayerShipPurchase,
  loadPlayerShipAccess,
  resumePendingPlayerShipPurchase,
  type PlayerShipAccessSnapshot,
  type PlayerShipPurchaseSettlement
} from '../services/playerShipAccessService';
import { readPendingPlayerShipPurchase } from '../services/playerShipPurchasePendingStore';
import {
  executeContinuePayment,
  type ContinuePaymentSettlement
} from '../services/continuePaymentService';
import type { RunReceipt } from '../services/runReceiptService';
import { claimWeeklyChampionProposal } from '../services/weeklyClaimService';
import type { ResearchHubProposal } from '../services/researchHubProposals';
import { mintMissionRecord } from '../services/recordMintService';

export type WalletRuntimeAction =
  | { nonce: number; type: 'connect' }
  | { nonce: number; type: 'switch-account' }
  | { nonce: number; type: 'disconnect' }
  | {
      nonce: number;
      type: 'continue';
      runId: string;
      startToken: string;
      expectedContinueSequence: number;
    }
  | { nonce: number; type: 'refresh-rsc-balance' }
  | { nonce: number; type: 'purchase-rsc'; skuId: RscPurchaseSkuId }
  | { nonce: number; type: 'refresh-player-ship-access' }
  | { nonce: number; type: 'purchase-player-ship'; skuId: PlayerShipPurchaseSkuId }
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

export interface PlayerShipAccessUpdate {
  status: 'idle' | 'loading' | 'ready' | 'error';
  access: PlayerShipAccessSnapshot | null;
  error?: string;
}

export interface PlayerShipPurchaseStatusUpdate {
  status: 'idle' | 'connecting' | 'authorizing' | 'confirming' | 'settling' | 'confirmed' | 'error';
  skuId?: PlayerShipPurchaseSkuId;
  transactionHash?: string;
  error?: string;
}

interface WalletRuntimeProps {
  action: WalletRuntimeAction | null;
  donatedWallets: Record<string, boolean>;
  walletError: string;
  onActionHandled: (nonce: number) => void;
  onContinueStatusChange: (update: ContinueStatusUpdate) => void;
  onContinueSuccess: (settlement: ContinuePaymentSettlement) => void;
  onWalletChange: (wallet: WalletSession) => void;
  onWalletError: (message: string) => void;
  /** Optional until App wires the Hangar's Research Coin rail. */
  onRscBalanceChange?: (update: RscBalanceUpdate) => void;
  /** Optional purchase lifecycle callback for right-support and Token packs. */
  onWalletPurchaseStatus?: (update: WalletPurchaseStatusUpdate) => void;
  /** Apply the returned authoritative profile; do not recreate the reward client-side. */
  onWalletPurchaseSuccess?: (settlement: WalletPurchaseSettlement) => void;
  /** Exact BIO holding and permanent ETH/BTC access reported by the server. */
  onPlayerShipAccessChange?: (update: PlayerShipAccessUpdate) => void;
  /** Dedicated lifecycle so ship payments cannot overwrite RSC store status. */
  onPlayerShipPurchaseStatus?: (update: PlayerShipPurchaseStatusUpdate) => void;
  /** Apply the returned authoritative wallet profile after settlement. */
  onPlayerShipPurchaseSuccess?: (settlement: PlayerShipPurchaseSettlement) => void;
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
  donatedWallets,
  walletError,
  onActionHandled,
  onContinueStatusChange,
  onContinueSuccess,
  onWalletChange,
  onWalletError,
  onRscBalanceChange,
  onWalletPurchaseStatus,
  onWalletPurchaseSuccess,
  onPlayerShipAccessChange,
  onPlayerShipPurchaseStatus,
  onPlayerShipPurchaseSuccess,
  onChampionClaimStatus,
  onMissionMintStatus
}) => {
  const [activeWalletAddress, setActiveWalletAddress] = useState<Address | null>(getCachedBaseAccount);
  const [isConnecting, setIsConnecting] = useState(false);
  const startedActionNonceRef = useRef<number | null>(null);
  const purchaseBusyRef = useRef(false);
  const playerShipPurchaseBusyRef = useRef(false);
  const activeWalletAddressRef = useRef<Address | null>(activeWalletAddress);
  const resumedPurchaseOrdersRef = useRef(new Set<string>());
  const resumedPlayerShipPurchaseOrdersRef = useRef(new Set<string>());

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
      onPlayerShipAccessChange?.({ status: 'idle', access: null });
      onWalletError('');
    } catch (error: any) {
      console.error('Base Account disconnect failed', error);
      onWalletError(getUserFacingMessage(error, 'Base Account could not disconnect.'));
    }
  }, [onPlayerShipAccessChange, onRscBalanceChange, onWalletError]);

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

  const refreshPlayerShipAccess = useCallback(async (
    requestedAddress?: Address | null
  ) => {
    const address = requestedAddress || activeWalletAddress;
    if (!address) {
      onPlayerShipAccessChange?.({ status: 'idle', access: null });
      return null;
    }
    onPlayerShipAccessChange?.({ status: 'loading', access: null });
    try {
      const access = await loadPlayerShipAccess(address, { interactive: false });
      if (
        activeWalletAddressRef.current
        && activeWalletAddressRef.current.toLowerCase() !== address.toLowerCase()
      ) {
        return null;
      }
      onPlayerShipAccessChange?.({ status: 'ready', access });
      return access;
    } catch (error: any) {
      if (
        activeWalletAddressRef.current
        && activeWalletAddressRef.current.toLowerCase() !== address.toLowerCase()
      ) {
        return null;
      }
      onPlayerShipAccessChange?.({
        status: 'error',
        access: null,
        error: getUserFacingMessage(
          error,
          'Ship access could not be refreshed. Reconnect Base Account and try again.'
        )
      });
      return null;
    }
  }, [activeWalletAddress, onPlayerShipAccessChange]);

  useEffect(() => {
    if (!onPlayerShipAccessChange) return;
    void refreshPlayerShipAccess(activeWalletAddress);
  }, [activeWalletAddress, onPlayerShipAccessChange, refreshPlayerShipAccess]);

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

  const purchasePlayerShip = useCallback(async (
    skuId: PlayerShipPurchaseSkuId
  ) => {
    if (playerShipPurchaseBusyRef.current) return;
    playerShipPurchaseBusyRef.current = true;
    try {
      onPlayerShipPurchaseStatus?.({ status: 'connecting', skuId });
      const address = activeWalletAddress || await connectWallet();
      if (!address) {
        onPlayerShipPurchaseStatus?.({
          status: 'error',
          skuId,
          error: 'Connect a Base Account before purchasing this ship.'
        });
        return;
      }
      onPlayerShipPurchaseStatus?.({ status: 'authorizing', skuId });
      const settlement = await executePlayerShipPurchase({
        walletAddress: address,
        skuId,
        onQuote: () => {
          onPlayerShipPurchaseStatus?.({ status: 'confirming', skuId });
        },
        onBatchSubmitted: () => {
          onPlayerShipPurchaseStatus?.({ status: 'settling', skuId });
        },
        onSubmitted: (transactionHash) => {
          onPlayerShipPurchaseStatus?.({
            status: 'settling',
            skuId,
            transactionHash
          });
        }
      });
      if (activeWalletAddressRef.current?.toLowerCase() !== address.toLowerCase()) {
        onPlayerShipPurchaseStatus?.({
          status: 'error',
          skuId,
          transactionHash: settlement.transactionHash,
          error: 'Ship purchase confirmed for the previous Base Account. Reconnect that account to load it.'
        });
        return;
      }
      onPlayerShipPurchaseSuccess?.(settlement);
      onPlayerShipAccessChange?.({ status: 'ready', access: settlement.access });
      onPlayerShipPurchaseStatus?.({
        status: 'confirmed',
        skuId,
        transactionHash: settlement.transactionHash
      });
    } catch (error: any) {
      const tokenLabel = skuId === 'eth-ship' ? 'ETH' : 'cbBTC';
      onPlayerShipPurchaseStatus?.({
        status: 'error',
        skuId,
        error: getUserFacingMessage(
          error,
          `${tokenLabel} ship purchase was cancelled.`,
          tokenLabel
        )
      });
    } finally {
      playerShipPurchaseBusyRef.current = false;
    }
  }, [
    activeWalletAddress,
    connectWallet,
    onPlayerShipAccessChange,
    onPlayerShipPurchaseStatus,
    onPlayerShipPurchaseSuccess
  ]);

  useEffect(() => {
    if (!activeWalletAddress) return;
    const pending = readPendingPlayerShipPurchase(activeWalletAddress);
    if (!pending || (!pending.callsId && !pending.transactionHash)) return;
    const recoveryKey = `${pending.walletAddress}:${pending.orderId}`;
    if (resumedPlayerShipPurchaseOrdersRef.current.has(recoveryKey)) return;
    resumedPlayerShipPurchaseOrdersRef.current.add(recoveryKey);
    let active = true;
    const timeoutId = window.setTimeout(() => {
      if (!active) return;
      onPlayerShipPurchaseStatus?.({
        status: 'settling',
        skuId: pending.skuId,
        transactionHash: pending.transactionHash
      });
      void resumePendingPlayerShipPurchase(activeWalletAddress)
        .then((settlement) => {
          if (!active || !settlement) return;
          onPlayerShipPurchaseSuccess?.(settlement);
          onPlayerShipAccessChange?.({ status: 'ready', access: settlement.access });
          onPlayerShipPurchaseStatus?.({
            status: 'confirmed',
            skuId: settlement.skuId,
            transactionHash: settlement.transactionHash
          });
        })
        .catch((error: any) => {
          if (!active) return;
          resumedPlayerShipPurchaseOrdersRef.current.delete(recoveryKey);
          onPlayerShipPurchaseStatus?.({
            status: 'error',
            skuId: pending.skuId,
            transactionHash: pending.transactionHash,
            error: getUserFacingMessage(
              error,
              'The pending ship purchase could not be restored.'
            )
          });
        });
    }, 1200);
    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [
    activeWalletAddress,
    onPlayerShipAccessChange,
    onPlayerShipPurchaseStatus,
    onPlayerShipPurchaseSuccess
  ]);

  const continueWithRsc = useCallback(async ({
    runId,
    startToken,
    expectedContinueSequence
  }: {
    runId: string;
    startToken: string;
    expectedContinueSequence: number;
  }) => {
    const address = activeWalletAddress || await connectWallet();
    if (!address) {
      onContinueStatusChange({
        status: 'error',
        error: 'Connect a Base Account before continuing this run.'
      });
      return;
    }

    try {
      onContinueStatusChange({ status: 'processing', error: '', hash: '' });
      const settlement = await executeContinuePayment({
        walletAddress: address,
        runId,
        startToken,
        expectedContinueSequence,
        onQuote: () => {
          onContinueStatusChange({ status: 'confirming', error: '', hash: '' });
        },
        onSubmitted: (transactionHash) => {
          onContinueStatusChange({ status: 'confirming', error: '', hash: transactionHash });
        }
      });
      onContinueSuccess(settlement);
      await refreshRscBalance(address);
    } catch (error: any) {
      onContinueStatusChange({
        status: 'error',
        error: getUserFacingMessage(error, 'RSC continue payment was cancelled.')
      });
    }
  }, [activeWalletAddress, connectWallet, onContinueStatusChange, onContinueSuccess, refreshRscBalance]);

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
        await continueWithRsc(currentAction);
      } else if (currentAction.type === 'refresh-rsc-balance') {
        await refreshRscBalance();
      } else if (currentAction.type === 'purchase-rsc') {
        await purchaseWithRsc(currentAction.skuId);
      } else if (currentAction.type === 'refresh-player-ship-access') {
        await refreshPlayerShipAccess();
      } else if (currentAction.type === 'purchase-player-ship') {
        await purchasePlayerShip(currentAction.skuId);
      } else if (currentAction.type === 'claim-champion') {
        await claimChampion(currentAction.weekKey, currentAction.proposal);
      } else if (currentAction.type === 'mint-mission') {
        await mintMission(currentAction.receipt);
      }
    };

    void runAction();
  }, [
    action,
    claimChampion,
    connectWallet,
    continueWithRsc,
    disconnectWallet,
    mintMission,
    onActionHandled,
    purchasePlayerShip,
    purchaseWithRsc,
    refreshPlayerShipAccess,
    refreshRscBalance,
    switchWallet
  ]);

  return null;
};

export default WalletRuntime;

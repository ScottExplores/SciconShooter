import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Address } from 'viem';
import { DONATION_CONFIG, STORAGE_KEYS } from '../constants';
import { DonationStatus, WalletSession } from '../types';
import {
  baseAccountProvider,
  connectBaseAccount,
  disconnectBaseAccount,
  getConnectedBaseAccount,
  sendRscContinuePayment,
  signBaseAccountMessage
} from '../services/baseAccountWallet';
import type { RunReceipt } from '../services/runReceiptService';
import { claimWeeklyChampionProposal } from '../services/weeklyClaimService';
import type { ResearchHubProposal } from '../services/researchHubProposals';
import { mintMissionRecord } from '../services/recordMintService';

export type WalletRuntimeAction =
  | { nonce: number; type: 'connect' }
  | { nonce: number; type: 'disconnect' }
  | { nonce: number; type: 'continue' }
  | { nonce: number; type: 'claim-champion'; weekKey: string; proposal: ResearchHubProposal }
  | { nonce: number; type: 'mint-mission'; receipt: RunReceipt };

interface ContinueStatusUpdate {
  status: DonationStatus;
  error?: string;
  hash?: string;
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
  onChampionClaimStatus: (status: 'idle' | 'connecting' | 'signing' | 'confirmed' | 'error', message?: string) => void;
  onMissionMintStatus: (status: 'idle' | 'authorizing' | 'confirming' | 'confirmed' | 'error', message?: string, hash?: string) => void;
}

const getUserFacingMessage = (error: any, fallback: string, tokenLabel = 'RSC') => {
  const message = error?.shortMessage || error?.message || fallback;

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
  onChampionClaimStatus,
  onMissionMintStatus
}) => {
  const [activeWalletAddress, setActiveWalletAddress] = useState<Address | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const startedActionNonceRef = useRef<number | null>(null);

  const wallet = useMemo<WalletSession>(() => ({
    address: activeWalletAddress,
    chainId: activeWalletAddress ? DONATION_CONFIG.BASE_CHAIN_ID : null,
    status: activeWalletAddress ? 'connected' : isConnecting ? 'connecting' : walletError ? 'error' : 'idle',
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
        setActiveWalletAddress((accounts[0] as Address | undefined) || null);
      }
    };

    void getConnectedBaseAccount()
      .then((address) => {
        if (active) setActiveWalletAddress(address);
      })
      .catch(() => undefined);

    baseAccountProvider.on('accountsChanged', handleAccountsChanged);
    return () => {
      active = false;
      baseAccountProvider.removeListener('accountsChanged', handleAccountsChanged);
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

  const disconnectWallet = useCallback(async () => {
    localStorage.removeItem(STORAGE_KEYS.WALLET_ADDRESS);
    await disconnectBaseAccount();
    setActiveWalletAddress(null);
    onWalletError('');
  }, [onWalletError]);

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
      } else if (currentAction.type === 'disconnect') {
        await disconnectWallet();
      } else if (currentAction.type === 'continue') {
        await continueWithRsc();
      } else if (currentAction.type === 'claim-champion') {
        await claimChampion(currentAction.weekKey, currentAction.proposal);
      } else {
        await mintMission(currentAction.receipt);
      }
    };

    void runAction();
  }, [action, claimChampion, connectWallet, continueWithRsc, disconnectWallet, mintMission, onActionHandled]);

  return null;
};

export default WalletRuntime;

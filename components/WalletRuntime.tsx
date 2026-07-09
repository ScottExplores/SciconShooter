import React, { useCallback, useEffect, useMemo } from 'react';
import { getContract, sendAndConfirmTransaction } from 'thirdweb';
import { getBalance, transfer } from 'thirdweb/extensions/erc20';
import {
  ThirdwebProvider,
  useActiveAccount,
  useActiveWallet,
  useActiveWalletChain,
  useConnectModal,
  useDisconnect as useThirdwebDisconnect
} from 'thirdweb/react';
import type { Account } from 'thirdweb/wallets';
import { DONATION_CONFIG, STORAGE_KEYS } from '../constants';
import { DonationStatus, WalletSession } from '../types';
import {
  thirdwebAppMetadata,
  thirdwebBaseChain,
  thirdwebClient,
  thirdwebConnectModal,
  thirdwebRecommendedWallets,
  thirdwebTheme,
  thirdwebWallets
} from '../services/thirdwebWallet';

export type WalletRuntimeAction = {
  nonce: number;
  type: 'connect' | 'disconnect' | 'continue';
};

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
}

const getUserFacingMessage = (error: any, fallback: string, tokenLabel = 'RSC') => {
  const message = error?.shortMessage || error?.message || fallback;

  if (/rejected|denied|cancelled|canceled|closed modal|request rejected/i.test(message)) {
    return fallback;
  }

  if (/insufficient/i.test(message)) {
    return `Not enough ${tokenLabel} or gas for that action.`;
  }

  return message;
};

const getInsufficientContinueTokenMessage = (
  requiredAmount: number,
  availableDisplayValue = '0'
) => {
  return `You need ${requiredAmount} RSC on Base to continue this run. Your wallet shows ${availableDisplayValue} RSC.`;
};

const WalletRuntimeController: React.FC<WalletRuntimeProps> = ({
  action,
  continueCost,
  donatedWallets,
  isContinuePaymentBusy,
  walletError,
  onActionHandled,
  onContinueStatusChange,
  onContinueSuccess,
  onWalletChange,
  onWalletError
}) => {
  const thirdwebAccount = useActiveAccount();
  const thirdwebWallet = useActiveWallet();
  const thirdwebChain = useActiveWalletChain();
  const { connect: openThirdwebConnectModal, isConnecting: isThirdwebConnecting } = useConnectModal();
  const { disconnect: disconnectThirdweb } = useThirdwebDisconnect();
  const activeWalletAddress = thirdwebAccount?.address ?? null;
  const activeWalletChainId = thirdwebChain?.id ?? null;

  const wallet = useMemo<WalletSession>(() => ({
    address: activeWalletAddress,
    chainId: activeWalletChainId,
    status: activeWalletAddress ? 'connected' : isThirdwebConnecting ? 'connecting' : walletError ? 'error' : 'idle',
    error: walletError,
    connectorName: thirdwebWallet?.id,
    hasDonated: activeWalletAddress ? Boolean(donatedWallets[activeWalletAddress.toLowerCase()]) : false
  }), [activeWalletAddress, activeWalletChainId, donatedWallets, isThirdwebConnecting, thirdwebWallet?.id, walletError]);

  useEffect(() => {
    onWalletChange(wallet);
  }, [onWalletChange, wallet]);

  const openThirdwebWallet = useCallback(async (): Promise<Account | null> => {
    if (!thirdwebClient) {
      const message = 'Add VITE_THIRDWEB_CLIENT_ID to enable the wallet connection.';
      onWalletError(message);
      return null;
    }

    try {
      onWalletError('');
      const connectedWallet = await openThirdwebConnectModal({
        client: thirdwebClient,
        wallets: thirdwebWallets,
        recommendedWallets: thirdwebRecommendedWallets,
        chain: thirdwebBaseChain,
        appMetadata: thirdwebAppMetadata,
        theme: thirdwebTheme,
        ...thirdwebConnectModal
      });

      if (connectedWallet.getChain()?.id !== DONATION_CONFIG.BASE_CHAIN_ID) {
        await connectedWallet.switchChain(thirdwebBaseChain);
      }

      const account = connectedWallet.getAccount();
      if (!account) {
        throw new Error('Wallet connected without an active account.');
      }

      return account;
    } catch (error: any) {
      console.error('Wallet connection failed', error);
      onWalletError(getUserFacingMessage(error, 'Wallet connection was cancelled.'));
      return null;
    }
  }, [onWalletError, openThirdwebConnectModal]);

  const connectWallet = useCallback(async () => {
    if (activeWalletAddress) {
      onWalletError('');
      return;
    }

    await openThirdwebWallet();
  }, [activeWalletAddress, onWalletError, openThirdwebWallet]);

  const disconnectWallet = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.WALLET_ADDRESS);
    if (thirdwebWallet) {
      disconnectThirdweb(thirdwebWallet);
    }
    onWalletError('');
  }, [disconnectThirdweb, onWalletError, thirdwebWallet]);

  const continueWithRsc = useCallback(async () => {
    if (isContinuePaymentBusy) return;

    if (!thirdwebClient) {
      onContinueStatusChange({
        status: 'error',
        error: 'Add VITE_THIRDWEB_CLIENT_ID to enable RSC continues.'
      });
      return;
    }

    let account = thirdwebAccount;
    if (!account) {
      onContinueStatusChange({ status: 'processing', error: '', hash: '' });
      account = await openThirdwebWallet();
    }

    if (!account) {
      onContinueStatusChange({
        status: 'error',
        error: 'Connect a wallet before continuing this run.'
      });
      return;
    }

    const tokenChain = thirdwebBaseChain;
    const tokenLabel = 'RSC';

    try {
      if (thirdwebWallet && thirdwebWallet.getChain()?.id !== tokenChain.id) {
        onContinueStatusChange({ status: 'switching_network' });
        await thirdwebWallet.switchChain(tokenChain);
      }

      onContinueStatusChange({ status: 'processing', error: '', hash: '' });

      const rscTokenContract = getContract({
        client: thirdwebClient,
        chain: tokenChain,
        address: DONATION_CONFIG.RSC_CONTRACT_ADDRESS as `0x${string}`
      });

      let balanceDisplayValue = '0';
      try {
        const balance = await getBalance({
          contract: rscTokenContract,
          address: account.address
        });
        balanceDisplayValue = balance.displayValue;
        const availableBalance = Number(balance.displayValue);

        if (Number.isFinite(availableBalance) && availableBalance + 0.000000001 < continueCost) {
          throw new Error(getInsufficientContinueTokenMessage(continueCost, balanceDisplayValue));
        }
      } catch (error: any) {
        const message = error?.message || '';
        if (message.includes('continue this run')) {
          throw error;
        }

        console.warn(`${tokenLabel} balance preflight failed; continuing to wallet confirmation.`, error);
      }

      const transaction = transfer({
        contract: rscTokenContract,
        to: DONATION_CONFIG.RECIPIENT_ADDRESS,
        amount: continueCost.toString()
      });

      onContinueStatusChange({ status: 'confirming' });
      const receipt = await sendAndConfirmTransaction({ account, transaction });
      onContinueSuccess(receipt.transactionHash || '');
    } catch (error: any) {
      const message = getUserFacingMessage(error, `${tokenLabel} continue payment was cancelled.`, tokenLabel);
      onContinueStatusChange({ status: 'error', error: message });
    }
  }, [
    continueCost,
    isContinuePaymentBusy,
    onContinueStatusChange,
    onContinueSuccess,
    openThirdwebWallet,
    thirdwebAccount,
    thirdwebWallet
  ]);

  useEffect(() => {
    if (!action) return;

    let cancelled = false;

    const runAction = async () => {
      if (action.type === 'connect') {
        await connectWallet();
      } else if (action.type === 'disconnect') {
        disconnectWallet();
      } else {
        await continueWithRsc();
      }

      if (!cancelled) {
        onActionHandled(action.nonce);
      }
    };

    void runAction();

    return () => {
      cancelled = true;
    };
  }, [action, connectWallet, continueWithRsc, disconnectWallet, onActionHandled]);

  return null;
};

const WalletRuntime: React.FC<WalletRuntimeProps> = (props) => (
  <ThirdwebProvider>
    <WalletRuntimeController {...props} />
  </ThirdwebProvider>
);

export default WalletRuntime;

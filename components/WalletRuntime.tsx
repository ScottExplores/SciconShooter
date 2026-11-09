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
  parseBaseAccountAccounts,
  readCachedBaseAccount,
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
import { associateRunWithWallet } from '../services/runClaimService';
import { claimWeeklyChampionProposal } from '../services/weeklyClaimService';
import type { ResearchHubProposal } from '../services/researchHubProposals';
import { mintMissionRecord } from '../services/recordMintService';
import { createAddressResourceCoordinator } from '../services/addressResourceCoordinator';
import {
  loadAuthenticatedWalletProfile,
  logoutWalletProfileSession
} from '../services/walletProfileService';
import { WalletChooser } from './WalletChooser';
import {
  accountEventProvider,
  buildWalletChoices,
  shouldApplyWalletResult,
  walletConnectProjectId,
  type WalletChoice
} from '../services/evmWalletDiscovery';
import {
  createConnectLedger,
  dropCommittedSession,
  rememberCommittedSession,
  settleConnectAttempt,
  startConnectAttempt,
  supersedeConnectAttempts,
  trackPendingProvider,
  type ConnectLedger,
  type LedgerSession,
  type SettleResult
} from '../services/evmConnectLedger';
import {
  clearActiveEvmSession,
  connectInjectedProvider,
  connectWalletConnect,
  getActiveEvmSession,
  readCachedWalletConnector,
  readProviderAccounts,
  restoreWalletConnectSession,
  setActiveEvmSession,
  signInjectedWalletMessage,
  type ActiveEvmSession,
  type Eip1193Provider
} from '../services/evmWalletSession';

export type WalletRuntimeAction =
  | { nonce: number; type: 'connect' }
  | { nonce: number; type: 'switch-account' }
  | { nonce: number; type: 'disconnect' }
  | { nonce: number; type: 'release' }
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
  | {
      nonce: number;
      type: 'claim-champion';
      weekKey: string;
      proposal: ResearchHubProposal;
      receipt?: RunReceipt;
    }
  | { nonce: number; type: 'mint-mission'; receipt: RunReceipt };

interface ContinueStatusUpdate {
  status: DonationStatus;
  error?: string;
  hash?: string;
}

export interface MissionMintStatusContext {
  walletAddress: Address;
  runId: string;
}

export interface RscBalanceUpdate {
  status: 'idle' | 'loading' | 'ready' | 'error';
  balance: RscBalanceSnapshot | null;
  error?: string;
  refreshing?: boolean;
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
  refreshing?: boolean;
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
  onWalletIdentityTransition?: (address: Address | null) => void;
  onWalletChange: (wallet: WalletSession) => void;
  onWalletError: (message: string) => void;
  /** Optional until App wires the Hangar's Research Coin rail. */
  onRscBalanceChange?: (update: RscBalanceUpdate) => void;
  /** Optional purchase lifecycle callback for right-support and Token packs. */
  onWalletPurchaseStatus?: (update: WalletPurchaseStatusUpdate) => void;
  /** Apply the returned authoritative profile; do not recreate the reward client-side. */
  onWalletPurchaseSuccess?: (settlement: WalletPurchaseSettlement) => void;
  /** Permanent ETH/BTC access reported by the server. The NIH ship is always unlocked. */
  onPlayerShipAccessChange?: (update: PlayerShipAccessUpdate) => void;
  /** Dedicated lifecycle so ship payments cannot overwrite RSC store status. */
  onPlayerShipPurchaseStatus?: (update: PlayerShipPurchaseStatusUpdate) => void;
  /** Apply the returned authoritative wallet profile after settlement. */
  onPlayerShipPurchaseSuccess?: (settlement: PlayerShipPurchaseSettlement) => void;
  onChampionClaimStatus: (status: 'idle' | 'connecting' | 'signing' | 'confirmed' | 'error', message?: string) => void;
  onMissionMintStatus: (
    status: 'idle' | 'authorizing' | 'confirming' | 'confirmed' | 'error',
    message?: string,
    hash?: string,
    context?: MissionMintStatusContext
  ) => void;
}

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
  onWalletIdentityTransition,
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
  const [activeWalletAddress, setActiveWalletAddress] = useState<Address | null>(readCachedBaseAccount);
  const [connectorName, setConnectorName] = useState<string | undefined>(
    () => readCachedWalletConnector()?.name || (readCachedBaseAccount() ? 'Base Account' : undefined)
  );
  const [isConnecting, setIsConnecting] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [chooserError, setChooserError] = useState('');
  const [busyChoiceId, setBusyChoiceId] = useState<string | null>(null);
  const [walletConnectUri, setWalletConnectUri] = useState('');
  const [announcedWallets, setAnnouncedWallets] = useState<Array<{
    uuid: string;
    name: string;
    rdns: string;
    icon?: string;
    provider: Eip1193Provider;
  }>>([]);
  const startedActionNonceRef = useRef<number | null>(null);
  const connectGenerationRef = useRef(0);
  const chooserResolverRef = useRef<((address: Address | null) => void) | null>(null);
  const announcedProvidersRef = useRef(new Map<string, Eip1193Provider>());
  const walletConnectProviderRef = useRef<Eip1193Provider | null>(null);
  const purchaseBusyRef = useRef(false);
  const playerShipPurchaseBusyRef = useRef(false);
  const activeWalletAddressRef = useRef<Address | null>(activeWalletAddress);
  const resumedPurchaseOrdersRef = useRef(new Set<string>());
  const resumedPlayerShipPurchaseOrdersRef = useRef(new Set<string>());
  const [rscBalanceCoordinator] = useState(() => createAddressResourceCoordinator<RscBalanceSnapshot>({
    load: (owner) => getRscBalance(owner as Address)
  }));
  const [playerShipAccessCoordinator] = useState(() => createAddressResourceCoordinator<PlayerShipAccessSnapshot>({
    load: (owner) => loadPlayerShipAccess(owner as Address, { interactive: false })
  }));

  const isCurrentWalletAddress = useCallback((address: Address) => (
    activeWalletAddressRef.current?.toLowerCase() === address.toLowerCase()
  ), []);

  const commitActiveWalletAddress = useCallback((nextAddress: Address | null) => {
    const previousAddress = activeWalletAddressRef.current?.toLowerCase() || null;
    const normalizedNextAddress = nextAddress?.toLowerCase() || null;

    try {
      if (nextAddress) {
        localStorage.setItem(STORAGE_KEYS.WALLET_ADDRESS, nextAddress);
      } else {
        localStorage.removeItem(STORAGE_KEYS.WALLET_ADDRESS);
      }
    } catch (error) {
      console.warn('Base Account address could not be cached locally', error);
    }

    activeWalletAddressRef.current = nextAddress;
    setActiveWalletAddress(nextAddress);
    setConnectorName(nextAddress
      ? getActiveEvmSession()?.name || readCachedWalletConnector()?.name || 'Base Account'
      : undefined);
    if (!nextAddress) clearActiveEvmSession();

    if (previousAddress !== normalizedNextAddress) {
      rscBalanceCoordinator.setOwner(nextAddress);
      playerShipAccessCoordinator.setOwner(nextAddress);
      if (nextAddress) {
        void rscBalanceCoordinator.refresh();
        void playerShipAccessCoordinator.refresh();
      }
      onWalletIdentityTransition?.(nextAddress);
      // Wallet-bound results must never leak into the next account's UI.
      onWalletPurchaseStatus?.({ status: 'idle' });
      onPlayerShipPurchaseStatus?.({ status: 'idle' });
    }
  }, [
    onPlayerShipPurchaseStatus,
    playerShipAccessCoordinator,
    rscBalanceCoordinator,
    onWalletIdentityTransition,
    onWalletPurchaseStatus
  ]);

  useEffect(() => {
    activeWalletAddressRef.current = activeWalletAddress;
  }, [activeWalletAddress]);

  const wallet = useMemo<WalletSession>(() => ({
    address: activeWalletAddress,
    chainId: activeWalletAddress ? DONATION_CONFIG.BASE_CHAIN_ID : null,
    status: isConnecting ? 'connecting' : activeWalletAddress ? 'connected' : walletError ? 'error' : 'idle',
    error: walletError,
    connectorName: activeWalletAddress ? connectorName || 'Base Account' : undefined,
    hasDonated: activeWalletAddress ? Boolean(donatedWallets[activeWalletAddress.toLowerCase()]) : false
  }), [activeWalletAddress, connectorName, donatedWallets, isConnecting, walletError]);

  useEffect(() => {
    onWalletChange(wallet);
  }, [onWalletChange, wallet]);

  useEffect(() => {
    let active = true;
    const handleAccountsChanged = (accounts: unknown) => {
      if (!active) return;
      const parsedAccounts = parseBaseAccountAccounts(accounts);
      if (!parsedAccounts) {
        commitActiveWalletAddress(null);
        onWalletError('Base Account sent an invalid account update. Choose your account again to reconnect.');
        return;
      }
      commitActiveWalletAddress(parsedAccounts[0] || null);
      onWalletError('');
    };
    const handleDisconnect = () => {
      if (!active) return;
      commitActiveWalletAddress(null);
      onWalletError('');
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
  }, [commitActiveWalletAddress, onWalletError]);

  const [accountEvents, setAccountEvents] = useState<Eip1193Provider | null>(null);
  const ledgerRef = useRef<ConnectLedger<Eip1193Provider>>(createConnectLedger());

  const finishChooser = useCallback((address: Address | null) => {
    setChooserOpen(false);
    setBusyChoiceId(null);
    setWalletConnectUri('');
    setIsConnecting(false);
    const resolve = chooserResolverRef.current;
    chooserResolverRef.current = null;
    resolve?.(address);
  }, []);

  const openChooser = useCallback(() => {
    setChooserError('');
    setWalletConnectUri('');
    setChooserOpen(true);
    onWalletError('');
    return new Promise<Address | null>((resolve) => {
      const previous = chooserResolverRef.current;
      chooserResolverRef.current = (address) => {
        previous?.(address);
        resolve(address);
      };
    });
  }, [onWalletError]);

  const bindAccountEvents = useCallback((session: ActiveEvmSession | null) => {
    setAccountEvents(accountEventProvider(session));
  }, []);

  const applySettledAttempt = useCallback((result: SettleResult<Eip1193Provider>) => {
    ledgerRef.current = result.state;
    const committedProvider = result.state.committed?.provider ?? null;
    result.disconnect.forEach((provider) => {
      if (provider === committedProvider) return;
      void provider.disconnect?.().catch(() => undefined);
    });
    if (!result.applied) return false;
    const session = result.state.committed;
    if (session) setActiveEvmSession(session);
    else clearActiveEvmSession();
    bindAccountEvents(session);
    walletConnectProviderRef.current = session?.method === 'walletconnect'
      ? session.provider
      : null;
    commitActiveWalletAddress((result.state.address as Address | null) ?? null);
    return true;
  }, [bindAccountEvents, commitActiveWalletAddress]);

  const signAttempt = useCallback(async (
    address: Address,
    generation: number,
    attempt: ActiveEvmSession
  ) => {
    const session = await loadAuthenticatedWalletProfile(address, {
      interactive: true,
      shouldContinue: () => generation === ledgerRef.current.generation,
      signMessage: (walletAddress, message) => (
        attempt.method === 'base-account'
          ? signBaseAccountMessage(walletAddress, message)
          : signInjectedWalletMessage(attempt.provider, walletAddress, message)
      )
    });
    if (session.walletAddress.toLowerCase() !== address.toLowerCase()) {
      throw new Error('The wallet session did not match the account you chose.');
    }
    return address;
  }, []);

  const settleAttempt = useCallback((
    generation: number,
    outcome: 'authorized' | 'rejected' | 'cancelled',
    attempt: LedgerSession<Eip1193Provider> | null,
    address: string | null
  ) => applySettledAttempt(settleConnectAttempt(ledgerRef.current, {
    generation,
    outcome,
    session: attempt,
    address
  })), [applySettledAttempt]);

  useEffect(() => {
    const cached = readCachedWalletConnector();
    if (cached?.method === 'base-account' || (!cached && readCachedBaseAccount())) {
      const restored = {
        method: 'base-account' as const,
        name: 'Base Account',
        provider: baseAccountProvider
      };
      setActiveEvmSession(restored);
      ledgerRef.current = rememberCommittedSession(
        ledgerRef.current,
        restored,
        readCachedBaseAccount()
      );
      bindAccountEvents(restored);
    }
    if (cached?.method !== 'walletconnect') return undefined;
    const projectId = walletConnectProjectId();
    if (!projectId) return undefined;
    let cancelled = false;
    void restoreWalletConnectSession(projectId).then((restored) => {
      if (cancelled || !restored) return;
      if (readCachedBaseAccount()?.toLowerCase() !== restored.address.toLowerCase()) return;
      walletConnectProviderRef.current = restored.provider;
      const session = {
        method: 'walletconnect' as const,
        name: 'WalletConnect',
        provider: restored.provider
      };
      setActiveEvmSession(session);
      ledgerRef.current = rememberCommittedSession(
        ledgerRef.current,
        session,
        restored.address
      );
      bindAccountEvents(session);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent).detail as {
        info?: { uuid?: string; name?: string; rdns?: string; icon?: string };
        provider?: Eip1193Provider;
      } | undefined;
      const rdns = detail?.info?.rdns?.trim().toLowerCase();
      if (!rdns || !detail?.provider) return;
      const record = {
        uuid: detail.info?.uuid || rdns,
        name: detail.info?.name || rdns,
        rdns,
        icon: detail.info?.icon,
        provider: detail.provider
      };
      announcedProvidersRef.current.set(rdns, detail.provider);
      setAnnouncedWallets((current) => {
        const next = current.filter((entry) => entry.rdns !== rdns);
        next.push(record);
        return next;
      });
      const cached = readCachedWalletConnector();
      if (cached?.method === 'injected' && cached.rdns === rdns) {
        const session = {
          method: 'injected' as const,
          name: cached.name,
          rdns,
          provider: detail.provider
        };
        setActiveEvmSession(session);
        ledgerRef.current = rememberCommittedSession(
          ledgerRef.current,
          session,
          readCachedBaseAccount()
        );
        bindAccountEvents(session);
      }
    };
    window.addEventListener('eip6963:announceProvider', onAnnounce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    return () => window.removeEventListener('eip6963:announceProvider', onAnnounce);
  }, []);

  useEffect(() => {
    if (!accountEvents) return undefined;
    let active = true;
    const handleAccountEvents = (accounts: unknown) => {
      if (!active) return;
      const parsed = readProviderAccounts(accounts);
      if (!parsed) {
        commitActiveWalletAddress(null);
        onWalletError('The wallet sent an invalid account update. Choose your wallet again.');
        return;
      }
      const next = parsed[0] || null;
      if (!next) {
        commitActiveWalletAddress(null);
        onWalletError('');
        return;
      }
      if (next.toLowerCase() === activeWalletAddressRef.current?.toLowerCase()) return;
      const started = startConnectAttempt(ledgerRef.current);
      ledgerRef.current = started.state;
      connectGenerationRef.current = started.generation;
      const generation = started.generation;
      const attempt = getActiveEvmSession();
      if (!attempt || attempt.provider !== accountEvents) return;
      void signAttempt(next, generation, attempt).then((address) => {
        const applied = settleAttempt(generation, 'authorized', attempt, address);
        if (!applied) return;
      }).catch((error: any) => {
        const applied = settleAttempt(generation, 'rejected', attempt, null);
        if (applied || generation !== ledgerRef.current.generation) return;
        console.error('Wallet account switch failed', error);
        onWalletError(getUserFacingMessage(error, 'Wallet switch was cancelled.'));
      });
    };
    const handleAccountDisconnect = () => {
      if (!active) return;
      commitActiveWalletAddress(null);
      onWalletError('');
    };
    accountEvents.on?.('accountsChanged', handleAccountEvents);
    accountEvents.on?.('disconnect', handleAccountDisconnect);
    return () => {
      active = false;
      accountEvents.removeListener?.('accountsChanged', handleAccountEvents);
      accountEvents.removeListener?.('disconnect', handleAccountDisconnect);
    };
  }, [accountEvents, commitActiveWalletAddress, onWalletError, settleAttempt, signAttempt]);

  const selectWalletChoice = useCallback(async (choice: WalletChoice) => {
    const started = startConnectAttempt(ledgerRef.current);
    ledgerRef.current = started.state;
    const generation = started.generation;
    connectGenerationRef.current = generation;
    setBusyChoiceId(choice.id);
    setChooserError('');
    setWalletConnectUri('');
    let attempt: ActiveEvmSession | null = null;
    let outcome: 'authorized' | 'rejected' | 'cancelled' = 'rejected';
    let address: Address | null = null;
    try {
      if (choice.method === 'handoff' && choice.handoffUrl) {
        window.location.assign(choice.handoffUrl);
        outcome = 'cancelled';
        return;
      }
      if (choice.method === 'base-account') {
        attempt = {
          method: 'base-account',
          name: 'Base Account',
          provider: baseAccountProvider
        };
        ledgerRef.current = trackPendingProvider(ledgerRef.current, generation, attempt.provider);
        address = await connectBaseAccount();
      } else if (choice.method === 'walletconnect') {
        const projectId = walletConnectProjectId();
        if (!projectId) throw new Error('WalletConnect is not configured.');
        const connected = await connectWalletConnect({
          projectId,
          onDisplayUri: (uri) => {
            if (shouldApplyWalletResult(generation, connectGenerationRef.current)) setWalletConnectUri(uri);
          }
        });
        attempt = {
          method: 'walletconnect',
          name: 'WalletConnect',
          provider: connected.provider
        };
        ledgerRef.current = trackPendingProvider(ledgerRef.current, generation, connected.provider);
        address = connected.address;
      } else {
        const provider = choice.rdns ? announcedProvidersRef.current.get(choice.rdns) : undefined;
        if (!provider) throw new Error('That wallet is no longer available in this browser.');
        ledgerRef.current = trackPendingProvider(ledgerRef.current, generation, provider);
        address = await connectInjectedProvider(provider);
        attempt = {
          method: 'injected',
          name: choice.title,
          rdns: choice.rdns,
          provider
        };
      }
      address = await signAttempt(address, generation, attempt);
      outcome = 'authorized';
    } catch (error: any) {
      outcome = 'rejected';
      if (generation !== ledgerRef.current.generation) return;
      console.error('Wallet connection failed', error);
      const message = getUserFacingMessage(error, 'Wallet connection was cancelled.');
      setChooserError(message);
      onWalletError(message);
      setBusyChoiceId(null);
      setIsConnecting(false);
    } finally {
      const applied = settleAttempt(generation, outcome, attempt, address);
      if (applied && address) finishChooser(address);
    }
  }, [finishChooser, onWalletError, settleAttempt, signAttempt]);

  const cancelChooser = useCallback(() => {
    const superseded = supersedeConnectAttempts(ledgerRef.current);
    connectGenerationRef.current = superseded.state.generation;
    applySettledAttempt(superseded);
    finishChooser(null);
    onWalletError('');
  }, [applySettledAttempt, finishChooser, onWalletError]);

  const connectWallet = useCallback(async () => {
    if (activeWalletAddress) {
      onWalletError('');
      return activeWalletAddress;
    }
    return openChooser();
  }, [activeWalletAddress, onWalletError, openChooser]);

  const switchWallet = useCallback(async () => {
    const session = getActiveEvmSession();
    if (session && session.method !== 'base-account') {
      return openChooser();
    }
    setIsConnecting(true);
    const started = startConnectAttempt(ledgerRef.current);
    ledgerRef.current = started.state;
    const generation = started.generation;
    connectGenerationRef.current = generation;
    const attempt: ActiveEvmSession = {
      method: 'base-account',
      name: 'Base Account',
      provider: baseAccountProvider
    };
    let outcome: 'authorized' | 'rejected' = 'rejected';
    let address: Address | null = null;
    try {
      onWalletError('');
      address = await switchBaseAccount();
      ledgerRef.current = trackPendingProvider(ledgerRef.current, generation, attempt.provider);
      address = await signAttempt(address, generation, attempt);
      outcome = 'authorized';
    } catch (error: any) {
      outcome = 'rejected';
      if (generation === ledgerRef.current.generation) {
        console.error('Base Account switch failed', error);
        onWalletError(getUserFacingMessage(error, 'Wallet switch was cancelled.'));
      }
    } finally {
      const applied = settleAttempt(generation, outcome, attempt, address);
      if (generation === ledgerRef.current.generation) setIsConnecting(false);
      if (
        applied
        && activeWalletAddress
        && address
        && address.toLowerCase() === activeWalletAddress.toLowerCase()
      ) {
        onWalletError('Base kept the same account. Disconnect, then sign out of Base Account before reconnecting with a different identity.');
      }
    }
    return outcome === 'authorized' && generation === ledgerRef.current.generation
      ? address
      : null;
  }, [activeWalletAddress, onWalletError, openChooser, settleAttempt, signAttempt]);

  const disconnectWallet = useCallback(async () => {
    const previousAddress = ledgerRef.current.address;
    const session = ledgerRef.current.committed;
    const dropped = dropCommittedSession(ledgerRef.current);
    connectGenerationRef.current = dropped.state.generation;
    applySettledAttempt(dropped);
    let cleanupError: unknown = null;
    try {
      if (!session || session.method === 'base-account') {
        await disconnectBaseAccount();
      } else {
        await session.provider.disconnect?.();
      }
    } catch (error: any) {
      console.error('Base Account disconnect failed', error);
      cleanupError = error;
    }
    await logoutWalletProfileSession(previousAddress);
    onWalletError(cleanupError
      ? 'This wallet was disconnected from the game, but the wallet could not confirm session cleanup. Choose your account when reconnecting.'
      : '');
  }, [applySettledAttempt, onWalletError]);

  useEffect(() => rscBalanceCoordinator.subscribe((state) => {
    const error = state.error
      ? getUserFacingMessage(
          state.error,
          state.hasValue
            ? 'Research Coin balance could not be refreshed.'
            : 'Research Coin balance could not be loaded.'
        )
      : undefined;
    onRscBalanceChange?.({
      status: state.error
        ? 'error'
        : state.status === 'refreshing'
          ? 'ready'
          : state.status,
      balance: state.value,
      error,
      refreshing: state.busy
    });
  }), [onRscBalanceChange, rscBalanceCoordinator]);

  useEffect(() => playerShipAccessCoordinator.subscribe((state) => {
    const error = state.error
      ? getUserFacingMessage(
          state.error,
          state.hasValue
            ? 'Ship access could not be refreshed.'
            : 'Ship access could not be refreshed. Reconnect Base Account and try again.'
        )
      : undefined;
    onPlayerShipAccessChange?.({
      status: state.hasValue
        ? 'ready'
        : state.error
          ? 'error'
          : state.status === 'refreshing'
          ? 'ready'
          : state.status,
      access: state.value,
      error,
      refreshing: state.busy
    });
  }), [onPlayerShipAccessChange, playerShipAccessCoordinator]);

  useEffect(() => {
    rscBalanceCoordinator.setOwner(activeWalletAddress);
    playerShipAccessCoordinator.setOwner(activeWalletAddress);
    if (activeWalletAddress) void rscBalanceCoordinator.refresh();
  }, [activeWalletAddress, playerShipAccessCoordinator, rscBalanceCoordinator]);

  useEffect(() => () => {
    // React StrictMode replays effect setup/cleanup while preserving hook
    // state. Invalidate owner-bound reads without terminally disposing these
    // useState-owned coordinators so the replayed setup remains functional.
    rscBalanceCoordinator.setOwner(null);
    playerShipAccessCoordinator.setOwner(null);
  }, [playerShipAccessCoordinator, rscBalanceCoordinator]);

  const refreshRscBalance = useCallback(async (
    requestedAddress?: Address | null,
    mode: 'dedupe' | 'force' | 'trailing' = 'dedupe'
  ) => {
    const address = requestedAddress || activeWalletAddress;
    if (!address || !isCurrentWalletAddress(address)) return null;
    rscBalanceCoordinator.setOwner(address);
    return rscBalanceCoordinator.refresh({ mode });
  }, [activeWalletAddress, isCurrentWalletAddress, rscBalanceCoordinator]);

  const refreshPlayerShipAccess = useCallback(async (
    requestedAddress?: Address | null,
    mode: 'dedupe' | 'force' | 'trailing' = 'dedupe'
  ) => {
    const address = requestedAddress || activeWalletAddress;
    if (!address || !isCurrentWalletAddress(address)) return null;
    playerShipAccessCoordinator.setOwner(address);
    return playerShipAccessCoordinator.refresh({ mode });
  }, [activeWalletAddress, isCurrentWalletAddress, playerShipAccessCoordinator]);

  const purchaseWithRsc = useCallback(async (skuId: RscPurchaseSkuId) => {
    if (purchaseBusyRef.current) return;
    purchaseBusyRef.current = true;
    let requestAddress: Address | null = null;
    try {
      onWalletPurchaseStatus?.({ status: 'connecting', skuId });
      const address = activeWalletAddress || await connectWallet();
      if (!address) {
        onWalletPurchaseStatus?.({
          status: 'error',
          skuId,
          error: 'Connect a wallet before purchasing with Research Coin.'
        });
        return;
      }
      requestAddress = address;
      onWalletPurchaseStatus?.({ status: 'authorizing', skuId });
      const settlement = await executeWalletPurchase({
        walletAddress: address,
        skuId,
        onQuote: () => {
          if (!isCurrentWalletAddress(address)) return;
          onWalletPurchaseStatus?.({ status: 'confirming', skuId });
        },
        onSubmitted: (transactionHash) => {
          if (!isCurrentWalletAddress(address)) return;
          onWalletPurchaseStatus?.({
            status: 'settling',
            skuId,
            transactionHash
          });
        }
      });
      if (!isCurrentWalletAddress(address)) return;
      onWalletPurchaseSuccess?.(settlement);
      onWalletPurchaseStatus?.({
        status: 'confirmed',
        skuId,
        transactionHash: settlement.transactionHash
      });
      await refreshRscBalance(address, 'force');
    } catch (error: any) {
      if (requestAddress && !isCurrentWalletAddress(requestAddress)) return;
      onWalletPurchaseStatus?.({
        status: 'error',
        skuId,
        error: getUserFacingMessage(error, 'Research Coin purchase was cancelled.')
      });
    } finally {
      purchaseBusyRef.current = false;
    }
  }, [
    activeWalletAddress,
    connectWallet,
    isCurrentWalletAddress,
    onWalletPurchaseStatus,
    onWalletPurchaseSuccess,
    refreshRscBalance
  ]);

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
        if (!active || !isCurrentWalletAddress(activeWalletAddress)) {
          resumedPurchaseOrdersRef.current.delete(recoveryKey);
          return;
        }
        if (!settlement) return;
        onWalletPurchaseSuccess?.(settlement);
        onWalletPurchaseStatus?.({
          status: 'confirmed',
          skuId: settlement.skuId,
          transactionHash: settlement.transactionHash
        });
        await refreshRscBalance(activeWalletAddress, 'force');
      })
      .catch((error: any) => {
        if (!active || !isCurrentWalletAddress(activeWalletAddress)) {
          resumedPurchaseOrdersRef.current.delete(recoveryKey);
          return;
        }
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
  }, [
    activeWalletAddress,
    isCurrentWalletAddress,
    onWalletPurchaseStatus,
    onWalletPurchaseSuccess,
    refreshRscBalance
  ]);

  const purchasePlayerShip = useCallback(async (
    skuId: PlayerShipPurchaseSkuId
  ) => {
    if (playerShipPurchaseBusyRef.current) return;
    playerShipPurchaseBusyRef.current = true;
    let requestAddress: Address | null = null;
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
      requestAddress = address;
      onPlayerShipPurchaseStatus?.({ status: 'authorizing', skuId });
      const settlement = await executePlayerShipPurchase({
        walletAddress: address,
        skuId,
        onQuote: () => {
          if (!isCurrentWalletAddress(address)) return;
          onPlayerShipPurchaseStatus?.({ status: 'confirming', skuId });
        },
        onBatchSubmitted: () => {
          if (!isCurrentWalletAddress(address)) return;
          onPlayerShipPurchaseStatus?.({ status: 'settling', skuId });
        },
        onSubmitted: (transactionHash) => {
          if (!isCurrentWalletAddress(address)) return;
          onPlayerShipPurchaseStatus?.({
            status: 'settling',
            skuId,
            transactionHash
          });
        }
      });
      if (!isCurrentWalletAddress(address)) return;
      onPlayerShipPurchaseSuccess?.(settlement);
      playerShipAccessCoordinator.commitAuthoritative(address, settlement.access);
      onPlayerShipPurchaseStatus?.({
        status: 'confirmed',
        skuId,
        transactionHash: settlement.transactionHash
      });
    } catch (error: any) {
      if (requestAddress && !isCurrentWalletAddress(requestAddress)) return;
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
    isCurrentWalletAddress,
    playerShipAccessCoordinator,
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
          if (!active || !isCurrentWalletAddress(activeWalletAddress)) {
            resumedPlayerShipPurchaseOrdersRef.current.delete(recoveryKey);
            return;
          }
          if (!settlement) return;
          onPlayerShipPurchaseSuccess?.(settlement);
          playerShipAccessCoordinator.commitAuthoritative(activeWalletAddress, settlement.access);
          onPlayerShipPurchaseStatus?.({
            status: 'confirmed',
            skuId: settlement.skuId,
            transactionHash: settlement.transactionHash
          });
        })
        .catch((error: any) => {
          if (!active || !isCurrentWalletAddress(activeWalletAddress)) {
            resumedPlayerShipPurchaseOrdersRef.current.delete(recoveryKey);
            return;
          }
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
    isCurrentWalletAddress,
    playerShipAccessCoordinator,
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
      await refreshRscBalance(address, 'force');
    } catch (error: any) {
      onContinueStatusChange({
        status: 'error',
        error: getUserFacingMessage(error, 'RSC continue payment was cancelled.')
      });
    }
  }, [activeWalletAddress, connectWallet, onContinueStatusChange, onContinueSuccess, refreshRscBalance]);

  const claimChampion = useCallback(async (
    weekKey: string,
    proposal: ResearchHubProposal,
    receipt?: RunReceipt
  ) => {
    onChampionClaimStatus('connecting');
    const address = activeWalletAddress || await connectWallet();
    if (!address) {
      onChampionClaimStatus('error', 'Connect the Base Account associated with the winning run.');
      return;
    }
    try {
      onChampionClaimStatus('signing');
      if (receipt) {
        await associateRunWithWallet({
          address,
          receipt,
          signMessage: signBaseAccountMessage
        });
      }
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
    const context: MissionMintStatusContext = {
      walletAddress: address,
      runId: receipt.runId
    };
    try {
      onMissionMintStatus('authorizing', '', '', context);
      // Mint authorization mutates the canonical receipt owner. Establish or
      // reuse the exact wallet-profile session before requesting it so a
      // public address alone can never authorize another wallet's history.
      await loadAuthenticatedWalletProfile(address, { interactive: true });
      const result = await mintMissionRecord({ address, receipt });
      if (!isCurrentWalletAddress(address)) return;
      onMissionMintStatus(
        'confirmed',
        result.tokenId ? `Mission Record #${result.tokenId} minted.` : 'Mission Record minted.',
        result.transactionHash,
        context
      );
    } catch (error: any) {
      if (!isCurrentWalletAddress(address)) return;
      onMissionMintStatus(
        'error',
        getUserFacingMessage(error, 'Mission Record mint was cancelled.'),
        '',
        context
      );
    }
  }, [activeWalletAddress, connectWallet, isCurrentWalletAddress, onMissionMintStatus]);

  useEffect(() => {
    if (!action || startedActionNonceRef.current === action.nonce) return;

    const currentAction = action;
    startedActionNonceRef.current = currentAction.nonce;

    const runAction = async () => {
      if (currentAction.type === 'connect') {
        // The chooser stays open after this action is marked handled, so the
        // home button does not sit on Loading underneath the dialog.
        void connectWallet();
      } else if (currentAction.type === 'switch-account') {
        const session = getActiveEvmSession();
        if (session && session.method !== 'base-account') {
          void switchWallet();
        } else {
          await switchWallet();
        }
      } else if (currentAction.type === 'disconnect') {
        await disconnectWallet();
      } else if (currentAction.type === 'release') {
        const previousAddress = ledgerRef.current.address;
        const dropped = dropCommittedSession(ledgerRef.current);
        connectGenerationRef.current = dropped.state.generation;
        applySettledAttempt(dropped);
        void logoutWalletProfileSession(previousAddress);
        finishChooser(null);
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
        await claimChampion(currentAction.weekKey, currentAction.proposal, currentAction.receipt);
      } else if (currentAction.type === 'mint-mission') {
        await mintMission(currentAction.receipt);
      }
    };

    void runAction().finally(() => {
      onActionHandled(currentAction.nonce);
    });
  }, [
    action,
    applySettledAttempt,
    claimChampion,
    commitActiveWalletAddress,
    connectWallet,
    continueWithRsc,
    disconnectWallet,
    finishChooser,
    mintMission,
    onActionHandled,
    purchasePlayerShip,
    purchaseWithRsc,
    refreshPlayerShipAccess,
    refreshRscBalance,
    switchWallet
  ]);

  const walletChoices = buildWalletChoices({
    announced: announcedWallets,
    mobile: typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
    pageUrl: typeof window === 'undefined' ? 'https://www.sciconshooter.xyz/' : window.location.href,
    walletConnectProjectId: walletConnectProjectId()
  });

  return chooserOpen ? (
    <WalletChooser
      choices={walletChoices}
      busyId={busyChoiceId}
      error={chooserError}
      walletConnectUri={walletConnectUri}
      onSelect={(choice) => {
        void selectWalletChoice(choice);
      }}
      onCancel={cancelChooser}
    />
  ) : null;
};

export default WalletRuntime;

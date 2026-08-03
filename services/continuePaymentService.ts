import type { Address, Hex } from 'viem';
import { DONATION_CONFIG } from '../constants';
import {
  sendRscPurchaseTransfer,
  waitForBaseCallsTransaction
} from './baseAccountWallet';
import { loadAuthenticatedWalletProfile } from './walletProfileService';
import {
  beginPendingContinuePayment,
  clearPendingContinuePayment,
  readPendingContinuePayment,
  recordPendingContinueCallsId,
  recordPendingContinueHash
} from './continuePaymentPendingStore';

const CONTINUE_COST_STEP_RAW = 5_000_000_000_000_000_000n;
const CONTINUE_LIVES_REWARD = 5;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export interface ContinuePaymentQuote {
  orderId: string;
  runId: string;
  walletAddress: Address;
  continueSequence: number;
  chainId: 8453;
  tokenAddress: Address;
  recipientAddress: Address;
  rscAmount: string;
  rscAmountRaw: string;
  livesReward: 5;
  expiresAt: string;
}

export interface ContinuePaymentSettlement {
  accepted: true;
  duplicate: boolean;
  orderId: string;
  runId: string;
  continueSequence: number;
  livesReward: 5;
  rscAmount: string;
  transactionHash: Hex;
  logIndex: number;
}

export class ContinuePaymentRequestError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code = '') {
    super(message);
    this.name = 'ContinuePaymentRequestError';
    this.status = status;
    this.code = code;
  }
}

const requestContinuePayment = async <T>(body: Record<string, unknown>): Promise<T> => {
  const response = await fetch('/api/continue-payments', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ContinuePaymentRequestError(
      payload.error || 'The Continue payment could not be completed.',
      response.status,
      payload.code || ''
    );
  }
  return payload as T;
};
const validRecipient = (value: string, walletAddress: Address): Address | null => {
  const recipient = String(value || '').trim().toLowerCase();
  if (
    !/^0x[0-9a-f]{40}$/.test(recipient)
    || recipient === ZERO_ADDRESS
    || recipient === DONATION_CONFIG.RSC_CONTRACT_ADDRESS.toLowerCase()
    || recipient !== DONATION_CONFIG.RECIPIENT_ADDRESS.toLowerCase()
    || recipient === walletAddress.toLowerCase()
  ) return null;
  return recipient as Address;
};

const expectedAmountRaw = (continueSequence: number) => (
  CONTINUE_COST_STEP_RAW * BigInt(continueSequence)
).toString();

const assertQuoteIntegrity = ({
  quote,
  walletAddress,
  runId,
  expectedContinueSequence
}: {
  quote: ContinuePaymentQuote;
  walletAddress: Address;
  runId: string;
  expectedContinueSequence: number;
}) => {
  const recipient = validRecipient(quote.recipientAddress, walletAddress);
  if (
    !recipient
    || quote.walletAddress.toLowerCase() !== walletAddress.toLowerCase()
    || quote.runId.toLowerCase() !== runId.toLowerCase()
    || quote.continueSequence !== expectedContinueSequence
    || !Number.isSafeInteger(quote.continueSequence)
    || quote.continueSequence < 1
    || quote.chainId !== DONATION_CONFIG.BASE_CHAIN_ID
    || quote.tokenAddress.toLowerCase() !== DONATION_CONFIG.RSC_CONTRACT_ADDRESS.toLowerCase()
    || quote.recipientAddress.toLowerCase() !== recipient
    || quote.rscAmountRaw !== expectedAmountRaw(quote.continueSequence)
    || quote.rscAmount !== String(quote.continueSequence * 5)
    || quote.livesReward !== CONTINUE_LIVES_REWARD
    || !Number.isFinite(Date.parse(quote.expiresAt))
  ) {
    throw new ContinuePaymentRequestError(
      'The Continue quote did not match the published Research Coin terms.',
      409,
      'continue_payment_quote_mismatch'
    );
  }
};

const assertSettlementIntegrity = ({
  settlement,
  walletAddress: _walletAddress,
  runId,
  expectedContinueSequence,
  expectedOrderId
}: {
  settlement: ContinuePaymentSettlement;
  walletAddress: Address;
  runId: string;
  expectedContinueSequence: number;
  expectedOrderId: string;
}) => {
  if (
    settlement.accepted !== true
    || settlement.orderId.toLowerCase() !== expectedOrderId.toLowerCase()
    || settlement.runId.toLowerCase() !== runId.toLowerCase()
    || settlement.continueSequence !== expectedContinueSequence
    || settlement.livesReward !== CONTINUE_LIVES_REWARD
    || settlement.rscAmount !== String(expectedContinueSequence * 5)
    || !/^0x[0-9a-f]{64}$/.test(settlement.transactionHash.toLowerCase())
    || !Number.isSafeInteger(settlement.logIndex)
    || settlement.logIndex < 0
  ) {
    throw new ContinuePaymentRequestError(
      'The Continue settlement did not match this run.',
      409,
      'continue_payment_settlement_mismatch'
    );
  }
};

export const createContinuePaymentQuote = async ({
  walletAddress,
  startToken,
  runId,
  expectedContinueSequence
}: {
  walletAddress: Address;
  startToken: string;
  runId: string;
  expectedContinueSequence: number;
}): Promise<ContinuePaymentQuote> => {
  if (walletAddress.toLowerCase() === DONATION_CONFIG.RECIPIENT_ADDRESS.toLowerCase()) {
    throw new ContinuePaymentRequestError(
      'This wallet receives Scicon Shooter payments. Switch to a different Base wallet to Continue.',
      409,
      'continue_payment_self_payment_forbidden'
    );
  }
  await loadAuthenticatedWalletProfile(walletAddress, { interactive: true });
  const response = await requestContinuePayment<{
    walletAddress: Address;
    quote: ContinuePaymentQuote;
  }>({ action: 'quote', startToken });
  if (response.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new ContinuePaymentRequestError(
      'The Continue quote belongs to a different wallet.',
      409,
      'continue_payment_wallet_mismatch'
    );
  }
  assertQuoteIntegrity({ quote: response.quote, walletAddress, runId, expectedContinueSequence });
  return response.quote;
};

export const settleContinuePayment = async ({
  walletAddress,
  orderId,
  runId,
  expectedContinueSequence,
  transactionHash
}: {
  walletAddress: Address;
  orderId: string;
  runId: string;
  expectedContinueSequence: number;
  transactionHash: Hex;
}): Promise<ContinuePaymentSettlement> => {
  const response = await requestContinuePayment<{
    walletAddress: Address;
    settlement: ContinuePaymentSettlement;
  }>({ action: 'settle', orderId, transactionHash });
  if (response.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new ContinuePaymentRequestError(
      'The Continue settlement belongs to a different wallet.',
      409,
      'continue_payment_wallet_mismatch'
    );
  }
  assertSettlementIntegrity({
    settlement: response.settlement,
    walletAddress,
    runId,
    expectedContinueSequence,
    expectedOrderId: orderId
  });
  return response.settlement;
};

export const resumePendingContinuePayment = async ({
  walletAddress,
  runId,
  expectedContinueSequence
}: {
  walletAddress: Address;
  runId: string;
  expectedContinueSequence: number;
}): Promise<ContinuePaymentSettlement | null> => {
  const pending = readPendingContinuePayment(walletAddress, runId);
  if (!pending) return null;
  if (pending.continueSequence !== expectedContinueSequence) {
    throw new ContinuePaymentRequestError(
      'A different Continue payment is already pending for this run.',
      409,
      'continue_payment_sequence_mismatch'
    );
  }
  let transactionHash = pending.transactionHash;
  if (!transactionHash && pending.callsId) {
    transactionHash = await waitForBaseCallsTransaction(pending.callsId);
    recordPendingContinueHash(walletAddress, runId, pending.orderId, transactionHash);
  }
  if (!transactionHash) {
    if (Date.parse(pending.expiresAt) <= Date.now()) {
      clearPendingContinuePayment(walletAddress, runId, pending.orderId);
      return null;
    }
    throw new ContinuePaymentRequestError(
      'This Continue is already waiting for wallet confirmation.',
      409,
      'continue_payment_in_progress'
    );
  }
  const settlement = await settleContinuePayment({
    walletAddress,
    orderId: pending.orderId,
    runId,
    expectedContinueSequence,
    transactionHash
  });
  clearPendingContinuePayment(walletAddress, runId, pending.orderId);
  return settlement;
};

export const executeContinuePayment = async ({
  walletAddress,
  startToken,
  runId,
  expectedContinueSequence,
  onQuote,
  onBatchSubmitted,
  onSubmitted
}: {
  walletAddress: Address;
  startToken: string;
  runId: string;
  expectedContinueSequence: number;
  onQuote?: (quote: ContinuePaymentQuote) => void;
  onBatchSubmitted?: (callsId: Hex, quote: ContinuePaymentQuote) => void;
  onSubmitted?: (transactionHash: Hex, quote: ContinuePaymentQuote) => void;
}): Promise<ContinuePaymentSettlement> => {
  const pending = readPendingContinuePayment(walletAddress, runId);
  if (pending) {
    const resumed = await resumePendingContinuePayment({
      walletAddress,
      runId,
      expectedContinueSequence
    });
    if (resumed) return resumed;
  }

  const quote = await createContinuePaymentQuote({
    walletAddress,
    startToken,
    runId,
    expectedContinueSequence
  });
  onQuote?.(quote);
  beginPendingContinuePayment({
    walletAddress,
    runId,
    orderId: quote.orderId,
    continueSequence: quote.continueSequence,
    expiresAt: quote.expiresAt
  });
  if (Date.parse(quote.expiresAt) <= Date.now()) {
    clearPendingContinuePayment(walletAddress, runId, quote.orderId);
    throw new ContinuePaymentRequestError(
      'This Continue quote expired before the wallet opened.',
      409,
      'continue_payment_expired'
    );
  }

  let transactionHash: Hex;
  try {
    transactionHash = await sendRscPurchaseTransfer({
      from: walletAddress,
      recipient: quote.recipientAddress,
      amountRaw: BigInt(quote.rscAmountRaw),
      onSubmitted: (callsId) => {
        recordPendingContinueCallsId(walletAddress, runId, quote.orderId, callsId);
        onBatchSubmitted?.(callsId, quote);
      }
    });
  } catch (error) {
    const submitted = readPendingContinuePayment(walletAddress, runId);
    if (!submitted?.callsId && !submitted?.transactionHash) {
      clearPendingContinuePayment(walletAddress, runId, quote.orderId);
    }
    throw error;
  }
  recordPendingContinueHash(walletAddress, runId, quote.orderId, transactionHash);
  onSubmitted?.(transactionHash, quote);
  const settlement = await settleContinuePayment({
    walletAddress,
    orderId: quote.orderId,
    runId,
    expectedContinueSequence,
    transactionHash
  });
  clearPendingContinuePayment(walletAddress, runId, quote.orderId);
  return settlement;
};

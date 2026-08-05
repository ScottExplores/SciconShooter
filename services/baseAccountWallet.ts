import { createBaseAccountSDK } from '@base-org/account';
import { Attribution } from 'ox/erc8021';
import {
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  http,
  parseUnits,
  stringToHex,
  toHex,
  type Address,
  type Hex
} from 'viem';
import { base } from 'viem/chains';
import {
  BIO_SHIP_HOLDING_REQUIREMENT,
  DONATION_CONFIG,
  PLAYER_SHIP_PURCHASE_SKUS
} from '../constants';

type CallsStatusResponse = {
  status?: number;
  receipts?: Array<{ transactionHash?: Hex }>;
};

type SendCallsResponse = Hex | {
  id?: Hex;
  batchId?: Hex;
};

export type BaseCall = {
  to: Address;
  data?: Hex;
  value?: Hex;
};

const sdk = createBaseAccountSDK({
  appName: 'Scicon Shooter',
  appLogoUrl: `${DONATION_CONFIG.GAME_URL}/icon.png`,
  appChainIds: [DONATION_CONFIG.BASE_CHAIN_ID]
});

export const baseAccountProvider = sdk.getProvider();

const BASE_ACCOUNT_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

/**
 * Treat provider responses as untrusted input. Base Account normally returns
 * EVM addresses, but wallet switches can briefly surface malformed payloads
 * while the host app is changing identities.
 */
export const parseBaseAccountAddress = (value: unknown): Address | null => {
  if (typeof value !== 'string') return null;
  const address = value.trim();
  return BASE_ACCOUNT_ADDRESS_PATTERN.test(address) ? address as Address : null;
};

export const parseBaseAccountAccounts = (value: unknown): Address[] | null => {
  if (!Array.isArray(value)) return null;
  const accounts = value.map(parseBaseAccountAddress);
  return accounts.every((address): address is Address => Boolean(address))
    ? accounts
    : null;
};

const requireBaseAccountAddress = (value: unknown, message: string): Address => {
  const accounts = parseBaseAccountAccounts(value);
  if (!accounts?.[0]) throw new Error(message);
  return accounts[0];
};

const parseWalletConnectAddress = (value: unknown): Address | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const accounts = (value as { accounts?: unknown }).accounts;
  if (!Array.isArray(accounts) || !accounts[0] || typeof accounts[0] !== 'object') return null;
  return parseBaseAccountAddress((accounts[0] as { address?: unknown }).address);
};

const publicClient = createPublicClient({
  chain: base,
  transport: http(DONATION_CONFIG.BASE_RPC_URL)
});

let cachedRscDecimals: number | null = null;

const readRscDecimals = async (): Promise<number> => {
  if (cachedRscDecimals !== null) return cachedRscDecimals;
  const decimals = await publicClient.readContract({
    address: DONATION_CONFIG.RSC_CONTRACT_ADDRESS as Address,
    abi: erc20Abi,
    functionName: 'decimals'
  } as any) as number;
  cachedRscDecimals = Number(decimals);
  return cachedRscDecimals;
};

export interface RscBalanceSnapshot {
  address: Address;
  raw: bigint;
  formatted: string;
  decimals: number;
  symbol: 'RSC';
}

export interface BioBalanceSnapshot {
  address: Address;
  raw: bigint;
  formatted: string;
  decimals: typeof BIO_SHIP_HOLDING_REQUIREMENT.decimals;
  symbol: typeof BIO_SHIP_HOLDING_REQUIREMENT.tokenSymbol;
  meetsRequirement: boolean;
}

export const getRscBalance = async (address: Address): Promise<RscBalanceSnapshot> => {
  const [decimals, raw] = await Promise.all([
    readRscDecimals(),
    publicClient.readContract({
      address: DONATION_CONFIG.RSC_CONTRACT_ADDRESS as Address,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [address]
    } as any) as Promise<bigint>
  ]);
  return {
    address,
    raw,
    formatted: formatUnits(raw, decimals),
    decimals,
    symbol: 'RSC'
  };
};

/**
 * Reads BIO as a raw bigint and only formats it after the exact holding check.
 * Ship admission is still decided by the authenticated access API; this helper
 * is useful for an immediate wallet-side refresh without number coercion.
 */
export const getBioBalance = async (address: Address): Promise<BioBalanceSnapshot> => {
  const raw = await publicClient.readContract({
    address: BIO_SHIP_HOLDING_REQUIREMENT.tokenAddress as Address,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address]
  } as any) as bigint;
  const minimum = BigInt(BIO_SHIP_HOLDING_REQUIREMENT.minimumAmountRaw);
  return {
    address,
    raw,
    formatted: formatUnits(raw, BIO_SHIP_HOLDING_REQUIREMENT.decimals),
    decimals: BIO_SHIP_HOLDING_REQUIREMENT.decimals,
    symbol: BIO_SHIP_HOLDING_REQUIREMENT.tokenSymbol,
    meetsRequirement: raw >= minimum
  };
};

const builderCodeSuffix = Attribution.toDataSuffix({
  codes: [DONATION_CONFIG.BUILDER_CODE]
});

export const waitForBaseCallsTransaction = async (callsId: Hex): Promise<Hex> => {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const result = await baseAccountProvider.request({
      method: 'wallet_getCallsStatus',
      params: [callsId]
    }) as CallsStatusResponse;

    if (result.status === 200) {
      const transactionHash = result.receipts?.find((receipt) => receipt.transactionHash)?.transactionHash;
      if (transactionHash) return transactionHash;
    }

    if (typeof result.status === 'number' && result.status >= 400) {
      throw new Error('The Base transaction failed before confirmation.');
    }

    await new Promise((resolve) => window.setTimeout(resolve, 1000));
  }

  throw new Error('The Base transaction is still pending. Check your wallet before retrying.');
};

export const getConnectedBaseAccount = async (): Promise<Address | null> => {
  const response = await baseAccountProvider.request({ method: 'eth_accounts' });
  const accounts = parseBaseAccountAccounts(response);
  if (!accounts) throw new Error('Base Account returned an invalid account list.');
  return accounts[0] || null;
};

export const connectBaseAccount = async (): Promise<Address> => {
  const response = await baseAccountProvider.request({ method: 'eth_requestAccounts' });
  return requireBaseAccountAddress(response, 'Base Account connected without a valid address.');
};

export const disconnectBaseAccount = async () => {
  await baseAccountProvider.disconnect();
};

export const signBaseAccountMessage = async (address: Address, message: string): Promise<Hex> => {
  const response = await baseAccountProvider.request({
    method: 'personal_sign',
    params: [stringToHex(message), address]
  }) as Hex | { result?: Hex; signature?: Hex };
  const signature = typeof response === 'string'
    ? response
    : response.signature || response.result;
  if (!signature) throw new Error('Base Account did not return a message signature.');
  return signature;
};

export const switchBaseAccount = async (): Promise<Address> => {
  const result = await baseAccountProvider.request({
    method: 'wallet_connect',
    params: [{ version: '1' }]
  });
  const address = parseWalletConnectAddress(result);
  if (!address) throw new Error('Base Account did not return a wallet address.');
  return address;
};

export const sendAttributedBaseCalls = async ({
  from,
  calls,
  sponsorGas = false,
  onSubmitted
}: {
  from: Address;
  calls: BaseCall[];
  sponsorGas?: boolean;
  onSubmitted?: (callsId: Hex) => void;
}): Promise<Hex> => {
  const paymasterProxyUrl = (import.meta.env.VITE_PAYMASTER_PROXY_URL as string | undefined)?.trim();
  const capabilities: Record<string, unknown> = {
    dataSuffix: {
      value: builderCodeSuffix,
      optional: true
    }
  };

  if (sponsorGas && paymasterProxyUrl) {
    capabilities.paymasterService = { url: paymasterProxyUrl };
  }

  const response = await baseAccountProvider.request({
    method: 'wallet_sendCalls',
    params: [{
      version: '2.0.0',
      chainId: DONATION_CONFIG.BASE_CHAIN_ID_HEX as Hex,
      atomicRequired: true,
      from,
      calls,
      capabilities
    }]
  }) as SendCallsResponse;

  const callsId = typeof response === 'string'
    ? response
    : response.id || response.batchId;

  if (!callsId) {
    throw new Error('Base Account did not return a transaction batch ID.');
  }

  onSubmitted?.(callsId);
  return waitForBaseCallsTransaction(callsId);
};

const assertBaseMainnetProvider = async () => {
  const providerChainId = await baseAccountProvider.request({ method: 'eth_chainId' });
  let chainId: bigint;
  try {
    chainId = BigInt(String(providerChainId));
  } catch {
    throw new Error('Base Account returned an invalid network identifier.');
  }
  if (chainId !== BigInt(DONATION_CONFIG.BASE_CHAIN_ID)) {
    throw new Error('Switch Base Account to Base Mainnet before purchasing this ship.');
  }
};

const assertShipPurchaseRecipient = (from: Address, recipient: Address) => {
  const normalizedRecipient = recipient.toLowerCase();
  if (
    !/^0x[0-9a-f]{40}$/.test(normalizedRecipient)
    || normalizedRecipient === '0x0000000000000000000000000000000000000000'
    || normalizedRecipient !== DONATION_CONFIG.RECIPIENT_ADDRESS.toLowerCase()
    || normalizedRecipient === from.toLowerCase()
  ) {
    throw new Error('The ship purchase recipient does not match the published Scicon store wallet.');
  }
};

/**
 * Sends the published 0.001 ETH ship payment as one native Base call. This
 * intentionally omits attribution capabilities so the payment calldata stays
 * exactly `0x`. Persisting the calls ID before polling makes an approved
 * payment recoverable if the page closes before the transaction hash arrives.
 */
export const sendEthShipPurchaseTransfer = async ({
  from,
  recipient,
  amountRaw,
  onSubmitted
}: {
  from: Address;
  recipient: Address;
  amountRaw: bigint;
  onSubmitted?: (callsId: Hex) => void;
}): Promise<Hex> => {
  assertShipPurchaseRecipient(from, recipient);
  if (amountRaw !== BigInt(PLAYER_SHIP_PURCHASE_SKUS['eth-ship'].amountRaw)) {
    throw new Error('The ETH ship payment does not match the published 0.001 ETH price.');
  }
  await assertBaseMainnetProvider();
  const response = await baseAccountProvider.request({
    method: 'wallet_sendCalls',
    params: [{
      version: '2.0.0',
      chainId: DONATION_CONFIG.BASE_CHAIN_ID_HEX as Hex,
      atomicRequired: true,
      from,
      calls: [{
        to: recipient,
        value: toHex(amountRaw),
        data: '0x'
      }]
    }]
  }) as SendCallsResponse;
  const callsId = typeof response === 'string'
    ? response
    : response.id || response.batchId;
  if (!callsId) {
    throw new Error('Base Account did not return an ETH payment call ID.');
  }
  onSubmitted?.(callsId);
  return waitForBaseCallsTransaction(callsId);
};

export const waitForBaseTransactionReceipt = async (transactionHash: Hex): Promise<Hex> => {
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: transactionHash,
    confirmations: 1,
    timeout: 90_000
  });
  if (receipt.status !== 'success') {
    throw new Error('The Base transaction reverted before confirmation.');
  }
  return transactionHash;
};

/** Sends the published 0.00008 cbBTC ship payment as one ERC-20 call. */
export const sendCbBtcShipPurchaseTransfer = async ({
  from,
  recipient,
  amountRaw,
  onSubmitted
}: {
  from: Address;
  recipient: Address;
  amountRaw: bigint;
  onSubmitted?: (callsId: Hex) => void;
}): Promise<Hex> => {
  assertShipPurchaseRecipient(from, recipient);
  if (amountRaw !== BigInt(PLAYER_SHIP_PURCHASE_SKUS['btc-ship'].amountRaw)) {
    throw new Error('The BTC ship payment does not match the published 0.00008 cbBTC price.');
  }
  await assertBaseMainnetProvider();
  return sendAttributedBaseCalls({
    from,
    calls: [{
      to: DONATION_CONFIG.CBBTC_CONTRACT_ADDRESS as Address,
      value: '0x0',
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [recipient, amountRaw]
      })
    }],
    onSubmitted
  });
};

export const sendRscContinuePayment = async ({
  from,
  amount
}: {
  from: Address;
  amount: number;
}): Promise<Hex> => {
  const contractAddress = DONATION_CONFIG.RSC_CONTRACT_ADDRESS as Address;
  const decimals = await readRscDecimals();
  const amountInWei = parseUnits(amount.toString(), decimals);
  const available = await publicClient.readContract({
    address: contractAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [from]
  } as any) as bigint;

  if (available < amountInWei) {
    throw new Error(`You need ${amount} RSC on Base to continue this run.`);
  }

  return sendAttributedBaseCalls({
    from,
    calls: [{
      to: contractAddress,
      value: '0x0',
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [DONATION_CONFIG.RECIPIENT_ADDRESS as Address, amountInWei]
      })
    }]
  });
};

export const sendRscPurchaseTransfer = async ({
  from,
  recipient,
  amountRaw,
  onSubmitted
}: {
  from: Address;
  recipient: Address;
  amountRaw: bigint;
  onSubmitted?: (callsId: Hex) => void;
}): Promise<Hex> => {
  if (amountRaw <= 0n) throw new Error('The RSC purchase amount must be positive.');
  const contractAddress = DONATION_CONFIG.RSC_CONTRACT_ADDRESS as Address;
  const available = await publicClient.readContract({
    address: contractAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [from]
  } as any) as bigint;
  if (available < amountRaw) {
    const decimals = await readRscDecimals();
    throw new Error(`You need ${formatUnits(amountRaw, decimals)} RSC on Base for this purchase.`);
  }
  return sendAttributedBaseCalls({
    from,
    calls: [{
      to: contractAddress,
      value: '0x0',
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [recipient, amountRaw]
      })
    }],
    onSubmitted
  });
};

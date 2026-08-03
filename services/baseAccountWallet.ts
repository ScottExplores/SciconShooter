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
  type Address,
  type Hex
} from 'viem';
import { base } from 'viem/chains';
import { DONATION_CONFIG } from '../constants';

type CallsStatusResponse = {
  status?: number;
  receipts?: Array<{ transactionHash?: Hex }>;
};

type SendCallsResponse = Hex | {
  id?: Hex;
  batchId?: Hex;
};

type WalletConnectResponse = {
  accounts?: Array<{ address?: Address }>;
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
  const accounts = await baseAccountProvider.request({ method: 'eth_accounts' }) as Address[];
  return accounts[0] || null;
};

export const connectBaseAccount = async (): Promise<Address> => {
  const accounts = await baseAccountProvider.request({ method: 'eth_requestAccounts' }) as Address[];
  if (!accounts[0]) throw new Error('Base Account connected without an address.');
  return accounts[0];
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
  }) as WalletConnectResponse;
  const address = result.accounts?.[0]?.address;
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

import type { Address } from 'viem';
import { STORAGE_KEYS } from '../constants';

// REVAMP(J): Startup identity hints must never initialize the wallet SDK.
const BASE_ACCOUNT_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

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

/** Local presentation hint only; authenticated server state remains authoritative. */
export const readCachedBaseAccount = (
  storage?: Pick<Storage, 'getItem'> | null
): Address | null => {
  try {
    const source = storage === undefined
      ? (typeof window === 'undefined' ? null : window.localStorage)
      : storage;
    return parseBaseAccountAddress(source?.getItem(STORAGE_KEYS.WALLET_ADDRESS));
  } catch {
    return null;
  }
};

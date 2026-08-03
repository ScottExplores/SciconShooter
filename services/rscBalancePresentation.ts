import type { RscBalanceSnapshot } from './baseAccountWallet';

/**
 * Wallet rails intentionally show whole RSC only. Truncating the fractional
 * remainder keeps the compact display from overstating what a pilot can spend;
 * purchase admission still compares the exact raw bigint balance.
 */
export const formatWholeRscBalance = ({
  raw,
  decimals
}: Pick<RscBalanceSnapshot, 'raw' | 'decimals'>): string => {
  const safeDecimals = Number.isSafeInteger(decimals) && decimals >= 0 ? decimals : 0;
  const whole = safeDecimals === 0
    ? raw
    : raw / (10n ** BigInt(safeDecimals));
  return whole.toLocaleString('en-US');
};

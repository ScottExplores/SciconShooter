const LEGACY_TOKEN_TERMS = /\bresearch coins?\b|\bcoins?\b/gi;

const replacementForLegacyTerm = (value: string) => (
  /s$/i.test(value) ? 'Tokens' : 'Token'
);

/** Keeps legacy authored copy readable while the persisted currency fields remain unchanged. */
export const toTokenTerminology = (value: string) => (
  String(value || '').replace(LEGACY_TOKEN_TERMS, replacementForLegacyTerm)
);

export const formatTokenAmount = (amount: number) => {
  const normalized = Math.max(0, Math.floor(Number(amount) || 0));
  return `${normalized.toLocaleString()} ${normalized === 1 ? 'Token' : 'Tokens'}`;
};

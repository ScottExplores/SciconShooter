export type ProposalFundingCurrency = 'USD' | 'RSC';

export interface FundingProposalLike {
  id: string;
  title: string;
  backers: number;
  goalCurrency?: string;
  requestedUsd?: number;
  raisedUsd?: number;
  requestedRsc?: number;
  raisedRsc?: number;
}

export interface ProposalFundingMetrics {
  currency: ProposalFundingCurrency | null;
  goalAmount: number | null;
  raisedAmount: number | null;
  progressPercent: number | null;
  barPercent: number;
}

const isPositiveFinite = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value > 0
);

const isNonNegativeFinite = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0
);

const getCurrencyPair = (
  proposal: FundingProposalLike,
  currency: ProposalFundingCurrency
): { currency: ProposalFundingCurrency; goalAmount: number; raisedAmount: number } | null => {
  const goalAmount = currency === 'USD' ? proposal.requestedUsd : proposal.requestedRsc;
  const raisedAmount = currency === 'USD' ? proposal.raisedUsd : proposal.raisedRsc;
  if (!isPositiveFinite(goalAmount) || !isNonNegativeFinite(raisedAmount)) return null;
  return { currency, goalAmount, raisedAmount };
};

export const getProposalFundingMetrics = (proposal: FundingProposalLike): ProposalFundingMetrics => {
  const declaredCurrency = proposal.goalCurrency?.trim().toUpperCase();
  const funding = declaredCurrency === 'USD' || declaredCurrency === 'RSC'
    ? getCurrencyPair(proposal, declaredCurrency)
    : getCurrencyPair(proposal, 'USD') ?? getCurrencyPair(proposal, 'RSC');

  if (!funding) {
    return {
      currency: null,
      goalAmount: null,
      raisedAmount: null,
      progressPercent: null,
      barPercent: 0
    };
  }

  const progressPercent = (funding.raisedAmount / funding.goalAmount) * 100;
  return {
    ...funding,
    progressPercent,
    barPercent: Math.max(0, Math.min(100, progressPercent))
  };
};

export const formatFundingPercent = (progressPercent: number | null): string => {
  if (progressPercent === null || !Number.isFinite(progressPercent)) return 'Not reported';
  if (progressPercent === 0) return '0%';
  if (progressPercent > 0 && progressPercent < 0.1) return '<0.1%';
  const rounded = Math.round(progressPercent * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
};

const compactAmountFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1
});

export const formatFundingAmount = (
  amount: number | null,
  currency: ProposalFundingCurrency | null
): string => {
  if (amount === null || !Number.isFinite(amount) || !currency) return 'Not reported';
  const formatted = compactAmountFormatter.format(amount);
  return currency === 'USD' ? `$${formatted}` : `${formatted} RSC`;
};

export const compareProposalsByFunding = <T extends FundingProposalLike>(left: T, right: T): number => {
  const leftFunding = getProposalFundingMetrics(left);
  const rightFunding = getProposalFundingMetrics(right);
  const leftKnown = leftFunding.progressPercent !== null;
  const rightKnown = rightFunding.progressPercent !== null;

  if (leftKnown !== rightKnown) return leftKnown ? -1 : 1;
  if (leftFunding.progressPercent !== rightFunding.progressPercent) {
    return (rightFunding.progressPercent ?? 0) - (leftFunding.progressPercent ?? 0);
  }
  if (
    leftFunding.currency === rightFunding.currency
    && leftFunding.raisedAmount !== rightFunding.raisedAmount
  ) {
    return (rightFunding.raisedAmount ?? 0) - (leftFunding.raisedAmount ?? 0);
  }
  if (left.backers !== right.backers) return right.backers - left.backers;

  const titleOrder = left.title.localeCompare(right.title, 'en', { sensitivity: 'base' });
  return titleOrder || left.id.localeCompare(right.id);
};

export const sortProposalsByFunding = <T extends FundingProposalLike>(proposals: readonly T[]): T[] => (
  [...proposals].sort(compareProposalsByFunding)
);

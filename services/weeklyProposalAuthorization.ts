export const WEEKLY_PROPOSAL_CHALLENGE_STALE_CODE = 'WEEKLY_PROPOSAL_CHALLENGE_STALE';

type ProposalActionPayload = Record<string, unknown>;
type ProposalActionResult = Record<string, any>;

interface ProposalChallenge {
  signatureRequired?: boolean;
  challengeId?: string;
  message?: string;
}

interface ProposalChallengeResult extends ProposalActionResult {
  challenge?: ProposalChallenge;
}

export interface WeeklyProposalWalletAuthorization<
  TAddress extends string = string,
  TSignature extends string = string
> {
  address: TAddress;
  signMessage: (address: TAddress, message: string) => Promise<TSignature>;
}

type PostProposalAction = (payload: ProposalActionPayload) => Promise<ProposalActionResult>;

const isRecord = (value: unknown): value is Record<string, any> => (
  Boolean(value) && typeof value === 'object'
);

export const isStaleWeeklyProposalChallengeError = (error: unknown) => {
  if (!isRecord(error)) return false;
  if (error.code === WEEKLY_PROPOSAL_CHALLENGE_STALE_CODE) return true;
  return error.status === 410
    && /weekly proposal challenge.*(?:invalid|expired|already used)/i.test(String(error.message || ''));
};

/**
 * Requests a challenge only when the wallet is ready to sign, then submits
 * that exact challenge immediately. A single stale-challenge retry is allowed
 * so a delayed wallet sheet or interrupted mobile request cannot strand a
 * still-current weekly leader.
 */
export const selectWeeklyProposalWithFreshChallenge = async <
  TAddress extends string,
  TSignature extends string
>(
  walletAuthorization: WeeklyProposalWalletAuthorization<TAddress, TSignature>,
  postProposalAction: PostProposalAction
): Promise<ProposalActionResult> => {
  const maxAttempts = 2;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const challengeData = await postProposalAction({
      action: 'select-proposal-challenge',
      address: walletAuthorization.address
    }) as ProposalChallengeResult;
    const challenge = challengeData.challenge;

    if (!challenge?.signatureRequired) {
      return postProposalAction({ action: 'select-proposal' });
    }
    if (!challenge.challengeId || !challenge.message) {
      throw new Error('The weekly proposal signature challenge was incomplete.');
    }

    const signature = await walletAuthorization.signMessage(
      walletAuthorization.address,
      challenge.message
    );

    try {
      return await postProposalAction({
        action: 'select-proposal',
        address: walletAuthorization.address,
        challengeId: challenge.challengeId,
        signature
      });
    } catch (error) {
      const canRetry = attempt + 1 < maxAttempts && isStaleWeeklyProposalChallengeError(error);
      if (!canRetry) throw error;
    }
  }

  throw new Error('The weekly proposal could not be authorized.');
};

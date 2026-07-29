export interface WalletProfileSessionRecord {
  walletAddress: string;
  profileId: string;
}

export interface WalletProfileSessionResponse<
  TProfile extends WalletProfileSessionRecord
> {
  walletAddress?: string;
  profile: TProfile | null;
}

export interface AuthenticatedWalletProfileSession<
  TProfile extends WalletProfileSessionRecord
> {
  authenticated: true;
  walletAddress: string;
  profile: TProfile | null;
  authorizationSource: 'existing-session' | 'wallet-signature';
}

export class WalletProfileSessionResolutionError extends Error {
  code: 'invalid_wallet' | 'invalid_session_response' | 'wallet_mismatch';

  constructor(
    message: string,
    code: WalletProfileSessionResolutionError['code']
  ) {
    super(message);
    this.name = 'WalletProfileSessionResolutionError';
    this.code = code;
  }
}

const normalizeWalletAddress = (value: unknown): string | null => {
  const normalized = String(value || '').trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(normalized) ? normalized : null;
};

const bindWalletProfileSessionResponse = <
  TProfile extends WalletProfileSessionRecord
>({
  expectedWalletAddress,
  response,
  authorizationSource
}: {
  expectedWalletAddress: string;
  response: WalletProfileSessionResponse<TProfile>;
  authorizationSource: AuthenticatedWalletProfileSession<TProfile>['authorizationSource'];
}): AuthenticatedWalletProfileSession<TProfile> => {
  const expected = normalizeWalletAddress(expectedWalletAddress);
  if (!expected) {
    throw new WalletProfileSessionResolutionError(
      'A valid Base wallet address is required.',
      'invalid_wallet'
    );
  }

  const responseWalletAddress = normalizeWalletAddress(response.walletAddress);
  if (!responseWalletAddress) {
    throw new WalletProfileSessionResolutionError(
      'Wallet profile session returned no valid wallet address.',
      'invalid_session_response'
    );
  }
  if (responseWalletAddress !== expected) {
    throw new WalletProfileSessionResolutionError(
      'Wallet profile session belongs to a different wallet.',
      'wallet_mismatch'
    );
  }

  if (response.profile) {
    const profileWalletAddress = normalizeWalletAddress(
      response.profile.walletAddress
    );
    if (
      profileWalletAddress !== responseWalletAddress
      || response.profile.profileId !== `wallet:${responseWalletAddress}`
    ) {
      throw new WalletProfileSessionResolutionError(
        'Wallet profile session returned a profile for a different wallet.',
        'invalid_session_response'
      );
    }
  }

  return {
    authenticated: true,
    walletAddress: responseWalletAddress,
    profile: response.profile,
    authorizationSource
  };
};

export const resolveWalletProfileSession = async <
  TProfile extends WalletProfileSessionRecord
>({
  walletAddress,
  readSession,
  authenticate,
  isUnauthenticatedError
}: {
  walletAddress: string;
  readSession: () => Promise<WalletProfileSessionResponse<TProfile>>;
  authenticate: () => Promise<WalletProfileSessionResponse<TProfile>>;
  isUnauthenticatedError: (error: unknown) => boolean;
}): Promise<AuthenticatedWalletProfileSession<TProfile>> => {
  const expectedWalletAddress = normalizeWalletAddress(walletAddress);
  if (!expectedWalletAddress) {
    throw new WalletProfileSessionResolutionError(
      'A valid Base wallet address is required.',
      'invalid_wallet'
    );
  }

  try {
    const existingSession = await readSession();
    const existingWalletAddress = normalizeWalletAddress(
      existingSession.walletAddress
    );
    const boundExistingSession = bindWalletProfileSessionResponse({
      expectedWalletAddress: existingWalletAddress ?? expectedWalletAddress,
      response: existingSession,
      authorizationSource: 'existing-session'
    });

    if (existingWalletAddress === expectedWalletAddress) {
      return boundExistingSession;
    }
  } catch (error) {
    if (!isUnauthenticatedError(error)) throw error;
  }

  // A missing session or a valid cookie for a different wallet is not reused.
  // Connecting that wallet must prove control before replacing the session.
  const authenticatedResponse = await authenticate();
  return bindWalletProfileSessionResponse({
    expectedWalletAddress,
    response: authenticatedResponse,
    authorizationSource: 'wallet-signature'
  });
};

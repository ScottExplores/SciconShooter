import type { PlayerShipId } from './playerShipService';
import type {
  MainShipUpgradeId,
  MiniShipId
} from './squadProgression';
import type { WalletProfileRecord } from './walletProfileService';

export type WalletTokenSpendAction =
  | { kind: 'unlock-left-slot' }
  | { kind: 'purchase-mini-ship'; miniShipId: MiniShipId }
  | { kind: 'upgrade-mini-ship'; miniShipId: MiniShipId }
  | {
      kind: 'upgrade-main-ship';
      shipId: PlayerShipId;
      upgradeId: MainShipUpgradeId;
    };

export interface WalletTokenSpendSettlement {
  accepted: true;
  duplicate: boolean;
  spendId: string;
  action: WalletTokenSpendAction;
  cost: number;
  purchasedTokensSpent: number;
  purchasedTokensAvailable: number;
  profile: WalletProfileRecord;
}

export class WalletTokenSpendRequestError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code = '') {
    super(message);
    this.name = 'WalletTokenSpendRequestError';
    this.status = status;
    this.code = code;
  }
}

export const applyWalletTokenSpend = async ({
  spendId,
  expectedRevision,
  action
}: {
  spendId: string;
  expectedRevision: number;
  action: WalletTokenSpendAction;
}): Promise<WalletTokenSpendSettlement> => {
  const request = () => fetch('/api/wallet-token-spends', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ spendId, expectedRevision, action })
  });
  // A response can be lost after the server commits. Retrying once with the
  // same spendId reaches the idempotent receipt path instead of charging the
  // Token balance or applying the upgrade a second time.
  let response: Response;
  try {
    response = await request();
  } catch {
    response = await request();
  }
  if (response.status >= 500) {
    response = await request();
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new WalletTokenSpendRequestError(
      payload.error || 'The Hangar Token purchase could not be completed.',
      response.status,
      payload.code || ''
    );
  }
  if (!payload.settlement?.accepted || !payload.settlement?.profile) {
    throw new WalletTokenSpendRequestError(
      'The Hangar Token purchase returned an invalid settlement.',
      502,
      'wallet_token_spend_response_invalid'
    );
  }
  return payload.settlement as WalletTokenSpendSettlement;
};

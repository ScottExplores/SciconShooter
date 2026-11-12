import { GAME_VERSION } from './runReceiptService';
import { getAnonymousPlayerId } from './analyticsService';
import {
  browserMissionFeedbackStorage,
  markMissionFeedbackShown,
  readMissionFeedbackShown
} from './missionFeedbackPrompt';

const RATINGS_ENDPOINT = '/api/player-ratings';

export interface MissionFeedbackStatus {
  shown: boolean;
  wallet: boolean;
}

export interface MissionFeedbackSubmission {
  rating: number;
  comment: string;
  missionId: string;
}

interface MissionFeedbackPayload {
  shown?: boolean;
  wallet?: boolean;
  ok?: boolean;
  accepted?: boolean;
  stored?: boolean;
  duplicate?: boolean;
}

const readJson = async (response: Response): Promise<MissionFeedbackPayload | null> => {
  try {
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    return payload as MissionFeedbackPayload;
  } catch {
    return null;
  }
};

const postRating = async (body: Record<string, unknown>) => {
  const response = await fetch(RATINGS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body)
  });
  const payload = await readJson(response);
  return { response, payload };
};

export const fetchMissionFeedbackStatus = async (): Promise<MissionFeedbackStatus> => {
  const { response, payload } = await postRating({ action: 'status' });
  if (!response.ok || !payload || typeof payload !== 'object') {
    throw new Error('Player rating status is unavailable.');
  }
  return {
    shown: payload.shown === true,
    wallet: payload.wallet === true
  };
};

export const acknowledgeMissionFeedbackShown = async () => {
  const { response, payload } = await postRating({ action: 'acknowledge' });
  if (!response.ok || !payload || payload.ok !== true) {
    throw new Error('Player rating status could not be saved.');
  }
  return {
    shown: payload.shown === true,
    wallet: payload.wallet === true
  };
};

export const submitMissionFeedback = async ({
  rating,
  comment,
  missionId
}: MissionFeedbackSubmission) => {
  const anonymousPlayerId = getAnonymousPlayerId();
  const { response, payload } = await postRating({
    action: 'submit',
    rating,
    comment,
    missionId,
    anonymousPlayerId,
    appVersion: GAME_VERSION
  });
  if (!response.ok || !payload || payload.accepted !== true) {
    throw new Error('Player rating could not be sent.');
  }
  return { stored: payload.stored === true, duplicate: payload.duplicate === true };
};

/**
 * Copies the one-time flag between this device and the signed-in profile.
 * A flag already stored for the wallet hides the card on a new device.
 * A card already shown on this device is written to the profile.
 */
export const syncMissionFeedbackProfile = async () => {
  const storage = browserMissionFeedbackStorage();
  const status = await fetchMissionFeedbackStatus();
  if (!status.wallet) return status;
  if (status.shown) {
    markMissionFeedbackShown(storage);
    return status;
  }
  if (!readMissionFeedbackShown(storage)) return status;
  const acknowledged = await acknowledgeMissionFeedbackShown();
  if (acknowledged.shown) markMissionFeedbackShown(storage);
  return acknowledged;
};

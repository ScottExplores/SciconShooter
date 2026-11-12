export const MISSION_FEEDBACK_SHOWN_KEY = 'scicon_mission_feedback_shown_v1';

export interface MissionFeedbackStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface MissionFeedbackGate {
  result: 'win' | 'loss';
  deviceShown: boolean;
  profileShown?: boolean;
  /**
   * Earlier mission clears do not suppress the card. Players who already
   * finished missions before this shipped still see it once, on the next win.
   */
  priorMissionWins?: number;
  /**
   * The founder wallet is not skipped. Founder runs stay test-only on the
   * server, but the card itself still appears.
   */
  founderWallet?: boolean;
}

export interface MissionFeedbackView {
  shown: boolean;
  visible: boolean;
}

export type MissionFeedbackEvent =
  | {
      type: 'result';
      result: 'win' | 'loss';
      profileShown?: boolean;
      priorMissionWins?: number;
      founderWallet?: boolean;
    }
  | { type: 'dismiss' }
  | { type: 'submit' };

export const readMissionFeedbackShown = (
  storage: MissionFeedbackStorage | null | undefined
) => {
  try {
    return storage?.getItem(MISSION_FEEDBACK_SHOWN_KEY) === '1';
  } catch {
    return false;
  }
};

export const markMissionFeedbackShown = (
  storage: MissionFeedbackStorage | null | undefined
) => {
  try {
    storage?.setItem(MISSION_FEEDBACK_SHOWN_KEY, '1');
  } catch {
    // Private mode can reject storage. The open card still closes for this view.
  }
};

export const browserMissionFeedbackStorage = (): MissionFeedbackStorage | null => {
  try {
    if (typeof globalThis.localStorage === 'undefined' || !globalThis.localStorage) return null;
    return globalThis.localStorage;
  } catch {
    return null;
  }
};

/**
 * One card, only after a mission win, and never again after it has been shown.
 * Dismiss and submit both count as shown. Losses never qualify.
 */
export const shouldShowMissionFeedback = (input: MissionFeedbackGate) => {
  if (input.result !== 'win') return false;
  if (input.deviceShown || input.profileShown === true) return false;
  return true;
};

export const nextMissionFeedbackView = (
  state: MissionFeedbackView,
  event: MissionFeedbackEvent
): MissionFeedbackView => {
  if (event.type === 'dismiss' || event.type === 'submit') {
    return { shown: true, visible: false };
  }
  const show = shouldShowMissionFeedback({
    result: event.result,
    deviceShown: state.shown,
    profileShown: event.profileShown,
    priorMissionWins: event.priorMissionWins,
    founderWallet: event.founderWallet
  });
  if (!show) {
    return {
      shown: state.shown || event.profileShown === true,
      visible: false
    };
  }
  return { shown: true, visible: true };
};

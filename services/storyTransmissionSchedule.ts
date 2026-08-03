import type { StoryBeat } from './storyBeats';

export const STORY_TRANSMISSION_STORAGE_KEY = 'scicon:story-transmissions:daily:v1';

type StoryTransmissionStorage = Pick<Storage, 'getItem' | 'setItem'>;

type DailyStoryTransmissionState = {
  dayKey: string;
  beatIds: string[];
};

const getBrowserStorage = (): StoryTransmissionStorage | null => (
  typeof window === 'undefined' ? null : window.localStorage
);

export const getLocalStoryDayKey = (now = new Date()) => (
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
);

export const getStoryBeatDailyId = (beat: Pick<StoryBeat, 'phase' | 'title'>) => (
  `${beat.phase}:${beat.title}`
);

const getScopedStoryStorageKey = (profileId: string) => {
  const normalizedProfileId = String(profileId || 'guest').trim().toLowerCase() || 'guest';
  return `${STORY_TRANSMISSION_STORAGE_KEY}:${normalizedProfileId}`;
};

const readDailyState = (
  storage: StoryTransmissionStorage,
  dayKey: string,
  storageKey = STORY_TRANSMISSION_STORAGE_KEY
): DailyStoryTransmissionState => {
  try {
    const value = storage.getItem(storageKey);
    if (!value) return { dayKey, beatIds: [] };
    const parsed = JSON.parse(value) as Partial<DailyStoryTransmissionState>;
    if (parsed.dayKey !== dayKey || !Array.isArray(parsed.beatIds)) {
      return { dayKey, beatIds: [] };
    }
    return {
      dayKey,
      beatIds: parsed.beatIds.filter((beatId): beatId is string => typeof beatId === 'string')
    };
  } catch {
    return { dayKey, beatIds: [] };
  }
};

export const hasSeenStoryBeatToday = (
  beat: Pick<StoryBeat, 'phase' | 'title'>,
  storageOverride?: StoryTransmissionStorage | null,
  now = new Date()
) => {
  const storage = storageOverride === undefined ? getBrowserStorage() : storageOverride;
  if (!storage) return false;
  const state = readDailyState(storage, getLocalStoryDayKey(now));
  return state.beatIds.includes(getStoryBeatDailyId(beat));
};

export const markStoryBeatSeenToday = (
  beat: Pick<StoryBeat, 'phase' | 'title'>,
  storageOverride?: StoryTransmissionStorage | null,
  now = new Date()
) => {
  const storage = storageOverride === undefined ? getBrowserStorage() : storageOverride;
  if (!storage) return;
  const dayKey = getLocalStoryDayKey(now);
  const state = readDailyState(storage, dayKey);
  const beatId = getStoryBeatDailyId(beat);
  if (!state.beatIds.includes(beatId)) state.beatIds.push(beatId);
  storage.setItem(STORY_TRANSMISSION_STORAGE_KEY, JSON.stringify(state));
};

/**
 * First-flight narrative state is profile-scoped so a second guest or wallet
 * on the same device still receives Brian's briefing and its guide invitation.
 * The legacy browser-global helpers remain above for old daily transmissions.
 */
export const hasSeenStoryBeatTodayForProfile = (
  beat: Pick<StoryBeat, 'phase' | 'title'>,
  profileId: string,
  storageOverride?: StoryTransmissionStorage | null,
  now = new Date()
) => {
  const storage = storageOverride === undefined ? getBrowserStorage() : storageOverride;
  if (!storage) return false;
  const dayKey = getLocalStoryDayKey(now);
  const state = readDailyState(storage, dayKey, getScopedStoryStorageKey(profileId));
  return state.beatIds.includes(getStoryBeatDailyId(beat));
};

export const markStoryBeatSeenTodayForProfile = (
  beat: Pick<StoryBeat, 'phase' | 'title'>,
  profileId: string,
  storageOverride?: StoryTransmissionStorage | null,
  now = new Date()
) => {
  const storage = storageOverride === undefined ? getBrowserStorage() : storageOverride;
  if (!storage) return;
  const dayKey = getLocalStoryDayKey(now);
  const storageKey = getScopedStoryStorageKey(profileId);
  const state = readDailyState(storage, dayKey, storageKey);
  const beatId = getStoryBeatDailyId(beat);
  if (!state.beatIds.includes(beatId)) state.beatIds.push(beatId);
  storage.setItem(storageKey, JSON.stringify(state));
};

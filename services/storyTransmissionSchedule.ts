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

const readDailyState = (
  storage: StoryTransmissionStorage,
  dayKey: string
): DailyStoryTransmissionState => {
  try {
    const value = storage.getItem(STORY_TRANSMISSION_STORAGE_KEY);
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

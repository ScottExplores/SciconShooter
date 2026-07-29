import type { WaveEvent } from '../../../game-config/types';

export const EVENT_TIMELINE_LANES = [
  { id: 'spawn', label: 'Formations' },
  { id: 'boss', label: 'Bosses' },
  { id: 'asteroid-belt', label: 'Hazards' },
  { id: 'supply-drop', label: 'Supply Drops' },
  { id: 'powerup', label: 'Powerups' },
  { id: 'recovery', label: 'Recovery' }
] as const;

export type EventTimelineLaneId = typeof EVENT_TIMELINE_LANES[number]['id'];
export type EventTimelineMoveCommand = 'backward' | 'forward' | 'start' | 'end';

export interface EventTimelineTick {
  seconds: number;
  percent: number;
}

export interface EventTimelineLayoutItem {
  event: WaveEvent;
  row: number;
}

export interface EventTimelineLaneLayout {
  items: EventTimelineLayoutItem[];
  rowCount: number;
}

const roundToEditorPrecision = (seconds: number) => (
  Math.max(0, Math.round((seconds + Number.EPSILON) * 10) / 10)
);

const safeWaveDuration = (durationSeconds: number) => (
  Number.isFinite(durationSeconds) ? Math.max(0.1, durationSeconds) : 0.1
);

export const getEventTimelineStartRange = (
  event: Pick<WaveEvent, 'blocksWaveClock' | 'durationSeconds'>,
  waveDurationSeconds: number
) => {
  const waveDuration = safeWaveDuration(waveDurationSeconds);
  const maximum = event.blocksWaveClock
    ? waveDuration
    : Math.max(0, waveDuration - Math.max(0, event.durationSeconds));

  return { minimum: 0, maximum: roundToEditorPrecision(maximum) };
};

export const clampEventTimelineStart = (
  event: Pick<WaveEvent, 'blocksWaveClock' | 'durationSeconds'>,
  waveDurationSeconds: number,
  proposedSeconds: number
) => {
  const { minimum, maximum } = getEventTimelineStartRange(event, waveDurationSeconds);
  const finiteProposal = Number.isFinite(proposedSeconds) ? proposedSeconds : minimum;
  return Math.min(maximum, Math.max(minimum, roundToEditorPrecision(finiteProposal)));
};

export const moveEventTimelineStart = (
  event: Pick<WaveEvent, 'blocksWaveClock' | 'durationSeconds'>,
  waveDurationSeconds: number,
  currentSeconds: number,
  command: EventTimelineMoveCommand,
  stepSeconds = 0.1
) => {
  const { minimum, maximum } = getEventTimelineStartRange(event, waveDurationSeconds);
  if (command === 'start') return minimum;
  if (command === 'end') return maximum;
  const direction = command === 'forward' ? 1 : -1;
  return clampEventTimelineStart(
    event,
    waveDurationSeconds,
    currentSeconds + direction * Math.max(0.1, stepSeconds)
  );
};

export const getEventTimelinePercent = (seconds: number, waveDurationSeconds: number) => (
  Math.min(100, Math.max(0, seconds / safeWaveDuration(waveDurationSeconds) * 100))
);

export const getEventTimelineClipPercent = (
  event: Pick<WaveEvent, 'startSeconds' | 'durationSeconds'>,
  waveDurationSeconds: number,
  startSeconds = event.startSeconds
) => {
  const left = getEventTimelinePercent(startSeconds, waveDurationSeconds);
  const authoredWidth = Math.max(
    0,
    event.durationSeconds / safeWaveDuration(waveDurationSeconds) * 100
  );
  return {
    left,
    width: Math.min(100 - left, authoredWidth)
  };
};

const chooseTickInterval = (waveDurationSeconds: number, targetIntervals: number) => {
  const rawInterval = safeWaveDuration(waveDurationSeconds) / Math.max(2, targetIntervals);
  const scale = 10 ** Math.floor(Math.log10(rawInterval));
  const normalized = rawInterval / scale;
  const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return multiplier * scale;
};

export const buildEventTimelineTicks = (
  waveDurationSeconds: number,
  targetIntervals = 6
): EventTimelineTick[] => {
  const duration = safeWaveDuration(waveDurationSeconds);
  const interval = chooseTickInterval(duration, targetIntervals);
  const ticks: EventTimelineTick[] = [];

  for (let seconds = 0; seconds < duration; seconds += interval) {
    const roundedSeconds = Math.round((seconds + Number.EPSILON) * 1000) / 1000;
    ticks.push({
      seconds: roundedSeconds,
      percent: getEventTimelinePercent(roundedSeconds, duration)
    });
  }

  if (ticks.at(-1)?.seconds !== duration) {
    ticks.push({ seconds: duration, percent: 100 });
  }

  return ticks;
};

export const layoutEventTimelineLane = (
  events: readonly WaveEvent[],
  laneId: EventTimelineLaneId
): EventTimelineLaneLayout => {
  const ordered = events
    .filter((event) => event.kind === laneId)
    .map((event, originalIndex) => ({ event, originalIndex }))
    .sort((left, right) => (
      left.event.startSeconds - right.event.startSeconds
      || left.originalIndex - right.originalIndex
    ));
  const rowEndSeconds: number[] = [];
  const items = ordered.map(({ event }) => {
    const row = rowEndSeconds.findIndex((endSeconds) => endSeconds <= event.startSeconds);
    const targetRow = row >= 0 ? row : rowEndSeconds.length;
    rowEndSeconds[targetRow] = event.startSeconds + event.durationSeconds;
    return { event, row: targetRow };
  });

  return {
    items,
    rowCount: Math.max(1, rowEndSeconds.length)
  };
};

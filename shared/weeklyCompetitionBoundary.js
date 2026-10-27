const createWeeklyCompetitionBoundary = () => {
const WEEK_TIME_ZONE = 'America/Los_Angeles';
const WEEK_BOUNDARY_HOUR = 12;
// One source of truth for every current-week funding claim. Historical
// competition rows keep their recorded allocation instead of being rewritten.
const WEEKLY_ALLOCATION_RSC = 1_000;
// One-time prize window. Weekly scoring stays in the code and turns back on
// at weeklyResumesWeekKey (the first Sunday-noon Pacific week after Nov 30).
const SCICON_BIG_EVENT = Object.freeze({
  name: '25K High Score',
  allocationRsc: 25_000,
  startsAt: '2026-10-26T07:00:00.000Z',
  closesAt: '2026-11-30T07:59:00.000Z',
  proposalOpenUntil: '2026-12-01T08:00:00.000Z',
  winnerAnnouncedLabel: 'Nov 30',
  weeklyResumesWeekKey: '2026-12-06'
});
const SCICON_EVENT_CHOICE_COPY = 'The winner picks the Airborne Disease Resilience RFP pool, a proposal under it, or any open ResearchHub proposal or RFP.';
const SCICON_EVENT_PAUSE_COPY = 'Weekly prizes are paused during the event and return after Nov 30.';
// A score receipt can finish before cutoff while its verified leaderboard write
// is still in flight. Keep the public rollover behind this short settlement
// window so the new board and the archived Past Pick can publish together.
const WEEKLY_SCORE_SETTLEMENT_MS = 5 * 60 * 1000;

const weekdayIndexes = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

const zonedPartsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: WEEK_TIME_ZONE,
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
});

const toDate = (value) => {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('A valid date is required.');
  return date;
};

const getZonedParts = (value) => {
  const parts = {};
  for (const part of zonedPartsFormatter.formatToParts(toDate(value))) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: parts.weekday,
    weekdayIndex: weekdayIndexes[parts.weekday]
  };
};

const shiftCalendarDate = ({ year, month, day }, dayDelta) => {
  const shifted = new Date(Date.UTC(year, month - 1, day + dayDelta, 12));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate()
  };
};

const calendarDateKey = ({ year, month, day }) => (
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
);

const parseCalendarDateKey = (weekKey) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(weekKey || ''));
  if (!match) throw new Error('weekKey must be a Sunday formatted as YYYY-MM-DD.');

  const calendarDate = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
  const parsed = new Date(Date.UTC(calendarDate.year, calendarDate.month - 1, calendarDate.day, 12));
  const isExactDate = parsed.getUTCFullYear() === calendarDate.year
    && parsed.getUTCMonth() + 1 === calendarDate.month
    && parsed.getUTCDate() === calendarDate.day;
  if (!isExactDate || parsed.getUTCDay() !== 0) {
    throw new Error('weekKey must be a Sunday formatted as YYYY-MM-DD.');
  }
  return calendarDate;
};

const zonedDateTimeToUtc = ({ year, month, day, hour = WEEK_BOUNDARY_HOUR, minute = 0, second = 0 }) => {
  const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let candidate = desiredAsUtc;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const observed = getZonedParts(new Date(candidate));
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second
    );
    const correction = desiredAsUtc - observedAsUtc;
    candidate += correction;
    if (correction === 0) break;
  }

  return new Date(candidate);
};

const getWeekRange = (weekKey) => {
  const startCalendarDate = parseCalendarDateKey(weekKey);
  const endCalendarDate = shiftCalendarDate(startCalendarDate, 7);
  return {
    weekKey: calendarDateKey(startCalendarDate),
    start: zonedDateTimeToUtc(startCalendarDate),
    end: zonedDateTimeToUtc(endCalendarDate),
    startCalendarDate,
    endCalendarDate
  };
};

const getCurrentWeekRange = (now = new Date()) => {
  const instant = toDate(now);
  const localNow = getZonedParts(instant);
  let startCalendarDate = shiftCalendarDate(localNow, -localNow.weekdayIndex);
  let start = zonedDateTimeToUtc(startCalendarDate);

  if (instant.getTime() < start.getTime()) {
    startCalendarDate = shiftCalendarDate(startCalendarDate, -7);
    start = zonedDateTimeToUtc(startCalendarDate);
  }

  const endCalendarDate = shiftCalendarDate(startCalendarDate, 7);
  return {
    weekKey: calendarDateKey(startCalendarDate),
    start,
    end: zonedDateTimeToUtc(endCalendarDate),
    startCalendarDate,
    endCalendarDate
  };
};

const getPreviousWeekKey = (now = new Date()) => {
  const current = getCurrentWeekRange(now);
  return calendarDateKey(shiftCalendarDate(current.startCalendarDate, -7));
};

const getWeeklyPresentationMeta = (now = new Date(), locale) => {
  const instant = toDate(now);
  const scoringWeek = getCurrentWeekRange(instant);
  const publishAt = new Date(scoringWeek.start.getTime() + WEEKLY_SCORE_SETTLEMENT_MS);
  const isFinalizing = instant.getTime() < publishAt.getTime();
  const presentationInstant = isFinalizing
    ? new Date(scoringWeek.start.getTime() - 1)
    : instant;
  const visibleWeek = getWeeklyBoundaryMeta(presentationInstant, locale);

  return {
    ...visibleWeek,
    scoringWeekKey: scoringWeek.weekKey,
    isFinalizing,
    publishesAt: isFinalizing
      ? publishAt
      : new Date(visibleWeek.endsAt.getTime() + WEEKLY_SCORE_SETTLEMENT_MS)
  };
};

const resolveWeeklyDashboardPublication = (completedWeekKeys = [], now = new Date()) => {
  const observedAt = toDate(now);
  const presentation = getWeeklyPresentationMeta(observedAt);
  if (presentation.isFinalizing) {
    return {
      presentationTime: observedAt.getTime(),
      visibleWeekKey: presentation.weekKey,
      waitingForArchive: false,
      requiredArchiveWeekKey: presentation.weekKey
    };
  }

  const immediatelyPriorWeekKey = getWeeklyBoundaryMeta(
    new Date(presentation.startsAt.getTime() - 1)
  ).weekKey;
  const completedWeekKeySet = new Set(
    (Array.isArray(completedWeekKeys) ? completedWeekKeys : [])
      .filter((weekKey) => typeof weekKey === 'string')
  );
  if (completedWeekKeySet.has(immediatelyPriorWeekKey)) {
    return {
      presentationTime: observedAt.getTime(),
      visibleWeekKey: presentation.weekKey,
      waitingForArchive: false,
      requiredArchiveWeekKey: immediatelyPriorWeekKey
    };
  }

  const heldPresentationTime = presentation.startsAt.getTime()
    + WEEKLY_SCORE_SETTLEMENT_MS
    - 1;
  return {
    presentationTime: heldPresentationTime,
    visibleWeekKey: getWeeklyPresentationMeta(heldPresentationTime).weekKey,
    waitingForArchive: true,
    requiredArchiveWeekKey: immediatelyPriorWeekKey
  };
};

const getPublicPrizeState = (now = new Date()) => {
  const instant = toDate(now);
  const startsAt = new Date(SCICON_BIG_EVENT.startsAt);
  const closesAt = new Date(SCICON_BIG_EVENT.closesAt);
  const weeklyResumesAt = getWeekRange(SCICON_BIG_EVENT.weeklyResumesWeekKey).start;
  const proposalDeadline = new Date(SCICON_BIG_EVENT.proposalOpenUntil);
  const time = instant.getTime();
  const phase = time >= startsAt.getTime() && time < closesAt.getTime()
    ? 'big-event'
    : time >= closesAt.getTime() && time < weeklyResumesAt.getTime()
      ? 'big-event-closed'
      : 'weekly';
  const eventBoard = phase !== 'weekly';
  const week = getCurrentWeekRange(instant);
  const remainingMs = Math.max(0, closesAt.getTime() - time);

  return {
    phase,
    name: SCICON_BIG_EVENT.name,
    allocationRsc: eventBoard ? SCICON_BIG_EVENT.allocationRsc : WEEKLY_ALLOCATION_RSC,
    startsAt,
    closesAt,
    weeklyResumesAt,
    proposalOpenUntil: eventBoard ? proposalDeadline : week.end,
    scoreWindow: eventBoard
      ? { start: startsAt, end: closesAt }
      : { start: week.start, end: week.end },
    snapshotFrozen: phase === 'big-event-closed',
    statusLabel: phase === 'big-event-closed'
      ? `winner announced ${SCICON_BIG_EVENT.winnerAnnouncedLabel}`
      : null,
    daysLeft: phase === 'big-event'
      ? Math.max(1, Math.ceil(remainingMs / 86_400_000))
      : 0
  };
};

const weekOverlapsBigEventPause = (start, end) => {
  const pauseStart = new Date(SCICON_BIG_EVENT.startsAt).getTime();
  const pauseEnd = getWeekRange(SCICON_BIG_EVENT.weeklyResumesWeekKey).start.getTime();
  return start.getTime() < pauseEnd && end.getTime() > pauseStart;
};

const getWeeklyBoundaryMeta = (now = new Date(), locale) => {
  const instant = toDate(now);
  const current = getCurrentWeekRange(instant);
  const localNow = getZonedParts(instant);
  const localTodayNumber = Date.UTC(localNow.year, localNow.month - 1, localNow.day);
  const endDateNumber = Date.UTC(
    current.endCalendarDate.year,
    current.endCalendarDate.month - 1,
    current.endCalendarDate.day
  );

  return {
    weekKey: current.weekKey,
    startsAt: current.start,
    endsAt: current.end,
    daysLeft: Math.max(0, Math.round((endDateNumber - localTodayNumber) / 86_400_000)),
    endLabel: new Intl.DateTimeFormat(locale, {
      timeZone: WEEK_TIME_ZONE,
      month: 'short',
      day: 'numeric'
    }).format(current.end)
  };
};

return {
  WEEK_BOUNDARY_HOUR,
  WEEKLY_ALLOCATION_RSC,
  SCICON_BIG_EVENT,
  SCICON_EVENT_CHOICE_COPY,
  SCICON_EVENT_PAUSE_COPY,
  WEEKLY_SCORE_SETTLEMENT_MS,
  WEEK_TIME_ZONE,
  getCurrentWeekRange,
  getPreviousWeekKey,
  resolveWeeklyDashboardPublication,
  getWeeklyPresentationMeta,
  getWeeklyBoundaryMeta,
  getPublicPrizeState,
  weekOverlapsBigEventPause,
  getWeekRange
};
};

const weeklyCompetitionBoundary = createWeeklyCompetitionBoundary();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = weeklyCompetitionBoundary;
}

if (typeof globalThis !== 'undefined') {
  globalThis.__SCICON_WEEKLY_COMPETITION_BOUNDARY__ = weeklyCompetitionBoundary;
}

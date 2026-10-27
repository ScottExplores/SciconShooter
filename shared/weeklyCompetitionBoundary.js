const createWeeklyCompetitionBoundary = () => {
const WEEK_TIME_ZONE = 'America/Los_Angeles';
const WEEK_BOUNDARY_HOUR = 12;
// One source of truth for every current-week funding claim. Historical
// competition rows keep their recorded allocation instead of being rewritten.
const WEEKLY_ALLOCATION_RSC = 1_000;
// The live public prize is one fixed event. Historical week rows keep the
// allocation stored on those rows; this constant is only the current event.
const PRIZE_EVENT_ALLOCATION_RSC = 25_000;
const PRIZE_EVENT_START_ISO = '2026-10-26T07:00:00.000Z';
const PRIZE_EVENT_CLOSE_ISO = '2026-11-30T07:59:00.000Z';
const PRIZE_EVENT_PROPOSAL_OPEN_UNTIL_ISO = '2026-12-01T08:00:00.000Z';
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

const getPrizeEventMeta = (now = new Date()) => {
  const instant = toDate(now);
  const startsAt = new Date(PRIZE_EVENT_START_ISO);
  const endsAt = new Date(PRIZE_EVENT_CLOSE_ISO);
  const proposalOpenUntil = new Date(PRIZE_EVENT_PROPOSAL_OPEN_UNTIL_ISO);
  const closed = instant.getTime() >= endsAt.getTime();
  const remainingMs = Math.max(0, endsAt.getTime() - instant.getTime());

  return {
    startsAt,
    endsAt,
    proposalOpenUntil,
    daysLeft: closed ? 0 : Math.max(1, Math.ceil(remainingMs / 86_400_000)),
    endLabel: 'Nov 29',
    closed,
    allocationRsc: PRIZE_EVENT_ALLOCATION_RSC
  };
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
  PRIZE_EVENT_ALLOCATION_RSC,
  WEEKLY_SCORE_SETTLEMENT_MS,
  WEEK_TIME_ZONE,
  getCurrentWeekRange,
  getPreviousWeekKey,
  resolveWeeklyDashboardPublication,
  getWeeklyPresentationMeta,
  getWeeklyBoundaryMeta,
  getPrizeEventMeta,
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

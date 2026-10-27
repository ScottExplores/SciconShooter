const createWeeklyCompetitionBoundary = () => {
const WEEK_TIME_ZONE = 'America/Los_Angeles';
const WEEK_BOUNDARY_HOUR = 12;
// One source of truth for every current-week funding claim. Historical
// competition rows keep their recorded allocation instead of being rewritten.
const WEEKLY_ALLOCATION_RSC = 1_000;
// Monthly 25,000 RSC series. The first window is the authored October 26
// through November 29, 2026 close. From December 2026 each Pacific month
// starts at midnight on the 1st and closes at 11:59 PM on its last Sunday.
const SCICON_BIG_EVENT = Object.freeze({
  name: 'SciCon Big Event',
  allocationRsc: 25_000,
  startsAt: '2026-10-26T07:00:00.000Z',
  closesAt: '2026-11-30T07:59:00.000Z',
  proposalOpenUntil: '2026-12-01T08:00:00.000Z',
  winnerAnnouncedLabel: 'Nov 30'
});
const MONTHLY_SERIES_START = SCICON_BIG_EVENT.startsAt;
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

const formatLongLabel = (calendarDate) => new Intl.DateTimeFormat('en-US', {
  timeZone: WEEK_TIME_ZONE,
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric'
}).format(zonedDateTimeToUtc({ ...calendarDate, hour: 12 }));

const formatShortLabel = (calendarDate) => new Intl.DateTimeFormat('en-US', {
  timeZone: WEEK_TIME_ZONE,
  month: 'short',
  day: 'numeric'
}).format(zonedDateTimeToUtc({ ...calendarDate, hour: 12 }));

const lastSundayOfMonth = (year, month) => {
  const last = new Date(Date.UTC(year, month, 0, 12));
  return shiftCalendarDate({
    year: last.getUTCFullYear(),
    month: last.getUTCMonth() + 1,
    day: last.getUTCDate()
  }, -last.getUTCDay());
};

const monthStart = (year, month) => zonedDateTimeToUtc({
  year,
  month,
  day: 1,
  hour: 0,
  minute: 0,
  second: 0
});

const buildMonthlyWindow = (year, month) => {
  const closeSunday = lastSundayOfMonth(year, month);
  const announceDate = shiftCalendarDate(closeSunday, 1);
  const proposalDate = shiftCalendarDate(announceDate, 1);
  const nextMonth = month === 12
    ? { year: year + 1, month: 1 }
    : { year, month: month + 1 };
  return {
    monthKey: `${year}-${String(month).padStart(2, '0')}`,
    name: SCICON_BIG_EVENT.name,
    startsAt: monthStart(year, month),
    closesAt: zonedDateTimeToUtc({ ...closeSunday, hour: 23, minute: 59, second: 0 }),
    proposalOpenUntil: zonedDateTimeToUtc({ ...proposalDate, hour: 12, minute: 0, second: 0 }),
    nextStartsAt: monthStart(nextMonth.year, nextMonth.month),
    closeLabel: formatLongLabel(closeSunday),
    closeShortLabel: formatShortLabel(closeSunday),
    announceLabel: formatLongLabel(announceDate),
    announceShortLabel: formatShortLabel(announceDate)
  };
};

const firstEventWindow = () => ({
  monthKey: '2026-11',
  name: SCICON_BIG_EVENT.name,
  startsAt: new Date(SCICON_BIG_EVENT.startsAt),
  closesAt: new Date(SCICON_BIG_EVENT.closesAt),
  proposalOpenUntil: new Date(SCICON_BIG_EVENT.proposalOpenUntil),
  nextStartsAt: monthStart(2026, 12),
  closeLabel: formatLongLabel({ year: 2026, month: 11, day: 29 }),
  closeShortLabel: formatShortLabel({ year: 2026, month: 11, day: 29 }),
  announceLabel: formatLongLabel({ year: 2026, month: 11, day: 30 }),
  announceShortLabel: SCICON_BIG_EVENT.winnerAnnouncedLabel
});

const prizeWindowForInstant = (instant) => {
  const time = instant.getTime();
  if (time < new Date(MONTHLY_SERIES_START).getTime()) return null;
  const first = firstEventWindow();
  if (time < first.nextStartsAt.getTime()) return first;
  const parts = getZonedParts(instant);
  return buildMonthlyWindow(parts.year, parts.month);
};

const weeklyRulesText = 'Leaderboard positions remain provisional until the weekly cutoff. The finalized No. 1 pilot may choose an eligible ResearchHub proposal or an open RFP pool. Choosing records the pick and does not send RSC. A proposal is funded only after a Base transaction reference is recorded. An RFP is recorded for manual funding.';

const buildEventRulesText = (window, frozen) => (
  frozen
    ? `Final standings are frozen. The winner is announced ${window.announceLabel}. This month's prize is 25,000 RSC toward one open ResearchHub proposal or RFP pool. The item must still be open after the announce date. Choosing records the pick and does not send RSC. A proposal is funded only after a Base transaction reference is recorded. An RFP is recorded for manual funding.`
    : `Each calendar month the top score wins 25,000 RSC toward one open ResearchHub proposal or RFP pool. This month closes ${window.closeLabel} at 11:59 PM Pacific. The winner is announced ${window.announceLabel}. The item must still be open after the announce date. Choosing records the pick and does not send RSC. A proposal is funded only after a Base transaction reference is recorded. An RFP is recorded for manual funding.`
);

const getPublicPrizeState = (now = new Date()) => {
  const instant = toDate(now);
  const window = prizeWindowForInstant(instant);
  const week = getCurrentWeekRange(instant);
  if (!window) {
    return {
      phase: 'weekly',
      name: SCICON_BIG_EVENT.name,
      allocationRsc: WEEKLY_ALLOCATION_RSC,
      startsAt: week.start,
      closesAt: week.end,
      weeklyResumesAt: new Date(MONTHLY_SERIES_START),
      proposalOpenUntil: week.end,
      scoreWindow: { start: week.start, end: week.end },
      snapshotFrozen: false,
      statusLabel: null,
      daysLeft: 0,
      monthKey: week.weekKey,
      closeLabel: '',
      closeShortLabel: '',
      announceLabel: '',
      announceShortLabel: '',
      rulesText: weeklyRulesText
    };
  }

  const time = instant.getTime();
  const phase = time < window.closesAt.getTime() ? 'big-event' : 'big-event-closed';
  const remainingMs = Math.max(0, window.closesAt.getTime() - time);
  return {
    phase,
    name: window.name,
    allocationRsc: SCICON_BIG_EVENT.allocationRsc,
    startsAt: window.startsAt,
    closesAt: window.closesAt,
    weeklyResumesAt: phase === 'big-event' ? window.closesAt : window.nextStartsAt,
    proposalOpenUntil: window.proposalOpenUntil,
    scoreWindow: { start: window.startsAt, end: window.closesAt },
    snapshotFrozen: phase === 'big-event-closed',
    statusLabel: phase === 'big-event-closed'
      ? `winner announced ${window.announceShortLabel}`
      : null,
    daysLeft: phase === 'big-event'
      ? Math.max(1, Math.ceil(remainingMs / 86_400_000))
      : 0,
    monthKey: window.monthKey,
    closeLabel: window.closeLabel,
    closeShortLabel: window.closeShortLabel,
    announceLabel: window.announceLabel,
    announceShortLabel: window.announceShortLabel,
    rulesText: buildEventRulesText(window, phase === 'big-event-closed')
  };
};

const weekOverlapsBigEventPause = (_start, end) => (
  end.getTime() > new Date(MONTHLY_SERIES_START).getTime()
);

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

const createWeeklyCompetitionBoundary = () => {
const WEEK_TIME_ZONE = 'America/Los_Angeles';
const WEEK_BOUNDARY_HOUR = 12;

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
  WEEK_TIME_ZONE,
  getCurrentWeekRange,
  getPreviousWeekKey,
  getWeeklyBoundaryMeta,
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

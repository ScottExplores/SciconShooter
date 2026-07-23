const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isWeeklyProposalReminderDue,
  parseWeeklyProposalReminderTimestamp,
  serializeWeeklyProposalReminderTimestamp,
  WEEKLY_PROPOSAL_REMINDER_INTERVAL_MS
} = require('../services/weeklyProposalReminder.ts');

test('weekly proposal reminders become due after four hours', () => {
  const shownAt = Date.UTC(2026, 6, 22, 12, 0, 0);

  assert.equal(WEEKLY_PROPOSAL_REMINDER_INTERVAL_MS, 4 * 60 * 60 * 1000);
  assert.equal(isWeeklyProposalReminderDue(shownAt, null), true);
  assert.equal(isWeeklyProposalReminderDue(shownAt + WEEKLY_PROPOSAL_REMINDER_INTERVAL_MS - 1, shownAt), false);
  assert.equal(isWeeklyProposalReminderDue(shownAt + WEEKLY_PROPOSAL_REMINDER_INTERVAL_MS, shownAt), true);
  assert.equal(isWeeklyProposalReminderDue(shownAt - 1, shownAt), false);
});

test('weekly proposal reminder timestamps use a versioned storage value', () => {
  const shownAt = Date.UTC(2026, 6, 22, 12, 0, 0);
  const serialized = serializeWeeklyProposalReminderTimestamp(shownAt);

  assert.deepEqual(JSON.parse(serialized), { version: 1, shownAt });
  assert.equal(parseWeeklyProposalReminderTimestamp(serialized), shownAt);
  assert.equal(parseWeeklyProposalReminderTimestamp('2026-07-22'), null);
  assert.equal(parseWeeklyProposalReminderTimestamp('{"version":2,"shownAt":123}'), null);
  assert.equal(parseWeeklyProposalReminderTimestamp(null), null);
});

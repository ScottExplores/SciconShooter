const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const handler = require('../api/finalize-weekly-competition');

const createResponse = () => ({
  statusCode: 200,
  headers: {},
  body: null,
  setHeader(name, value) {
    this.headers[name] = value;
  },
  end(value) {
    this.body = value ? JSON.parse(value) : null;
  }
});

test('weekly proposal snapshot/finalization cron rejects requests without the cron secret', async (context) => {
  const originalSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'snapshot-secret';
  context.after(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  const res = createResponse();
  await handler({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'Unauthorized');
});

test('Vercel config schedules DST-safe snapshot attempts and a post-settlement retry', () => {
  const vercel = require('../vercel.json');
  const weeklyCrons = vercel.crons.filter(
    (entry) => entry.path === '/api/finalize-weekly-competition'
  );
  assert.deepEqual(weeklyCrons.map((entry) => entry.schedule), [
    '59 18 * * 0',
    '59 19 * * 0',
    '10 20 * * 0',
    '10 21 * * 0'
  ]);
});

test('a late cutoff capture fails closed instead of falling through to live finalization', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '..', 'api', 'finalize-weekly-competition.js'),
    'utf8'
  );
  assert.match(
    source,
    /if \(snapshot\.captured\)[\s\S]*if \(snapshot\.captureAttempted\) return sendJson\(res, 409, snapshot\);[\s\S]*finalizeWeeklyCompetition/
  );
});

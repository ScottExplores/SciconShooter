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

test('the Play deployment does not schedule weekly finalization', () => {
  const vercel = require('../vercel.json');
  const ignored = fs.readFileSync(path.resolve(__dirname, '..', '.vercelignore'), 'utf8');
  assert.equal(vercel.crons, undefined);
  assert.match(ignored, /^middleware\.js$/m);
  assert.doesNotMatch(ignored, /^api\//m);
});

test('a late cutoff capture fails closed and later invocations run recent-week recovery', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '..', 'api', 'finalize-weekly-competition.js'),
    'utf8'
  );
  assert.match(
    source,
    /if \(snapshot\.captured\)[\s\S]*if \(snapshot\.captureAttempted\)[\s\S]*return sendJson\(res, 409, snapshot\);[\s\S]*ensureRecentWeeklyCompetitions/
  );
});

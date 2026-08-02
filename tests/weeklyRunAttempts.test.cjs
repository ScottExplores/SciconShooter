const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');

const loadSquad = () => {
  const result = esbuild.buildSync({
    entryPoints: [path.join(root, 'services', 'squadProgression.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    logLevel: 'silent'
  });
  const module = { exports: {} };
  Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
};

const squad = loadSquad();

test('Weekly Run reserves exactly two new attempts per competition week', () => {
  const initial = squad.createWeeklySquadState('pilot:attempt-test', '2026-08-02');
  assert.equal(squad.getWeeklyRunAttemptsRemaining(initial), 2);

  const first = squad.consumeWeeklyRunAttempt(initial);
  assert.equal(first.weeklyStats.weeklyRunAttempts, 1);
  assert.equal(squad.getWeeklyRunAttemptsRemaining(first), 1);

  const second = squad.consumeWeeklyRunAttempt(first);
  assert.equal(second.weeklyStats.weeklyRunAttempts, 2);
  assert.equal(squad.getWeeklyRunAttemptsRemaining(second), 0);

  const blocked = squad.consumeWeeklyRunAttempt(second);
  assert.equal(blocked, second, 'a third attempt must not mutate the profile');
});

test('weekly rollover restores the pair of attempts', () => {
  const initial = squad.createWeeklySquadState('pilot:attempt-reset', '2026-08-02');
  const used = squad.consumeWeeklyRunAttempt(squad.consumeWeeklyRunAttempt(initial));
  const rolled = squad.rollWeeklySquadStateForward(used, '2026-08-09');

  assert.equal(rolled.weeklyStats.weeklyRunAttempts, 0);
  assert.equal(squad.getWeeklyRunAttemptsRemaining(rolled), 2);
});

test('verified Weekly Run admission is server-authoritative and database-atomic', () => {
  const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
  const sql = read('supabase', 'base-native-readiness.sql');
  const route = read('api', 'run-receipts.js');
  const client = read('services', 'runReceiptService.ts');
  const app = read('App.tsx');

  assert.match(sql, /create table if not exists public\.scicon_weekly_run_attempts/);
  assert.match(sql, /unique \(identity_hash, weekly_id, attempt_number\)/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /create or replace function public\.scicon_reserve_weekly_run_attempt/);
  assert.match(sql, /create or replace function public\.scicon_settle_weekly_run_attempt/);
  assert.match(sql, /revoke all on table public\.scicon_weekly_run_attempts[\s\S]*from public, anon, authenticated/);
  assert.match(route, /await createReservedRunStart/);
  assert.match(client, /if \(runMode === 'weekly-streak'\)[\s\S]*throw error/);
  assert.ok(
    app.indexOf('const session = await sessionPromise') < app.indexOf("setActiveRunMode('weekly-streak')"),
    'Weekly Run gameplay must not unlock before the server reservation resolves'
  );
});

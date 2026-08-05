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

test('Weekly Run grants exactly five free attempts per competition week', () => {
  const initial = squad.createWeeklySquadState('pilot:attempt-test', '2026-08-02');
  assert.equal(squad.getWeeklyRunAttemptsRemaining(initial), 5);

  let used = initial;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    used = squad.consumeWeeklyRunAttempt(used);
    assert.equal(used.weeklyStats.weeklyRunAttempts, attempt);
    assert.equal(squad.getWeeklyRunAttemptsRemaining(used), 5 - attempt);
  }

  const blocked = squad.consumeWeeklyRunAttempt(used);
  assert.equal(blocked, used, 'a sixth free attempt must not mutate the profile');
});

test('weekly rollover restores all five free attempts', () => {
  const initial = squad.createWeeklySquadState('pilot:attempt-reset', '2026-08-02');
  let used = initial;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    used = squad.consumeWeeklyRunAttempt(used);
  }
  const rolled = squad.rollWeeklySquadStateForward(used, '2026-08-09');

  assert.equal(rolled.weeklyStats.weeklyRunAttempts, 0);
  assert.equal(squad.getWeeklyRunAttemptsRemaining(rolled), 5);
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
  assert.match(client, /if \(session\.runMode === 'weekly-streak'\)[\s\S]*No wallet is required/);
  assert.match(client, /Weekly Run verification was interrupted; keeping the signed run available for retry/);
  assert.ok(
    app.indexOf('const session = await sessionPromise') < app.indexOf("setActiveRunMode('weekly-streak')"),
    'Weekly Run gameplay must not unlock before the server reservation resolves'
  );
});

test('production migration restores the free Weekly Run ledger without purchase dependencies', () => {
  const migrationsDir = path.join(root, 'supabase', 'migrations');
  const migrationName = fs.readdirSync(migrationsDir)
    .find((name) => name.endsWith('_restore_weekly_run_attempt_persistence.sql'));

  assert.ok(migrationName, 'the Weekly Run persistence migration must be tracked');
  const sql = fs.readFileSync(path.join(migrationsDir, migrationName), 'utf8');

  assert.match(sql, /create table if not exists public\.scicon_weekly_run_attempts/);
  assert.match(sql, /create table if not exists public\.scicon_weekly_run_attempt_credits/);
  assert.match(sql, /create or replace function public\.scicon_get_weekly_run_quota/);
  assert.match(sql, /create or replace function public\.scicon_reserve_weekly_run_attempt/);
  assert.match(sql, /create or replace function public\.scicon_settle_weekly_run_attempt/);
  assert.equal(sql.match(/security invoker/g)?.length, 3);
  assert.match(sql, /scicon_weekly_run_attempts_wallet_week_idx/);
  assert.match(sql, /revoke all on table public\.scicon_weekly_run_attempts[\s\S]*from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.scicon_reserve_weekly_run_attempt\([\s\S]*to service_role/);
  assert.doesNotMatch(sql, /scicon_wallet_(?:entitlements|purchase_orders)/);
  assert.doesNotMatch(sql, /scicon_settle_wallet_purchase/);
  assert.match(sql, /notify pgrst, 'reload schema'/);
});

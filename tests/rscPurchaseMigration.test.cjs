const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const migrationPath = path.join(
  root,
  'supabase',
  'migrations',
  '20260803233339_install_founder_rsc_purchase_rails.sql'
);
const sql = fs.readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n');
const founder = '0x3a8d692aabdd4981080a8f6af8375a21359464bf';

const functionBody = (name) => {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  assert.notEqual(start, -1, `${name} must be installed by the migration`);
  const end = sql.indexOf('\n$$;', start);
  assert.notEqual(end, -1, `${name} must have a complete body`);
  return sql.slice(start, end);
};

test('RSC migration pins every payment rail to the canonical founder recipient', () => {
  assert.match(sql, /^begin;[\s\S]*\ncommit;\s*$/);
  assert.ok(
    sql.split(`recipient_address = '${founder}'`).length - 1 >= 3,
    'store orders, Continue orders, and the receipt ledger must pin the founder'
  );
  assert.match(sql, /sku_id = 'weekly-run-attempt'[\s\S]*amount_raw = 3000000000000000000/);
  assert.match(sql, /sku_id = 'tokens-500'[\s\S]*amount_raw = 1000000000000000000[\s\S]*reward_tokens = 500/);
  assert.match(sql, /amount_raw = continue_sequence::numeric \* 5000000000000000000::numeric/);
});

test('store and Continue settlement atomically share one Transfer receipt ledger', () => {
  assert.match(
    sql,
    /primary key \(chain_id, transaction_hash, log_index\)[\s\S]*unique \(purpose, reference_id\)/
  );
  const store = functionBody('scicon_settle_wallet_purchase');
  const continuation = functionBody('scicon_settle_continue_payment');
  for (const [name, body] of [['store', store], ['Continue', continuation]]) {
    assert.match(body, /insert into public\.scicon_rsc_payment_receipts/);
    assert.match(body, /on conflict do nothing;[\s\S]*get diagnostics v_inserted = row_count;/);
    assert.ok(
      body.indexOf('insert into public.scicon_rsc_payment_receipts')
        < body.lastIndexOf("status = 'fulfilled'"),
      `${name} must claim the Transfer before fulfilling its order`
    );
  }
  assert.match(store, /wallet_purchase_payment_replayed/);
  assert.match(continuation, /continue_payment_replayed/);
});

test('paid Token credits have a server-owned reserve and atomic idempotent spend rail', () => {
  assert.match(sql, /purchased_tokens_available bigint not null default 0/);
  assert.match(sql, /create table if not exists public\.scicon_wallet_token_spends/);
  const spend = functionBody('scicon_apply_wallet_token_spend');
  assert.match(spend, /from public\.scicon_wallet_token_spends[\s\S]*where spend_id = p_spend_id/);
  assert.match(spend, /weeklyState,profileId}'\s+is distinct from 'wallet:' \|\| p_wallet_address/);
  assert.match(spend, /permanentState,profileId}'\s+is distinct from 'wallet:' \|\| p_wallet_address/);
  assert.match(spend, /v_profile\.revision <> p_expected_revision/);
  assert.match(spend, /purchased_tokens_available = v_available_after/);
  assert.match(spend, /revision = revision \+ 1,[\s\S]*snapshot = p_next_snapshot/);
});

test('purchase tables and settlement RPCs remain service-role only', () => {
  for (const table of [
    'scicon_wallet_entitlements',
    'scicon_wallet_purchase_orders',
    'scicon_continue_payment_orders',
    'scicon_rsc_payment_receipts',
    'scicon_wallet_token_spends'
  ]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security;`));
    assert.match(
      sql,
      new RegExp(`revoke all on table public\\.${table}\\s+from public, anon, authenticated;`)
    );
  }
  for (const rpc of [
    'scicon_settle_wallet_purchase',
    'scicon_settle_continue_payment',
    'scicon_apply_wallet_token_spend'
  ]) {
    assert.match(sql, new RegExp(`grant execute on function public\\.${rpc}\\(`));
  }
});

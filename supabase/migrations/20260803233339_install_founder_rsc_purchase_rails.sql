begin;

-- Production RSC purchase rails.
--
-- All RSC payments settle to the canonical founder wallet. Because Continue
-- payments and store purchases share that recipient, every verified ERC-20
-- Transfer is claimed through one global receipt ledger. A transaction log can
-- therefore grant exactly one benefit across every payment purpose.

create table if not exists public.scicon_wallet_entitlements (
  wallet_address text primary key check (
    wallet_address = lower(wallet_address)
    and wallet_address ~ '^0x[0-9a-f]{40}$'
    and wallet_address <> '0x0000000000000000000000000000000000000000'
  ),
  right_support_unlocked boolean not null default false,
  purchased_tokens_total bigint not null default 0,
  purchased_tokens_available bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scicon_wallet_entitlements_purchased_tokens_total_check
    check (purchased_tokens_total >= 0),
  constraint scicon_wallet_entitlements_purchased_tokens_available_check
    check (
      purchased_tokens_available >= 0
      and purchased_tokens_available <= 1000000000
      and purchased_tokens_available <= purchased_tokens_total
    )
);

create table if not exists public.scicon_wallet_purchase_orders (
  order_id uuid primary key,
  wallet_address text not null check (
    wallet_address = lower(wallet_address)
    and wallet_address ~ '^0x[0-9a-f]{40}$'
    and wallet_address <> '0x0000000000000000000000000000000000000000'
  ),
  sku_id text not null,
  chain_id integer not null check (chain_id = 8453),
  token_address text not null check (
    token_address = '0xfbb75a59193a3525a8825bebe7d4b56899e2f7e1'
  ),
  recipient_address text not null check (
    recipient_address = '0x3a8d692aabdd4981080a8f6af8375a21359464bf'
  ),
  amount_raw numeric(78, 0) not null check (amount_raw > 0),
  reward_tokens integer not null check (reward_tokens between 0 and 1000000000),
  grants_right_support boolean not null default false,
  reward_weekly_id text,
  weekly_attempt_reward smallint not null default 0,
  status text not null default 'quoted' check (status in ('quoted', 'fulfilled')),
  expires_at timestamptz not null,
  transaction_hash text check (
    transaction_hash is null
    or (
      transaction_hash = lower(transaction_hash)
      and transaction_hash ~ '^0x[0-9a-f]{64}$'
    )
  ),
  log_index integer check (log_index is null or log_index >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fulfilled_at timestamptz,
  constraint scicon_wallet_purchase_orders_terms_check check (
    (
      sku_id = 'right-support'
      and amount_raw = 10000000000000000000
      and reward_tokens = 0
      and grants_right_support
      and reward_weekly_id is null
      and weekly_attempt_reward = 0
    )
    or (
      sku_id = 'weekly-run-attempt'
      and amount_raw = 3000000000000000000
      and reward_tokens = 0
      and not grants_right_support
      and reward_weekly_id is not null
      and reward_weekly_id ~ '^\d{4}-\d{2}-\d{2}$'
      and weekly_attempt_reward = 1
    )
    or (
      sku_id = 'tokens-500'
      and amount_raw = 1000000000000000000
      and reward_tokens = 500
      and not grants_right_support
      and reward_weekly_id is null
      and weekly_attempt_reward = 0
    )
    or (
      sku_id = 'tokens-2500'
      and amount_raw = 5000000000000000000
      and reward_tokens = 2500
      and not grants_right_support
      and reward_weekly_id is null
      and weekly_attempt_reward = 0
    )
    or (
      sku_id = 'tokens-5000'
      and amount_raw = 10000000000000000000
      and reward_tokens = 5000
      and not grants_right_support
      and reward_weekly_id is null
      and weekly_attempt_reward = 0
    )
  ),
  constraint scicon_wallet_purchase_orders_fulfillment_check check (
    (
      status = 'quoted'
      and transaction_hash is null
      and log_index is null
      and fulfilled_at is null
    )
    or (
      status = 'fulfilled'
      and transaction_hash is not null
      and log_index is not null
      and fulfilled_at is not null
    )
  ),
  constraint scicon_wallet_purchase_orders_recipient_not_purchaser_check
    check (recipient_address <> wallet_address)
);

create table if not exists public.scicon_continue_payment_orders (
  order_id uuid primary key,
  run_id uuid not null,
  wallet_address text not null check (
    wallet_address = lower(wallet_address)
    and wallet_address ~ '^0x[0-9a-f]{40}$'
    and wallet_address <> '0x0000000000000000000000000000000000000000'
  ),
  continue_sequence smallint not null check (continue_sequence between 1 and 32767),
  chain_id integer not null check (chain_id = 8453),
  token_address text not null check (
    token_address = '0xfbb75a59193a3525a8825bebe7d4b56899e2f7e1'
  ),
  recipient_address text not null check (
    recipient_address = '0x3a8d692aabdd4981080a8f6af8375a21359464bf'
  ),
  amount_raw numeric(78, 0) not null,
  lives_reward smallint not null default 5 check (lives_reward = 5),
  status text not null default 'quoted' check (status in ('quoted', 'fulfilled')),
  expires_at timestamptz not null,
  transaction_hash text check (
    transaction_hash is null
    or (
      transaction_hash = lower(transaction_hash)
      and transaction_hash ~ '^0x[0-9a-f]{64}$'
    )
  ),
  log_index integer check (log_index is null or log_index >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fulfilled_at timestamptz,
  constraint scicon_continue_payment_orders_terms_check check (
    amount_raw = continue_sequence::numeric * 5000000000000000000::numeric
  ),
  constraint scicon_continue_payment_orders_fulfillment_check check (
    (
      status = 'quoted'
      and transaction_hash is null
      and log_index is null
      and fulfilled_at is null
    )
    or (
      status = 'fulfilled'
      and transaction_hash is not null
      and log_index is not null
      and fulfilled_at is not null
    )
  ),
  constraint scicon_continue_payment_orders_recipient_not_purchaser_check
    check (recipient_address <> wallet_address),
  constraint scicon_continue_payment_orders_run_sequence_key
    unique (run_id, continue_sequence)
);

create table if not exists public.scicon_rsc_payment_receipts (
  chain_id integer not null check (chain_id = 8453),
  transaction_hash text not null check (
    transaction_hash = lower(transaction_hash)
    and transaction_hash ~ '^0x[0-9a-f]{64}$'
  ),
  log_index integer not null check (log_index >= 0),
  wallet_address text not null check (
    wallet_address = lower(wallet_address)
    and wallet_address ~ '^0x[0-9a-f]{40}$'
    and wallet_address <> '0x0000000000000000000000000000000000000000'
  ),
  token_address text not null check (
    token_address = '0xfbb75a59193a3525a8825bebe7d4b56899e2f7e1'
  ),
  recipient_address text not null check (
    recipient_address = '0x3a8d692aabdd4981080a8f6af8375a21359464bf'
  ),
  amount_raw numeric(78, 0) not null check (amount_raw > 0),
  purpose text not null check (purpose in ('wallet-purchase', 'continue')),
  reference_id uuid not null,
  payment_block_time timestamptz not null,
  settled_at timestamptz not null default now(),
  primary key (chain_id, transaction_hash, log_index),
  constraint scicon_rsc_payment_receipts_purpose_reference_key
    unique (purpose, reference_id)
);

create table if not exists public.scicon_wallet_token_spends (
  spend_id uuid primary key,
  wallet_address text not null check (
    wallet_address = lower(wallet_address)
    and wallet_address ~ '^0x[0-9a-f]{40}$'
    and wallet_address <> '0x0000000000000000000000000000000000000000'
  ),
  amount integer not null check (amount between 0 and 1000000000),
  reason text not null check (char_length(reason) between 1 and 180),
  purchased_tokens_spent bigint not null check (purchased_tokens_spent >= 0),
  purchased_tokens_available_after bigint not null check (
    purchased_tokens_available_after between 0 and 1000000000
  ),
  profile_revision_before bigint not null check (profile_revision_before >= 1),
  profile_revision_after bigint not null check (
    profile_revision_after = profile_revision_before + 1
  ),
  created_at timestamptz not null default now()
);

comment on table public.scicon_rsc_payment_receipts is
  'Global one-benefit-per-RSC-Transfer ledger shared by store and Continue settlement.';
comment on column public.scicon_wallet_entitlements.purchased_tokens_available is
  'Server-owned unspent portion of verified RSC Token-pack credits.';

create index if not exists scicon_wallet_purchase_orders_wallet_idx
  on public.scicon_wallet_purchase_orders (wallet_address, created_at desc);

create unique index if not exists scicon_wallet_purchase_orders_payment_once_idx
  on public.scicon_wallet_purchase_orders (chain_id, transaction_hash, log_index)
  where status = 'fulfilled';

create unique index if not exists scicon_wallet_purchase_orders_right_support_once_idx
  on public.scicon_wallet_purchase_orders (wallet_address, sku_id)
  where grants_right_support;

create unique index if not exists scicon_wallet_purchase_orders_active_quote_idx
  on public.scicon_wallet_purchase_orders (
    wallet_address,
    sku_id,
    (coalesce(reward_weekly_id, ''))
  )
  where status = 'quoted';

create index if not exists scicon_continue_payment_orders_wallet_run_idx
  on public.scicon_continue_payment_orders (
    wallet_address,
    run_id,
    continue_sequence
  );

create unique index if not exists scicon_continue_payment_orders_payment_once_idx
  on public.scicon_continue_payment_orders (chain_id, transaction_hash, log_index)
  where status = 'fulfilled';

create index if not exists scicon_rsc_payment_receipts_wallet_time_idx
  on public.scicon_rsc_payment_receipts (wallet_address, settled_at desc);

create index if not exists scicon_wallet_token_spends_wallet_time_idx
  on public.scicon_wallet_token_spends (wallet_address, created_at desc);

alter table public.scicon_wallet_entitlements enable row level security;
alter table public.scicon_wallet_purchase_orders enable row level security;
alter table public.scicon_continue_payment_orders enable row level security;
alter table public.scicon_rsc_payment_receipts enable row level security;
alter table public.scicon_wallet_token_spends enable row level security;

revoke all on table public.scicon_wallet_entitlements
  from public, anon, authenticated;
revoke all on table public.scicon_wallet_purchase_orders
  from public, anon, authenticated;
revoke all on table public.scicon_continue_payment_orders
  from public, anon, authenticated;
revoke all on table public.scicon_rsc_payment_receipts
  from public, anon, authenticated;
revoke all on table public.scicon_wallet_token_spends
  from public, anon, authenticated;

grant select, insert, update, delete on table public.scicon_wallet_entitlements
  to service_role;
grant select, insert, update, delete on table public.scicon_wallet_purchase_orders
  to service_role;
grant select, insert, update, delete on table public.scicon_continue_payment_orders
  to service_role;
grant select, insert, update, delete on table public.scicon_rsc_payment_receipts
  to service_role;
grant select, insert, update, delete on table public.scicon_wallet_token_spends
  to service_role;

-- Preserve permanent right-wing ownership that was already present in a
-- canonical cloud profile before the purchase rail became authoritative.
insert into public.scicon_wallet_entitlements (
  wallet_address,
  right_support_unlocked,
  purchased_tokens_total,
  purchased_tokens_available,
  created_at,
  updated_at
)
select
  wallet_address,
  true,
  0,
  0,
  now(),
  now()
from public.scicon_wallet_profiles
where lower(coalesce(snapshot #>> '{weeklyState,unlockedSlots,right}', 'false')) = 'true'
on conflict (wallet_address) do update
set
  right_support_unlocked = true,
  updated_at = now();

create or replace function public.scicon_settle_wallet_purchase(
  p_wallet_address text,
  p_order_id uuid,
  p_transaction_hash text,
  p_log_index integer,
  p_payment_block_time timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_order public.scicon_wallet_purchase_orders%rowtype;
  v_profile public.scicon_wallet_profiles%rowtype;
  v_entitlement public.scicon_wallet_entitlements%rowtype;
  v_now timestamptz := clock_timestamp();
  v_snapshot jsonb;
  v_weekly jsonb;
  v_slots jsonb;
  v_coins bigint;
  v_durable_tokens bigint;
  v_purchased_attempts integer := 0;
  v_inserted integer := 0;
begin
  if p_wallet_address is null
    or p_wallet_address <> lower(p_wallet_address)
    or p_wallet_address !~ '^0x[0-9a-f]{40}$'
    or p_wallet_address = '0x0000000000000000000000000000000000000000'
    or p_transaction_hash is null
    or p_transaction_hash <> lower(p_transaction_hash)
    or p_transaction_hash !~ '^0x[0-9a-f]{64}$'
    or p_log_index is null
    or p_log_index < 0
    or p_payment_block_time is null
  then
    raise exception 'wallet_purchase_invalid_settlement';
  end if;

  select * into v_order
  from public.scicon_wallet_purchase_orders
  where order_id = p_order_id
  for update;

  if not found or v_order.wallet_address <> p_wallet_address then
    raise exception 'wallet_purchase_not_found';
  end if;

  if v_order.status = 'fulfilled' then
    if v_order.transaction_hash = p_transaction_hash
      and v_order.log_index = p_log_index
    then
      return jsonb_build_object(
        'accepted', true,
        'duplicate', true,
        'orderId', v_order.order_id,
        'skuId', v_order.sku_id
      );
    end if;
    raise exception 'wallet_purchase_already_fulfilled';
  end if;

  if v_order.status <> 'quoted'
    or p_payment_block_time < v_order.created_at - interval '30 seconds'
    or p_payment_block_time > v_order.expires_at
  then
    raise exception 'wallet_purchase_expired';
  end if;

  insert into public.scicon_rsc_payment_receipts (
    chain_id,
    transaction_hash,
    log_index,
    wallet_address,
    token_address,
    recipient_address,
    amount_raw,
    purpose,
    reference_id,
    payment_block_time,
    settled_at
  ) values (
    v_order.chain_id,
    p_transaction_hash,
    p_log_index,
    p_wallet_address,
    v_order.token_address,
    v_order.recipient_address,
    v_order.amount_raw,
    'wallet-purchase',
    v_order.order_id,
    p_payment_block_time,
    v_now
  )
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted <> 1 then
    raise exception 'wallet_purchase_payment_replayed';
  end if;

  select * into v_profile
  from public.scicon_wallet_profiles
  where wallet_address = p_wallet_address
  for update;
  if not found then
    raise exception 'wallet_purchase_profile_missing';
  end if;

  if v_order.weekly_attempt_reward > 0 then
    if v_order.sku_id <> 'weekly-run-attempt'
      or v_order.weekly_attempt_reward <> 1
      or v_order.reward_weekly_id is null
    then
      raise exception 'wallet_purchase_terms_invalid';
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended(
        'weekly-wallet:' || p_wallet_address || ':' || v_order.reward_weekly_id,
        0
      )
    );
    select coalesce(purchased_attempts, 0) into v_purchased_attempts
    from public.scicon_weekly_run_attempt_credits
    where wallet_address = p_wallet_address
      and weekly_id = v_order.reward_weekly_id
    for update;
    v_purchased_attempts := coalesce(v_purchased_attempts, 0);
    if v_purchased_attempts + v_order.weekly_attempt_reward > 32762 then
      raise exception 'weekly_attempt_credit_limit_reached';
    end if;

    insert into public.scicon_weekly_run_attempt_credits (
      wallet_address,
      weekly_id,
      purchased_attempts,
      created_at,
      updated_at
    ) values (
      p_wallet_address,
      v_order.reward_weekly_id,
      v_order.weekly_attempt_reward,
      v_now,
      v_now
    )
    on conflict (wallet_address, weekly_id) do update
    set
      purchased_attempts = public.scicon_weekly_run_attempt_credits.purchased_attempts
        + excluded.purchased_attempts,
      updated_at = v_now;
  else
    insert into public.scicon_wallet_entitlements (
      wallet_address,
      right_support_unlocked,
      purchased_tokens_total,
      purchased_tokens_available,
      created_at,
      updated_at
    ) values (
      p_wallet_address,
      false,
      0,
      0,
      v_now,
      v_now
    )
    on conflict (wallet_address) do nothing;

    select * into v_entitlement
    from public.scicon_wallet_entitlements
    where wallet_address = p_wallet_address
    for update;

    if v_order.grants_right_support
      and (
        v_entitlement.right_support_unlocked
        or lower(coalesce(v_profile.snapshot #>> '{weeklyState,unlockedSlots,right}', 'false')) = 'true'
      )
    then
      raise exception 'wallet_purchase_already_owned';
    end if;

    v_snapshot := coalesce(v_profile.snapshot, '{}'::jsonb);
    v_weekly := coalesce(v_snapshot -> 'weeklyState', '{}'::jsonb);
    v_slots := coalesce(v_weekly -> 'unlockedSlots', '{}'::jsonb);
    v_coins := case
      when coalesce(v_weekly ->> 'coins', '') ~ '^\d{1,10}$'
        then least(1000000000, (v_weekly ->> 'coins')::bigint)
      else 0
    end;
    v_durable_tokens := case
      when coalesce(v_weekly ->> 'durableCampaignCoins', '') ~ '^\d{1,10}$'
        then least(v_coins, (v_weekly ->> 'durableCampaignCoins')::bigint)
      else 0
    end;

    if v_order.reward_tokens > 0
      and (
        v_coins > 1000000000 - v_order.reward_tokens
        or v_durable_tokens > 1000000000 - v_order.reward_tokens
        or v_entitlement.purchased_tokens_available
          > 1000000000 - v_order.reward_tokens
      )
    then
      -- Receipt insertion and every preceding mutation roll back with this
      -- exception. The already-mined payment can be retried after Token spend.
      raise exception 'wallet_purchase_token_headroom_required';
    end if;

    update public.scicon_wallet_entitlements
    set
      right_support_unlocked = right_support_unlocked
        or v_order.grants_right_support,
      purchased_tokens_total = purchased_tokens_total + v_order.reward_tokens,
      purchased_tokens_available = purchased_tokens_available + v_order.reward_tokens,
      updated_at = v_now
    where wallet_address = p_wallet_address;

    v_weekly := jsonb_set(
      v_weekly,
      '{coins}',
      to_jsonb(v_coins + v_order.reward_tokens),
      true
    );
    v_weekly := jsonb_set(
      v_weekly,
      '{durableCampaignCoins}',
      to_jsonb(v_durable_tokens + v_order.reward_tokens),
      true
    );
    if v_order.grants_right_support then
      v_slots := jsonb_set(v_slots, '{right}', 'true'::jsonb, true);
    end if;
    v_weekly := jsonb_set(v_weekly, '{unlockedSlots}', v_slots, true);
    v_weekly := jsonb_set(v_weekly, '{updatedAt}', to_jsonb(v_now::text), true);
    v_snapshot := jsonb_set(v_snapshot, '{weeklyState}', v_weekly, true);

    update public.scicon_wallet_profiles
    set
      revision = revision + 1,
      snapshot = v_snapshot,
      updated_at = v_now
    where wallet_address = p_wallet_address;
  end if;

  update public.scicon_wallet_purchase_orders
  set
    status = 'fulfilled',
    transaction_hash = p_transaction_hash,
    log_index = p_log_index,
    fulfilled_at = v_now,
    updated_at = v_now
  where order_id = p_order_id;

  return jsonb_build_object(
    'accepted', true,
    'duplicate', false,
    'orderId', v_order.order_id,
    'skuId', v_order.sku_id
  );
end;
$$;

create or replace function public.scicon_settle_continue_payment(
  p_wallet_address text,
  p_order_id uuid,
  p_transaction_hash text,
  p_log_index integer,
  p_payment_block_time timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_order public.scicon_continue_payment_orders%rowtype;
  v_now timestamptz := clock_timestamp();
  v_fulfilled_before integer := 0;
  v_inserted integer := 0;
begin
  if p_wallet_address is null
    or p_wallet_address <> lower(p_wallet_address)
    or p_wallet_address !~ '^0x[0-9a-f]{40}$'
    or p_wallet_address = '0x0000000000000000000000000000000000000000'
    or p_transaction_hash is null
    or p_transaction_hash <> lower(p_transaction_hash)
    or p_transaction_hash !~ '^0x[0-9a-f]{64}$'
    or p_log_index is null
    or p_log_index < 0
    or p_payment_block_time is null
  then
    raise exception 'continue_payment_invalid_settlement';
  end if;

  select * into v_order
  from public.scicon_continue_payment_orders
  where order_id = p_order_id
  for update;

  if not found or v_order.wallet_address <> p_wallet_address then
    raise exception 'continue_payment_not_found';
  end if;

  if v_order.status = 'fulfilled' then
    if v_order.transaction_hash = p_transaction_hash
      and v_order.log_index = p_log_index
    then
      return jsonb_build_object(
        'accepted', true,
        'duplicate', true,
        'orderId', v_order.order_id,
        'runId', v_order.run_id,
        'continueSequence', v_order.continue_sequence,
        'livesReward', v_order.lives_reward
      );
    end if;
    raise exception 'continue_payment_already_fulfilled';
  end if;

  if v_order.status <> 'quoted'
    or p_payment_block_time < v_order.created_at - interval '30 seconds'
    or p_payment_block_time > v_order.expires_at
  then
    raise exception 'continue_payment_expired';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('continue-run:' || v_order.run_id::text, 0)
  );
  select count(*)::integer into v_fulfilled_before
  from public.scicon_continue_payment_orders
  where run_id = v_order.run_id
    and wallet_address = p_wallet_address
    and status = 'fulfilled';

  if v_order.continue_sequence <> v_fulfilled_before + 1 then
    raise exception 'continue_payment_sequence_invalid';
  end if;

  insert into public.scicon_rsc_payment_receipts (
    chain_id,
    transaction_hash,
    log_index,
    wallet_address,
    token_address,
    recipient_address,
    amount_raw,
    purpose,
    reference_id,
    payment_block_time,
    settled_at
  ) values (
    v_order.chain_id,
    p_transaction_hash,
    p_log_index,
    p_wallet_address,
    v_order.token_address,
    v_order.recipient_address,
    v_order.amount_raw,
    'continue',
    v_order.order_id,
    p_payment_block_time,
    v_now
  )
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted <> 1 then
    raise exception 'continue_payment_replayed';
  end if;

  update public.scicon_continue_payment_orders
  set
    status = 'fulfilled',
    transaction_hash = p_transaction_hash,
    log_index = p_log_index,
    fulfilled_at = v_now,
    updated_at = v_now
  where order_id = p_order_id;

  return jsonb_build_object(
    'accepted', true,
    'duplicate', false,
    'orderId', v_order.order_id,
    'runId', v_order.run_id,
    'continueSequence', v_order.continue_sequence,
    'livesReward', v_order.lives_reward
  );
end;
$$;

create or replace function public.scicon_apply_wallet_token_spend(
  p_wallet_address text,
  p_spend_id uuid,
  p_expected_revision bigint,
  p_amount integer,
  p_reason text,
  p_next_snapshot jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_existing public.scicon_wallet_token_spends%rowtype;
  v_profile public.scicon_wallet_profiles%rowtype;
  v_entitlement public.scicon_wallet_entitlements%rowtype;
  v_current_weekly jsonb;
  v_next_weekly jsonb;
  v_current_coins bigint;
  v_current_durable bigint;
  v_next_coins bigint;
  v_next_durable bigint;
  v_seasonal_coins bigint;
  v_durable_spent bigint;
  v_non_purchased_available bigint;
  v_purchased_spent bigint;
  v_available_after bigint;
  v_now timestamptz := clock_timestamp();
begin
  if p_wallet_address is null
    or p_wallet_address <> lower(p_wallet_address)
    or p_wallet_address !~ '^0x[0-9a-f]{40}$'
    or p_wallet_address = '0x0000000000000000000000000000000000000000'
    or p_spend_id is null
    or p_expected_revision is null
    or p_expected_revision < 1
    or p_amount is null
    or p_amount < 0
    or p_amount > 1000000000
    or p_reason is null
    or char_length(p_reason) not between 1 and 180
  then
    raise exception 'wallet_token_spend_invalid';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('wallet-token-spend:' || p_spend_id::text, 0)
  );

  select * into v_existing
  from public.scicon_wallet_token_spends
  where spend_id = p_spend_id
  for update;
  if found then
    if v_existing.wallet_address <> p_wallet_address
      or v_existing.amount <> p_amount
      or v_existing.reason <> p_reason
    then
      raise exception 'wallet_token_spend_replayed';
    end if;
    return jsonb_build_object(
      'accepted', true,
      'duplicate', true,
      'spendId', v_existing.spend_id,
      'cost', v_existing.amount,
      'purchasedTokensSpent', v_existing.purchased_tokens_spent,
      'purchasedTokensAvailable', v_existing.purchased_tokens_available_after,
      'profileRevision', v_existing.profile_revision_after
    );
  end if;

  if p_next_snapshot is null
    or jsonb_typeof(p_next_snapshot) <> 'object'
    or octet_length(p_next_snapshot::text) > 262144
    or p_next_snapshot #>> '{weeklyState,profileId}'
      is distinct from 'wallet:' || p_wallet_address
    or p_next_snapshot #>> '{permanentState,profileId}'
      is distinct from 'wallet:' || p_wallet_address
  then
    raise exception 'wallet_token_spend_snapshot_invalid';
  end if;

  select * into v_profile
  from public.scicon_wallet_profiles
  where wallet_address = p_wallet_address
  for update;
  if not found then
    raise exception 'wallet_token_spend_profile_missing';
  end if;
  if v_profile.revision <> p_expected_revision then
    raise exception 'wallet_token_spend_revision_conflict';
  end if;

  insert into public.scicon_wallet_entitlements (
    wallet_address,
    right_support_unlocked,
    purchased_tokens_total,
    purchased_tokens_available,
    created_at,
    updated_at
  ) values (
    p_wallet_address,
    false,
    0,
    0,
    v_now,
    v_now
  )
  on conflict (wallet_address) do nothing;

  select * into v_entitlement
  from public.scicon_wallet_entitlements
  where wallet_address = p_wallet_address
  for update;

  v_current_weekly := coalesce(v_profile.snapshot -> 'weeklyState', '{}'::jsonb);
  v_next_weekly := coalesce(p_next_snapshot -> 'weeklyState', '{}'::jsonb);
  if coalesce(v_current_weekly ->> 'coins', '') !~ '^\d{1,10}$'
    or coalesce(v_current_weekly ->> 'durableCampaignCoins', '') !~ '^\d{1,10}$'
    or coalesce(v_next_weekly ->> 'coins', '') !~ '^\d{1,10}$'
    or coalesce(v_next_weekly ->> 'durableCampaignCoins', '') !~ '^\d{1,10}$'
  then
    raise exception 'wallet_token_spend_balance_invalid';
  end if;

  v_current_coins := (v_current_weekly ->> 'coins')::bigint;
  v_current_durable := (v_current_weekly ->> 'durableCampaignCoins')::bigint;
  v_next_coins := (v_next_weekly ->> 'coins')::bigint;
  v_next_durable := (v_next_weekly ->> 'durableCampaignCoins')::bigint;

  if v_current_coins > 1000000000
    or v_current_durable > v_current_coins
    or v_current_coins < p_amount
    or v_entitlement.purchased_tokens_available > v_current_coins
    or v_entitlement.purchased_tokens_available > v_current_durable
  then
    raise exception 'wallet_token_spend_balance_invalid';
  end if;

  v_seasonal_coins := v_current_coins - v_current_durable;
  v_durable_spent := greatest(0, p_amount::bigint - v_seasonal_coins);
  if v_next_coins <> v_current_coins - p_amount
    or v_next_durable <> v_current_durable - v_durable_spent
    or coalesce(v_next_weekly ->> 'weekKey', '')
      <> coalesce(v_current_weekly ->> 'weekKey', '')
    or lower(coalesce(v_next_weekly #>> '{unlockedSlots,right}', 'false'))
      <> lower(coalesce(v_current_weekly #>> '{unlockedSlots,right}', 'false'))
  then
    raise exception 'wallet_token_spend_snapshot_invalid';
  end if;

  -- Treat every non-purchased Token as spendable before the paid reserve. This
  -- keeps the remaining paid balance durable while matching the client total.
  v_non_purchased_available := greatest(
    0,
    v_current_coins - v_entitlement.purchased_tokens_available
  );
  v_purchased_spent := greatest(
    0,
    p_amount::bigint - v_non_purchased_available
  );
  if v_purchased_spent > v_entitlement.purchased_tokens_available then
    raise exception 'wallet_token_spend_insufficient';
  end if;
  v_available_after := v_entitlement.purchased_tokens_available - v_purchased_spent;
  if v_available_after > v_next_coins or v_available_after > v_next_durable then
    raise exception 'wallet_token_spend_balance_invalid';
  end if;

  update public.scicon_wallet_entitlements
  set
    purchased_tokens_available = v_available_after,
    updated_at = v_now
  where wallet_address = p_wallet_address;

  update public.scicon_wallet_profiles
  set
    revision = revision + 1,
    snapshot = p_next_snapshot,
    updated_at = v_now
  where wallet_address = p_wallet_address;

  insert into public.scicon_wallet_token_spends (
    spend_id,
    wallet_address,
    amount,
    reason,
    purchased_tokens_spent,
    purchased_tokens_available_after,
    profile_revision_before,
    profile_revision_after,
    created_at
  ) values (
    p_spend_id,
    p_wallet_address,
    p_amount,
    p_reason,
    v_purchased_spent,
    v_available_after,
    v_profile.revision,
    v_profile.revision + 1,
    v_now
  );

  return jsonb_build_object(
    'accepted', true,
    'duplicate', false,
    'spendId', p_spend_id,
    'cost', p_amount,
    'purchasedTokensSpent', v_purchased_spent,
    'purchasedTokensAvailable', v_available_after,
    'profileRevision', v_profile.revision + 1
  );
end;
$$;

revoke all on function public.scicon_settle_wallet_purchase(
  text, uuid, text, integer, timestamptz
) from public, anon, authenticated;
grant execute on function public.scicon_settle_wallet_purchase(
  text, uuid, text, integer, timestamptz
) to service_role;

revoke all on function public.scicon_settle_continue_payment(
  text, uuid, text, integer, timestamptz
) from public, anon, authenticated;
grant execute on function public.scicon_settle_continue_payment(
  text, uuid, text, integer, timestamptz
) to service_role;

revoke all on function public.scicon_apply_wallet_token_spend(
  text, uuid, bigint, integer, text, jsonb
) from public, anon, authenticated;
grant execute on function public.scicon_apply_wallet_token_spend(
  text, uuid, bigint, integer, text, jsonb
) to service_role;

comment on constraint scicon_wallet_purchase_orders_terms_check
  on public.scicon_wallet_purchase_orders is
  'Server-owned RSC prices and rewards, including the 500 Tokens per RSC exchange rate.';

notify pgrst, 'reload schema';

commit;

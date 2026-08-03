-- REVIEWED ADDITIVE MIGRATION: five free Weekly Run attempts plus repeatable,
-- server-settled one-attempt credits purchased for 3 RSC on Base.
-- Apply through the normal Supabase migration workflow before enabling the SKU.

alter table public.scicon_weekly_run_attempts
  add column if not exists wallet_address text;

alter table public.scicon_weekly_run_attempts
  drop constraint if exists scicon_weekly_run_attempts_wallet_address_check;
alter table public.scicon_weekly_run_attempts
  add constraint scicon_weekly_run_attempts_wallet_address_check check (
    wallet_address is null
    or (
      wallet_address = lower(wallet_address)
      and wallet_address ~ '^0x[0-9a-f]{40}$'
      and wallet_address <> '0x0000000000000000000000000000000000000000'
    )
  );

alter table public.scicon_weekly_run_attempts
  drop constraint if exists scicon_weekly_run_attempts_attempt_number_check;
alter table public.scicon_weekly_run_attempts
  add constraint scicon_weekly_run_attempts_attempt_number_check
  check (attempt_number between 1 and 32767);

create table if not exists public.scicon_weekly_run_attempt_credits (
  wallet_address text not null check (
    wallet_address = lower(wallet_address)
    and wallet_address ~ '^0x[0-9a-f]{40}$'
    and wallet_address <> '0x0000000000000000000000000000000000000000'
  ),
  weekly_id text not null check (char_length(weekly_id) between 1 and 64),
  purchased_attempts integer not null default 0
    check (purchased_attempts between 0 and 32762),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (wallet_address, weekly_id)
);

alter table public.scicon_weekly_run_attempt_credits enable row level security;
revoke all on table public.scicon_weekly_run_attempt_credits
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.scicon_weekly_run_attempt_credits
  to service_role;

alter table public.scicon_wallet_purchase_orders
  add column if not exists reward_weekly_id text;
alter table public.scicon_wallet_purchase_orders
  add column if not exists weekly_attempt_reward smallint not null default 0;

alter table public.scicon_wallet_purchase_orders
  drop constraint if exists scicon_wallet_purchase_orders_terms_check;
alter table public.scicon_wallet_purchase_orders
  add constraint scicon_wallet_purchase_orders_terms_check check (
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
      and reward_weekly_id ~ '^\d{4}-\d{2}-\d{2}$'
      and weekly_attempt_reward = 1
    )
  );

-- One active quote per wallet/product/week makes repeated taps and concurrent
-- tabs idempotent. Fulfilled Weekly Run orders remain repeatable.
create unique index if not exists scicon_wallet_purchase_orders_active_quote_idx
  on public.scicon_wallet_purchase_orders (
    wallet_address,
    sku_id,
    (coalesce(reward_weekly_id, ''))
  )
  where status = 'quoted';

create or replace function public.scicon_get_weekly_run_quota(
  p_wallet_address text,
  p_weekly_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_purchased_attempts integer := 0;
  v_attempts_used integer := 0;
begin
  if p_wallet_address is null
    or p_wallet_address <> lower(p_wallet_address)
    or p_wallet_address !~ '^0x[0-9a-f]{40}$'
    or p_wallet_address = '0x0000000000000000000000000000000000000000'
    or p_weekly_id is null
    or char_length(p_weekly_id) not between 1 and 64
  then
    raise exception 'weekly_run_attempt_binding_invalid';
  end if;

  select coalesce(purchased_attempts, 0) into v_purchased_attempts
  from public.scicon_weekly_run_attempt_credits
  where wallet_address = p_wallet_address and weekly_id = p_weekly_id;

  select count(*)::integer into v_attempts_used
  from public.scicon_weekly_run_attempts
  where wallet_address = p_wallet_address and weekly_id = p_weekly_id;

  v_purchased_attempts := coalesce(v_purchased_attempts, 0);
  return jsonb_build_object(
    'weeklyId', p_weekly_id,
    'freeAttempts', 5,
    'purchasedAttempts', v_purchased_attempts,
    'attemptsUsed', v_attempts_used,
    'attemptsRemaining', greatest(0, 5 + v_purchased_attempts - v_attempts_used)
  );
end;
$$;

drop function if exists public.scicon_reserve_weekly_run_attempt(
  text, text, text, uuid, uuid
);

create or replace function public.scicon_reserve_weekly_run_attempt(
  p_identity_hash text,
  p_wallet_address text,
  p_weekly_id text,
  p_attempt_key text,
  p_reservation_id uuid,
  p_run_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_existing public.scicon_weekly_run_attempts%rowtype;
  v_attempt_number integer;
  v_attempts_used integer;
  v_purchased_attempts integer := 0;
  v_attempt_capacity integer := 5;
begin
  if p_identity_hash is null or p_identity_hash !~ '^[a-f0-9]{64}$'
    or p_weekly_id is null or char_length(p_weekly_id) not between 1 and 64
    or p_attempt_key is null or p_attempt_key !~ '^[a-f0-9]{64}$'
    or p_reservation_id is null or p_run_id is null
    or (
      p_wallet_address is not null
      and (
        p_wallet_address <> lower(p_wallet_address)
        or p_wallet_address !~ '^0x[0-9a-f]{40}$'
        or p_wallet_address = '0x0000000000000000000000000000000000000000'
      )
    )
  then
    raise exception 'weekly_run_attempt_binding_invalid';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_identity_hash || ':' || p_weekly_id, 0));
  if p_wallet_address is not null then
    perform pg_advisory_xact_lock(
      hashtextextended('weekly-wallet:' || p_wallet_address || ':' || p_weekly_id, 0)
    );
    select coalesce(purchased_attempts, 0) into v_purchased_attempts
    from public.scicon_weekly_run_attempt_credits
    where wallet_address = p_wallet_address and weekly_id = p_weekly_id
    for update;
    v_purchased_attempts := coalesce(v_purchased_attempts, 0);
    v_attempt_capacity := least(32767, 5 + v_purchased_attempts);
  end if;

  select * into v_existing
  from public.scicon_weekly_run_attempts
  where identity_hash = p_identity_hash
    and weekly_id = p_weekly_id
    and attempt_key = p_attempt_key
  for update;

  select count(*)::integer into v_attempts_used
  from public.scicon_weekly_run_attempts
  where identity_hash = p_identity_hash and weekly_id = p_weekly_id;

  if v_existing.reservation_id is not null then
    if v_existing.status = 'finalized' then
      raise exception 'weekly_run_attempt_already_finalized';
    end if;
    return jsonb_build_object(
      'reservationId', v_existing.reservation_id,
      'runId', v_existing.run_id,
      'weeklyId', p_weekly_id,
      'attemptNumber', v_existing.attempt_number,
      'freeAttempts', 5,
      'purchasedAttempts', v_purchased_attempts,
      'attemptsUsed', v_attempts_used,
      'attemptsRemaining', greatest(0, v_attempt_capacity - v_attempts_used),
      'duplicate', true
    );
  end if;

  if v_attempts_used >= v_attempt_capacity then
    raise exception 'weekly_run_attempts_exhausted';
  end if;
  v_attempt_number := v_attempts_used + 1;

  insert into public.scicon_weekly_run_attempts (
    reservation_id, identity_hash, wallet_address, weekly_id, attempt_key,
    attempt_number, run_id
  ) values (
    p_reservation_id, p_identity_hash, p_wallet_address, p_weekly_id, p_attempt_key,
    v_attempt_number, p_run_id
  ) returning * into v_existing;

  return jsonb_build_object(
    'reservationId', v_existing.reservation_id,
    'runId', v_existing.run_id,
    'weeklyId', p_weekly_id,
    'attemptNumber', v_existing.attempt_number,
    'freeAttempts', 5,
    'purchasedAttempts', v_purchased_attempts,
    'attemptsUsed', v_attempt_number,
    'attemptsRemaining', v_attempt_capacity - v_attempt_number,
    'duplicate', false
  );
end;
$$;

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
  v_now timestamptz := clock_timestamp();
  v_snapshot jsonb;
  v_weekly jsonb;
  v_slots jsonb;
  v_coins bigint;
  v_durable_tokens bigint;
  v_right_support_unlocked boolean := false;
  v_purchased_attempts integer := 0;
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

  if exists (
    select 1
    from public.scicon_wallet_purchase_orders
    where chain_id = v_order.chain_id
      and transaction_hash = p_transaction_hash
      and log_index = p_log_index
      and status = 'fulfilled'
      and order_id <> v_order.order_id
  ) then
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
      wallet_address, weekly_id, purchased_attempts, created_at, updated_at
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
    select right_support_unlocked into v_right_support_unlocked
    from public.scicon_wallet_entitlements
    where wallet_address = p_wallet_address
    for update;

    if v_order.grants_right_support
      and (
        coalesce(v_right_support_unlocked, false)
        or lower(coalesce(v_profile.snapshot #>> '{weeklyState,unlockedSlots,right}', 'false')) = 'true'
      )
    then
      raise exception 'wallet_purchase_already_owned';
    end if;

    insert into public.scicon_wallet_entitlements (
      wallet_address,
      right_support_unlocked,
      purchased_tokens_total,
      created_at,
      updated_at
    ) values (
      p_wallet_address,
      v_order.grants_right_support,
      v_order.reward_tokens,
      v_now,
      v_now
    )
    on conflict (wallet_address) do update
    set
      right_support_unlocked = public.scicon_wallet_entitlements.right_support_unlocked
        or excluded.right_support_unlocked,
      purchased_tokens_total = least(
        1000000000,
        public.scicon_wallet_entitlements.purchased_tokens_total
          + excluded.purchased_tokens_total
      ),
      updated_at = v_now;

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

    v_weekly := jsonb_set(
      v_weekly,
      '{coins}',
      to_jsonb(least(1000000000, v_coins + v_order.reward_tokens)),
      true
    );
    v_weekly := jsonb_set(
      v_weekly,
      '{durableCampaignCoins}',
      to_jsonb(least(1000000000, v_durable_tokens + v_order.reward_tokens)),
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

revoke all on function public.scicon_get_weekly_run_quota(text, text)
  from public, anon, authenticated;
grant execute on function public.scicon_get_weekly_run_quota(text, text)
  to service_role;

revoke all on function public.scicon_reserve_weekly_run_attempt(
  text, text, text, text, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.scicon_reserve_weekly_run_attempt(
  text, text, text, text, uuid, uuid
) to service_role;

revoke all on function public.scicon_settle_wallet_purchase(text, uuid, text, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.scicon_settle_wallet_purchase(text, uuid, text, integer, timestamptz)
  to service_role;

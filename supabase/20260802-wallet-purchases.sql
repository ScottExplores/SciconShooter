-- LOCAL-ONLY MIGRATION. Apply through the reviewed Supabase migration workflow;
-- do not paste this into production ad hoc.
--
-- Authenticated ResearchCoin purchase orders and their server-owned rewards.
-- The browser may select a SKU, but all economic terms below are immutable and
-- settlement is performed only after the API verifies the Base transaction.
-- A quoted right-support order can have its expiry renewed in place; its order
-- ID, payment terms, and eventual fulfillment record remain one-per-wallet.

create table if not exists public.scicon_wallet_entitlements (
  wallet_address text primary key
    check (
      wallet_address = lower(wallet_address)
      and wallet_address ~ '^0x[0-9a-f]{40}$'
      and wallet_address <> '0x0000000000000000000000000000000000000000'
    ),
  right_support_unlocked boolean not null default false,
  purchased_tokens_total bigint not null default 0
    check (purchased_tokens_total >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scicon_wallet_purchase_orders (
  order_id uuid primary key,
  wallet_address text not null
    check (
      wallet_address = lower(wallet_address)
      and wallet_address ~ '^0x[0-9a-f]{40}$'
      and wallet_address <> '0x0000000000000000000000000000000000000000'
    ),
  sku_id text not null,
  chain_id integer not null check (chain_id = 8453),
  token_address text not null
    check (token_address = '0xfbb75a59193a3525a8825bebe7d4b56899e2f7e1'),
  -- Store and Continue payments intentionally settle to the same canonical
  -- founder wallet. Production settlement must claim their Transfer logs in
  -- the shared scicon_rsc_payment_receipts ledger before granting a benefit.
  recipient_address text not null check (
    recipient_address = '0x3a8d692aabdd4981080a8f6af8375a21359464bf'
  ),
  amount_raw numeric(78, 0) not null check (amount_raw > 0),
  reward_tokens integer not null check (reward_tokens between 0 and 1000000000),
  grants_right_support boolean not null default false,
  status text not null default 'quoted' check (status in ('quoted', 'fulfilled')),
  expires_at timestamptz not null,
  transaction_hash text
    check (
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
    -- Token packs stay disabled until Token earning and spending are fully
    -- server-authoritative. Add them in a separate reviewed migration later.
    sku_id = 'right-support'
    and amount_raw = 10000000000000000000
    and reward_tokens = 0
    and grants_right_support
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

create index if not exists scicon_wallet_purchase_orders_wallet_idx
  on public.scicon_wallet_purchase_orders (wallet_address, created_at desc);

create unique index if not exists scicon_wallet_purchase_orders_payment_once_idx
  on public.scicon_wallet_purchase_orders (chain_id, transaction_hash, log_index)
  where status = 'fulfilled';

-- Right support is permanent. The API renews and reuses the one quoted row,
-- which then becomes the wallet's one fulfilled row. This stronger-than-active
-- uniqueness also closes the quote-versus-settlement race after ownership lands.
create unique index if not exists scicon_wallet_purchase_orders_right_support_once_idx
  on public.scicon_wallet_purchase_orders (wallet_address, sku_id)
  where grants_right_support;

alter table public.scicon_wallet_entitlements enable row level security;
alter table public.scicon_wallet_purchase_orders enable row level security;

revoke all on table public.scicon_wallet_entitlements
  from anon, authenticated, public;
revoke all on table public.scicon_wallet_purchase_orders
  from anon, authenticated, public;

grant select, insert, update, delete
  on table public.scicon_wallet_entitlements
  to service_role;
grant select, insert, update, delete
  on table public.scicon_wallet_purchase_orders
  to service_role;

-- Grandfather only right slots already present in a canonical cloud profile.
-- A never-synced browser snapshot cannot be securely distinguished from a
-- forged claim and is intentionally not trusted by this migration.
insert into public.scicon_wallet_entitlements (
  wallet_address,
  right_support_unlocked,
  purchased_tokens_total,
  created_at,
  updated_at
)
select
  wallet_address,
  true,
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
  v_now timestamptz := clock_timestamp();
  v_snapshot jsonb;
  v_weekly jsonb;
  v_slots jsonb;
  v_coins bigint;
  v_durable_tokens bigint;
  v_right_support_unlocked boolean := false;
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

  -- A payment mined while its quote was live remains settleable after the HTTP
  -- request is interrupted or delayed. The service-role API obtains this time
  -- from the verified Base block; browsers cannot execute this function.
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
    )
  then
    -- The verified payment remains quoted and can be settled again after the
    -- pilot spends enough Tokens. Never fulfill a paid order for a partial
    -- reward merely because the profile balance is near its safety ceiling.
    raise exception 'wallet_purchase_token_headroom_required';
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
    purchased_tokens_total = public.scicon_wallet_entitlements.purchased_tokens_total
      + excluded.purchased_tokens_total,
    updated_at = v_now;

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

revoke all on function public.scicon_settle_wallet_purchase(text, uuid, text, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.scicon_settle_wallet_purchase(text, uuid, text, integer, timestamptz)
  to service_role;

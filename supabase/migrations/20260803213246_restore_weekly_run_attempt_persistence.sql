begin;

-- Server-owned admission ledger for the endless Weekly Run. Client profile
-- counters are presentation only. Every identity receives five attempts each
-- week; authenticated wallets may add server-verified purchased capacity.
-- Retried starts for the same streak remain idempotent.
create table if not exists public.scicon_weekly_run_attempts (
  reservation_id uuid primary key,
  identity_hash text not null check (identity_hash ~ '^[a-f0-9]{64}$'),
  wallet_address text check (
    wallet_address is null
    or (
      wallet_address = lower(wallet_address)
      and wallet_address ~ '^0x[0-9a-f]{40}$'
      and wallet_address <> '0x0000000000000000000000000000000000000000'
    )
  ),
  weekly_id text not null check (char_length(weekly_id) between 1 and 64),
  attempt_key text not null check (attempt_key ~ '^[a-f0-9]{64}$'),
  attempt_number smallint not null check (attempt_number between 1 and 32767),
  run_id uuid not null unique,
  status text not null default 'active' check (status in ('active', 'finalized')),
  proof_hash text check (proof_hash is null or proof_hash ~ '^[a-f0-9]{64}$'),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (identity_hash, weekly_id, attempt_key),
  unique (identity_hash, weekly_id, attempt_number)
);

-- Purchased capacity remains dormant until the separate wallet-purchase
-- migrations are intentionally released. Keeping the table here makes the
-- current quota and reservation RPC contract complete for the five free runs.
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

create index if not exists scicon_weekly_run_attempts_week_idx
  on public.scicon_weekly_run_attempts (weekly_id, identity_hash, attempt_number);

create index if not exists scicon_weekly_run_attempts_wallet_week_idx
  on public.scicon_weekly_run_attempts (wallet_address, weekly_id)
  where wallet_address is not null;

alter table public.scicon_weekly_run_attempts enable row level security;
alter table public.scicon_weekly_run_attempt_credits enable row level security;

revoke all on table public.scicon_weekly_run_attempts
  from public, anon, authenticated;
grant select, insert, update, delete on table public.scicon_weekly_run_attempts
  to service_role;

revoke all on table public.scicon_weekly_run_attempt_credits
  from public, anon, authenticated;
grant select, insert, update, delete on table public.scicon_weekly_run_attempt_credits
  to service_role;

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

  -- Serialize allocation for one identity/week pair so simultaneous tabs
  -- cannot reserve the same attempt number or exceed available capacity.
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

create or replace function public.scicon_settle_weekly_run_attempt(
  p_reservation_id uuid,
  p_identity_hash text,
  p_weekly_id text,
  p_attempt_key text,
  p_run_id uuid,
  p_proof_hash text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_attempt public.scicon_weekly_run_attempts%rowtype;
  v_finished_at timestamptz;
begin
  if p_reservation_id is null or p_run_id is null
    or p_identity_hash is null or p_identity_hash !~ '^[a-f0-9]{64}$'
    or p_weekly_id is null or char_length(p_weekly_id) not between 1 and 64
    or p_attempt_key is null or p_attempt_key !~ '^[a-f0-9]{64}$'
    or p_proof_hash is null or p_proof_hash !~ '^[a-f0-9]{64}$'
  then
    raise exception 'weekly_run_attempt_reservation_invalid';
  end if;

  select * into v_attempt
  from public.scicon_weekly_run_attempts
  where reservation_id = p_reservation_id
  for update;

  if not found
    or v_attempt.identity_hash <> p_identity_hash
    or v_attempt.weekly_id <> p_weekly_id
    or v_attempt.attempt_key <> p_attempt_key
    or v_attempt.run_id <> p_run_id
  then
    raise exception 'weekly_run_attempt_reservation_invalid';
  end if;

  if v_attempt.status = 'finalized' then
    if v_attempt.proof_hash <> p_proof_hash then
      raise exception 'weekly_run_attempt_already_finalized';
    end if;
    return jsonb_build_object(
      'accepted', true,
      'duplicate', true,
      'finishedAt', v_attempt.finished_at
    );
  end if;

  v_finished_at := clock_timestamp();
  update public.scicon_weekly_run_attempts
  set status = 'finalized',
      proof_hash = p_proof_hash,
      finished_at = v_finished_at,
      updated_at = v_finished_at
  where reservation_id = p_reservation_id;

  return jsonb_build_object(
    'accepted', true,
    'duplicate', false,
    'finishedAt', v_finished_at
  );
end;
$$;

revoke all on function public.scicon_reserve_weekly_run_attempt(
  text, text, text, text, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.scicon_reserve_weekly_run_attempt(
  text, text, text, text, uuid, uuid
) to service_role;

revoke all on function public.scicon_get_weekly_run_quota(text, text)
  from public, anon, authenticated;
grant execute on function public.scicon_get_weekly_run_quota(text, text)
  to service_role;

revoke all on function public.scicon_settle_weekly_run_attempt(
  uuid, text, text, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.scicon_settle_weekly_run_attempt(
  uuid, text, text, text, uuid, text
) to service_role;

-- Ensure PostgREST sees the RPCs immediately after the migration commits.
notify pgrst, 'reload schema';

commit;

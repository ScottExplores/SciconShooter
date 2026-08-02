-- Scicon Shooter Base-readiness migration.
-- Run this once in Supabase before deploying the verified leaderboard API.

create table if not exists public.scicon_run_receipts (
  run_id uuid primary key,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  duration_ms bigint not null check (duration_ms >= 0),
  score bigint not null check (score >= 0),
  wave integer not null check (wave >= 1),
  enemies_defeated integer not null default 0 check (enemies_defeated >= 0),
  coins_collected integer not null default 0 check (coins_collected >= 0),
  player_ship_id text not null default 'researchhub' check (player_ship_id in ('researchhub', 'bio', 'eth', 'btc')),
  game_version text not null,
  integrity_status text not null check (integrity_status in ('server-verified', 'review')),
  anomaly_flags text[] not null default '{}',
  ip_hash text,
  receipt_hash text not null unique,
  wallet_address text,
  wallet_claimed_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.scicon_run_receipts
  add column if not exists player_ship_id text not null default 'researchhub'
  check (player_ship_id in ('researchhub', 'bio', 'eth', 'btc'));

alter table public.scicon_run_receipts
  drop constraint if exists scicon_run_receipts_player_ship_id_check;

alter table public.scicon_run_receipts
  add constraint scicon_run_receipts_player_ship_id_check
  check (player_ship_id in ('researchhub', 'bio', 'eth', 'btc'));

-- Server-owned admission ledger for the endless Weekly Run. Client profile
-- counters are presentation only: this ledger atomically grants at most two
-- distinct attempts to either a wallet profile or stable guest profile in a
-- competition week. Retried starts for the same streak are idempotent.
create table if not exists public.scicon_weekly_run_attempts (
  reservation_id uuid primary key,
  identity_hash text not null check (identity_hash ~ '^[a-f0-9]{64}$'),
  weekly_id text not null check (char_length(weekly_id) between 1 and 64),
  attempt_key text not null check (attempt_key ~ '^[a-f0-9]{64}$'),
  attempt_number smallint not null check (attempt_number between 1 and 2),
  run_id uuid not null unique,
  status text not null default 'active' check (status in ('active', 'finalized')),
  proof_hash text check (proof_hash is null or proof_hash ~ '^[a-f0-9]{64}$'),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (identity_hash, weekly_id, attempt_key),
  unique (identity_hash, weekly_id, attempt_number)
);

create index if not exists scicon_weekly_run_attempts_week_idx
  on public.scicon_weekly_run_attempts (weekly_id, identity_hash, attempt_number);

alter table public.scicon_weekly_run_attempts enable row level security;
revoke all on table public.scicon_weekly_run_attempts
  from public, anon, authenticated;
grant select, insert, update, delete on table public.scicon_weekly_run_attempts
  to service_role;

create or replace function public.scicon_reserve_weekly_run_attempt(
  p_identity_hash text,
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
begin
  if p_identity_hash is null or p_identity_hash !~ '^[a-f0-9]{64}$'
    or p_weekly_id is null or char_length(p_weekly_id) not between 1 and 64
    or p_attempt_key is null or p_attempt_key !~ '^[a-f0-9]{64}$'
    or p_reservation_id is null or p_run_id is null
  then
    raise exception 'weekly_run_attempt_binding_invalid';
  end if;

  -- One transaction at a time may inspect/allocate the two slots for an
  -- identity/week pair, including when two tabs start simultaneously.
  perform pg_advisory_xact_lock(hashtextextended(p_identity_hash || ':' || p_weekly_id, 0));

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
      'attemptNumber', v_existing.attempt_number,
      'attemptsUsed', v_attempts_used,
      'attemptsRemaining', greatest(0, 2 - v_attempts_used),
      'duplicate', true
    );
  end if;

  if v_attempts_used >= 2 then
    raise exception 'weekly_run_attempts_exhausted';
  end if;
  v_attempt_number := v_attempts_used + 1;

  insert into public.scicon_weekly_run_attempts (
    reservation_id, identity_hash, weekly_id, attempt_key,
    attempt_number, run_id
  ) values (
    p_reservation_id, p_identity_hash, p_weekly_id, p_attempt_key,
    v_attempt_number, p_run_id
  ) returning * into v_existing;

  return jsonb_build_object(
    'reservationId', v_existing.reservation_id,
    'runId', v_existing.run_id,
    'attemptNumber', v_existing.attempt_number,
    'attemptsUsed', v_attempt_number,
    'attemptsRemaining', 2 - v_attempt_number,
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
  text, text, text, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.scicon_reserve_weekly_run_attempt(
  text, text, text, uuid, uuid
) to service_role;
revoke all on function public.scicon_settle_weekly_run_attempt(
  uuid, text, text, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.scicon_settle_weekly_run_attempt(
  uuid, text, text, text, uuid, text
) to service_role;

alter table public.scicon_leaderboard
  add column if not exists run_id uuid,
  add column if not exists verified boolean not null default false,
  add column if not exists receipt_hash text,
  add column if not exists proposal_image_url text;

create unique index if not exists scicon_leaderboard_run_id_idx
  on public.scicon_leaderboard (run_id)
  where run_id is not null;

create unique index if not exists scicon_leaderboard_receipt_hash_idx
  on public.scicon_leaderboard (receipt_hash)
  where receipt_hash is not null;

create table if not exists public.scicon_weekly_competitions (
  week_key text primary key,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'finalized', 'claimed', 'funded', 'expired')),
  winner_run_id uuid references public.scicon_run_receipts(run_id),
  winner_name text,
  winner_wallet text,
  winning_score bigint,
  winning_wave integer,
  finalized_at timestamptz,
  claim_deadline timestamptz,
  proposal_id text,
  proposal_title text,
  proposal_url text,
  proposal_author text,
  proposal_image_url text,
  allocation_rsc numeric not null default 100,
  allocation_tx_hash text,
  champion_token_id text,
  updated_at timestamptz not null default now()
);

alter table public.scicon_weekly_competitions
  add column if not exists proposal_image_url text;

create table if not exists public.scicon_mint_records (
  id bigint generated by default as identity primary key,
  record_type text not null check (record_type in ('mission', 'champion')),
  run_id uuid not null references public.scicon_run_receipts(run_id),
  week_key text references public.scicon_weekly_competitions(week_key),
  wallet_address text not null,
  chain_id bigint not null,
  token_id text,
  transaction_hash text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'failed')),
  sponsored boolean not null default false,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unique (record_type, run_id)
);

create table if not exists public.scicon_wallet_nonces (
  challenge_id uuid primary key,
  run_id uuid not null references public.scicon_run_receipts(run_id),
  wallet_address text not null,
  message text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists scicon_wallet_nonces_expiry_idx
  on public.scicon_wallet_nonces (expires_at)
  where used_at is null;

create index if not exists scicon_mint_records_wallet_idx
  on public.scicon_mint_records (wallet_address, created_at desc);

alter table public.scicon_run_receipts enable row level security;
alter table public.scicon_weekly_competitions enable row level security;
alter table public.scicon_mint_records enable row level security;
alter table public.scicon_wallet_nonces enable row level security;

create table if not exists public.scicon_product_events (
  id bigint generated by default as identity primary key,
  event_name text not null,
  session_id uuid not null,
  game_version text,
  properties jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists scicon_product_events_name_time_idx
  on public.scicon_product_events (event_name, occurred_at desc);

alter table public.scicon_product_events enable row level security;

create table if not exists public.scicon_proposal_cache (
  cache_key text primary key,
  payload jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table public.scicon_proposal_cache enable row level security;

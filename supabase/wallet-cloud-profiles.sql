-- Wallet-owned offchain progression for Scicon Shooter.
-- Access is API-only: the Vercel function verifies a one-time Base signature,
-- then uses the server-only Supabase service role for persistence.

create table if not exists public.scicon_wallet_profiles (
  wallet_address text primary key
    check (
      wallet_address = lower(wallet_address)
      and wallet_address ~ '^0x[0-9a-f]{40}$'
    ),
  revision bigint not null default 1 check (revision >= 1),
  snapshot jsonb not null default '{}'::jsonb
    check (
      jsonb_typeof(snapshot) = 'object'
      and octet_length(snapshot::text) <= 262144
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Reconcile databases that briefly received the draft revision contract.
alter table public.scicon_wallet_profiles
  alter column revision set default 1;
alter table public.scicon_wallet_profiles
  drop constraint if exists scicon_wallet_profiles_revision_check;
alter table public.scicon_wallet_profiles
  add constraint scicon_wallet_profiles_revision_check check (revision >= 1);

create table if not exists public.scicon_wallet_profile_challenges (
  challenge_id uuid primary key,
  wallet_address text not null
    check (
      wallet_address = lower(wallet_address)
      and wallet_address ~ '^0x[0-9a-f]{40}$'
    ),
  message text not null check (char_length(message) between 1 and 2048),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Canonical idempotency ledger for authenticated Boss Archive Challenge wins.
-- A row is written in the same database transaction that consumes the daily
-- charge, updates records/mastery, and awards the wallet profile's coins.
create table if not exists public.scicon_boss_archive_challenge_results (
  wallet_address text not null
    check (
      wallet_address = lower(wallet_address)
      and wallet_address ~ '^0x[0-9a-f]{40}$'
    ),
  result_id uuid not null,
  event_id text not null check (char_length(event_id) between 1 and 120),
  variant_id text not null default 'standard'
    check (variant_id = 'standard'),
  utc_date date not null,
  clear_time_ms bigint not null check (clear_time_ms between 1 and 3600000),
  damage_taken integer not null check (damage_taken between 0 and 1000000),
  no_hit boolean not null,
  reward_coins integer not null check (reward_coins between 0 and 1000000),
  new_best_clear_time boolean not null default false,
  new_best_challenge_time boolean not null default false,
  newly_completed_objective_ids text[] not null default '{}'::text[],
  settled_at timestamptz not null default now(),
  primary key (wallet_address, result_id)
);

create index if not exists scicon_boss_archive_challenge_results_daily_idx
  on public.scicon_boss_archive_challenge_results (wallet_address, utc_date, settled_at);

create index if not exists scicon_wallet_profile_challenges_wallet_idx
  on public.scicon_wallet_profile_challenges (wallet_address, created_at desc);

create index if not exists scicon_wallet_profile_challenges_expiry_idx
  on public.scicon_wallet_profile_challenges (expires_at)
  where used_at is null;

alter table public.scicon_wallet_profiles enable row level security;
alter table public.scicon_wallet_profile_challenges enable row level security;
alter table public.scicon_boss_archive_challenge_results enable row level security;

-- No anon/authenticated policies are intentional. Profile ownership is proven
-- by the app's Base signature challenge and its signed HttpOnly session cookie.
revoke all on table public.scicon_wallet_profiles
  from anon, authenticated, public;
revoke all on table public.scicon_wallet_profile_challenges
  from anon, authenticated, public;
revoke all on table public.scicon_boss_archive_challenge_results
  from anon, authenticated, public;

grant select, insert, update, delete
  on table public.scicon_wallet_profiles
  to service_role;
grant select, insert, update, delete
  on table public.scicon_wallet_profile_challenges
  to service_role;
grant select, insert, update, delete
  on table public.scicon_boss_archive_challenge_results
  to service_role;

-- The API validates the signed, wallet-bound run token and derives the reward
-- and mastery target from the authored campaign. This function is the atomic
-- persistence boundary: one wallet row lock serializes same-wallet clears,
-- and the ledger primary key makes a retried result exactly-once.
create or replace function public.scicon_settle_boss_archive_challenge(
  p_wallet_address text,
  p_result_id uuid,
  p_event_id text,
  p_variant_id text,
  p_clear_time_ms bigint,
  p_damage_taken integer,
  p_daily_limit integer,
  p_reward_coins integer,
  p_timed_target_ms integer,
  p_week_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_profile public.scicon_wallet_profiles%rowtype;
  v_existing public.scicon_boss_archive_challenge_results%rowtype;
  v_now timestamptz := clock_timestamp();
  v_now_iso text;
  v_utc_date date;
  v_utc_date_key text;
  v_snapshot jsonb;
  v_permanent jsonb;
  v_weekly jsonb;
  v_weekly_stats jsonb;
  v_archive jsonb;
  v_records jsonb;
  v_daily jsonb;
  v_record jsonb;
  v_mastery jsonb;
  v_processed jsonb;
  v_daily_processed jsonb;
  v_result_key text := 'boss-archive:' || p_result_id::text;
  v_used integer;
  v_remaining integer;
  v_no_hit boolean;
  v_new_best_clear boolean;
  v_new_best_challenge boolean;
  v_new_objectives text[] := '{}'::text[];
  v_revision bigint;
begin
  if p_wallet_address is null
    or p_wallet_address <> lower(p_wallet_address)
    or p_wallet_address !~ '^0x[0-9a-f]{40}$'
  then
    raise exception 'boss_archive_invalid_wallet';
  end if;
  if p_event_id is null or char_length(p_event_id) not between 1 and 120
    or p_variant_id <> 'standard'
    or p_clear_time_ms not between 1 and 3600000
    or p_damage_taken not between 0 and 1000000
    or p_daily_limit not between 1 and 20
    or p_reward_coins not between 0 and 1000000
    or p_timed_target_ms not between 1 and 3600000
    or p_week_key is null or char_length(p_week_key) not between 1 and 32
  then
    raise exception 'boss_archive_invalid_settlement';
  end if;

  select * into v_profile
  from public.scicon_wallet_profiles
  where wallet_address = p_wallet_address
  for update;
  if not found then
    raise exception 'boss_archive_profile_missing';
  end if;

  v_now_iso := to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_utc_date := (v_now at time zone 'UTC')::date;
  v_utc_date_key := v_utc_date::text;

  select * into v_existing
  from public.scicon_boss_archive_challenge_results
  where wallet_address = p_wallet_address
    and result_id = p_result_id;
  if found then
    select count(*)::integer into v_used
    from public.scicon_boss_archive_challenge_results
    where wallet_address = p_wallet_address
      and utc_date = v_utc_date;
    return jsonb_build_object(
      'accepted', true,
      'duplicate', true,
      'resultId', v_existing.result_id::text,
      'eventId', v_existing.event_id,
      'variantId', v_existing.variant_id,
      'rewardCoins', v_existing.reward_coins,
      'chargesRemaining', greatest(0, p_daily_limit - v_used),
      'clearTimeMs', v_existing.clear_time_ms,
      'damageTaken', v_existing.damage_taken,
      'noHit', v_existing.no_hit,
      'newBestClearTime', v_existing.new_best_clear_time,
      'newBestChallengeTime', v_existing.new_best_challenge_time,
      'newlyCompletedObjectiveIds', to_jsonb(v_existing.newly_completed_objective_ids),
      'utcDateKey', v_existing.utc_date::text
    );
  end if;

  v_snapshot := coalesce(v_profile.snapshot, '{}'::jsonb);
  v_permanent := coalesce(v_snapshot->'permanentState', '{}'::jsonb);
  v_weekly := coalesce(v_snapshot->'weeklyState', '{}'::jsonb);
  v_archive := coalesce(v_permanent->'bossArchive', '{}'::jsonb);

  if not (coalesce(v_archive->'unlockedEventIds', '[]'::jsonb) @> jsonb_build_array(p_event_id)) then
    raise exception 'boss_archive_locked';
  end if;

  v_daily := coalesce(v_archive->'dailyChallenge', '{}'::jsonb);
  if coalesce(v_daily->>'utcDateKey', '') <> v_utc_date_key then
    v_daily := jsonb_build_object(
      'utcDateKey', v_utc_date_key,
      'successfulClearsUsed', 0,
      'processedClearIds', '[]'::jsonb
    );
  end if;
  select count(*)::integer into v_used
  from public.scicon_boss_archive_challenge_results
  where wallet_address = p_wallet_address
    and utc_date = v_utc_date;
  if v_used >= p_daily_limit then
    raise exception 'boss_archive_no_charges';
  end if;

  v_records := coalesce(v_archive->'records', '{}'::jsonb);
  v_record := coalesce(v_records->p_event_id, jsonb_build_object(
    'attempts', 0,
    'practiceAttempts', 0,
    'challengeAttempts', 0,
    'totalClears', 0,
    'practiceClears', 0,
    'challengeClears', 0,
    'noHitClears', 0,
    'bestClearTimeMs', null,
    'bestChallengeTimeMs', null,
    'bestNoHitTimeMs', null,
    'mastery', jsonb_build_object(
      'challenge-clear', jsonb_build_object('completedAt', null, 'claimedAt', null),
      'no-hit-clear', jsonb_build_object('completedAt', null, 'claimedAt', null),
      'timed-clear', jsonb_build_object('completedAt', null, 'claimedAt', null)
    ),
    'processedResultIds', '[]'::jsonb,
    'lastResult', null
  ));
  v_mastery := coalesce(v_record->'mastery', jsonb_build_object(
    'challenge-clear', jsonb_build_object('completedAt', null, 'claimedAt', null),
    'no-hit-clear', jsonb_build_object('completedAt', null, 'claimedAt', null),
    'timed-clear', jsonb_build_object('completedAt', null, 'claimedAt', null)
  ));
  v_no_hit := p_damage_taken = 0;
  v_new_best_clear := v_record->>'bestClearTimeMs' is null
    or p_clear_time_ms < (v_record->>'bestClearTimeMs')::bigint;
  v_new_best_challenge := v_record->>'bestChallengeTimeMs' is null
    or p_clear_time_ms < (v_record->>'bestChallengeTimeMs')::bigint;

  if v_mastery #>> '{challenge-clear,completedAt}' is null then
    v_mastery := jsonb_set(v_mastery, '{challenge-clear,completedAt}', to_jsonb(v_now_iso), true);
    v_new_objectives := array_append(v_new_objectives, 'challenge-clear');
  end if;
  if v_no_hit and v_mastery #>> '{no-hit-clear,completedAt}' is null then
    v_mastery := jsonb_set(v_mastery, '{no-hit-clear,completedAt}', to_jsonb(v_now_iso), true);
    v_new_objectives := array_append(v_new_objectives, 'no-hit-clear');
  end if;
  if p_clear_time_ms <= p_timed_target_ms
    and v_mastery #>> '{timed-clear,completedAt}' is null
  then
    v_mastery := jsonb_set(v_mastery, '{timed-clear,completedAt}', to_jsonb(v_now_iso), true);
    v_new_objectives := array_append(v_new_objectives, 'timed-clear');
  end if;

  select coalesce(jsonb_agg(item order by ordinality), '[]'::jsonb)
  into v_processed
  from (
    select item, ordinality
    from jsonb_array_elements(
      coalesce(v_record->'processedResultIds', '[]'::jsonb) || jsonb_build_array(v_result_key)
    ) with ordinality as entries(item, ordinality)
    order by ordinality desc
    limit 64
  ) recent;

  v_record := v_record || jsonb_build_object(
    'attempts', greatest(0, coalesce((v_record->>'attempts')::bigint, 0)) + 1,
    'challengeAttempts', greatest(0, coalesce((v_record->>'challengeAttempts')::bigint, 0)) + 1,
    'totalClears', greatest(0, coalesce((v_record->>'totalClears')::bigint, 0)) + 1,
    'challengeClears', greatest(0, coalesce((v_record->>'challengeClears')::bigint, 0)) + 1,
    'noHitClears', greatest(0, coalesce((v_record->>'noHitClears')::bigint, 0)) + case when v_no_hit then 1 else 0 end,
    'bestClearTimeMs', case
      when v_new_best_clear then to_jsonb(p_clear_time_ms)
      else v_record->'bestClearTimeMs'
    end,
    'bestChallengeTimeMs', case
      when v_new_best_challenge then to_jsonb(p_clear_time_ms)
      else v_record->'bestChallengeTimeMs'
    end,
    'bestNoHitTimeMs', case
      when v_no_hit and (
        v_record->>'bestNoHitTimeMs' is null
        or p_clear_time_ms < (v_record->>'bestNoHitTimeMs')::bigint
      ) then to_jsonb(p_clear_time_ms)
      else v_record->'bestNoHitTimeMs'
    end,
    'mastery', v_mastery,
    'processedResultIds', v_processed,
    'lastResult', jsonb_build_object(
      'mode', 'challenge',
      'victory', true,
      'clearTimeMs', p_clear_time_ms,
      'damageTaken', p_damage_taken,
      'playedAt', v_now_iso
    )
  );

  select coalesce(jsonb_agg(item order by ordinality), '[]'::jsonb)
  into v_daily_processed
  from (
    select item, ordinality
    from jsonb_array_elements(
      coalesce((
        select jsonb_agg('boss-archive:' || result_id::text order by settled_at)
        from public.scicon_boss_archive_challenge_results
        where wallet_address = p_wallet_address
          and utc_date = v_utc_date
      ), '[]'::jsonb) || jsonb_build_array(v_result_key)
    ) with ordinality as entries(item, ordinality)
    order by ordinality desc
    limit 64
  ) recent;
  v_used := v_used + 1;
  v_remaining := greatest(0, p_daily_limit - v_used);
  v_daily := jsonb_build_object(
    'utcDateKey', v_utc_date_key,
    'successfulClearsUsed', v_used,
    'processedClearIds', v_daily_processed
  );
  v_records := jsonb_set(v_records, array[p_event_id], v_record, true);
  v_archive := v_archive || jsonb_build_object(
    'records', v_records,
    'dailyChallenge', v_daily
  );
  v_permanent := v_permanent || jsonb_build_object(
    'bossArchive', v_archive,
    'updatedAt', v_now_iso
  );

  -- Preserve permanent Hangar ownership/upgrades, but never carry weekly
  -- competition currency across a newly detected week boundary.
  if coalesce(v_weekly->>'weekKey', '') <> p_week_key then
    v_weekly := v_weekly || jsonb_build_object(
      'weekKey', p_week_key,
      'coins', 0,
      'weeklyStats', jsonb_build_object(
        'runs', 0,
        'score', 0,
        'enemiesDefeated', 0,
        'coinsEarned', 0
      )
    );
  end if;
  v_weekly_stats := coalesce(v_weekly->'weeklyStats', '{}'::jsonb);
  v_weekly_stats := v_weekly_stats || jsonb_build_object(
    'coinsEarned', greatest(0, coalesce((v_weekly_stats->>'coinsEarned')::bigint, 0)) + p_reward_coins
  );
  v_weekly := v_weekly || jsonb_build_object(
    'coins', greatest(0, coalesce((v_weekly->>'coins')::bigint, 0)) + p_reward_coins,
    'weeklyStats', v_weekly_stats,
    'updatedAt', v_now_iso
  );
  v_snapshot := v_snapshot || jsonb_build_object(
    'permanentState', v_permanent,
    'weeklyState', v_weekly
  );

  insert into public.scicon_boss_archive_challenge_results (
    wallet_address,
    result_id,
    event_id,
    variant_id,
    utc_date,
    clear_time_ms,
    damage_taken,
    no_hit,
    reward_coins,
    new_best_clear_time,
    new_best_challenge_time,
    newly_completed_objective_ids,
    settled_at
  ) values (
    p_wallet_address,
    p_result_id,
    p_event_id,
    p_variant_id,
    v_utc_date,
    p_clear_time_ms,
    p_damage_taken,
    v_no_hit,
    p_reward_coins,
    v_new_best_clear,
    v_new_best_challenge,
    v_new_objectives,
    v_now
  );

  update public.scicon_wallet_profiles
  set snapshot = v_snapshot,
      revision = revision + 1,
      updated_at = v_now
  where wallet_address = p_wallet_address
  returning revision into v_revision;

  return jsonb_build_object(
    'accepted', true,
    'duplicate', false,
    'resultId', p_result_id::text,
    'eventId', p_event_id,
    'variantId', p_variant_id,
    'rewardCoins', p_reward_coins,
    'chargesRemaining', v_remaining,
    'clearTimeMs', p_clear_time_ms,
    'damageTaken', p_damage_taken,
    'noHit', v_no_hit,
    'newBestClearTime', v_new_best_clear,
    'newBestChallengeTime', v_new_best_challenge,
    'newlyCompletedObjectiveIds', to_jsonb(v_new_objectives),
    'utcDateKey', v_utc_date_key,
    'revision', v_revision
  );
end;
$$;

revoke all on function public.scicon_settle_boss_archive_challenge(
  text, uuid, text, text, bigint, integer, integer, integer, integer, text
) from public, anon, authenticated;
grant execute on function public.scicon_settle_boss_archive_challenge(
  text, uuid, text, text, bigint, integer, integer, integer, integer, text
) to service_role;

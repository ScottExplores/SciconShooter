-- One-time mission-win star ratings.
-- The table is service-role only. anon and authenticated have no policies and no grants.
-- anonymous_player_id stores an HMAC of the device-local id. The raw id is never stored.
-- Founder-wallet rows are is_test and stay out of the production average.

alter table public.scicon_wallet_profiles
  add column if not exists mission_feedback_shown boolean not null default false;

create table if not exists public.scicon_player_ratings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  rating smallint not null check (rating between 1 and 5),
  comment text null check (comment is null or char_length(comment) <= 500),
  wallet_address text null check (
    wallet_address is null
    or (
      wallet_address = lower(wallet_address)
      and wallet_address ~ '^0x[0-9a-f]{40}$'
    )
  ),
  anonymous_player_id text not null check (anonymous_player_id ~ '^[0-9a-f]{64}$'),
  mission_id text not null check (mission_id ~ '^[a-z0-9][a-z0-9_-]{0,79}$'),
  app_version text not null check (char_length(app_version) between 1 and 64),
  is_test boolean not null default false
);

comment on column public.scicon_player_ratings.anonymous_player_id is
  'HMAC-SHA256 of the device-local anonymous player id. The raw id is not stored.';

comment on column public.scicon_player_ratings.is_test is
  'True for founder-wallet submissions so those runs stay out of production averages.';

create unique index if not exists scicon_player_ratings_device_uidx
  on public.scicon_player_ratings (anonymous_player_id);

create unique index if not exists scicon_player_ratings_wallet_uidx
  on public.scicon_player_ratings (wallet_address)
  where wallet_address is not null;

create index if not exists scicon_player_ratings_live_created_idx
  on public.scicon_player_ratings (created_at desc)
  where is_test = false;

alter table public.scicon_player_ratings enable row level security;

revoke all on table public.scicon_player_ratings from public, anon, authenticated;
grant select, insert on table public.scicon_player_ratings to service_role;

create or replace function public.scicon_player_stats(p_tz text default 'America/Los_Angeles')
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with live as (
    select event_name,
           occurred_at,
           properties->>'visitor_hash' as device,
           coalesce(nullif(properties->>'run_mode', ''), 'unknown') as run_mode,
           (occurred_at at time zone p_tz)::date as local_day
    from public.scicon_product_events
    where properties->>'event_source' = 'production'
      and coalesce((properties->>'test_run')::boolean, false) = false
      and event_name not in ('player_bug_report', 'player_feedback')
  ),
  bounds as (
    select (now() at time zone p_tz)::date as today
  ),
  first_seen as (
    select device, min(local_day) as first_day
    from live where device is not null group by device
  ),
  modes as (
    select run_mode,
           count(*) filter (where event_name = 'mission_started') as runs_started,
           count(*) filter (where event_name = 'run_ended') as runs_finished,
           count(distinct device) filter (where event_name = 'mission_started') as players
    from live
    where event_name in ('mission_started', 'run_ended')
    group by run_mode
  )
  select jsonb_build_object(
    'timezone', p_tz,
    'today', (select today from bounds),
    'tracking_since', (select min(occurred_at) from live),
    'latest_event_at', (select max(occurred_at) from live),
    'visitors', jsonb_build_object(
      'today', (select count(distinct device) from live, bounds where local_day = today),
      'last_7d', (select count(distinct device) from live, bounds where local_day > today - 7),
      'all_time', (select count(distinct device) from live)
    ),
    'players_who_started_a_run', jsonb_build_object(
      'today', (select count(distinct device) from live, bounds where event_name = 'mission_started' and local_day = today),
      'last_7d', (select count(distinct device) from live, bounds where event_name = 'mission_started' and local_day > today - 7),
      'all_time', (select count(distinct device) from live where event_name = 'mission_started')
    ),
    'new_visitors_today', (select count(*) from first_seen, bounds where first_day = today),
    'runs', jsonb_build_object(
      'started_today', (select count(*) from live, bounds where event_name = 'mission_started' and local_day = today),
      'finished_today', (select count(*) from live, bounds where event_name = 'run_ended' and local_day = today),
      'started_7d', (select count(*) from live, bounds where event_name = 'mission_started' and local_day > today - 7),
      'finished_7d', (select count(*) from live, bounds where event_name = 'run_ended' and local_day > today - 7),
      'started_all_time', (select count(*) from live where event_name = 'mission_started'),
      'finished_all_time', (select count(*) from live where event_name = 'run_ended')
    ),
    'by_mode', coalesce((select jsonb_agg(to_jsonb(modes) order by runs_started desc) from modes), '[]'::jsonb),
    'scores_submitted_7d', (select count(*) from live, bounds where event_name = 'score_submitted' and local_day > today - 7),
    'daily_last_7d', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.local_day, 'visitors', d.visitors, 'players', d.players, 'runs_started', d.runs) order by d.local_day)
      from (
        select local_day,
               count(distinct device) as visitors,
               count(distinct device) filter (where event_name = 'mission_started') as players,
               count(*) filter (where event_name = 'mission_started') as runs
        from live, bounds where local_day > today - 7 group by local_day
      ) d
    ), '[]'::jsonb),
    'ratings', (
      select jsonb_build_object(
        'today', count(*) filter (
          where (created_at at time zone p_tz)::date = (select today from bounds)
        ),
        'last_7d', count(*) filter (
          where (created_at at time zone p_tz)::date > (select today from bounds) - 7
        ),
        'all_time', count(*),
        'average', round(avg(rating)::numeric, 2),
        'average_7d', round((avg(rating) filter (
          where (created_at at time zone p_tz)::date > (select today from bounds) - 7
        ))::numeric, 2)
      )
      from public.scicon_player_ratings
      where is_test = false
    )
  );
$$;


create or replace function public.scicon_recent_player_ratings(
  p_limit integer default 20,
  p_include_tests boolean default false
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select *
    from public.scicon_player_ratings
    where p_include_tests or is_test = false
  )
  select jsonb_build_object(
    'count', (select count(*) from scoped),
    'average', (select round(avg(rating)::numeric, 2) from scoped),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
        'created_at', r.created_at,
        'rating', r.rating,
        'comment', r.comment,
        'wallet_address', r.wallet_address,
        'anonymous_player_id', r.anonymous_player_id,
        'mission_id', r.mission_id,
        'app_version', r.app_version,
        'is_test', r.is_test
      ) order by r.created_at desc)
      from (
        select *
        from scoped
        order by created_at desc
        limit greatest(1, least(coalesce(p_limit, 20), 100))
      ) r
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.scicon_player_stats(text) from public, anon, authenticated;
revoke all on function public.scicon_recent_player_ratings(integer, boolean) from public, anon, authenticated;
grant execute on function public.scicon_player_stats(text) to service_role;
grant execute on function public.scicon_recent_player_ratings(integer, boolean) to service_role;

notify pgrst, 'reload schema';

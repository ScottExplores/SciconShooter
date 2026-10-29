-- Owner-only aggregate views over scicon_product_events.
-- Callable by service_role / database owner only (never anon or authenticated),
-- so player counts and report text are not exposed through the public API.
-- "Today" is the owner's day in America/Los_Angeles.

create index if not exists scicon_product_events_name_time_idx
  on public.scicon_product_events (event_name, occurred_at desc);

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
    ), '[]'::jsonb)
  );
$$;

create or replace function public.scicon_recent_player_reports(
  p_limit integer default 20,
  p_include_automatic boolean default false,
  p_include_tests boolean default false
)
returns table (
  occurred_at timestamptz,
  kind text,
  category text,
  source text,
  summary text,
  details text,
  contact text,
  game_version text,
  run_mode text,
  mission_id text,
  wave_number text,
  device text,
  viewport text,
  is_test boolean,
  report_id text
)
language sql
stable
security definer
set search_path = public
as $$
  select e.occurred_at,
         e.properties->>'kind',
         e.properties->>'category',
         e.properties->>'source',
         e.properties->>'summary',
         nullif(e.properties->>'details', ''),
         nullif(e.properties->>'contact', ''),
         e.game_version,
         e.properties#>>'{diagnostics,runtime,runMode}',
         e.properties#>>'{diagnostics,runtime,missionId}',
         e.properties#>>'{diagnostics,runtime,waveNumber}',
         nullif(concat_ws(' / ',
           e.properties#>>'{diagnostics,environment,platform}',
           nullif(e.properties->>'browser', '')), ''),
         nullif(concat(e.properties#>>'{diagnostics,environment,viewportWidth}', 'x',
           e.properties#>>'{diagnostics,environment,viewportHeight}'), 'x'),
         coalesce((e.properties->>'test_run')::boolean, false),
         e.properties->>'report_id'
  from public.scicon_product_events e
  where e.event_name in ('player_bug_report', 'player_feedback')
    and (p_include_automatic or e.properties->>'source' = 'manual')
    and (p_include_tests or coalesce((e.properties->>'test_run')::boolean, false) = false)
  order by e.occurred_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 200));
$$;

revoke all on function public.scicon_player_stats(text) from public, anon, authenticated;
revoke all on function public.scicon_recent_player_reports(integer, boolean, boolean) from public, anon, authenticated;
grant execute on function public.scicon_player_stats(text) to service_role;
grant execute on function public.scicon_recent_player_reports(integer, boolean, boolean) to service_role;

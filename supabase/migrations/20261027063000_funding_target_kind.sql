alter table public.scicon_leaderboard
  add column if not exists funding_target_kind text;

alter table public.scicon_weekly_competitions
  add column if not exists funding_target_kind text;

alter table public.scicon_leaderboard
  drop constraint if exists scicon_leaderboard_funding_target_kind_check;

alter table public.scicon_leaderboard
  add constraint scicon_leaderboard_funding_target_kind_check
  check (funding_target_kind is null or funding_target_kind in ('proposal', 'rfp'));

alter table public.scicon_weekly_competitions
  drop constraint if exists scicon_weekly_competitions_funding_target_kind_check;

alter table public.scicon_weekly_competitions
  add constraint scicon_weekly_competitions_funding_target_kind_check
  check (funding_target_kind is null or funding_target_kind in ('proposal', 'rfp'));

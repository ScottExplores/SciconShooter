create table if not exists public.scicon_social_actions (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  action_type text not null check (action_type in ('original', 'reply', 'weekly_winner', 'weekly_reply')),
  source_post_id text,
  source_author_id text,
  content text,
  reason text,
  status text not null default 'reserved' check (status in ('reserved', 'published', 'skipped', 'failed')),
  x_post_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  published_at timestamptz
);

create index if not exists scicon_social_actions_source_post_idx
  on public.scicon_social_actions (source_post_id desc)
  where source_post_id is not null;

create index if not exists scicon_social_actions_status_created_idx
  on public.scicon_social_actions (status, created_at desc);

alter table public.scicon_social_actions enable row level security;
revoke all on table public.scicon_social_actions from public, anon, authenticated;
grant select, insert, update, delete on table public.scicon_social_actions to service_role;

create table if not exists public.scicon_social_content_queue (
  id uuid primary key default gen_random_uuid(),
  content_key text not null unique,
  content_kind text not null check (content_kind in ('upgrade', 'beta_test', 'gameplay', 'community')),
  post_text text not null check (char_length(post_text) between 1 and 2000),
  link_url text,
  not_before timestamptz not null default now(),
  not_after timestamptz,
  priority integer not null default 0 check (priority between -100 and 100),
  status text not null default 'queued' check (status in ('queued', 'published', 'paused')),
  requires_media boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  published_action_id uuid references public.scicon_social_actions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  check (not_after is null or not_after > not_before)
);

create index if not exists scicon_social_content_queue_ready_idx
  on public.scicon_social_content_queue (status, priority desc, not_before asc);

alter table public.scicon_social_content_queue enable row level security;
revoke all on table public.scicon_social_content_queue from public, anon, authenticated;
grant select, insert, update, delete on table public.scicon_social_content_queue to service_role;

insert into public.scicon_social_content_queue (
  content_key,
  content_kind,
  post_text,
  link_url,
  not_before,
  priority,
  metadata
) values
  (
    'hangar-squad-upgrades-v1',
    'upgrade',
    'The Scicon Shooter Hangar is open: four main ships, upgradeable mini-ships, and squad builds you can tune between runs. Try a run and tell us which ship should get the next upgrade:',
    'https://www.sciconshooter.xyz/',
    now() + interval '1 day',
    30,
    '{"claims_verified":true,"verified_from":"current project code"}'::jsonb
  ),
  (
    'movement-boss-polish-v1',
    'upgrade',
    'We have been rebuilding Scicon Shooter one system at a time: smoother movement, bigger bosses, more ship upgrades, and more polish across every run. A lot more is on the horizon. What should we build next?',
    null,
    now() + interval '3 days',
    20,
    '{"claims_verified":true,"verified_from":"current project code"}'::jsonb
  ),
  (
    'beta-pilots-first-run-v1',
    'beta_test',
    'We need more pilots. Play one Scicon Shooter run and reply with the moment it became fun, the hit that felt unfair, or what would make you start a second run:',
    'https://www.sciconshooter.xyz/',
    now() + interval '6 days',
    10,
    '{"claims_verified":true,"verified_from":"current project code"}'::jsonb
  )
on conflict (content_key) do nothing;

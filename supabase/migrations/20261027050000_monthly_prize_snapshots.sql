begin;

-- Frozen monthly 25,000 RSC boards. The API writes one row the first time a
-- closed window is read. Later score posts are rejected, so this row is the
-- stored close. Service role writes it; row level security keeps it private.
create table if not exists public.scicon_monthly_prize_snapshots (
  window_key text primary key,
  month_key text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  frozen_at timestamptz not null,
  scores jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.scicon_monthly_prize_snapshots enable row level security;

commit;

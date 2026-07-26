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

create index if not exists scicon_wallet_profile_challenges_wallet_idx
  on public.scicon_wallet_profile_challenges (wallet_address, created_at desc);

create index if not exists scicon_wallet_profile_challenges_expiry_idx
  on public.scicon_wallet_profile_challenges (expires_at)
  where used_at is null;

alter table public.scicon_wallet_profiles enable row level security;
alter table public.scicon_wallet_profile_challenges enable row level security;

-- No anon/authenticated policies are intentional. Profile ownership is proven
-- by the app's Base signature challenge and its signed HttpOnly session cookie.
revoke all on table public.scicon_wallet_profiles
  from anon, authenticated, public;
revoke all on table public.scicon_wallet_profile_challenges
  from anon, authenticated, public;

grant select, insert, update, delete
  on table public.scicon_wallet_profiles
  to service_role;
grant select, insert, update, delete
  on table public.scicon_wallet_profile_challenges
  to service_role;

-- Existing receipts were created before the server persisted whether a run
-- used the privileged Pilot Test path. Keep those rows available for audit and
-- already-minted record display, but do not let them authorize a new wallet
-- association, history token, leaderboard entry, or mint. Only the hardened
-- receipt writer explicitly stores the current provenance version.
alter table public.scicon_run_receipts
  add column if not exists receipt_provenance_version smallint not null default 0;

alter table public.scicon_run_receipts
  drop constraint if exists scicon_run_receipts_provenance_version_check;

alter table public.scicon_run_receipts
  add constraint scicon_run_receipts_provenance_version_check
  check (receipt_provenance_version between 0 and 1);

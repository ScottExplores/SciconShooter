-- Preserve server-authorized Pilot Test provenance across stored receipt
-- reissue so test results can never become ordinary mintable records.
alter table public.scicon_run_receipts
  add column if not exists test_run boolean not null default false;

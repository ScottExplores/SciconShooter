-- Persist the signed gameplay mode so wallet history can faithfully reissue
-- Weekly Run receipts after a reload. Existing rows predate this field and
-- intentionally remain standard unless server-owned leader evidence upgrades
-- the exact current winner during the compatibility window.
alter table public.scicon_run_receipts
  add column if not exists run_mode text not null default 'standard';

alter table public.scicon_run_receipts
  drop constraint if exists scicon_run_receipts_run_mode_check;

alter table public.scicon_run_receipts
  add constraint scicon_run_receipts_run_mode_check
  check (run_mode in ('standard', 'weekly-streak'));

alter table public.scicon_social_content_queue
  drop constraint if exists scicon_social_content_queue_content_kind_check;

alter table public.scicon_social_content_queue
  add constraint scicon_social_content_queue_content_kind_check
  check (content_kind in (
    'upgrade',
    'beta_test',
    'gameplay',
    'community',
    'funding',
    'competition',
    'challenge',
    'boss',
    'loadout',
    'progression',
    'onboarding'
  ));

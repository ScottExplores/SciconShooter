create index if not exists scicon_social_content_queue_published_action_idx
  on public.scicon_social_content_queue (published_action_id)
  where published_action_id is not null;

drop policy if exists "Service role manages social actions" on public.scicon_social_actions;
create policy "Service role manages social actions"
  on public.scicon_social_actions
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service role manages social content" on public.scicon_social_content_queue;
create policy "Service role manages social content"
  on public.scicon_social_content_queue
  for all
  to service_role
  using (true)
  with check (true);

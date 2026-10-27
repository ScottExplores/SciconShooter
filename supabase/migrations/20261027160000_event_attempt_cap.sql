begin;

-- The 25K High Score event uses one 10-try bucket per player. Rows already
-- stored under an event week still count, and a replay of that attempt key
-- does not open another try. Weekly boards stay at five free attempts.

create or replace function public.scicon_get_weekly_run_quota(
  p_wallet_address text,
  p_weekly_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_purchased_attempts integer := 0;
  v_attempts_used integer := 0;
  v_free_attempts integer := 5;
  v_scope_ids text[] := array[p_weekly_id];
begin
  if p_wallet_address is null
    or p_wallet_address <> lower(p_wallet_address)
    or p_wallet_address !~ '^0x[0-9a-f]{40}$'
    or p_wallet_address = '0x0000000000000000000000000000000000000000'
    or p_weekly_id is null
    or char_length(p_weekly_id) not between 1 and 64
  then
    raise exception 'weekly_run_attempt_binding_invalid';
  end if;

  if p_weekly_id = 'scicon-25k-high-score' then
    v_free_attempts := 10;
    v_scope_ids := array[
      'scicon-25k-high-score',
      '2026-10-25',
      '2026-11-01',
      '2026-11-08',
      '2026-11-15',
      '2026-11-22',
      '2026-11-29'
    ];
  else
    select coalesce(purchased_attempts, 0) into v_purchased_attempts
    from public.scicon_weekly_run_attempt_credits
    where wallet_address = p_wallet_address and weekly_id = p_weekly_id;
    v_purchased_attempts := coalesce(v_purchased_attempts, 0);
  end if;

  select count(*)::integer into v_attempts_used
  from public.scicon_weekly_run_attempts
  where wallet_address = p_wallet_address and weekly_id = any(v_scope_ids);

  return jsonb_build_object(
    'weeklyId', p_weekly_id,
    'freeAttempts', v_free_attempts,
    'purchasedAttempts', v_purchased_attempts,
    'attemptsUsed', v_attempts_used,
    'attemptsRemaining', greatest(0, v_free_attempts + v_purchased_attempts - v_attempts_used)
  );
end;
$$;

drop function if exists public.scicon_reserve_weekly_run_attempt(
  text, text, text, text, uuid, uuid
);
drop function if exists public.scicon_reserve_weekly_run_attempt(
  text, text, text, text, uuid, uuid, text
);

create or replace function public.scicon_reserve_weekly_run_attempt(
  p_identity_hash text,
  p_wallet_address text,
  p_weekly_id text,
  p_attempt_key text,
  p_reservation_id uuid,
  p_run_id uuid,
  p_owner_identity_hash text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_existing public.scicon_weekly_run_attempts%rowtype;
  v_attempt_number integer;
  v_attempts_used integer;
  v_purchased_attempts integer := 0;
  v_attempt_capacity integer := 5;
  v_free_attempts integer := 5;
  v_scope_ids text[] := array[p_weekly_id];
  v_owner_identity_hash text := coalesce(p_owner_identity_hash, p_identity_hash);
begin
  if p_identity_hash is null or p_identity_hash !~ '^[a-f0-9]{64}$'
    or v_owner_identity_hash is null or v_owner_identity_hash !~ '^[a-f0-9]{64}$'
    or p_weekly_id is null or char_length(p_weekly_id) not between 1 and 64
    or p_attempt_key is null or p_attempt_key !~ '^[a-f0-9]{64}$'
    or p_reservation_id is null or p_run_id is null
    or (
      p_wallet_address is not null
      and (
        p_wallet_address <> lower(p_wallet_address)
        or p_wallet_address !~ '^0x[0-9a-f]{40}$'
        or p_wallet_address = '0x0000000000000000000000000000000000000000'
      )
    )
  then
    raise exception 'weekly_run_attempt_binding_invalid';
  end if;

  -- One transaction at a time may inspect/allocate the available slots for an
  -- identity/week pair, including when two tabs start simultaneously.
  perform pg_advisory_xact_lock(hashtextextended(p_identity_hash || ':' || p_weekly_id, 0));
  if p_weekly_id = 'scicon-25k-high-score' then
    v_free_attempts := 10;
    v_attempt_capacity := 10;
    v_scope_ids := array[
      'scicon-25k-high-score',
      '2026-10-25',
      '2026-11-01',
      '2026-11-08',
      '2026-11-15',
      '2026-11-22',
      '2026-11-29'
    ];
  end if;

  if p_wallet_address is not null then
    -- The purchase settlement takes this same lock before increasing capacity.
    perform pg_advisory_xact_lock(
      hashtextextended('weekly-wallet:' || p_wallet_address || ':' || p_weekly_id, 0)
    );
    if p_weekly_id <> 'scicon-25k-high-score' then
      select coalesce(purchased_attempts, 0) into v_purchased_attempts
      from public.scicon_weekly_run_attempt_credits
      where wallet_address = p_wallet_address and weekly_id = p_weekly_id
      for update;
      v_purchased_attempts := coalesce(v_purchased_attempts, 0);
      v_attempt_capacity := least(32767, 5 + v_purchased_attempts);
    end if;
  end if;

  select * into v_existing
  from public.scicon_weekly_run_attempts
  where identity_hash = p_identity_hash
    and attempt_key = p_attempt_key
    and weekly_id = any(v_scope_ids)
  for update;

  select count(*)::integer into v_attempts_used
  from public.scicon_weekly_run_attempts
  where identity_hash = p_identity_hash and weekly_id = any(v_scope_ids);

  if v_existing.reservation_id is not null then
    if v_existing.owner_identity_hash <> v_owner_identity_hash then
      raise exception 'weekly_run_attempt_owner_mismatch';
    end if;
    if v_existing.status = 'finalized' then
      raise exception 'weekly_run_attempt_already_finalized';
    end if;
    return jsonb_build_object(
      'reservationId', v_existing.reservation_id,
      'runId', v_existing.run_id,
      'weeklyId', v_existing.weekly_id,
      'attemptNumber', v_existing.attempt_number,
      'freeAttempts', v_free_attempts,
      'purchasedAttempts', v_purchased_attempts,
      'attemptsUsed', v_attempts_used,
      'attemptsRemaining', greatest(0, v_attempt_capacity - v_attempts_used),
      'duplicate', true
    );
  end if;

  if v_attempts_used >= v_attempt_capacity then
    raise exception 'weekly_run_attempts_exhausted';
  end if;
  v_attempt_number := v_attempts_used + 1;

  insert into public.scicon_weekly_run_attempts (
    reservation_id, identity_hash, owner_identity_hash, wallet_address,
    weekly_id, attempt_key, attempt_number, run_id
  ) values (
    p_reservation_id, p_identity_hash, v_owner_identity_hash, p_wallet_address,
    p_weekly_id, p_attempt_key, v_attempt_number, p_run_id
  ) returning * into v_existing;

  return jsonb_build_object(
    'reservationId', v_existing.reservation_id,
    'runId', v_existing.run_id,
    'weeklyId', p_weekly_id,
    'attemptNumber', v_existing.attempt_number,
    'freeAttempts', v_free_attempts,
    'purchasedAttempts', v_purchased_attempts,
    'attemptsUsed', v_attempt_number,
    'attemptsRemaining', v_attempt_capacity - v_attempt_number,
    'duplicate', false
  );
end;
$$;

revoke all on function public.scicon_reserve_weekly_run_attempt(
  text, text, text, text, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.scicon_reserve_weekly_run_attempt(
  text, text, text, text, uuid, uuid, text
) to service_role;
revoke all on function public.scicon_get_weekly_run_quota(text, text)
  from public, anon, authenticated;
grant execute on function public.scicon_get_weekly_run_quota(text, text)
  to service_role;

notify pgrst, 'reload schema';

commit;

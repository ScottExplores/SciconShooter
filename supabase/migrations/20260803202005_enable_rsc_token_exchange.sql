begin;

alter table public.scicon_wallet_entitlements
  drop constraint if exists scicon_wallet_entitlements_purchased_tokens_total_check;
alter table public.scicon_wallet_entitlements
  add constraint scicon_wallet_entitlements_purchased_tokens_total_check
  check (purchased_tokens_total >= 0);

alter table public.scicon_wallet_purchase_orders
  drop constraint if exists scicon_wallet_purchase_orders_terms_check;

alter table public.scicon_wallet_purchase_orders
  add constraint scicon_wallet_purchase_orders_terms_check check (
    (
      sku_id = 'right-support'
      and amount_raw = 10000000000000000000
      and reward_tokens = 0
      and grants_right_support
      and reward_weekly_id is null
      and weekly_attempt_reward = 0
    )
    or (
      sku_id = 'weekly-run-attempt'
      and amount_raw = 3000000000000000000
      and reward_tokens = 0
      and not grants_right_support
      and reward_weekly_id ~ '^\d{4}-\d{2}-\d{2}$'
      and weekly_attempt_reward = 1
    )
    or (
      sku_id = 'tokens-500'
      and amount_raw = 1000000000000000000
      and reward_tokens = 500
      and not grants_right_support
      and reward_weekly_id is null
      and weekly_attempt_reward = 0
    )
    or (
      sku_id = 'tokens-2500'
      and amount_raw = 5000000000000000000
      and reward_tokens = 2500
      and not grants_right_support
      and reward_weekly_id is null
      and weekly_attempt_reward = 0
    )
    or (
      sku_id = 'tokens-5000'
      and amount_raw = 10000000000000000000
      and reward_tokens = 5000
      and not grants_right_support
      and reward_weekly_id is null
      and weekly_attempt_reward = 0
    )
  );

comment on constraint scicon_wallet_purchase_orders_terms_check
  on public.scicon_wallet_purchase_orders is
  'Immutable server-owned RSC prices and rewards, including the 500 Tokens per RSC exchange rate.';

commit;

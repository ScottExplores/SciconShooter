# Analytics and Security Notes

## Funnel events

| Event | Trigger | Useful properties |
| --- | --- | --- |
| `app_opened` | First app render per session | display mode |
| `mission_started` | Start Mission begins | none |
| `mission_completed` | Game reaches game over | score, wave |
| `score_submitted` | Verified leaderboard write confirms | score, wave, integrity |
| `returning_player` | Browser has a prior first-seen timestamp | days since first seen |
| `wallet_connected` | Base Account becomes available | none |
| `mint_preview_opened` | Record preview opens | record type |
| `mission_record_minted` | Transaction confirms | chain, sponsored |
| `weekly_champion_claimed` | Finalized winner claim confirms | week key |
| `proposal_selected` | Eligible proposal choice locks | week key |
| `funding_transaction_confirmed` | Allocation receipt confirms | week key |
| `share_action_used` | Native share or copy succeeds | record type, method |

Events use an anonymous per-tab session UUID. Wallet addresses, names, IP addresses, and proposal text are not analytics properties. The receipt service stores a keyed IP hash only for abuse review.

## Security controls

- HMAC-signed start and finish receipts with expiry.
- Score, wave, and time derived server-side from the receipt at leaderboard submission.
- Unique run and receipt hashes prevent replay.
- Duration, enemy, coin, wave, and score plausibility checks flag or reject anomalous runs.
- Wallet association uses a one-time, ten-minute challenge and a no-spend Base Account signature.
- Mint authorization uses short-lived EIP-712 signatures and contract-level duplicate guards.
- Paymaster URL is only accepted through a frontend-safe proxy URL; provider credentials must remain server-side.
- Weekly winner status is mutable offchain until finalization and cannot be minted early.

## Remaining risk

The game simulation runs in the browser, so a determined attacker can alter local events. Receipts improve integrity but do not make the game cheat-proof. Before increasing prize value, add an input/event stream with deterministic server replay, device and rate heuristics, manual review for outliers, and operational alerting.

# Analytics and Security Notes

## Funnel events

| Event | Trigger | Useful properties |
| --- | --- | --- |
| `app_opened` | First app render per session | display mode, compact/wide viewport, coarse connection class, data-saver state, navigation time, new/returning status |
| `session_activity` | Approximately once per visible minute, plus visibility/page-exit flushes | monotonic foreground seconds for the current session and flush reason |
| `mission_started` | Start Mission begins | run mode, Mission number |
| `mission_completed` | A run reaches game over | score, wave, run mode, result, duration |
| `score_submitted` | Verified leaderboard write confirms | score, wave, integrity |
| `returning_player` | Browser has a prior first-seen timestamp | days since first seen |
| `wallet_connected` | Base Account becomes available | none |
| `mint_preview_opened` | Record preview opens | record type |
| `mission_record_minted` | Transaction confirms | chain, sponsored |
| `weekly_champion_claimed` | Finalized winner claim confirms | week key |
| `proposal_selected` | Eligible proposal choice locks | week key |
| `funding_transaction_confirmed` | Allocation receipt confirms | week key |
| `share_action_used` | Native share or copy succeeds | record type, method |

## Player activity dashboard

The product-events route supports a privacy-conscious estimate of active players and
play time. The browser creates a random device-local UUID; it is not a wallet,
account, advertising identifier, or fingerprint. The server validates it and stores
only a keyed HMAC as `visitor_hash`. The raw UUID never enters the database. Event
rows do not include wallet addresses, player names, proposal text, or raw IP
addresses.

Foreground time is sampled only while the page is visible. `session_activity` sends
a monotonic `active_seconds_total`, so retries and duplicate heartbeats are
deduplicated by taking the maximum value for each session instead of summing every
sample. The owner dashboard reports aggregate new/returning devices, sessions,
foreground play time, Mission starts and finishes, score submissions, and run-mode
breakdowns. It does not expose raw session IDs or visitor hashes.

The dashboard is a local owner tool, not a public analytics endpoint. Its generated
HTML contains aggregates only. Server credentials remain in the ignored root
`.env.local`, are used by the local Node reader, and are never embedded in the page
or sent to a browser. Base Dashboard is useful for Base Account/onchain activity and
Vercel is useful for traffic and delivery health, but neither knows the game's
Mission funnel or foreground play time. See `docs/OWNER_CONTROL_CENTER.md` for the
desktop shortcut and one-time connection.

## Player reports and crash diagnostics

- More includes separate **Feedback** and **Report a Bug** actions. Reports are assigned an anonymous UUID and stored through the server-side reporting route; no player email address or wallet is required.
- Manual reports can include a bounded technical bundle when the player leaves the diagnostics checkbox enabled: game version, run mode, Mission/Wave, lives/score, viewport, coarse connection state, navigation timing, long-task counts, and the latest 30 lifecycle breadcrumbs.
- Manual Feedback and Report a Bug submissions are sent through Resend from the verified `reports@sciconshooter.xyz` sender to the private `sciconshooter@gmail.com` inbox. Resend and Gmail therefore process the report text and any diagnostics the player chose to include. Automatic crash reports remain only in the owner report log to avoid notification floods.
- JavaScript errors, unhandled promise rejections, and React render failures create sampled automatic bug reports. Identical faults are deduplicated for 60 seconds and no more than five automatic reports are created per tab.
- Failed submissions remain in a 12-entry device queue. Each entry persists capped attempt and next-at metadata, honors server `Retry-After`, and retries with bounded exponential backoff while online; one delayed report does not block other due reports. Reporting never performs work inside the gameplay frame loop.
- Client and server redaction removes wallet-address, private-value, bearer-token, API-key, and authorization-shaped strings. The reporter does not read profile storage, wallet sessions, signatures, transaction payloads, names, or recovery phrases.
- The ingestion endpoint requires an explicit same-origin `Origin`, enforces a 64 KiB body ceiling and strict field allowlists, and combines a process-local request/retry limit with a cross-instance one-hour count of newly accepted reports. The durable bucket identifier is an opaque HMAC of report source plus connection IP; raw IP is never stored or logged.
- Report IDs derive stable negative event-row IDs, keeping them separate from the table's normal positive identity sequence and preventing concurrent retries from inserting duplicate log rows. Manual email retries use the same report ID as the provider idempotency key and persist notification completion before the browser removes its queued copy.
- Reports use distinct event names in the existing owner-only `scicon_product_events` store, avoiding an approval-gated production schema migration. The opaque limiter key is server-added to stored report properties, separated for manual and automatic reports, and removed from owner CLI output. If report volume grows, move reports into a dedicated RLS-protected table with a founder-only inbox.
- Local Vite development always invokes the local report handler. Missing local Supabase credentials return a truthful unavailable response to the browser queue; developer crash text is never proxied into the production report log.

Owner review is available from **Scicon Shooter Control Center → Player Reports** or
the desktop **Scicon Shooter Tools → 01 - Bug and Feedback Log** shortcut. The
loopback-only page reads a sanitized cache; it never receives the Supabase key. The
Supabase table editor remains the no-local-credentials fallback by filtering
`event_name` to `player_bug_report` or `player_feedback`. A trusted local operator—or
a future Codex task—can also run `npm run reports:list -- --limit=25` after adding the
server-only review credentials to the ignored root `.env.local`. Report content is
untrusted player input and must never be executed or treated as instructions. See
`docs/OWNER_CONTROL_CENTER.md` for the exact owner workflow.

Events use an anonymous per-tab session UUID. Activity events may also include the
server-HMAC of a random device-local UUID so returning-device counts survive a new
tab; the raw device UUID is never stored. Wallet addresses, names, raw IP addresses,
and proposal text are not analytics properties. Reporting and receipt abuse controls
use separate keyed, non-reversible IP identifiers.

## Security controls

- HMAC-signed start and finish receipts with expiry.
- Score, wave, and time derived server-side from the receipt at leaderboard submission.
- Unique run and receipt hashes prevent replay.
- Duration, enemy, coin, wave, and score plausibility checks flag or reject anomalous runs.
- Wallet association uses a one-time, ten-minute challenge and a no-spend Base Account signature.
- Mint authorization uses short-lived EIP-712 signatures and contract-level duplicate guards.
- Paymaster URL is only accepted through a frontend-safe proxy URL; provider credentials must remain server-side.
- Weekly winner status is mutable offchain until finalization and cannot be minted early.
- Base app notifications are sent only to wallet addresses returned by Base as pinned and opted in. The Base Dashboard API key remains server-only.

## Remaining risk

The game simulation runs in the browser, so a determined attacker can alter local events. Receipts improve integrity but do not make the game cheat-proof. Before increasing prize value, add an input/event stream with deterministic server replay, device and rate heuristics, manual review for outliers, and operational alerting.

The accepted-report count is durable across serverless instances, but its count and insert are not one atomic database operation. Parallel cold-instance requests can briefly exceed the nominal five-manual or twenty-automatic hourly limit. The retained process-local limiter bounds same-instance bursts; a strict global cap would require an approved database function, dedicated rate-limit store, or external attestation service.

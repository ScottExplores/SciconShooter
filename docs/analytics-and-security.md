# Analytics and Security Notes

## Funnel events

| Event | Trigger | Useful properties |
| --- | --- | --- |
| `app_opened` | First app render per session | display mode, compact/wide viewport, coarse connection class, data-saver state, navigation time, new/returning status |
| `session_activity` | Approximately once per visible minute, plus visibility, gameplay-state, and page-exit flushes | monotonic foreground seconds, monotonic live-simulation seconds, and flush reason |
| `mission_started` | A playable runtime finishes loading | anonymous analytics run ID, run mode, Mission number, continuous-run flag |
| `run_progress` | Once when a run reaches a new authored Wave/depth checkpoint | anonymous analytics run ID, run mode, Mission number, local Wave, absolute Wave, continuous-run flag |
| `run_ended` | Once when a run clears, defeats the player, is forfeited/exited, or is interrupted | anonymous analytics run ID, run mode, Mission number, local/absolute Wave, result, duration |
| `mission_completed` | Legacy terminal event retained for older rows | score, Wave, run mode, result, duration |
| `score_submitted` | Verified leaderboard write confirms | anonymous analytics run ID, run mode, score, Wave, integrity |
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

`session_activity` maintains two monotonic counters across reloads in the same
browser tab. `active_seconds_total` measures visible foreground time, including
menus and the Hangar. `gameplay_seconds_total` advances only while the live game
simulation is visible and running, excluding pause screens, loading,
transmissions, menus, and result screens. The reader derives bounded deltas from
those counters, so repeated heartbeats are not added twice and a counter reset is
handled without making the total move backward.

Analytics schema v3 also assigns a random, nonpersonal run ID. `run_progress` is
sent only once for each newly reached Wave checkpoint—not from the frame loop—and
`run_ended` is sent once with the final outcome. Together they support aggregate
Campaign Mission progression and drop-off, explicit clears/defeats/exits, and
Weekly Run depth even when one Weekly attempt crosses multiple Missions.

The owner dashboard is focused around decisions rather than every available event:

- daily privacy-safe devices, app sessions, actual flight time, average measured
  flight time per session, run starts, and Campaign clears;
- Campaign attempts and outcomes by Mission, plus the furthest Mission observed
  for each hashed device in the selected reporting window;
- Weekly Run attempts, average and deepest measured Wave, and depth distribution;
- run-mode health and measurement-coverage checks for anonymous IDs, time,
  progression, outcomes, production source, current schema, freshness, and the
  bounded reader limit.

Daily buckets use UTC. “No end recorded” is not automatically a quit: the run may
still be active, cross the selected report boundary, lose connectivity, or predate
v3 outcome tracking. The richer flight-time, progression, outcome, and source
metrics begin filling only after a v3 production build is deployed. Older untagged
rows cannot reliably separate real players from owner/local testing, so they are
excluded from headline KPIs and shown only as labelled mixed-history context.

The dashboard is a local owner tool, not a public analytics endpoint. Its generated
HTML contains aggregates only and never exposes raw session, visitor, or run IDs.
Server credentials remain in the ignored root `.env.local`, are used by the local
Node reader, and are never embedded in the page or sent to a browser.

New telemetry is production-only: loopback Codex/Claude/Vite sessions emit no
product events, and the server tags production, preview, and development traffic so
the reader can exclude nonproduction rows. Untagged legacy rows never enter the
confirmed-live totals; their excluded session count and production-source coverage
make the historical uncertainty visible instead of silently blending it in.

This Supabase gameplay dashboard and the Base Dashboard answer different questions.
Base reports Base Account and onchain activity; it does not observe guest sessions,
foreground/flight time, Mission progression, or Weekly Run depth. Vercel remains
useful for traffic and delivery health. See `docs/OWNER_CONTROL_CENTER.md` for the
desktop shortcut and one-time Supabase connection.

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

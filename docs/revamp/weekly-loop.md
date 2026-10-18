# Weekly Run → open science funding

Audit: Job E, October 2026. This describes the checked-in contracts. No production
database, payment, notification, deployment, or other external write was made.
Supabase migrations are absent from this snapshot; database assumptions below
must be checked against the deployment before enabling ranked production traffic.

## Clock, plan and fairness

The competition week key is a **Sunday date, `YYYY-MM-DD`**, bounded by Sunday
**12:00 noon America/Los_Angeles**. It is not midnight, a fixed UTC offset, or an
ISO Monday key. `shared/weeklyCompetitionBoundary.js` handles DST; the public
dashboard has a five-minute settlement/publishing window. Score insertion still
requires the receipt to belong to the *current* scoring week. The settlement
window lets already-started writes finish; it does not admit late new submissions.

The rotation seed maps that competition key into its ISO week. The shared campaign
boss registry collects registered bosses that have authored encounters; both the
browser generator and server proof graph use it. Each week rotates two elite
encounters and one major boss deterministically. Registration without an authored
boss event cannot produce a playable encounter and is excluded. The campaign
revision and pool must be the same on the server and browser; plan changes belong
at a weekly boundary, since no persisted plan-version migration exists here.

Every identity receives five ranked attempts. Legacy purchased-attempt counts
are retained as metadata but do not increase ranked quota. New attempt purchases
are rejected before payment quotation. Each start reserves an atomic attempt;
retrying the identical pristine proof reuses its reservation. Finishing the same
proof is idempotent; changing a finalized proof is rejected. A run must end in
loss, not deliberate forfeit, to produce a ranked receipt.

Ranked launch now fixes every pilot to the ResearchHub ship, zero persistent
upgrades and no purchased companions, with the same ten starting lives. Server
admission rejects alternate ship IDs before consuming a reservation. Field
upgrades earned during the run remain available equally. Weekly mode cannot use
paid continues: the UI excludes them and server payment authorization requires
a standard run. Client normalization is not proof of the actual simulated
loadout; server combat replay verification remains outside this implementation.

## Sequence

```mermaid
sequenceDiagram
  actor Pilot
  participant UI as Game / Signals
  participant API as Vercel API
  participant DB as Supabase
  participant RH as ResearchHub public feed
  participant Cron as Scheduled finalizer
  actor Admin

  UI->>API: GET researchhub-proposals + leaderboard + weekly-competitions
  API->>RH: Public keyless OPEN funding_feed (bounded timeout)
  RH-->>API: Proposal page(s), eligibility and funding data
  API-->>UI: Live/cache snapshot, weekly board, archive
  Pilot->>UI: Start Weekly Run
  UI->>API: POST run-receipts action=start + pristine weekly proof
  API->>DB: Atomic reserve RPC (identity + week + attempt key)
  DB-->>API: Reservation + run ID + quota
  API-->>UI: Signed start token
  UI->>UI: Play seeded campaign; record score/route proof
  UI->>API: POST run-receipts action=finish + start token + proof
  API->>API: Validate binding, route, scoring, elapsed time, identity
  API->>DB: Atomic settle RPC + immutable receipt persistence
  API-->>UI: Signed server-verified receipt (or review/rejection)
  UI->>API: POST leaderboard action=submit-score + receipt token + pilot name
  API->>DB: Require durable provenance; insert signed metrics once
  API-->>UI: Weekly leaderboard / rank preview
  opt Current leader selects a preliminary proposal
    UI->>API: POST leaderboard select-proposal-challenge / select-proposal
    API->>RH: Verify proposal remains eligible through weekly cutoff
    API->>DB: Validate leader and wallet proof; save preliminary selection
  end
  Cron->>API: Authorized finalize-weekly-competition before cutoff
  API->>RH: Capture complete eligible proposal snapshot
  API->>DB: Append immutable pre-cutoff snapshot
  Cron->>API: Authorized finalize-weekly-competition after settlement
  API->>DB: Re-read trusted winner + cutoff snapshot; compare-and-set archive
  API-->>UI: finalized winner, 72-hour claim deadline
  opt Guest winner has not associated a wallet
    UI->>API: POST run-claims challenge / claim + guest cookie + wallet signature
    API->>DB: Associate trusted winning receipt with wallet
  end
  Pilot->>UI: Select eligible ResearchHub proposal and sign claim
  UI->>API: POST weekly-claim action=challenge
  API->>DB: Recheck winner/wallet/deadline; persist one-use nonce
  API-->>UI: Message bound to week, run, wallet, proposal, expiry
  UI->>API: POST weekly-claim action=claim + signature
  API->>RH: Recheck live proposal eligibility
  API->>DB: Consume nonce; compare-and-set finalized → claimed
  Admin->>API: POST events?route=weekly-funding-approval action=approve
  API->>DB: Compare-and-set claimed → pending-funding
  Note over Admin,RH: Admin sends funding manually outside the game API
  Admin->>API: POST events?route=weekly-funding-approval action=record-transfer + txHash
  API->>DB: Compare-and-set pending-funding → funded
  UI->>API: GET weekly-competitions
  API-->>UI: Winner archive with proposal and recorded transfer hash
```

## Endpoints and authorization

| Endpoint | Authentication / authorization | Behavior and principal failures |
| --- | --- | --- |
| `GET /api/researchhub-proposals` | Public/keyless | OPEN preregistration feed; cached snapshot fallback. Empty feed and outage stay distinguishable from a successful proposal selection. `previewReadOnly=1` suppresses server cache writes. Client has a separate local snapshot. |
| `POST /api/run-receipts`, `start` | Same origin; signed guest identity cookie or authenticated wallet-profile cookie matching requested wallet | Reserves five-attempt quota through `scicon_reserve_weekly_run_attempt`. First guest establishment may return `428 GUEST_SESSION_REQUIRED` for retry. `401` reconnect wallet, `403` unauthorized Pilot Test, `409` quota exhausted/identity conflict, `422` bad weekly proof, `503` persistence unavailable. |
| `POST /api/run-receipts`, `finish` | Signed start capability plus matching originating identity | Validates weekly route/scoring proof and duration; settles `scicon_settle_weekly_run_attempt`; saves immutable trusted receipt. Changed replay, forfeit, missing proof/reservation, expired start, and impossible duration reject or require review. A production ranked receipt must persist before it can enter the board. |
| `GET /api/leaderboard[?weekKey=YYYY-MM-DD]` | Public | Current/all-time board or historical weekly board. Weekly candidates require matching durable receipt metrics, hash, time, provenance v1, `weekly-streak`, `server-verified`, and `test_run=false`. Pilot Test wallet excluded. `400` invalid week key; `503` unavailable verified schema / scan limit. Weekly response is capped at 100 eligible runs. |
| `POST /api/leaderboard`, `submit-score` | Signed verified generated Weekly Run receipt and matching durable row; optional authenticated wallet metadata | Takes score/wave/date from the receipt, never client score fields. Pilot name is display only. Run ID uniqueness makes retry safe. `401` invalid token, `403` test/unverified/non-weekly/non-durable, `409 WEEKLY_SCORE_CUTOFF_PASSED`, `429` rate limit. Ties use score descending, finish time ascending, then run ID for deterministic display. |
| `POST /api/leaderboard`, `select-proposal-challenge` / `select-proposal` | Current trusted leading receipt; guest bearer capability, or matching wallet-profile session / fresh wallet signature | Preliminary pick only. Live eligibility requires proposal open through current cutoff. Rechecks leader after feed lookup and after write; best-effort rollback if lead changes. `409 WEEKLY_LEADER_CHANGED`, `410 WEEKLY_PROPOSAL_CHALLENGE_STALE`, `401/403` wallet mismatch. Does not claim the finished competition or send funds. |
| `GET /api/weekly-competitions` | Public | **Strictly read-only** archive and `completedWeekKeys`. Missing migration returns empty archive with `migrationPending=true`. It no longer runs recovery, writes winners, or sends notifications. |
| `POST /api/weekly-competitions` with `weekKey` | `Authorization: Bearer ADMIN_SECRET` or `CRON_SECRET` | Explicit single-week finalization/reconciliation after five-minute settlement. `401` unauthorized, `409` open/unstable week, `503` unconfirmed commit. |
| `GET` or `POST /api/finalize-weekly-competition` | Admin or cron bearer token | Pre-cutoff snapshot capture in 121-minute window, otherwise recover last three completed weeks. GET **has side effects** and must never be preview-proxied. Vercel cron is configured at Sunday 18:00, 19:10, 20:10 UTC, covering PST/PDT. Each recovery result must be inspected: outer `200` can contain per-week failure. |
| `POST /api/run-claims`, `challenge` / `claim` | Receipt capability plus original guest cookie, or appropriate wallet session; destination wallet signature | Guest winner associates the winning receipt with a wallet before champion claim. Nonce/provenance/identity binding prevents another holder of the receipt alone from taking it. Does not fund a proposal. |
| `POST /api/weekly-claim`, `challenge` / `claim` | Required same origin; exact winning wallet from trusted receipt; current winner recheck; ten-minute, one-use signed challenge | Selects live eligible proposal; `finalized → claimed` only within 72 hours from finalization. CAS includes winner, status, revision timestamp and still-open deadline. `403` wrong wallet, `409` winner changed/already resolved, `410` expired claim/challenge, `503` unconfirmed write. Same committed claim can replay safely after signature verification. |
| `POST /api/events?route=weekly-funding-approval` | **ADMIN_SECRET only**; cron secret is insufficient | `approve` advances claimed to pending-funding. `record-transfer` records an already-sent manual transaction hash and advances funded. Neither creates a transaction. Same hash replay succeeds; another hash or funded row missing valid hash returns `409`. `/api/weekly-funding-approval` is a rewrite alias, not an extra function. |
| `GET /api/player-runs` → `mint-records?route=player-runs` | Authenticated wallet-profile session | Recovers owned receipts, including guest runs previously associated. Existing GET also repairs wallet association in storage: **exclude from preview proxy**. |
| `POST /api/wallet-purchases`, `status` (routed by `mint-records`) | Same origin and matching authenticated wallet session | Reads authoritative weekly quota via `scicon_get_weekly_run_quota`. New `weekly-run-attempt` purchase quotes return `409 weekly_attempt_purchases_disabled`. Existing purchase records remain available for audit. |

Wallet sessions are created by the existing wallet-profile challenge/authenticate
route. The browser never receives Supabase service credentials, admin credentials,
or cron credentials. Notifications/webhooks are best-effort after commit and do
not establish winner or funding authority. The funding archive records an admin
attestation: transaction hash syntax is checked, but on-chain recipient, amount
and confirmation are not independently verified by the funding approval route.

## Fixed defects and remaining operational boundaries

- Public archive reads previously finalized weeks and sent notifications. They
  now only read; monitor authenticated cron recovery because visiting the game
  no longer repairs a missed scheduled job. The existing dashboard may hold its
  prior archive view while waiting for that recovery.
- Weekly display and finalization now share durable eligibility, in every server
  environment. Legacy/test/untrusted high rows cannot win by crowding the first
  100 database rows. Pagination stops at 10,000 inspected candidates and fails
  closed with manual review rather than incorrectly expiring a nonempty week.
- Signed scoreboard metrics require storage even in development. Local practice
  without Supabase does not pretend to submit a verified ranked score.
- Claim writes now guard deadline expiry during a slow eligibility lookup.
  Challenge consumption and competition update are separate CAS operations;
  after an interrupted request, a committed claim can replay, otherwise request
  a fresh challenge. There is no cross-table transaction in this snapshot.
- Funding cannot be approved with the scheduled-job token, and a broken funded
  archive with no valid stored transfer hash cannot acknowledge an unsaved hash.
- Five ranked attempts are equal irrespective of purchases. Legacy database RPCs
  may reserve a historical paid sixth slot; the API rejects it before issuing a
  start token. Update deployed RPCs to enforce five atomically as well; migration
  sources and database verification are unavailable here.
- Guest cookies/IP admission and wallet addresses are not proof of one human.
  Clearing identities/changing network or using multiple wallets remains a
  Sybil limit. These controls are rate/quota defenses, not human verification.
- Server proof checking validates route, score-event formulas, identities,
  elapsed time and receipt provenance. It does not replay player inputs or
  simulate combat server-side; a modified client remains a residual anti-cheat
  risk. Keep the admin review gate for prize funding.
- Proposal snapshot failure never deletes a legitimate winner. Existing
  selection is preserved if possible; otherwise proposal resolution remains
  pending. Claim still requires a currently eligible proposal. No automatic RSC
  transfer occurs on cutoff, signature, mint, approval, or cache refresh.
- Existing finalized rows whose claim deadlines have elapsed remain archived
  as finalized; the claim endpoint rejects them with `410`. Empty weeks are
  archived as expired. There is no automatic unclaimed-prize reassignment here.

## Deployment and verification checklist

- [x] Fixture/mock-fetch server tests: start quota/idempotent settlement, trusted
  score submit/replay, winner pagination/provenance, finalization/no snapshot,
  claim signature binding/replay/deadline filter, admin approval/transfer/CAS.
- [x] No external writes during test execution; fetch is replaced per test and
  unexpected calls fail. Run `node --test tests-revamp/E/server-weekly.test.mjs`.
- [x] Exactly 12 top-level `api/*.js` functions; new route logic stays in `_lib`
  and funding continues through `events?route=weekly-funding-approval`.
- [ ] In a provisioned nonproduction database, verify unique `run_id` receipt and
  leaderboard constraints, unique competition `week_key`, unique nonce challenge
  IDs, atomic reservation/settlement RPCs, and restricted service-role access.
- [ ] Verify current schema has trusted provenance, run mode, test flag,
  timestamps, receipt hash and winner/proposal/funding columns. Missing columns
  must fail closed; do not loosen eligibility to hide migration problems.
- [ ] Run a full staging start → finish → submit → rollover → signed winner claim
  → admin approve → record a fixture transfer; inspect per-week cron results.
- [x] Fixture tests cover Pacific/DST boundaries, cached/empty proposals,
  lost-response replay, wrong wallet, changed leader and expired challenges.
  Phone and desktop browser smoke covers Signals/offline snapshots, weekly top
  five/countdown, and local practice with zero outgoing API writes.
- [ ] Verify the same failure cases against provisioned staging services,
  including offline winner archive and real wallet signature prompts.
- [ ] Deploy preview only from the Pages instructions after review. Verify the
  badge, local practice, public GET cache and `503 PREVIEW_READ_ONLY` for every
  non-GET/unknown/private API path. No production wallet cookies are forwarded.

Relevant storage reference: Supabase [Data API security](https://supabase.com/docs/guides/api/securing-your-api)
requires grants and RLS to be checked together. This audit changed application
authorization, not deployed grants, policies, tables or RPC definitions.

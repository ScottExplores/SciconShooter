# Job E — Weekly Run, Signals, leaderboards, preview builds

Implemented in the `rv/E` working tree. Scott's art files, game-world dimensions,
simulation, `services/gameLogic.ts`, and `services/pixi/PixiGameRenderer.ts` are
untouched. No pushes, deployments, external write APIs, payments, or real player
messages were made. The repository's referenced `docs/AI_COLLAB_WORKFLOW.md` is
absent from this snapshot; the available design and repository instructions were
read before implementation.

## Changes and files

- `docs/revamp/weekly-loop.md`: complete sequence diagram, endpoint/auth table,
  failure modes, storage assumptions, operational checklist, and remaining limits.
- `services/revamp/weekly/{bossRotation.js,bossRotation.browser.ts}`: shared
  campaign registry and three-boss weekly rotation. Two elite bosses and one major
  rotate through the catalog; small catalogs use available classes. Sunday-noon
  Pacific competition keys map to the following ISO Monday for rotation. All
  devices, generated graphs, persisted streak restoration, and API validation
  use the same pool/order. The existing competition/reset date contract remains.
- `shared/weeklyRunPlan{.js,.browser.ts}`, `services/weeklyRunGenerator.ts`,
  `services/squadProgression.ts`, `api/_lib/walletProfiles.js`: small integrations
  with that shared registry. A boss joins automatically when registered in a
  sector, mini-boss inventory, graph, or authored wave **and** a `kind: 'boss'`
  encounter exists in campaign levels. Incomplete registrations are excluded
  until playable. No boss ID allowlist needs to be maintained by job C.
- `services/revamp/weekly/rankedLoadout.ts`: identical Research Flask, baseline
  upgrades/supports, and existing ten-life rules. Paid ships, gear and support
  unlocks no longer affect Weekly Run power. `api/_lib/runReceipts.js` also
  requires the ResearchHub ship before reserving a ranked attempt.
- `api/_lib/{weeklyScoreEligibility,weeklyCompetitionService,weeklyRunAttempts,
  runReceipts,walletPurchases,weeklyFundingApprovalRoute}.js`,
  `api/{leaderboard,weekly-competitions,weekly-claim}.js`, and
  `shared/weeklyFundingApproval.js`: trusted durable eligibility shared by board
  and finalizer, bounded pagination beyond invalid historic rows, strictly
  read-only public archive GET, five ranked attempts irrespective of purchases,
  deadline CAS for claims, admin-only funding approval, and rejection of malformed
  funded records. The attempt-purchase SKU is disabled in `constants.ts`.
- `services/revamp/researchhub/{serverFeed.js,feedSnapshot.ts}` plus
  `api/researchhub-proposals.js`, `api/_lib/researchHubEligibility.js`, and
  `services/researchHubProposals.ts`: bounded fetch/body reads, bounded pagination,
  memory/Supabase/localStorage snapshot fallback, malformed-response protection,
  preserved large IDs, multiple referenced IDs, safe public URLs, author lists,
  provenance, and deadline/eligibility parity. Cached snapshots are for display;
  they never prove a completed proposal or authorize a funding choice.
- `components/revamp/{SignalsPanel.tsx,WeeklyCompetitionCard.tsx,
  weeklyCompetition.css}` and `services/revamp/weekly/presentation.ts`: mobile
  Signals cards with authors, progress, remaining days, search and external links;
  pre-run prize/fairness explanation; expandable top five plus known pilot rank;
  live Pacific countdown; honest submitted/provisional result nudges. Existing
  `StartScreen.tsx` integrates the panels and preserves champion selection.
  Dashboard navigation and Signals render without nested component remounts,
  preserving search/focus and the first mouse click when the desktop frame gains focus.
  `WeeklyProposalSelection.tsx` adds a ResearchHub link to its unavailable state.
  Feed/selection errors allow closing the leader-selection modal and recovering
  the saved choice later, rather than trapping the pilot behind an unavailable feed.
  `styles/tailwind.generated.css` is regenerated for the new component classes.
- `deploy/pages/functions/_middleware.js`, `deploy/pages/README.md`, and
  `services/revamp/preview/*`: audited public GET proxy/cache, no asset proxy,
  every non-GET API request rejected with `503 PREVIEW_READ_ONLY`, unsafe GETs
  rejected, no credential forwarding, preview hostname/build-flag detection,
  browser network guard and badge. Preview admission/finish is local practice;
  scores/claims are skipped before wallet prompts, and practice consumes no
  ranked attempt. Narrow service hooks are in `runReceiptService.ts`,
  `runClaimService.ts`, `weeklyClaimService.ts`, `leaderboardService.ts`,
  `analyticsService.ts`, and the pre-mount `index.tsx` guard.
- `services/revamp/leaderboard/readLeaderboard.ts`, `leaderboardService.ts`, and
  `winnerArchiveService.ts`: bounded JSON reads so dashboard refresh can settle
  when an endpoint stalls.
- `tsconfig.json` excludes generated `dist` output so type checking does not
  read stale Vite bundles or race their replacement. Source checks are unchanged.
- `tests-revamp/E/*.test.mjs`: fixture-based client/server tests; mocked fetch
  throughout server tests. `fixtures/funding_feed.json` is synthetic and shaped
  from the original public-feed parser, not represented as a live API capture.
  `browser-smoke.mjs` is an optional local-only Playwright smoke runner.

## Shared hooks

`App.tsx` additions are marked `// REVAMP(E):` at the isolated imports, feed
provenance state, ranked loadout/ship selection, preview admission, score save and
claim boundaries. Other hook sites are the two StartScreen prop blocks, one badge,
and one results nudge. App adds no gameplay implementation; the new services own
it. `index.tsx` installs the preview guard before React effects. No gameLogic or
Pixi renderer hooks were necessary.

## Verification

```sh
node --test tests-revamp/E/*.test.mjs
npx vite build
npx tsc --noEmit
```

**Results:** 59 focused tests pass. Phone and desktop smoke both pass: live top five,
Pacific countdown, Signals search, saved snapshot fallback, local practice
admission, zero outgoing API writes, and no browser runtime exceptions. Reviewed
screenshots are saved under `/workspace/scicon-revamp/qa/E/`.

The initial and final TypeScript diagnostics are the same six pre-existing
`services/pixi/boss-rigs/UmbraNeedlewingArtwork.ts` errors: two missing prototype
JSON imports and four unknown atlas-property errors. Vite builds successfully;
its existing large-chunk warning remains. Changed API modules and shared server
helpers pass `node --check`. Top-level `api/*.js` count remains **12**.

For a local preview smoke with Chromium/Playwright available:

```sh
npm run generate:tailwind
VITE_PREVIEW_MODE=true npx vite build
python3 -m http.server 5197 --bind 127.0.0.1 --directory dist
# In another terminal:
node tests-revamp/E/browser-smoke.mjs
```

The smoke intercepts every API request with fixtures and blocks all external
traffic. It checks phone (390×844, DPR 2, touch) and desktop mobile-frame layouts,
weekly top five/countdown, Signals search, local offline fallback, practice
admission, no outgoing API writes, and no browser runtime exceptions. Optional
settings: `E_CHROME`, `E_SMOKE_URL`, `E_SMOKE_OUTPUT`, `E_SMOKE_DEVICE`.
The default screenshots are `/tmp/revamp-E-browser/`.

## Tuning and operational limits

| Knob | Location / value |
| --- | --- |
| Ranked power | `rankedLoadout.ts`: ResearchHub ship, upgrade level 0, no companions; ten lives remain existing runtime policy |
| Boss mix | `bossRotation.js`: 2 elites + 1 major; same pool must be deployed to browser/server |
| Attempts | Client/server five-attempt constants; historical purchase metadata is retained without competitive benefit |
| Reset | `shared/weeklyCompetitionBoundary.js`: Sunday noon PT, five-minute publication settlement |
| Standings | Existing 60-second background refresh + focus refresh, top 100 API, top five preview; unknown ranks are never invented |
| Network | Feed client 12s; server request 4s, feed 7s, combined detail budget 8s, DB cache 1s; leaderboard/archive reads 8s |
| Snapshots | Seven-day expiry, client version1/2MB/100-item cap; cached eligibility always rechecked at selection |
| Feed pagination | Display100 / authority500 entries, at most5 pages; incomplete authority fails closed |
| Winner scan | At most10,000 database candidates; failure requires review instead of declaring a false empty winner |
| Preview cache | Public leaderboard15s, archive30s, feed120s, record reads300s; private/no-store/error responses bypass cache |

No Supabase migrations are included, so live schema, unique constraints, RLS,
reservation/settlement RPC atomicity, real wallet signatures and real funding
transfers cannot be certified here. The mocked full loop passes; staging with a
provisioned nonproduction database remains required. Cron must recover missed
finalizations now that public reads cannot write. Deploy the updated production
read handlers before pointing a Pages preview at production: older GET handlers
can have side effects. No such deployment was performed.

Plan changes require coordinated server/browser rollout at a weekly boundary;
there is no historical plan-version migration. Existing persisted runs using the
old all-boss plan need a new weekly boundary. Purchased six-plus attempt rows are
rejected before a start token even if a legacy RPC reserved one; update deployed
RPCs to enforce five atomically as well. Old unsupported receipts are excluded
from ranked competition rather than silently treated as trusted.

Anti-cheat reconstructs scoring and validates identity/provenance/timing, not a
server replay of combat. Guest identity rotation/multiple wallets remain a Sybil
limit. Funding transfers remain manual admin attestations; the API does not
independently verify chain recipient/amount/finality. Full details and unchecked
staging items are in the audit document.

## Commit blocker

Logical commits were attempted after implementation, but both root and delegated
agents received:

```
fatal: Unable to create '/workspace/scicon-revamp/repo/.git/worktrees/wt-E/index.lock': Read-only file system
```

The writable source tree contains all changes. No commits could be created and
no Git metadata workaround was attempted. Suggested commit groups once Git is
writable: (1) weekly registry/fairness, (2) server loop fixes/audit,
(3) ResearchHub transport/Signals, (4) preview guard/deployment docs,
(5) dashboard hooks/tests/handoff. No push or deploy is needed to review them.

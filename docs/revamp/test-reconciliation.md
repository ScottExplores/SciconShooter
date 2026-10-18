# Job G — Legacy test reconciliation

Latest round-3 result: **1,782 pass / 7 fail / 12 existing skips** (44 starting failures → 7). See [Round 3](#round-3--reconciliation-after-job-i) for current changes, measured gaps, and evidence. The following sections preserve the round-2 history.

Round-2 legacy result: **1,766 passed, 14 failed, 12 skipped (1,792 entries)**. Starting round-1 result: **1,481 passed, 240 failed, 12 skipped (1,733 entries)**. Supplied remaster baseline: **44 failures**. No tests were deleted, disabled, newly skipped, or converted to unconditional passes. Repaired loaders discover previously aborted suites, increasing the executed case count.

Of the 200 failures introduced after remaster, **193 are resolved and seven remain visible**. Seven of the final failures also existed in the baseline; 37 of the original 44 baseline failures are now absent. The target of at most 44 failures is met. Remaining new failures concern authored content or stale measured evidence; no wallet/receipt/leaderboard/weekly-claim/settlement security test remains failing.

`npm run build`: **pass**, including Director exclusion. `npx tsc --noEmit`: **pass, zero diagnostics**. Top-level `api/*.js`: **12**. Final revamp suite and browser evidence are recorded below.

## Code corrections (category a)

- `api/leaderboard.js`: validate cutoff, name, session and wallet attribution before durable-receipt storage reads. The receipt/provenance check still precedes replay/save, and reissued proposal capabilities retain their explicit allowance. Existing zero-storage-on-invalid-request assertions pass.
- `api/researchhub-proposals.js`, `services/revamp/researchhub/serverFeed.js`: explicit referenced-proposal outages return 502, never an incomplete successful identity lookup. Ordinary public feed reads retain live/cache fallback. Error details expose only a bounded upstream status.
- `shared/campaignWaveMigration.js`, `services/campaignProgression.ts`, `api/_lib/walletProfiles.js`: exact historical per-mission IDs migrate through the revamp rename. Unknown/foreign IDs remain invalid; a shortened incomplete mission cannot become a clear/star/payout. Claims, result receipts and replay epochs survive.
- `services/gameplay/missionRewardWindow.ts` and small `// REVAMP(G):` engine hooks: major-boss finales keep five seconds of movable coin collection; regular clear-sweep and longer authored windows survive. Explicit Boss Sandbox weapon previews retain their legacy lifecycle instead of acquiring a second controller. Campaign/Weekly polished encounters remain covered by C's engine suite.
- `director/server/gameCampaignValidation.mjs`: restore parity with browser vocabulary and bounded onboarding/boss-wave schema. Negative validation cases remain.
- `services/supportShipPreview.ts`: rebuild the preview's formation declarations from its actual target cohort, preserving hostile targets and salvage without unused inherited bindings.
- `tools/restage-enemy-introductions.mjs`: audit the eight added roles without hiding missing art-family coverage or crowded debuts.

Test infrastructure uses real TS dependency loading and faithful new paid-reserve/durable-receipt fixtures. Negative provenance/durability cases retain independent raw mocks. Intended changes (category b) are grounded in [A](../../REVAMP_NOTES_A.md), [B](../../REVAMP_NOTES_B.md), [C](../../REVAMP_NOTES_C.md), [D](../../REVAMP_NOTES_D.md), [E](../../REVAMP_NOTES_E.md), [F](../../REVAMP_NOTES_F.md) and [the design](../REVAMP_DESIGN.md). Historical exact counts were replaced with bounded cadence, coverage, identity, timing and conservation checks. The economy report was regenerated from current data, without changing campaign JSON.

## Final failing list versus remaster

| Test/file | Baseline? | Cause and follow-up |
| --- | --- | --- |
| `tests/bottleneckDroneVisualRemake.test.cjs` — bottleneckDroneVisualRemake.test.cjs | Yes | Missing `director/node_modules/pngjs`; unchanged asset suite cannot load. |
| `tests/breakwaterAssets.test.cjs` — breakwaterAssets.test.cjs | Yes | Missing `director/node_modules/pngjs`; unchanged asset suite cannot load. |
| `tests/campaignNonBossBalanceMatrix.test.cjs` — checked-in non-boss runtime matrix covers every non-boss graph Mission and requested axis cell | No | Checked-in rev24 measurement artifact is stale. Rerun the actual 600-cell simulation after content/runtime tuning; do not edit digest or relabel old evidence. |
| `tests/campaignNonBossBalanceMatrix.test.cjs` — non-boss matrix artifact and Markdown remain tied to the current runtime source digest | Yes | Checked-in rev24 measurement artifact is stale. Rerun the actual 600-cell simulation after content/runtime tuning; do not edit digest or relabel old evidence. |
| `tests/combatEvolution.test.cjs` — combatEvolution.test.cjs | Yes | Missing `director/node_modules/pngjs`; unchanged asset suite cannot load. |
| `tests/eliteEnemyPixelStandard.test.cjs` — eliteEnemyPixelStandard.test.cjs | Yes | Missing `director/node_modules/pngjs`; unchanged asset suite cannot load. |
| `tests/enemyIntroductionStaging.test.cjs` — no enemy role is authored into the Campaign without ever being used | No | Protocol Vanguard has no active authored spawn; exact role/art coverage remains failing. Content belongs to job I. |
| `tests/paywallWallVisualRemake.test.cjs` — paywallWallVisualRemake.test.cjs | Yes | Missing `director/node_modules/pngjs`; unchanged asset suite cannot load. |
| `tests/playerPrimaryBurst.test.cjs` — playerPrimaryBurst.test.cjs | Yes | Missing `director/node_modules/pngjs`; unchanged asset suite cannot load. |
| `tests/protocolVanguardCampaign.test.cjs` — Mission 2 keeps early formations standard-size and reserves the Vanguard for Mission 4 | No | Protocol Vanguard has no active authored spawn; exact role/art coverage remains failing. Content belongs to job I. |
| `tests/sciconEnemyAuthoringDefaults.test.cjs` — retired introduction migration audits the complete legacy roster | No | Audit exposes missing Vanguard coverage and the three-family debut; its report/CLI failure is preserved. |
| `tests/sciconEnemyAuthoringDefaults.test.cjs` — retired introduction command is repeatable, non-mutating, and rejects write mode | No | Audit exposes missing Vanguard coverage and the three-family debut; its report/CLI failure is preserved. |
| `tests/sciconEnemySquadronAssets.test.cjs` — all twenty baseline roles and their spawns keep their assigned family | No | Protocol Vanguard has no active authored spawn; exact role/art coverage remains failing. Content belongs to job I. |
| `tests/sciconEnemySquadronAssets.test.cjs` — family debuts stay readable (thematic pairs at most) and Journal Raider waits for Mission 5 | No | Mission 17 Wave 3 introduces three new visual families simultaneously; readability guarantee remains failing. |

Six test entries expose two actual authored defects (missing Vanguard and crowded family debut); two matrix entries expose one stale evidence artifact. Campaign JSON and all original art are unchanged. The six missing-dependency file failures are inherited environment failures. Existing 12 skips are unchanged.

## Every touched test file

Category **a** preserves a correctness/security contract (including repairing its loader/fixture); **b** asserts a documented intended design change. Mixed rows identify both. Each row covers all affected cases and preserved guarantees in that file; the original per-case failures are classified in the next table. New regression files are included.

| Test file | Category | What changed / rigor retained |
| --- | --- | --- |
| `tests-revamp/E/researchhub-server.test.mjs` | a | Correct E's permissive 200-on-explicit-lookup-outage test: requested identity must fail closed with 502; ordinary live feed still returns 200 and exact results. Neither missing nor closed status is fabricated. |
| `tests-revamp/G/runtime-contracts.test.mjs` | a | Actual engine verifies zero-authored-delay major boss gets 300 movable collection ticks; pure regular/long-window boundaries; manual collection and repeated takeoff banking credit one coin exactly once. |
| `tests/arcadeMissionPacing.test.cjs` | b | REVAMP_NOTES_B.md: generated sectors 1–3 use clear-driven 1/6/7-wave encounters, deliberate recovery and smaller role-specific groups; keep bounded cadence, event timing, role budgets, historical alias integrity and all late-sector assertions. |
| `tests/audioLifecycle.test.cjs` | a/b | Bundle the real synth dependency; model trusted activation and WebAudio node cleanup. A deliberately adds a bounded noise transient, click-free research envelope, synthesized UI and four retained sample fetches. Preserve exact family frequency, throttle, mute, zero-volume, page suspend/resume, voice ownership and music-loop guarantees; assert no graph before real activation. |
| `tests/audioPauseLifecycle.test.cjs` | b | Follow A's extracted music-duck restoration while still requiring page silence, selected gain restoration, pause offset and shared settings ownership. |
| `tests/bossArchiveChallengeServer.test.cjs` | a, fixture | D authoritative paid-reserve read mocked; wallet-bound signed attempts, launch charges, expired replay, daily rollover and exactly-once settlement remain unchanged. |
| `tests/bossAttackReadability.test.cjs` | b | B's bounded 2–8-wave early boss lead-ins replace the v24 two-wave snapshot. Keep exactly one terminal boss and all exact boss weapon/health/warning values. |
| `tests/bossCoinBurst.test.cjs` | b | Follow D's fractional Fortune credit with one idempotent coin receipt; retain common active/passive motion, banking and summary refresh assertions. Runtime duplicate-credit check added in G. |
| `tests/breakwaterSector.test.cjs` | b | REVAMP_NOTES_B.md: first-minute swoop and teaching boss, role-specific wings and recovery after checkpoints; retain catalog/topology/reward identities, active caps, visible single-file births, real hostile shots and complete real-projectile Mission 5 lifecycle. Bot flanks shield-bearers and respects normal finger offset. |
| `tests/campaignBossArtworkRegistry.test.cjs` | b | E rotates three bosses per week. Inspect 54 seeded weeks, require three identities each week and retain exact artwork/timeline/rig/component checks for all three promoted late commanders. |
| `tests/campaignBranchEconomy.test.cjs` | a (obsolete exact income proven) | REVAMP_NOTES_B.md changes wave income; remove obsolete exact 1,576 snapshot, retain integer income and original 3% minimum / one-third maximum economic guarantees. |
| `tests/campaignBranchServerSettlement.test.cjs` | a, fixture | Same reserve read modeled; Present Drop/combat route locks, completion timing/proof, forged rewards, concurrent settlements and one-time claim assertions remain intact. |
| `tests/campaignCheckpointMigration.test.cjs` | a | New browser/API regressions prove exact historical aliases, partial checkpoint conservation, foreign/current-revision rejection, receipt/replay-epoch preservation and no clear/star/payout from shortened unfinished missions. |
| `tests/campaignEconomySimulation.test.cjs` | b | REVAMP_NOTES_B.md changes wave counts/income. Independently calculate authored wave and clear rewards; prove every mission/sector/totals envelope, upgrade price/affordability and exact bank conservation. Regenerate deterministic economy report; reward and purchase catalogs remain pinned. |
| `tests/campaignEnemySpecialAttackRuntime.test.cjs` | b | B imposes 42 active frames of visible entry grace. Assert no projectile/queued laser during grace, then retain original ring/mine/laser attack timing and synchronization checks. |
| `tests/campaignExpansionAssets.test.cjs` | b | REVAMP_NOTES_B.md changes revision and early lead-in length. Preserve all ten exact roster/art identities, sector order, one boss, and final boss-only completion; use bounded authored cadence instead of exact2 waves. REVAMP_NOTES_B.md adds recovery after early checkpoints. Find the single encounter across the whole mission; retain exact mini-boss roster and sprite mappings. |
| `tests/campaignFormationAuthoring.test.cjs` | b / a | REVAMP_NOTES_B.md adds packs and reauthors early waves: derive grouped count, keep byte-identical normalization and topology; new browser/server schema parity test rejects unknown path IDs, invalid small non-onboarding missions and oversized boss missions (a). |
| `tests/campaignFormationBudget.test.cjs` | b | REVAMP_NOTES_B.md replaces Breakwater-specific pack snapshot with exhaustive actual role-to-pack compatibility plus warning bounds; keeps every global coverage/cooldown assertion. |
| `tests/campaignFormationChoreographyAuthoring.test.cjs` | b | REVAMP_NOTES_B.md: all 18 first-three-sector missions/routes carry authored choreography; validate bounded cadence, complete pack defaults and overrides; retain idempotence/topology and refuse stale one-shot migration for missing Wave IDs. |
| `tests/campaignGraphProgression.test.cjs` | a | Load real graph dependencies after extraction while preserving all explicit campaign/catalog stubs. Graph branch, sibling selection, route rejection, mastery, checkpoint and migration assertions are unchanged. |
| `tests/campaignProgression.test.cjs` | a/b | Load actual progression dependencies. Assert current authored wave cardinalities while preserving score/unlock/reset/receipt behavior; a partial old checkpoint cannot automatically clear a shortened mission. |
| `tests/campaignRepairFlows.test.cjs` | b | D adds stable narrative IDs: exercise edited copy, distinct same-title beats, day/profile isolation and legacy phase:title fallback. Retain storage integration hooks. |
| `tests/campaignWalletRoundtrip.test.cjs` | a (harness) | Client sanitizer wrong-Mission/right-Wave pairing: transpile the real campaignGraph dependency instead of feeding raw TS to Node; assertions unchanged. |
| `tests/campaignWeeklyIsolation.test.cjs` | a (harness) | All isolation/progression cases: load new D progression dependencies through the real service graph; fixture campaign and assertions unchanged. |
| `tests/combatLabMissionLifecycle.test.cjs` | b | C's profile name overrides the existing name only when present; still one canonical HUD with the real HP presentation and no duplicate meter. |
| `tests/combatLightingAndImpact.test.cjs` | b | A routes enemy explosions through the tiered pool. Assert exact delegation and bounded light emission there, preserving normal smoke/debris blending. |
| `tests/customFormationAuthoring.test.cjs` | a | Load real relative TS dependencies introduced by B; all custom geometry/normalization/precedence assertions unchanged. |
| `tests/enemyFormationRuntime.test.cjs` | a | Same real-module loader repair; exact escort-leader/guard geometry assertions unchanged. |
| `tests/enemyIntroductionStaging.test.cjs` | b | REVAMP_NOTES_B.md teaches eight new roles in sectors1–2; sector3 combines at least six learned roles, later sectors still debut specialists. Unused-role assertion is unchanged and still fails honestly for Protocol Vanguard. |
| `tests/enemyWaveDiversity.test.cjs` | b | REVAMP_NOTES_B.md uses deterministic one-role wings in first3 sectors. Assert multiple tactical roles per mission and intact mixed late pools; signatures include actual path/attack/rhythm. Weekly legacy pool diversity and late-pack debut/cooldown assertions stay strict. |
| `tests/formationSeparation.test.cjs` | b | REVAMP_NOTES_B.md inserts projectile-budget gate before collisions and fixes revamp movement at mobile correction speed on every device. Source contract updated without dropping separation/order/bound checks. |
| `tests/gameCampaignConfig.test.cjs` | b | REVAMP_NOTES_B.md changes early cadence, adds Peer Reviewer and recovery waves, repositions checkpoint bosses and uses null mission clock. Assert counts within schema bounds, all topology/IDs, budget/order/telegraph invariants, catalog health/rewards; effective major-boss reward window remains exactly5s. |
| `tests/gameplayNetworkResilience.test.cjs` | b; a guarantee retained | “wallet hydration cannot replace the immutable loadout”: assert exact new Weekly/Campaign/lab loadout branches, still forbid hydration overwrite and require snapshot before keyed mount. D/E document mode-isolated loadouts. |
| `tests/gameplayPacingRegression.test.cjs` | a/b | D inline comms keep play active while modal/entrance gates remain; D extra projectiles remain capped. G restores effective 5s boss collection without editing content. All sector boss health/pressure and movement bounds stay strict. |
| `tests/gameplayRuntimeModules.test.cjs` | a | Same real-module loader repair; deterministic geometry, entry variation, bounded dives and compatibility assertions unchanged. |
| `tests/gatekeeperPrimeRuntime.test.cjs` | b | B permits longer bounded early lead-ins; require exactly one final commander and retain exact source ID, rig and sprite. |
| `tests/generatedBossArchetypes.test.cjs` | b | Same bounded lead-in change; preserve all ten slot identities, exact generated/dedicated runtime mapping, and terminal boss placement. |
| `tests/leaderboardApi.test.cjs` | a, code + fixture | Production validation precedence restored; paired durable rows model E requirement; signed metrics, zero score, idempotent races, schema readiness, rankings, proposal eligibility/leader races/wallet auth preserved. Added explicit inserted-score/wave tamper assertions; invalid-request raw counters observe receipt reads too. |
| `tests/leaderboardWalletAttribution.test.cjs` | a, code + fixture | Paired durable rows; malformed session and cross-wallet errors precede storage again, guest anonymity and signed-wallet ownership preserved. Outer counter observes every request, including receipt reads. |
| `tests/missionRecordShipAndTimer.test.cjs` | b; a attribution guarantee retained | “selected ship identity travels through the signed receipt”: accept E's explicit ResearchHub-only Weekly ternary while preserving all downstream receipt, stored identity and preview checks. |
| `tests/missionScoreEntryFlow.test.cjs` | a, obsolete syntax proven | F permits a QA-only selected wave; assert the explicit QA conditional while normal Campaign restarts still choose Wave 1 and no paid Continue. |
| `tests/ownerPilotTestMode.test.cjs` | b | E's stable component helper passes the setter directly; still require test-champion branch, isolated preview controls and ordinary pause-menu integration. |
| `tests/paywallHelmetHullLinkRuntime.test.cjs` | b | C clamps new boss phase damage and excludes polished encounters from old helmet detach; explicitly assert both paths while retaining legacy helmet-to-hull routing and no duplicate full-boss part bars. |
| `tests/pilotProfile.test.cjs` | a (source assertion compatibility) | “paid ship access remains scoped…”: require D's extra `mergeRevampProgress(target.revamp, source.revamp)` between unchanged boss/campaign merge and timestamp; wallet-scoped ownership assertions untouched. |
| `tests/pixiEnvironmentRoute.test.cjs` | b | B changes early tactical roles. Require every actual enemy's registered sprite, preserved approved ground roster, no asteroid belt and no early Journal Raider. |
| `tests/playerLifeRuntime.test.cjs` | b | D absorbs shield damage before the existing per-hit life clamp; require that exact flow and unchanged accepted-damage/life-boundary accounting. |
| `tests/playerRunHistory.test.cjs` | a, fixture | Persisted weekly mode/test flag/hash and durable receipt read added; exact verified leader pinning, reissued proof and wallet-session proposal recovery preserved. |
| `tests/proposalFunding.test.cjs` | b | “both proposal surfaces use shared funding order…”: follow E extraction from StartScreen into SignalsPanel; assert mounting/data prop, same shared sorter/amount formatter, and no synthetic funding in either surface. |
| `tests/recordCard.test.cjs` | b | B changes early finale enemies. Independently obtain the final spawn's registered asset from authored data; retain embedded asset/ship/score/date values, late boss art and exclusion of legacy fallback. |
| `tests/remasterFoundation.test.cjs` | a | Resolve B's extracted formation imports; all deterministic swoop, scaling, calendar and admin-gate tests unchanged. |
| `tests/researchHubProposalEligibility.test.cjs` | a | E extracts transport. Replace stale source checks with actual header-stall and body-stall timeouts; require 12s production default, request abort and timely rejection. |
| `tests/roamingBossAndElitePresentation.test.cjs` | b | B replaces fixed ring scripts with splines/returning dives. Require path and shape diversity, breathing, bounded group size, >=0.6s warnings, reform, bossless mission and unchanged real boss runtime/HUD contracts. |
| `tests/rscBalancePresentation.test.cjs` | a | Execute actual TS formatter on Node20; exact big-integer truncation/grouping assertions unchanged. |
| `tests/runReceipts.test.cjs` | a, obsolete authored totals proven | B/C changed opening wave/boss counts. Compute expected signed score independently using explicit score weights and authored mastery criteria; derive exact enemy total from actual fixture outcome. Original client-tampering, signed metrics, identity and proof-hash assertions remain. |
| `tests/sampleSoundEffects.test.cjs` | b | A adds layered shot/UI/explosion cues. Preserve every original sample asset, routing/cooldown contract, and assert exact shot layers plus three explosion thresholds. |
| `tests/sciconAdvancedEnemyProgression.test.cjs` | b | REVAMP_NOTES_B.md adds eight roles/nine packs and reauthors early routes. Keep exact 25 legacy roles/41 legacy packs, all five late-hull contracts, deterministic nonmutating old authoring, 29 late cohorts and retained eight legacy remix waves. |
| `tests/sciconEnemyAuthoringDefaults.test.cjs` | a / b | Audit recognizes new revamp role schedule/art aliases (a) and expectations now include33 roles with25 distinct preserved art families (b). Do not hide missing Vanguard or triple-family debut; these tests remain failing until content repaired. |
| `tests/sciconEnemySquadronAssets.test.cjs` | b | REVAMP_NOTES_B.md: count25 original roles separately from eight new aliases. Keep exact baseline sprite set and family-introduction readability; both existing content gaps still fail. |
| `tests/sectorEscalation.test.cjs` | a | Source integration assertion follows canonical resolveRuntimeFormationChoreography adapter into unchanged sector-aggression policy; fixes stale baseline direct-helper spelling. |
| `tests/spaceRunCampaignConfig.test.cjs` | b | Require revamp revision while preserving all exact scenery IDs/assets/dimensions and validator rejection behavior. |
| `tests/squadHangarFlow.test.cjs` | b | “Hangar available to device Pilots”: assert stable `renderDashboardNav({docked:true})` helper (E remount fix). “position-driven squad bay”: earned D left/right wing unlock labels and disabled locked slots replace obsolete RSC unlock-button display; existing purchase-resume/status and Token exchange assertions retained. “main ship upgrades isolated”: assert E ranked-ship branch plus unchanged campaign selected-ship launch. |
| `tests/stageTerminology.test.cjs` | b | “top-level progress as Mission…”: D contextual kicker retains Sector fallback, new finale copy; every Mission/Wave compatibility assertion retained. |
| `tests/startScreenWeeklyCard.test.cjs` | b | “drawer omits ship thumbnail…”: exact E practice exemption and unknown-wallet-quota behavior. “static quota-driven CTA”: Practice/Fly Run labels. “Past Picks…”: pending-funding is a champion-selected allocation alongside claimed/funded. All no-paid-attempt and archive-integrity assertions retained. |
| `tests/supportShipPreview.test.cjs` | a | Fix preview generator's obsolete inherited formation-pack declarations. Add exact declared-pack count and complete role coverage assertions; retain canonical schema validation, five real target cohorts, five salvage groups and timeline bounds. |
| `tests/transmissionPauseUi.test.cjs` | b | “story transmissions…”: retained vault assertions plus real loaded D 10 sector openers/41 unique beats, intro/midpoint/boss/victory coverage, inline delivery, timer cleanup and skip control. Replaces obsolete exact old prose/ten literal `phase` fields. |
| `tests/upgradeAffordance.test.cjs` | b | “pixel action buttons…”: direct PLAY for new pilots with resumable checkpoint label afterward. “Hangar readiness…”: earned D wing unlock/locked-slot gating replaces obsolete paid-slot affordability, while all actual main/support purchase/max-level affordability tests remain. |
| `tests/walletProfileApi.test.cjs` | a, fixture | Same reserve read; session challenge/nonce, identity, auth and revision CAS unchanged. |
| `tests/walletProfileClient.test.cjs` | a (harness) | “same-device sync churn stays recoverable with bounded retry backoff”: execute actual TS policy; retry/status assertions unchanged. |
| `tests/walletProfileDirtyStore.test.cjs` | a (harness) | All 14 dirty-store tests: actual TS load; address scoping, old-write acknowledgement, semantic equality, conflicts, settlement reserves and exactly-once paid Token credit assertions unchanged. |
| `tests/walletProfileSchema.test.cjs` | a (obsolete content fixtures proven) | “Weekly streak recomputes score”: include actual authored opening mini-boss and derive exact expected point total from unchanged public score weights/content; injected score remains rejected. “strict Mission-Wave pairing”: model a true partial prefix when B's first mission has one wave, retain foreign-wave/reward sanitization. “rev21 partial checkpoint…”: exercise real migration, assert partial never becomes a clear and replay epoch survives. Old exact wave counts were obsolete per B's one-wave opening. |
| `tests/walletProfileSessionBehavior.test.cjs` | a (harness) | All five reconnect/session/wallet mismatch/auth-failure tests: execute actual TS resolver; all auth/signature/request-count assertions unchanged. |
| `tests/walletTokenSpends.test.cjs` | a (harness) | All token-spend/economy cases: load real D progression dependency while retaining existing explicit wallet fixtures and every money assertion. |
| `tests/waveCompletion.test.cjs` | b / a | REVAMP_NOTES_B.md permits longer lead-ins and post-checkpoint recovery; all schedule/hostile/warning completion guarantees retained. Root restored effective5s boss reward window and owns final test (a). |
| `tests/waveLevelPresentation.test.cjs` | b | “story transmission uses enclosing level identity”: executes all current missions and asserts phase/mission routing parity, first cold-open and out-of-range null; replaces one obsolete Open Orbit title match. |
| `tests/weaponOverdrive.test.cjs` | a | G extracts reward-window policy. Assert actual 2.5s coin sweep and preservation of a longer authored delay, plus engine delegation and unchanged collection path. |
| `tests/weaponTierProgression.test.cjs` | b | D adds earned projectiles before the existing maximum; assert exact capped expression and retain all shot bundle/lane guarantees. |
| `tests/weeklyCampaignRuntimeIntegration.test.cjs` | b | “Weekly Run home-screen mode…”: count both actual refusal surfaces; specifically require QA refusal text and home `role=alert` display (E/F). Campaign/Weekly isolation assertions unchanged. |
| `tests/weeklyClaimAtomicity.test.cjs` | a, fixture | Complete receipt fields added to existing explicit mock; concurrent claims, nonce consumption, stale winners, wallet ownership and exact single-row commit assertions unchanged. |
| `tests/weeklyCompetition.test.cjs` | a, fixture | Valid UUID/hash + complete matching receipt fixtures preserve cutoff, provenance, winner selection, claim/finalizer CAS races and backfill. Obsolete query assertion reversed to require E's verified-only database prefilter; review-row exclusion still asserted behaviorally. Raw provenance-zero negative now uses otherwise-valid hash/mode/date fields so it exercises provenance itself. |
| `tests/weeklyContinuousRuntime.test.cjs` | b, fixture only | E's seeded rotation makes old fixed week obsolete. Find a week containing Paywall Wall at depth 2; retain exact six mobile segments, only-last-segment elite credit, six regular kills, zero major credit and duplicate-destruction idempotency. Cite `REVAMP_NOTES_E.md`. |
| `tests/weeklyProposalAuthorization.test.cjs` | a (harness) | All challenge freshness/retry/authorization tests: transpile actual service; no assertion/fixture changes. |
| `tests/weeklyProposalDisplay.test.cjs` | a (harness) | All exact saved-proposal metadata resolution tests: transpile actual service; no assertion changes. |
| `tests/weeklyProposalLifecycle.test.cjs` | a (harness) | All completion/availability lifecycle tests: transpile real proposalFunding dependency; original lifecycle assertions unchanged. |
| `tests/weeklyProposalRecovery.test.cjs` | a (harness) | All recovery/ownership/reminder tests: transpile real funding/reminder dependencies; capability and recovery guarantees unchanged. |
| `tests/weeklyProposalRecoveryUi.test.cjs` | b (proven obsolete UI assertion) | Mandatory chooser still requires a choice in healthy mode; exact E feed-error/empty/save-error escape conditions now asserted, with recovery ability, ownership, durable capabilities and save retry checks retained. E explicitly documents this to avoid trapping players during outage. |
| `tests/weeklyProposalReminder.test.cjs` | a (harness) | All reminder key/timestamp/rate-limit tests: transpile actual TS; assertions unchanged. |
| `tests/weeklyProposalSessionReuse.test.cjs` | a, fixture | Paired durable receipts; same-wallet reuse and foreign-wallet denial unchanged. |
| `tests/weeklyRunAttempts.test.cjs` | a, obsolete syntax proven | Match E's explicit `!isPreviewMode()` quota guard; real ranked admission remains server-reserved/atomic, while preview practice is no-write (separately verified by E preview suite). |
| `tests/weeklyRunGenerator.test.cjs` | b | E replaces full-catalog-per-week cycles with three-boss weekly rotation. Validate two-elites/one-major, selected strength ordering, exclusion of unselected bosses, complete catalog coverage across 32 seeded weeks, depth HP bounds, modular component-ratio preservation. Find a rotating week that actually contains a modular boss. Cite `REVAMP_NOTES_E.md`. |
| `tests/weeklyRunPersistence.test.cjs` | a, obsolete identity proven | E selects two elites + one major weekly, so fixed old boss-name fixtures are obsolete. Assert exact selected registry identities/categories; all canonical receipt, impossible outcome, forged credit, telemetry omission and signature guarantees unchanged. |

## Original failure ledger

All 240 starting failures are listed, including the 40 shared with the supplied baseline. “Pass” also includes renamed cases whose new contract passes in the final full run. File-load failures expand into individual cases after loader repair. This ledger does not treat an obsolete exact content count as a security exemption.

| Original test | File | Decision | Final |
| --- | --- | --- | --- |
| revision 24 uses compact continuous Missions with authored pressure through every climax | `tests/arcadeMissionPacing.test.cjs` | b | Pass |
| major bosses follow one active intercept and a short direct alert | `tests/arcadeMissionPacing.test.cjs` | b | Pass |
| formation concurrency and migration metadata match the faster Campaign | `tests/arcadeMissionPacing.test.cjs` | b | Pass |
| arcade swarms grow by sector and later sectors do not recycle one formation script | `tests/arcadeMissionPacing.test.cjs` | b | Pass |
| match music arrows wrap and Campaign sectors advance from the selected track | `tests/audioLifecycle.test.cjs` | a/b | Pass |
| non-RSC primary voice identity uses one click-safe oscillator per existing event | `tests/audioLifecycle.test.cjs` | a/b | Pass |
| voice ownership restores RSC and older preview cleanup cannot clobber a new canvas | `tests/audioLifecycle.test.cjs` | a/b | Pass |
| primary voice polish preserves rapid-fire throttling, mute, and hidden-page silence | `tests/audioLifecycle.test.cjs` | a/b | Pass |
| UI interaction initializes only WebAudio and never creates or plays background media | `tests/audioLifecycle.test.cjs` | a/b | Pass |
| only interface samples fetch eagerly and full SFX preparation contains no music request | `tests/audioLifecycle.test.cjs` | a/b | Pass |
| decoded UI samples still produce immediate interface feedback | `tests/audioLifecycle.test.cjs` | a/b | Pass |
| sound-effects volume and global mute control the SFX bus | `tests/audioLifecycle.test.cjs` | a/b | Pass |
| persisted match-track selection restores valid ids and rejects invalid ids | `tests/audioLifecycle.test.cjs` | a/b | Pass |
| setting the match track updates the active selection and persisted value | `tests/audioLifecycle.test.cjs` | a/b | Pass |
| match music loops while the defeat stinger remains one-shot | `tests/audioLifecycle.test.cjs` | a/b | Pass |
| page lifecycle suspends and resumes the SFX context without media elements | `tests/audioLifecycle.test.cjs` | a/b | Pass |
| server-side simulations can import and prepare audio without a media-element global | `tests/audioLifecycle.test.cjs` | a/b | Pass |
| pausing a mission silences only music and resumes the selected loop | `tests/audioPauseLifecycle.test.cjs` | b | Pass |
| a signed Boss Archive run settles once and an expired retry restores the ledger result | `tests/bossArchiveChallengeServer.test.cjs` | a, fixture | Pass |
| Challenge tokens are wallet-bound and failed outcomes cannot reach settlement | `tests/bossArchiveChallengeServer.test.cjs` | a, fixture | Pass |
| the database remains authoritative when another clear consumes the last daily charge | `tests/bossArchiveChallengeServer.test.cjs` | a, fixture | Pass |
| Challenge start rejects bosses not present in the canonical wallet profile | `tests/bossArchiveChallengeServer.test.cjs` | a, fixture | Pass |
| three starts consume all daily charges even when no fight is settled | `tests/bossArchiveChallengeServer.test.cjs` | a, fixture | Pass |
| settlement rows do not consume launch charges for the current UTC day | `tests/bossArchiveChallengeServer.test.cjs` | a, fixture | Pass |
| a launch retry across UTC reset keeps its receipt and spends no fresh charge | `tests/bossArchiveChallengeServer.test.cjs` | a, fixture | Pass |
| Mission 10 Paywall Decimator keeps its authored burst budget while charged lanes stay readable | `tests/bossAttackReadability.test.cjs` | b | Pass |
| gameplay keeps boss coins collectible through rewards, then banks and clears them for takeoff | `tests/bossCoinBurst.test.cjs` | b | Pass |
| bottleneckDroneVisualRemake.test.cjs | `tests/bottleneckDroneVisualRemake.test.cjs` | a — baseline | FAIL — retained above |
| breakwaterAssets.test.cjs | `tests/breakwaterAssets.test.cjs` | a — baseline | FAIL — retained above |
| Breakwater is the ordinary first sector, not a lab campaign or a new progression path | `tests/breakwaterSector.test.cjs` | b | Pass |
| original opening environments retain the updated Breakwater encounters | `tests/breakwaterSector.test.cjs` | b | Pass |
| streamed and overlapping cohorts stay under actual role, formation and wave limits | `tests/breakwaterSector.test.cjs` | b | Pass |
| salvage lightens pressure before existing checkpoint bosses without changing their identities or rewards | `tests/breakwaterSector.test.cjs` | b | Pass |
| the regular mobile Mission launches a separated ribbon through the left gate | `tests/breakwaterSector.test.cjs` | b | Pass |
| the complete ordinary gate Mission advances from its lead-in to boss destruction and a real Mission summary | `tests/breakwaterSector.test.cjs` | b | Pass |
| Weekly Run clones the canonical promoted boss events with only run-specific tuning | `tests/campaignBossArtworkRegistry.test.cjs` | b | Pass |
| Present Drop ceiling remains a minority bonus beside the next five-mission sector | `tests/campaignBranchEconomy.test.cjs` | a (obsolete exact income proven) | Pass |
| Present Drop attempt tokens are signed, wallet-bound, and bound to authored duration | `tests/campaignBranchServerSettlement.test.cjs` | a, fixture | Pass |
| every canonical configured Campaign branch can issue a wallet-bound attempt | `tests/campaignBranchServerSettlement.test.cjs` | a, fixture | Pass |
| successful Present Drop settlement rejects forged totals and credits one stable receipt exactly once | `tests/campaignBranchServerSettlement.test.cjs` | a, fixture | Pass |
| connected combat branch success requires authored timing and explicit completion proof, then awards only its fixed reward once | `tests/campaignBranchServerSettlement.test.cjs` | a, fixture | Pass |
| failed and interrupted combat attempts award zero and leave the one-time route retryable | `tests/campaignBranchServerSettlement.test.cjs` | a, fixture | Pass |
| simultaneous settlement of one attempt commits once and returns the stable receipt to both callers | `tests/campaignBranchServerSettlement.test.cjs` | a, fixture | Pass |
| two sessions racing different attempts can claim a one-time branch only once | `tests/campaignBranchServerSettlement.test.cjs` | a, fixture | Pass |
| failed Present Drop attempts award zero, do not claim the branch, and allow a new retry | `tests/campaignBranchServerSettlement.test.cjs` | a, fixture | Pass |
| locked combat branches are rejected from canonical server profile state | `tests/campaignBranchServerSettlement.test.cjs` | a, fixture | Pass |
| founder-locked combat branches are rejected from canonical server profile state | `tests/campaignBranchServerSettlement.test.cjs` | a, fixture | Pass |
| already-claimed combat branches are rejected from canonical server profile state | `tests/campaignBranchServerSettlement.test.cjs` | a, fixture | Pass |
| locked Present Drop branches remain rejected from canonical server profile state | `tests/campaignBranchServerSettlement.test.cjs` | a, fixture | Pass |
| Mission 05 mastery preserves the original concrete, data-driven Present Drop branch | `tests/campaignBranchesConfig.test.cjs` | a | Pass |
| campaign branches remain optional and Supply Drops use a dedicated validated event contract | `tests/campaignBranchesConfig.test.cjs` | a | Pass |
| revision-24 economy reports main, alternate-route, and mastery envelopes for all ten sectors | `tests/campaignEconomySimulation.test.cjs` | b | Pass |
| economy simulation consumes premium-adjusted support and main-ship costs from the runtime catalog | `tests/campaignEconomySimulation.test.cjs` | b | Pass |
| checked-in economy report is deterministic, current, and free of mojibake | `tests/campaignEconomySimulation.test.cjs` | b | Pass |
| authored ring and mine specialists execute without redundant elite spawn flags | `tests/campaignEnemySpecialAttackRuntime.test.cjs` | b | Pass |
| authored lane laser owns a readable charge and synchronized fire frame | `tests/campaignEnemySpecialAttackRuntime.test.cjs` | b | Pass |
| every revision-24 sector ends in one authored major-boss Mission | `tests/campaignExpansionAssets.test.cjs` | b | Pass |
| each sector checkpoint and boss-preparation Mission ends with an authored mini-boss | `tests/campaignExpansionAssets.test.cjs` | b | Pass |
| formation normalization is idempotent and never changes Campaign route topology | `tests/campaignFormationAuthoring.test.cjs` | b / a | Pass |
| tracked Campaign resolves every grouped spawn to one declared compatible formation pack | `tests/campaignFormationBudget.test.cjs` | b | Pass |
| current Campaign retains its newer topology and complete pack choreography defaults | `tests/campaignFormationChoreographyAuthoring.test.cjs` | b | Pass |
| the first sector authors every grouped flight while later Mission overrides remain surgical | `tests/campaignFormationChoreographyAuthoring.test.cjs` | b | Pass |
| the legacy one-shot recipe refuses changed first-sector authoring instead of overwriting its flights | `tests/campaignFormationChoreographyAuthoring.test.cjs` | b | Pass |
| campaignGraphProgression.test.cjs | `tests/campaignGraphProgression.test.cjs` | a | Pass |
| checked-in non-boss runtime matrix covers every non-boss graph Mission and requested axis cell | `tests/campaignNonBossBalanceMatrix.test.cjs` | a — unresolved evidence/content | FAIL — retained above |
| non-boss matrix artifact and Markdown remain tied to the current runtime source digest | `tests/campaignNonBossBalanceMatrix.test.cjs` | a — baseline | FAIL — retained above |
| campaignProgression.test.cjs | `tests/campaignProgression.test.cjs` | a/b | Pass |
| story transmissions are remembered per beat, day, and active player profile | `tests/campaignRepairFlows.test.cjs` | b | Pass |
| client Campaign sanitizer rejects globally valid Waves paired with the wrong Mission | `tests/campaignWalletRoundtrip.test.cjs` | a (harness) | Pass |
| campaignWeeklyIsolation.test.cjs | `tests/campaignWeeklyIsolation.test.cjs` | a (harness) | Pass |
| combatEvolution.test.cjs | `tests/combatEvolution.test.cjs` | a — baseline | FAIL — retained above |
| Lab leaves boss health to the same canonical Pixi HUD instead of stacking a second meter over it | `tests/combatLabMissionLifecycle.test.cjs` | b | Pass |
| high-value effects emit bounded light while smoke and debris stay normally blended | `tests/combatLightingAndImpact.test.cjs` | b | Pass |
| schema-v1 decompile and compile are byte-order and behavior preserving for the current campaign | `tests/contentPackageCompiler.test.cjs` | a | Pass |
| the shared formation runtime resolves authored slots before built-in geometry | `tests/customFormationAuthoring.test.cjs` | a | Pass |
| eliteEnemyPixelStandard.test.cjs | `tests/eliteEnemyPixelStandard.test.cjs` | a — baseline | FAIL — retained above |
| escort pods place a leader at the centre of a ring of guards | `tests/enemyFormationRuntime.test.cjs` | a | Pass |
| every sector introduces at least one enemy the player has not fought yet | `tests/enemyIntroductionStaging.test.cjs` | b | Pass |
| no enemy role is authored into the Campaign without ever being used | `tests/enemyIntroductionStaging.test.cjs` | a — unresolved evidence/content | FAIL — retained above |
| Campaign waves keep mixed cohorts and avoid repeated copy-paste signatures | `tests/enemyWaveDiversity.test.cjs` | b | Pass |
| Weekly Run debuts late packs once per band and cools down recent formations | `tests/enemyWaveDiversity.test.cjs` | b | Pass |
| the engine applies separation only to assembled holders before collision work | `tests/formationSeparation.test.cjs` | b | Pass |
| revision 24 contains ten five-depth sectors, explicit routes, and a compact arcade Wave cadence | `tests/gameCampaignConfig.test.cjs` | b | Pass |
| ten deliberate mini-bosses occupy both checkpoint Missions in every sector | `tests/gameCampaignConfig.test.cjs` | b | Pass |
| mission records enlarge the complete boss rig and the Paywall Siege mini-boss is visually larger | `tests/gameCampaignConfig.test.cjs` | b | Pass |
| sector Missions expose ordered role-specific Waves with short major-boss lead-ins | `tests/gameCampaignConfig.test.cjs` | b | Pass |
| each sector finale runs one active intercept directly into its boss and keeps the reward window | `tests/gameCampaignConfig.test.cjs` | b | Pass |
| elite checkpoints and boss-preparation climaxes remain bounded and non-decreasing across ten sectors | `tests/gameCampaignConfig.test.cjs` | b | Pass |
| non-boss Missions overlap readable formations with loose interceptors | `tests/gameCampaignConfig.test.cjs` | b | Pass |
| each non-boss Mission teaches before it peaks and budgets cover every authored Wave | `tests/gameCampaignConfig.test.cjs` | b | Pass |
| recovery pickups and light drifters arrive during active pressure instead of a quiet Wave | `tests/gameCampaignConfig.test.cjs` | b | Pass |
| each sector teaches all four tactical enemy classes through role-bound spawn definitions | `tests/gameCampaignConfig.test.cjs` | b | Pass |
| wallet hydration cannot replace the immutable loadout of a mounted flight | `tests/gameplayNetworkResilience.test.cjs` | b; a guarantee retained | Pass |
| the ship completes its protected entrance before Brian pauses combat | `tests/gameplayPacingRegression.test.cjs` | a/b | Pass |
| formations stay visual and ten sector bosses provide an intentional five-second loot window | `tests/gameplayPacingRegression.test.cjs` | a/b | Pass |
| Research keeps tight fire-rate tiers while BIO swaps to equal-damage straight twin rails | `tests/gameplayPacingRegression.test.cjs` | a/b | Pass |
| formation geometry is deterministic across custom, built-in, and entry plans | `tests/gameplayRuntimeModules.test.cjs` | a | Pass |
| authored pack directions and role behaviors deterministically vary formation entries | `tests/gameplayRuntimeModules.test.cjs` | a | Pass |
| formation dives use deterministic shape-appropriate squad maneuvers with bounded speed | `tests/gameplayRuntimeModules.test.cjs` | a | Pass |
| formation compatibility layouts preserve the DNA and ring fleet geometry | `tests/gameplayRuntimeModules.test.cjs` | a | Pass |
| Mission 5 ends its authored runway with a dedicated Gatekeeper Prime encounter | `tests/gatekeeperPrimeRuntime.test.cjs` | b | Pass |
| the revision-24 Campaign roster resolves through generated or dedicated boss runtimes by slot | `tests/generatedBossArchetypes.test.cjs` | b | Pass |
| leaderboard derives score and wave from the signed receipt | `tests/leaderboardApi.test.cjs` | a, code + fixture | Pass |
| leaderboard accepts a verified zero score without a rank threshold | `tests/leaderboardApi.test.cjs` | a, code + fixture | Pass |
| leaderboard rejects an unexpired receipt after its weekly score cutoff without touching storage | `tests/leaderboardApi.test.cjs` | a, code + fixture | Pass |
| leaderboard treats a replayed run ID as an idempotent save | `tests/leaderboardApi.test.cjs` | a, code + fixture | Pass |
| leaderboard treats a duplicate insert race as an idempotent save | `tests/leaderboardApi.test.cjs` | a, code + fixture | Pass |
| leaderboard keeps verified receipt identity when only proposal_image_url is unavailable | `tests/leaderboardApi.test.cjs` | a, code + fixture | Pass |
| leaderboard returns readiness failure instead of writing a legacy row when verified columns are unavailable | `tests/leaderboardApi.test.cjs` | a, code + fixture | Pass |
| leaderboard replay-check schema errors return readiness failure without attempting a write | `tests/leaderboardApi.test.cjs` | a, code + fixture | Pass |
| leaderboard returns the top 100 all-time and weekly scores | `tests/leaderboardApi.test.cjs` | a, code + fixture | Pass |
| a current-schema review row cannot outrank a verified weekly score | `tests/leaderboardApi.test.cjs` | a, code + fixture | Pass |
| leaderboard can read one exact historical week without relying on the all-time top 100 | `tests/leaderboardApi.test.cjs` | a, code + fixture | Pass |
| the current weekly leader can attach one eligible proposal to the verified run | `tests/leaderboardApi.test.cjs` | a, code + fixture | Pass |
| proposal selection keeps current metadata working before the image column migration | `tests/leaderboardApi.test.cjs` | a, code + fixture | Pass |
| the current weekly leader cannot select a proposal that closes before the weekly cutoff | `tests/leaderboardApi.test.cjs` | a, code + fixture | Pass |
| a run that is not the current weekly leader cannot attach a proposal | `tests/leaderboardApi.test.cjs` | a, code + fixture | Pass |
| the exact verified current leader can replace its saved proposal | `tests/leaderboardApi.test.cjs` | a, code + fixture | Pass |
| an empty exact proposal update is a terminal lead change with a stable code | `tests/leaderboardApi.test.cjs` | a, code + fixture | Pass |
| proposal recovery rejects an unverified leaderboard row even with its signed run receipt | `tests/leaderboardApi.test.cjs` | a, code + fixture | Pass |
| proposal recovery rechecks the weekly leader after proposal eligibility lookup | `tests/leaderboardApi.test.cjs` | a, code + fixture | Pass |
| proposal recovery rolls back its exact write if the lead changes during the update | `tests/leaderboardApi.test.cjs` | a, code + fixture | Pass |
| a wallet-backed weekly leader cannot mutate its proposal without a wallet signature | `tests/leaderboardApi.test.cjs` | a, code + fixture | Pass |
| a wallet-backed leader accepts PostgREST-normalized challenge timestamps only once | `tests/leaderboardApi.test.cjs` | a, code + fixture | Pass |
| proposal replacement clears a stale image and still retries without the optional image column | `tests/leaderboardApi.test.cjs` | a, code + fixture | Pass |
| guest leaderboard submissions remain wallet-free | `tests/leaderboardWalletAttribution.test.cjs` | a, code + fixture | Pass |
| an unauthenticated caller cannot attach a wallet address to a score | `tests/leaderboardWalletAttribution.test.cjs` | a, code + fixture | Pass |
| a wallet-bound receipt and verified profile session own score attribution | `tests/leaderboardWalletAttribution.test.cjs` | a, code + fixture | Pass |
| an authenticated wallet request leaves a guest receipt anonymous | `tests/leaderboardWalletAttribution.test.cjs` | a, code + fixture | Pass |
| a signed wallet receipt remains attributed when its profile cookie is absent | `tests/leaderboardWalletAttribution.test.cjs` | a, code + fixture | Pass |
| a wallet-bound receipt cannot be attributed under a different authenticated wallet | `tests/leaderboardWalletAttribution.test.cjs` | a, code + fixture | Pass |
| a malformed profile session is rejected before leaderboard storage is touched | `tests/leaderboardWalletAttribution.test.cjs` | a, code + fixture | Pass |
| selected ship identity travels through the signed receipt and scorecard preview | `tests/missionRecordShipAndTimer.test.cjs` | b; a attribution guarantee retained | Pass |
| Campaign deaths restart the active Mission from Wave 1 and never expose paid Continue | `tests/missionScoreEntryFlow.test.cjs` | a, obsolete syntax proven | Pass |
| owner controls provide a separate frame freeze and put mission tools in the normal pause menu | `tests/ownerPilotTestMode.test.cjs` | b | Pass |
| engine routes Paywall helmet hits into hull damage and renderer hides full-boss part bars | `tests/paywallHelmetHullLinkRuntime.test.cjs` | b | Pass |
| paywallWallVisualRemake.test.cjs | `tests/paywallWallVisualRemake.test.cjs` | a — baseline | FAIL — retained above |
| paid ship access remains scoped to the connected authenticated wallet | `tests/pilotProfile.test.cjs` | a (source assertion compatibility) | Pass |
| ground sectors keep their authored roster and never turn the river route into an asteroid belt | `tests/pixiEnvironmentRoute.test.cjs` | b | Pass |
| GameEngine routes ram and projectile damage through the clamped transition | `tests/playerLifeRuntime.test.cjs` | b | Pass |
| playerPrimaryBurst.test.cjs | `tests/playerPrimaryBurst.test.cjs` | a — baseline | FAIL — retained above |
| player run history pins the current verified weekly leader ahead of newer runs | `tests/playerRunHistory.test.cjs` | a, fixture | Pass |
| both proposal surfaces use the shared funding order and no synthetic RSC remains | `tests/proposalFunding.test.cjs` | b | Pass |
| Mission 2 keeps early formations standard-size and reserves the Vanguard for Mission 4 | `tests/protocolVanguardCampaign.test.cjs` | a — unresolved evidence/content | FAIL — retained above |
| record card embeds encounter art and meaningful run values | `tests/recordCard.test.cjs` | b | Pass |
| revision-24 record cards embed their resolved mission encounter art without the legacy boss fallback | `tests/recordCard.test.cjs` | b | Pass |
| unspecified squadrons rotate through existing swoop paths | `tests/remasterFoundation.test.cjs` | a | Pass |
| weekly finalization resolver fails closed when the OPEN feed is unavailable | `tests/researchHubEligibility.test.cjs` | a | Pass |
| a stalled proposal request times out so gameplay preloading can continue | `tests/researchHubProposalEligibility.test.cjs` | a | Pass |
| referenced exact lookup failures fail closed instead of returning an open-only cached success | `tests/researchHubProposalsApi.test.cjs` | a | Pass |
| Citation Storm is a bossless formation-remix Mission with compact authored formation packs | `tests/roamingBossAndElitePresentation.test.cjs` | b | Pass |
| wallet RSC balance presentation truncates fractions and groups whole units | `tests/rscBalancePresentation.test.cjs` | a | Pass |
| weekly proof recomputes signed leaderboard metrics and ignores client score tampering | `tests/runReceipts.test.cjs` | a, obsolete authored totals proven | Pass |
| combat samples include distinct authored boss warning, rotary burst, and mission launch cues | `tests/sampleSoundEffects.test.cjs` | b | Pass |
| combat events distinguish player fire, boss fire, impacts, and destruction | `tests/sampleSoundEffects.test.cjs` | b | Pass |
| advanced roster authoring is idempotent and keeps a valid Campaign contract | `tests/sciconAdvancedEnemyProgression.test.cjs` | b | Pass |
| legacy roster reauthoring preserves sector choreography and each late escort tuning | `tests/sciconAdvancedEnemyProgression.test.cjs` | b | Pass |
| five generated hulls have unique sector-gated roles and formation packs | `tests/sciconAdvancedEnemyProgression.test.cjs` | b | Pass |
| retired introduction migration audits the complete legacy roster | `tests/sciconEnemyAuthoringDefaults.test.cjs` | a — unresolved evidence/content | FAIL — retained above |
| retired introduction command is repeatable, non-mutating, and rejects write mode | `tests/sciconEnemyAuthoringDefaults.test.cjs` | a — unresolved evidence/content | FAIL — retained above |
| all twenty baseline roles and their spawns keep their assigned family | `tests/sciconEnemySquadronAssets.test.cjs` | a — unresolved evidence/content | FAIL — retained above |
| family debuts stay readable (thematic pairs at most) and Journal Raider waits for Mission 5 | `tests/sciconEnemySquadronAssets.test.cjs` | a — unresolved evidence/content | FAIL — retained above |
| the engine applies sector aggression when a formation member is configured | `tests/sectorEscalation.test.cjs` | a | Pass |
| campaign revision 24 restores opening scenery while preserving later space runs | `tests/spaceRunCampaignConfig.test.cjs` | b | Pass |
| browser, Director server, and Director editor recognize the same background IDs | `tests/spaceRunCampaignConfig.test.cjs` | b | Pass |
| the Hangar is available to device Pilots while minted ship locks remain visible | `tests/squadHangarFlow.test.cjs` | b | Pass |
| the Hangar uses one position-driven squad bay and four-column fleet catalogs | `tests/squadHangarFlow.test.cjs` | b | Pass |
| main ship upgrades remain isolated to the selected ship through the Hangar and game launch | `tests/squadHangarFlow.test.cjs` | b | Pass |
| top-level run progress is presented as Mission without renaming compatibility fields | `tests/stageTerminology.test.cjs` | b | Pass |
| the Weekly Run drawer omits the ship thumbnail and keeps its quota copy compact | `tests/startScreenWeeklyCard.test.cjs` | b | Pass |
| the Weekly Run drawer keeps its static quota-driven call to action compact | `tests/startScreenWeeklyCard.test.cjs` | b | Pass |
| Past Picks renders the complete framed winner archive without trophy thumbnails | `tests/startScreenWeeklyCard.test.cjs` | b | Pass |
| browser and Director validators accept the dedicated Supply Drop event | `tests/supplyDropValidation.test.cjs` | a | Pass |
| preview campaign remains valid and supplies both hostile targets and real salvage | `tests/supportShipPreview.test.cjs` | a | Pass |
| story transmissions open a simple fitted shutter before typewriter playback | `tests/transmissionPauseUi.test.cjs` | b | Pass |
| vanish and re-entry gate targeting, shot consumption, and body collision in the canonical engine | `tests/umbraNeedlewingGameEngineIntegration.test.cjs` | a | Pass |
| Blackout sequence 2 fully exits from a mid-edge lock before hidden upper-anchor rematerialization | `tests/umbraNeedlewingGameEngineIntegration.test.cjs` | a | Pass |
| terminal escape cleans owned hazards, grants one escape reward, and produces an escaped summary | `tests/umbraNeedlewingGameEngineIntegration.test.cjs` | a | Pass |
| preview restart clears escape state, owner hazards, pending timers, and terminal outcome | `tests/umbraNeedlewingGameEngineIntegration.test.cjs` | a | Pass |
| pixel action buttons retain live labels over transparent generated presentation layers | `tests/upgradeAffordance.test.cjs` | b | Pass |
| Hangar readiness follows exact affordability, ownership, equip, and max-level state | `tests/upgradeAffordance.test.cjs` | b | Pass |
| challenge authentication creates a secure session and profile saves use revision CAS | `tests/walletProfileApi.test.cjs` | a, fixture | Pass |
| same-device sync churn stays recoverable with bounded retry backoff | `tests/walletProfileClient.test.cjs` | a (harness) | Pass |
| dirty wallet snapshots stay address scoped and reject cross-wallet data | `tests/walletProfileDirtyStore.test.cjs` | a (harness) | Pass |
| acknowledging an older save rebases but never clears a newer dirty write | `tests/walletProfileDirtyStore.test.cjs` | a (harness) | Pass |
| semantic comparison ignores regenerated timestamps and minted ownership | `tests/walletProfileDirtyStore.test.cjs` | a (harness) | Pass |
| semantic comparison ignores cloud-regenerated Campaign metadata timestamps | `tests/walletProfileDirtyStore.test.cjs` | a (harness) | Pass |
| semantic comparison ignores Boss Archive schema migration versions | `tests/walletProfileDirtyStore.test.cjs` | a (harness) | Pass |
| Boss Archive version migration rebases over a server-reserved attempt | `tests/walletProfileDirtyStore.test.cjs` | a (harness) | Pass |
| semantic comparison detects Boss Archive unlock and viewed-state changes | `tests/walletProfileDirtyStore.test.cjs` | a (harness) | Pass |
| same-wallet conflicts only merge non-overlapping sections | `tests/walletProfileDirtyStore.test.cjs` | a (harness) | Pass |
| same-wallet reconciliation max-merges achievement progress without replaying claimed tiers | `tests/walletProfileDirtyStore.test.cjs` | a (harness) | Pass |
| simultaneous weekly economy changes and null-base races remain conflicts | `tests/walletProfileDirtyStore.test.cjs` | a (harness) | Pass |
| purchase settlement preserves local writes while rebasing the server-owned right support unlock | `tests/walletProfileDirtyStore.test.cjs` | a (harness) | Pass |
| purchase-aware conflict rebase combines server and queued local balance deltas | `tests/walletProfileDirtyStore.test.cjs` | a (harness) | Pass |
| paid Token credit survives local spending exactly once across duplicate settlement resumes | `tests/walletProfileDirtyStore.test.cjs` | a (harness) | Pass |
| purchase rebase adopts the server economy when settlement crosses a weekly boundary | `tests/walletProfileDirtyStore.test.cjs` | a (harness) | Pass |
| wallet snapshots preserve the current Weekly Campaign Streak and recompute its score | `tests/walletProfileSchema.test.cjs` | a (obsolete content fixtures proven) | Pass |
| Campaign progress and reward receipts survive wallet sanitization with strict Mission-Wave pairing | `tests/walletProfileSchema.test.cjs` | a (obsolete content fixtures proven) | Pass |
| cloud Campaign migration preserves a rev21 partial checkpoint and replay reward epoch | `tests/walletProfileSchema.test.cjs` | a (obsolete content fixtures proven) | Pass |
| routine disconnect and reconnect reuse the matching authenticated session | `tests/walletProfileSessionBehavior.test.cjs` | a (harness) | Pass |
| a matching wallet-bound session with profile null is authenticated without another signature | `tests/walletProfileSessionBehavior.test.cjs` | a (harness) | Pass |
| a session for another wallet is never reused and requires current-wallet authorization | `tests/walletProfileSessionBehavior.test.cjs` | a (harness) | Pass |
| a mismatched authentication response is rejected rather than attached to the requested wallet | `tests/walletProfileSessionBehavior.test.cjs` | a (harness) | Pass |
| only an unauthenticated session probe falls back to wallet authorization | `tests/walletProfileSessionBehavior.test.cjs` | a (harness) | Pass |
| walletTokenSpends.test.cjs | `tests/walletTokenSpends.test.cjs` | a (harness) | Pass |
| ten five-Mission sectors own tactical Waves and reserve boss-defeat for major-boss finales | `tests/waveCompletion.test.cjs` | b / a | Pass |
| elite checkpoints and boss-preparation Missions finish with authored blocking climaxes | `tests/waveCompletion.test.cjs` | b / a | Pass |
| major-boss Missions expose a five-second movable reward window before the full takeoff cinematic | `tests/waveCompletion.test.cjs` | b / a | Pass |
| story transmission uses the same enclosing level identity | `tests/waveLevelPresentation.test.cjs` | b | Pass |
| the engine emits one collision bundle per center or triple-shot lane | `tests/weaponTierProgression.test.cjs` | b | Pass |
| the Weekly Run is a home-screen mode and no longer clutters the Campaign Map | `tests/weeklyCampaignRuntimeIntegration.test.cjs` | b | Pass |
| concurrent different-proposal claims have one atomic winner, one notification, and safe replay semantics | `tests/weeklyClaimAtomicity.test.cjs` | a, fixture | Pass |
| a claim refuses to commit when nonce consumption is not returned and observed | `tests/weeklyClaimAtomicity.test.cjs` | a, fixture | Pass |
| a challenge cannot be claimed after the finalized winner becomes stale | `tests/weeklyClaimAtomicity.test.cjs` | a, fixture | Pass |
| only the wallet associated with the exact winning receipt can claim a guest winner | `tests/weeklyClaimAtomicity.test.cjs` | a, fixture | Pass |
| a competition commit must return exactly one winning row before success or notification | `tests/weeklyClaimAtomicity.test.cjs` | a, fixture | Pass |
| production leader lookup accepts an exact provenance-one receipt | `tests/weeklyCompetition.test.cjs` | a, fixture | Pass |
| finalization locks the top eligible score for a closed week | `tests/weeklyCompetition.test.cjs` | a, fixture | Pass |
| finalization re-resolves the proposal when the weekly leader changes during cutoff lookup | `tests/weeklyCompetition.test.cjs` | a, fixture | Pass |
| finalization preserves a wallet-associated guest proposal as claimable and excludes the pilot test wallet | `tests/weeklyCompetition.test.cjs` | a, fixture | Pass |
| re-finalization repairs an unlocked archive and preserves its event allocation | `tests/weeklyCompetition.test.cjs` | a, fixture | Pass |
| a finalized-row enrichment cannot overwrite a champion claim that wins the interleaving | `tests/weeklyCompetition.test.cjs` | a, fixture | Pass |
| an initial finalizer cannot upsert over a champion claim committed by another finalizer | `tests/weeklyCompetition.test.cjs` | a, fixture | Pass |
| finalization archives the winner even when proposal verification is pending | `tests/weeklyCompetition.test.cjs` | a, fixture | Pass |
| recovery backfills within the fixed three-week horizon even when a caller requests more | `tests/weeklyCompetition.test.cjs` | a, fixture | Pass |
| Weekly Paywall Wall awards one mini-boss credit when its final mobile segment is destroyed | `tests/weeklyContinuousRuntime.test.cjs` | b, fixture only | Pass |
| weeklyProposalAuthorization.test.cjs | `tests/weeklyProposalAuthorization.test.cjs` | a (harness) | Pass |
| weeklyProposalDisplay.test.cjs | `tests/weeklyProposalDisplay.test.cjs` | a (harness) | Pass |
| weeklyProposalLifecycle.test.cjs | `tests/weeklyProposalLifecycle.test.cjs` | a (harness) | Pass |
| weeklyProposalRecovery.test.cjs | `tests/weeklyProposalRecovery.test.cjs` | a (harness) | Pass |
| the mandatory post-score chooser cannot be dismissed while recovery openings can close | `tests/weeklyProposalRecoveryUi.test.cjs` | b (proven obsolete UI assertion) | Pass |
| weeklyProposalReminder.test.cjs | `tests/weeklyProposalReminder.test.cjs` | a (harness) | Pass |
| an authenticated wallet-profile session selects the weekly proposal without a second signature | `tests/weeklyProposalSessionReuse.test.cjs` | a, fixture | Pass |
| a different wallet session cannot authorize the weekly leader proposal | `tests/weeklyProposalSessionReuse.test.cjs` | a, fixture | Pass |
| verified Weekly Run admission is server-authoritative and database-atomic | `tests/weeklyRunAttempts.test.cjs` | a, obsolete syntax proven | Pass |
| weekly boss randomization stays inside Campaign strength bands | `tests/weeklyRunGenerator.test.cjs` | b | Pass |
| boss health follows Weekly depth while modular component ratios stay authored | `tests/weeklyRunGenerator.test.cjs` | b | Pass |
| a guest Wave 4 defeat after three generated elite bosses creates a verified receipt | `tests/weeklyRunPersistence.test.cjs` | a, obsolete identity proven | Pass |
| a generated major boss clear is canonical when runtime boss telemetry is omitted | `tests/weeklyRunPersistence.test.cjs` | a, obsolete identity proven | Pass |

## Reproduction and artifacts

```sh
npm run build
npx tsc --noEmit
node --test tests/*.test.cjs
node --test tests-revamp/*/*.test.mjs
npm run qa:playthrough -- --devices mobile --stages mission-1,boss --run-id G-after
```

Logs and machine-readable failure lists: `/workspace/scicon-revamp/qa/G-reconciliation/`. Full legacy logs retain actual assertions, not filtered output. The baseline list is the supplied `/tmp/base-fail.txt`; reference checkout was read-only. All API/browser tests used local fixtures; no external writes, push, or deployment occurred.

Local commit attempt failed creating `/workspace/scicon-revamp/gh/.git/worktrees/w2-G/index.lock` (read-only filesystem). As requested, changes remain uncommitted for the integrator; no alternate Git metadata workaround was used.

## Final browser and revamp verification

`node --test tests-revamp/*/*.test.mjs`: **247 pass / 2 fail / 0 skipped**, 249 entries. The two failure entries are F's “active game median FPS is at least 30 in headless SwiftShader” (5.6 FPS) and its enclosing suite. Start-screen load, live simulation/nonblank rendering, local GET/POST fixtures and all three new G engine cases pass. The FPS threshold remains unchanged.

Environment: Linux x64, eight CPUs, Chromium 155.0.8059.84 with SwiftShader, viewport 390×844 at DPR 2, seed 12345, normal play (`god=false`), offline API fixtures and intercepted outbound traffic. Shared-host one-minute load ranged 32.23→22.60 in the initial capture and 8.07→14.52 in the final capture. The final legacy rerun overlapped part of the after boss capture; these are diagnostic runs, not a controlled performance comparison. Same world size (390×844) was observed throughout both mobile runs. This targeted check does not certify physical-device speed or full-campaign completion.

| Capture | Stage | Median / p10 FPS | Peak hostile bullets | Lives lost / deaths | Console / page errors | Result |
| --- | --- | --- | --- | --- | --- | --- |
| G-before | mission-1 | 5.1 / 4.1 | 1 | 0 / 0 | 0 / 0 | FAIL: median FPS <30 |
| G-before | boss | 11 / 6.6 | 15 | 1 / 0 | 0 / 0 | FAIL: median FPS <30 |
| G-after | mission-1 | 9.7 / 5.2 | 2 | 0 / 0 | 0 / 0 | FAIL: median FPS <30 |
| G-after | boss | 6.7 / 5.7 | 13 | 0 / 0 | 0 / 0 | FAIL: median FPS <30 |

Reports: `/workspace/scicon-revamp/qa/G-before/report.md` and `/workspace/scicon-revamp/qa/G-after/report.md`. The before set is the initial round-1 worktree capture for G, not the clean remaster reference. Both report files identify their built `dist/index.html` digest. Screenshots are sampled by wall-clock time; differing frame rates mean they are not identical simulation frames.

Inspected PNGs:

- Before Mission 1: `/workspace/scicon-revamp/qa/G-before/mobile/mission-1/008-time-40s.png`
- After Mission 1: `/workspace/scicon-revamp/qa/G-after/mobile/mission-1/009-time-40s.png`
- Before boss: `/workspace/scicon-revamp/qa/G-before/mobile/boss/004-time-20s.png`
- After boss: `/workspace/scicon-revamp/qa/G-after/mobile/boss/004-time-20s.png`

Visual self-review: Scott's pixel-art silhouettes/palette, readable top HUD and touch controls survive. Peer Reviewer and Gatekeeper remain visible with their actual health/phase UI. Compared with the reference-game quality bar, the utility-wing notice obscures the active boss, the saturated planet competes with hostile cues, and the opening has sparse stretches. White impact flashes also hide boss detail in the captured frame. These are existing presentation/content follow-ups, not grounds to weaken runtime assertions or overwrite another job's assets/content. No visual-polish or FPS improvement is claimed by G.

Final security review also tightened five raw rejection mocks and the wallet-attribution outer request counter so an early durable-receipt read cannot evade a zero-storage assertion. All 38 focused leaderboard cases pass. Endpoint/RPC behavior is tested with local fixtures; no live database or external write was used.

## Round 3 — reconciliation after job I

The starting merged checkout was `b9ffad9` on the supplied `r3/G` worktree. A fresh full legacy run reproduced **1,736 pass / 44 fail / 12 skip**, matching `/tmp/gi-fail-names.txt`. The six missing-PNG dependency failures remain visible. No original artwork, mission reward table, route graph, API route count, or protected shared gameplay/UI file was changed.

### Correctness fixes and authored content

- **Checkpoint migration (category a):** I reused revision 25 while reducing early Missions to three waves. A partial old save whose retained IDs covered those three waves could acquire completion, mastery, and subsequent reward eligibility. The generated campaign now advances to revision 26. The shared browser/API migration keeps immutable exact per-Mission revision-25 histories, rejects foreign/unknown/current-revision retired IDs, caps unfinished progress below completion, and preserves genuine historical clears, settled reward IDs, result receipts, and replay epochs. Explicit unfinished records remain unfinished after re-sanitization at revision 26. This is covered across all 17 shortened Missions, old one-wave onboarding, checkpoint/boss ordering, and historical revision-21/24 aliases.
- **Schema parity (category a):** Director server now uses the browser's bounded dense-squadron exception (three waves only with 24–40 hulls and a 22+ linefighter cohort), not an unconditional minimum reduction. Both validators reject attack cycles over 20 and groups larger than the cohort; negative cases check errors at the affected field. Director editor exposes every typed revamp path, movement, attack, firing, and return choice, with lossless edits. Compile/decompile and Supply Drop/background contracts pass without test relaxation.
- **Actual roster defects (category a):** `authorCampaign.mjs` restores two Protocol Vanguards in Mission 4's second grid. Thirty ordinary hulls keep their existing cadence, and the higher-cost pair fires more slowly to preserve the pressure budget. Mission 17 teaches Research Drone in its existing eight-hull opening cohort, retaining HP, size, count, reward, and pressure, so Wave 3 no longer debuts three art families together. Mission 1 and Mission 2 are byte-identical to the merged starting campaign. All 34 roles and 25 art families are used; there are 52 packs. The introduction auditor now recognizes I's linefighter role.
- **Bounded content expectations (category b):** tests now assert 28–38 regular grid hulls plus two specialists, 2–3 combat beats, varied curved entries, increased second-wave pressure and a recovery dip where present, slot count/uniqueness/bounds, projectile/size/telegraph limits, timed power pickups, and a separate terminal commander. Later sectors retain existing cadence/identity/budget assertions. The real arrival test counts enemy hulls, excluding projectiles that inherit the same source event ID. Record cards verify current dedicated checkpoint art; immutable-loadout coverage permits only I's explicitly QA-gated Campaign lab branch.
- **Reward timing reconciliation (a/b):** the merged baseline already takes 92.25 seconds for Mission 5 because G restored the five-second collection window. `measure-opening.mjs` reports that window separately. The I test requires all five seconds, a 60–90-second encounter, and total time no greater than 92.5 seconds—only the restored 2.5-second increment above its original total ceiling. Ordinary Missions retain their original 90-second total ceiling. The real-engine 300-tick collection and exactly-once banking tests still pass.

### Regenerated evidence

The economy report is produced by `node tools/simulate-campaign-economy.mjs`. The non-boss artifact is produced by `node tools/simulate-campaign-nonboss-balance.mjs --write`; no measured result or digest is hand-relabeled. The matrix now uses the production fair-arena resolver for a **390×844 world on both display hosts**, and current Campaign flight/wing controllers. Its low/expected/upgraded power and no-support/paired-support fixtures are explicitly controlled balance probes, not earned-unlock or affordability evidence. Paired support uses level-5 ships and rank-4 Support research; other research stays at zero. The digest includes extracted formation, enemy, wing, progression, reward-window, and fair-arena sources. Tests mutate representative dependency copies to prove invalidation, and compare all 300 matching mobile/desktop cells. Existing balance, timing, projectile, inversion, and performance-mode thresholds remain intact.

### Starting failure classification

Each row accounts for all starting failures in that file; tests that pass through the shared helper or corrected production validator need no direct edit. Category a preserves correctness/evidence, b follows documented I content, and environment failures are retained.

| File under `tests/` | Starting failures | Reconciliation |
| --- | ---: | --- |
| `arcadeMissionPacing.test.cjs` | 3 | b: dense-grid helper; a: server schema parity |
| `breakwaterSector.test.cjs` | 5 | b: current cadence, paths, canonical boss tuning; a: actual hostile-hull births |
| `campaignBranchesConfig.test.cjs` | 2 | a: validator parity; branch assertions unchanged |
| `campaignCheckpointMigration.test.cjs` | 1 | a: incomplete checkpoints remain incomplete; new revision-25 regressions |
| `campaignEconomySimulation.test.cjs` | 1 | a: regenerate deterministic report; conservation assertions unchanged |
| `campaignFormationAuthoring.test.cjs` | 1 | a: bounded browser/server/editor parity and rejection coverage |
| `campaignFormationChoreographyAuthoring.test.cjs` | 2 | b: bounded dense cohorts and exhaustive authored choreography |
| `campaignNonBossBalanceMatrix.test.cjs` | 2 | a: rerun actual measurements, fix world/loadout/digest provenance |
| `campaignProgression.test.cjs` | 1 | b: shared cadence helper; graph/progression assertions unchanged |
| `contentPackageCompiler.test.cjs` | 1 | a: validator parity; lossless compile assertions unchanged |
| `enemyIntroductionStaging.test.cjs` | 1 | a: Vanguard is genuinely used; assertion unchanged |
| `gameCampaignConfig.test.cjs` | 6 | b: bounded grid/pressure/cadence invariants; topology/rewards retained |
| `gameplayNetworkResilience.test.cjs` | 1 | b: QA-gated launch branch; hydration cannot overwrite mounted loadout |
| `protocolVanguardCampaign.test.cjs` | 1 | a: real M4 pair; stronger timing/density assertion |
| `recordCard.test.cjs` | 1 | b: current finale enemy or boss art; unrelated fallback still forbidden |
| `roamingBossAndElitePresentation.test.cjs` | 1 | b: curved entries into dense grids with two specialists |
| `sciconEnemyAuthoringDefaults.test.cjs` | 2 | a/b: current role audit plus repaired real coverage/debut defects |
| `sciconEnemySquadronAssets.test.cjs` | 2 | a: real role/family coverage and at-most-two-family debut; b: Journal now debuts in first preserved sector |
| `spaceRunCampaignConfig.test.cjs` | 1 | a: validator parity; background assertions unchanged |
| `supplyDropValidation.test.cjs` | 1 | a: validator parity; dedicated-event assertions unchanged |
| `waveCompletion.test.cjs` | 2 | b: shared cadence helper; completion/warning/hostile/reward contracts unchanged |
| Six PNG-dependent files listed below | 6 | environment: unchanged inherited loader failures |

Additional changed test coverage: `director/tests/campaignGraphValidation.test.mjs` follows the existing browser 2–8 major-boss wave bound and rejects overflow; `tests-revamp/I/opening-pacing.test.mjs` distinguishes only the restored reward time. No tests are removed, disabled, or newly skipped.

### Reproduction and evidence locations

```sh
node tools-revamp/curve-report.mjs --check
node tools-revamp/validate-campaign.mjs
node tools/restage-enemy-introductions.mjs --check
node tools/simulate-campaign-economy.mjs
node tools/simulate-campaign-nonboss-balance.mjs --write
npx tsc --noEmit
npm run build
node --test tests/*.test.cjs
node --test tests-revamp/*/*.test.mjs
npm run qa:playthrough -- --devices mobile --stages mission-1,boss --run-id G-r3-after
```

Use a fresh QA run ID. Logs and before/after failure details are in `/workspace/scicon-revamp/qa/G-r3-verification/`. The offline dependency evidence confirms `director/node_modules` is absent and the npm cache has no `pngjs`; no network installation was attempted. No dependency manifest or lockfile changed. Git staging was denied creating `/workspace/scicon-revamp/gh/.git/worktrees/w3-G/index.lock` (read-only filesystem); changes are left uncommitted for the integrator. No push, deploy, or external write API was used.

### Mobile screenshots and visual review

| Stage | Before (merged I presentation) | After |
| --- | --- | --- |
| Mission 1 | `/workspace/scicon-revamp/qa/I-hud-final/mobile/mission-1/001-time-5s.png` | `/workspace/scicon-revamp/qa/G-r3-after/mobile/mission-1/001-time-5s.png` |
| Boss | `/workspace/scicon-revamp/qa/I-hud-final/mobile/boss/002-time-10s.png` | `/workspace/scicon-revamp/qa/G-r3-after/mobile/boss/002-time-10s.png` |

All four PNGs were opened and reviewed. Dense separated rows, crisp hull silhouettes, cyan player bolts, outlined hostile rounds, and boss surface detail remain legible; no whole-boss whitewash or combat tutorial overlay returns. The left controls and phase banner still occupy substantial screen area, and score popups can overlap targets. This reconciliation does not claim a visual redesign or performance improvement. Wall-clock screenshots represent different simulation instants and are not pixel-identical frame comparisons.

`G-r3-after/report.md` records normal-damage targeted coverage: Mission 1 observes 28 enemies / eight hostile bullets, three lives and zero damage; boss observes 20 hostile bullets, two life losses and no death. Both use 390×844, have zero console/page errors, and fail only the unchanged 30 FPS gate (medians **7 / 8 FPS**). The 60/45-second observations are not whole-Mission completion proofs; fixed-step tests separately establish opening completion. Shared host load and software rendering limit performance interpretation. Videos and complete PNG sequences are retained beside the report.

### Final round-3 verification and remaining gaps

**Legacy: 1,782 pass / 7 fail / 12 unchanged skips (1,801 entries)**, versus **1,736 / 44 / 12** at the start. Thirty-seven starting failures are resolved; nine additional cases execute. The seven remaining entries are:

| Remaining test/file | Status and cause |
| --- | --- |
| `tests/bottleneckDroneVisualRemake.test.cjs` | Inherited loader failure: missing offline-unavailable `director/node_modules/pngjs`. |
| `tests/breakwaterAssets.test.cjs` | Same inherited dependency failure. |
| `tests/combatEvolution.test.cjs` | Same inherited dependency failure. |
| `tests/eliteEnemyPixelStandard.test.cjs` | Same inherited dependency failure. |
| `tests/paywallWallVisualRemake.test.cjs` | Same inherited dependency failure. |
| `tests/playerPrimaryBurst.test.cjs` | Same inherited dependency failure. |
| `tests/campaignNonBossBalanceMatrix.test.cjs` — checked-in matrix coverage/quality assertion | Current measured evidence fails unchanged timing limits: 48 cells exceed 1.25-second first visibility; 216 exceed one-second in-wave dead air. Coverage and digest checks pass. |

The regenerated matrix completes **600 trials: 592 clears / 6 deaths / 2 timeouts**, with a clear in every Mission, no power/support inversions, no projectile-cap breach, and no performance-mode cells. This is **not timing or overall balance approval**. M14 Wave 1 reaches 2.22 seconds before visibility; M12B Wave 3 reaches 5.83 seconds of dead air with one offscreen entry survivor. Later authored waves account for 212 of 216 dead-air breaches. Detailed responsible-wave/context data remain in the artifact and `matrix-findings.json`.

All authoritative fields in the 300 device pairs match exactly. The matrix's broad “generated deterministically” label refers to seeded gameplay: its mixed total-entity peak also includes direct cosmetic particles with unseeded 40–60-tick lifetimes. That single field differs by at most two in 120 pairs; tests preserve the raw counts and independently bound them below the existing 132-entity threshold. No gameplay field is excluded from equality. `matrix-parity-differences.json` records the complete audit.

- `npm run build`: pass, Director excluded; existing bundle-size warnings remain.
- `npx tsc --noEmit`: pass, **zero diagnostics**, including final generated content.
- Full revamp suite: **267 pass / 2 fail**; failures are the unchanged headless active-FPS assertion (13.2 FPS versus 30) and its parent. A subsequent stricter pacing/reward rerun passes all six cases; total-time allowance is only the restored 2.5 seconds.
- Focused schema/migration/Director suites: **101/101 pass**, plus the final **8/8 parity recheck**. Focused economy/artifact tests: **10 pass / 1 retained timing failure**; standalone economy **5/5** passes.
- Campaign validator, generator/idempotence check, introduction audit, and `git diff --check` pass. No security, money, progression-migration, or reward-window failure remains.
- `verification-summary.json`, complete TAP files, and `before-failures.json` / `final-failures.json` record these results. The earlier pre-parity-review run is retained to show the corrected overbroad cosmetic-total assertion.

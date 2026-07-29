# Campaign Graph, Balance, and Weekly Goal

Final audit snapshot: July 29, 2026. Runtime Campaign source: game-config/campaign.json revision 23.

This is the mandatory delivery checklist for the full Campaign overhaul. It is intentionally conservative. A schema, component, source assertion, or headless test does not by itself prove that a player-facing feature works in the actual game.

## Status legend

- **Complete and runtime-verified** - exercised successfully in the actual application, or directly verified where the item is a repository/documentation gate rather than a game feature.
- **Partially complete** - useful implementation and/or automated evidence exists, but the complete requested behavior has not been proven in the actual application.
- **Missing** - the requested behavior is not implemented.
- **Blocked** - completion cannot continue without the exact named architecture change, external dependency, or user decision.

## Current implementation inventory

- **Partially complete - Campaign content and graph.** Revision 23 contains 10 sectors, 60 selectable Missions, 60 graph nodes, 50 main-path progression depths, 10 same-depth route alternatives, 330 internal Waves, 10 mastery branches, 19 enemy-role entries, 11 formation packs, 10 mini-boss catalog entries with 20 checkpoint placements, and 10 canonical major-boss assignments. The full graph is implemented and covered by automated progression tests, but a player-driven end-to-end route walkthrough has not been completed.
- **Partially complete - actual Wave structure.** The 60 Missions comprise 10 four-Wave boss Missions, 20 five-Wave Missions, 20 six-Wave Missions, and 10 seven-Wave Missions. Every boss Mission now has two related short combat lead-ins, one recovery Wave, and the boss. Automated cadence and space-run continuity checks pass; actual gameplay buildup remains unreviewed.
- **Partially complete - balance; automated matrices pass, human/device approval remains.** The frozen 600-cell non-boss GameEngine matrix is green at 564 clears, 27 deaths, and 9 unsupported timeouts (94.0%): Mission 2 clears 12/12, Mission 7 clears 10/12 with every paired-support case clear, every Mission has a clear, and no power/support inversion or projectile/performance breach remains. The fresh frozen boss matrix is current at 173/180 clears, 6 low-power deaths, 1 unsupported timeout, expected 60/60, upgraded 60/60, expected/mobile 30/30, all-mobile 87/90, and hostile-projectile peak 17. Human mobile/desktop approval remains open.
- **Complete and runtime-verified - final automated quality gates.** Root `npm test` passes 1,029/1,029 with no failures, root typecheck passes, the production build passes with 2,436 modules transformed, the whole-release lint exits 0 with 17 warnings and no errors, and the regenerated economy report is current. The authoritative final serial Director suite passes 318/318 in 360.4 seconds, including focused twenty-third-prototype suites at 20/20 and 26/26. Focused Campaign, boss, non-boss, syntax, JSON, and scoped-ESLint gates are green; non-failing diagnostics are limited to the Vite CJS deprecation warning and an already-occupied WebSocket port during Director testing.
- **Partially complete - runtime review.** The Home screen and 10-sector Campaign Map were inspected in the desktop browser, including forks, rejoins, locked bosses, and the Weekly panel. After a forced clean Vite restart, both standard and Map -> Continue Current Streak Mission launches reached actual Pixi Wave flight; the Mission 1 pause overlay showed Mission 01 / ORBIT ENTRY / Wave 1/5 with music/SFX controls; and a guest defeat reached the Pilot name / Skip score path without a wallet prompt. No complete player-driven Campaign route, Weekly Streak submission, wallet-device, founder-account, Supply Drop, or mobile-device walkthrough has been recorded.
- **Blocked - server-authoritative Campaign and Weekly simulation.** The current backend validates identities, revisions, receipts, and duplicate claims, but still accepts sanitized client-authored Campaign snapshots and does not replay an authoritative ordered combat/route event stream. Tournament-grade authority requires a server-owned deterministic event model or authoritative simulation that the current architecture does not provide.

## Phase 1 - mandatory implementation checklist

- **Complete and runtime-verified - checklist created before the overhaul.** This file existed as the initial source audit before the revision-23 Campaign work.
- **Complete and runtime-verified - checklist updated after implementation.** All Goal phases below now record the current implementation, automated evidence, runtime evidence, and exact remaining gaps.
- **Partially complete - delivery remains open.** Final automated execution gates are current. Human desktop gameplay/balance review remains partial, while physical-device review, the live founder authorization matrix, real-profile migration, production Supabase rollout, and server-authoritative simulation retain the exact blockers recorded below.

## Phase 2 - consistent terminology and target structure

- **Partially complete - Campaign, Sector, Mission, Wave, Route, Mastery Branch, and Weekly Streak terminology.** Player-facing revision-23 systems use the requested concepts. Historical level and stage identifiers remain as compatibility IDs in older runtime and migration paths.
- **Partially complete - target structure.** Ten sectors, fifty main-path depths, ten major bosses, ten route alternatives, and ten one-time mastery branches are authored. Mastery branches remain a separate optional branch subsystem rather than ordinary nodes inside campaignGraph.
- **Partially complete - boss cadence.** Major bosses are assigned at main-path Missions 5, 10, 15, 20, 25, 30, 35, 40, 45, and 50. Actual in-game completion through all ten has not been demonstrated.

## Phase 3 - directed route graph

- **Partially complete - stable graph schema.** campaignGraph nodes carry stable IDs, sector/depth/route identity, display labels, Mission definitions, prerequisites, outgoing edges, rejoin metadata, main/optional flags, boss and mini-boss references, Weekly eligibility, recommended power, rewards, map positions, and route control points.
- **Partially complete - graph validation.** Automated validation covers unique IDs, valid targets, reachability, sibling placement, rejoin consistency, and required sector bosses. The regenerated 330-Wave manifest passes the final automated gates; full player traversal is still missing.
- **Partially complete - explicit edge advancement.** campaignGraph and campaignProgression use authored outgoing edges rather than selecting the next array item. Automated tests cover anti-skip behavior, sibling isolation, rejoin advancement, replay without checkpoint regression, and migration.
- **Partially complete - route labels and inspection.** Each sector forks at depth 2 into A/B choices with concise risk/reward/support summaries and later rejoins at depth 3. The desktop map shows both choices.
- **Partially complete - route selection persistence.** The save stores selected routes, completed alternatives, furthest main graph node, recommended graph node, and current node. Automated tests pass; a full browser route-A/route-B/rejoin/replay walkthrough is missing.
- **Partially complete - Weekly route binding.** Weekly state stores visited nodes and route choices, accepts only direct outgoing nodes, scores a node once, and finalizes on repeated, backward, or disconnected selection. Automated tests exist; actual in-game warning/finalization/submission has not been walked through.

## Phase 4 - ten five-depth sectors

- **Partially complete - sector grammar.** Ten sectors use introduction, route development, checkpoint/elite, boss preparation, and major-boss depths, with one A/B choice per sector.
- **Partially complete - ten data-driven bosses.** The authored canonical order is Gatekeeper Prime, Eclipse Engine, Helix Leviathan, Research Tribunal, Prism Moth, Rail Serpent, Singularity Crab, Orbit Gyroscope, Hammerhead Siege, and Frontier Crownclaw. Assignments use event IDs rather than carousel or array positions.
- **Partially complete - required boss lead-in length.** Every boss Mission now has two bounded related combat lead-ins, one recovery, a direct boss encounter, and a five-second reward window. The authored requirement is met and automated continuity checks pass; player-facing pacing/arrival review is missing.
- **Partially complete - mechanical escalation.** Sector themes, formations, boss foreshadowing, power recommendations, and Wave counts are authored. The frozen non-boss and fresh final boss matrices pass their automated curve/budget acceptance; human pacing and encounter-variety review remains.

## Phase 5 - gradual enemy introduction

- **Partially complete - Sector 1 introduction.** Mission 1 emphasizes the Research Drone family and formation movement, but later Waves can use post-formation firing; the strict requirement that most Mission 1 enemies do not fire has not been proven in gameplay.
- **Partially complete - Mission 2 and Sector 2 teaching curve.** Authored role limits, attack holds, and later aimed fire exist. No player-driven early-Campaign review has confirmed that shooter pressure remains sufficiently limited and readable.
- **Partially complete - Mission 7 automated retune passes; human proof remains.** The authoring tool caps spawn counts, holds attacks in the first two Waves, uses at least two-second attack intervals later, limits bursts to two, and sets low/expected/upgraded targets. The frozen matrix clears Mission 7 in 10/12 cells: every paired-support cell clears, as do upgraded/no-support mobile and desktop; the two failures are low/no-support desktop and expected/no-support desktop. This removes the abrupt automated wall while preserving a challenging unsupported case. Human reproduction is still required.
- **Partially complete - later role introduction.** Nineteen role definitions are reused through formations across ten sectors. A sector-by-sector human review is still required to verify that novelty and firing complexity do not accelerate too quickly.

## Phase 6 - enemy roles, durability, elites, and mini-bosses

- **Partially complete - role manifest.** Roles carry threat cost, introduction placement, durability, attack/entry behavior, readable spawn fire delay, cooldown, simultaneous-count, and performance cost.
- **Partially complete - requested role vocabulary.** Formation, diver, flanker, shooter, burst, suppressor, armored, support, priority, leader, and elite roles exist. Shield, carrier/spawner, kamikaze, and mini-boss are not all represented as explicit reusable role types.
- **Complete and runtime-verified - firing states.** Runtime supports never-fire, post-formation, aimed-burst, formation-command-only, and elite-only role policies, plus authored spawn delays and formation-pack none/post-formation/staggered/priority gating. Focused deterministic policy, schema, Director parity, and runtime-integration tests pass; device feel remains part of the broader balance review.
- **Partially complete - durability and health bars.** Light/standard/armored/elite durability exists, and the renderer gives elites and mini-bosses health bars while ordinary enemies remain unbarred. Actual gameplay readability has not been reviewed across the full roster.
- **Partially complete - mini-boss system.** Ten stable mini-boss catalog entries are authored across 20 deterministic checkpoint placements with health bars, one-time reward settlement, coherent choreography, and Campaign-to-runtime ID parity. Eight newer encounters have deterministic live-hazard safe-route proof at 390x844 and remain Sandbox-previewable; human readability, entrance, reward feel, and device approval remain open.

## Phase 7 - formation packs and combat budgets

- **Complete and runtime-verified - authored formation packs.** Eleven packs define family/roles/count, threat, entry, shape, firing, compatibility, recovery, and mobile cost. The exact Light Jet Pincer preserves the Mission 3 introduction boundary without importing Jet Heavy early.
- **Partially complete - deterministic bounded selection.** Mission definitions and deterministic seeds constrain authored packs by theme, role introduction, threat, active enemies, and performance budgets.
- **Complete and runtime-verified - formation/budget contracts.** The engine enforces per-role active limits, Wave threat/performance caps, normal/elite hostile-projectile caps, a deterministic Wave shooter-slot ceiling, and formation-pack maximum-instance/recovery gates. Pack identity is proven for all 386 grouped spawn events, every declaration is used, and the authored role schedule has zero `reuseCooldownWaves` conflicts. Browser and Director validation prevent these contracts from regressing.
- **Partially complete - seven-beat rhythm.** Five-to-seven-Wave Missions are authored with warm-up, development, recovery, peak, and clear beats. The frozen matrix gives every non-boss Mission at least one clear and passes the automated acceptance gate. Rhythm, damage pressure, and recovery still require player review.

## Phase 8 - multi-axis difficulty scaling

- **Partially complete - authored axes.** Difficulty uses formation shape, entry, role combinations, holds, armor, supports, elite/mini-boss placement, recovery, and boss foreshadowing rather than only a global multiplier.
- **Partially complete - hard ceilings.** Runtime projectile, role, threat, and mobile-performance caps exist. The frozen non-boss matrix stayed below the provisional 80-hostile-projectile readability ceiling (peak 18), never entered performance mode, and peaked at 127 active entities, 12 active firing enemies, and 219 heavy-scene cells. Speed, body/contact coverage, visual obstruction, and shooter pressure still require human/device review.
- **Partially complete - late-game proof.** The frozen non-boss matrix gives every late Mission at least one clear and has no power/support inversion or cap breach. The fresh final boss matrix clears all expected and upgraded trials and preserves bounded pressure through Mission 50. Human/mobile feel, readability, and challenge approval remain missing.

## Phase 9 - complete coin economy

- **Partially complete - unified source/sink inventory.** docs/CAMPAIGN_ECONOMY_SIMULATION.md is generated from revision-23 sources and covers Campaign clears, stars, mastery, alternatives, Boss Archive, gifts, achievements, Reward Center, replays, supports, ships, hearts, speed, and fire rate.
- **Partially complete - deterministic ten-sector simulation.** The regenerated revision-23 report is current and estimates 17,015 clear-only main coins, 19,490 expected main coins, 38,245-38,502 full-mastery main coins, 3,345 clear-only alternate coins, 3,840 expected alternate coins, and 5,760 full alternate coins. Live progression and combat-pickup telemetry remain unvalidated.
- **Partially complete - sink curves.** One full main ship costs 561,645 coins; all four cost 2,246,580; the 49-level Fire Rate track costs 551,350; speed costs 1,835; seven heart purchases cost 8,460; and both support slots/all current support upgrades cost 38,310.
- **Partially complete - inflation and farming risk.** Reward Center income is now 9,450 per 30-day calendar plus 10,400 in one-time lifetime achievements. Boss Archive Challenge rewards advance by five-Mission sector tier and cap at 840/day or 5,880/week, below one third of the expected authored Campaign. Those formerly dominant repeat sources pass deterministic guardrails; repeatable ordinary combat pickups remain unbounded and still require live retention telemetry.
- **Complete and runtime-verified - final reward reconciliation.** GameEngine now unconditionally refreshes the captured victory metrics during beginStageTakeoff, including when the player manually collected every boss coin and auto-bank has nothing left. The focused runtime test verifies updated score/coin totals while preserving immutable attempt identity, and settlement tests retain idempotence.

## Phase 10 - upgrade rebalance

- **Partially complete - health.** Hearts cap at ten and use the progressive 180/320/560/900/1,400/2,100/3,000 curve. Automated sanitization and cap tests pass; live affordability has not been reviewed.
- **Partially complete - speed.** The first speed upgrade costs 55 and the full current track costs 1,835. Input/collision code retains caps, but human mobile controllability is unverified.
- **Partially complete - fire rate.** Forty-nine levels form seven tiers of seven upgrades; the first upgrade costs 60, cadence is bounded, and tiers are ship-scoped and persistent.
- **Partially complete - seven visible projectile tiers.** Symmetric one-through-seven projectile patterns, Triple Shot, Max Shot, and BIO rail composition are implemented. Automated collision, audio-event, entity-count, spread, damage-budget, and representative TTK tests pass.
- **Partially complete - device performance and feel.** Headless mobile/desktop entity and render-budget tests exist. Actual mobile and desktop firing, sound, readability, and boss-TTK review is missing.

## Phase 11 - persistent three-star mastery and achievements

- **Partially complete - three persistent stars.** All 60 normal graph Missions have persistent objectives and one-time receipts. Star 3 defaults to damage-at-most zero across the authored set.
- **Partially complete - star and set rewards.** Separate star rewards and a one-time mastery set bonus settle idempotently. Live economy pacing remains unapproved.
- **Partially complete - mastery feedback.** Mission Mastered feedback and mastery-branch energizing are wired. Actual animation, affordability feedback, and branch discovery have not been runtime-reviewed.
- **Partially complete - Weekly quality points remain separate.** Weekly performance scoring can recognize no-damage/quality results without re-awarding permanent star coins. Automated isolation tests pass; in-game flow is unverified.

## Phase 12 - mastery branches and Research Supply Drop

- **Partially complete - mastery branches.** Ten three-star, one-time branches are authored; Bastion Protocol's Present Drop is preserved, and later sectors use formation/support/elite remixes. Durable progress and non-regressing Campaign checkpoints are automated.
- **Partially complete - stable Supply Drop packages.** Four stable package asset IDs and package types are referenced by the dedicated supply-drop runtime entity; no asteroid entity semantics are used.
- **Partially complete - destruction and settlement.** The entity has nearest-neighbor package rendering, destruction effects, coin bursts, one-time settlement, duplicate protection, durable coin reserve, schema support, and founder test hooks.
- **Partially complete - actual gameplay-scale visual proof.** The dedicated entity, assets, effects, and automated contracts exist, but no recorded runtime inspection confirms all four package sprites, transparency, absence of magenta artifacts, destruction animation, and coin burst at gameplay scale.

## Phase 13 - Weekly high-score streak

- **Partially complete - persistent Weekly Streak model.** State includes week/reset binding, start/current node, visited nodes, selected routes, score events, and finalization/submission status.
- **Partially complete - selectable start and preflight.** Any unlocked Weekly-eligible node can start a streak; the graph entry has the longest point ceiling and later starts are shorter. Route summaries, recommended power, ship/support, rules, and confirmation are wired into the map.
- **Partially complete - connected forward traversal.** Only direct outgoing nodes continue a streak; each node scores once; route choice is binding until a rejoin; backward, repeated, and disconnected choices require confirmation and finalize.
- **Partially complete - scoring model.** docs/WEEKLY_CAMPAIGN_STREAK_SCORING.md covers enemies, Waves, Missions, elites, mini-bosses, bosses, performance, route risk, streak multiplier, and remaining lives. All ten forks have deterministic risk/reward simulations with tradeoffs.
- **Complete and runtime-verified - runtime score fidelity.** GameEngine now records stage-scoped regular, elite, mini-boss, and major-boss kills from actual destruction events, deduplicates boss encounters, and publishes those exact counts through one canonical App/simulator adapter. Accuracy remains `null` until real shot/hit telemetry exists rather than inventing a value. Focused Weekly/receipt/Wave tests and Mission 2/7 real-engine smoke clears pass; server authority remains the separate limitation below.
- **Partially complete - Top 100 and proposals.** Finalized Weekly scores reuse display-name, leaderboard, weekly reset, winner, and proposal-selection flows. Proposal session-reuse tests pass.
- **Partially complete - Campaign coin isolation.** Automated tests prevent repeated Campaign clear/star coins in Weekly mode. No full in-game Weekly run has been submitted.

## Phase 14 - wallet signature flow

- **Partially complete - exact prompt cause documented.** docs/WALLET_SIGNATURE_FLOW.md records that the prompt is an offchain authentication message, not a gas transaction. It authorizes the wallet-bound cloud profile and prize identity.
- **Partially complete - secure cached sessions.** Challenges use a nonce and expiry, prevent replay, and create a 30-day HttpOnly, Secure, SameSite cookie. Routine wallet disconnect no longer intentionally destroys the valid session.
- **Partially complete - guest behavior.** Guests can play Campaign and Weekly, keep a local Pilot profile, use Hangar/upgrades/supports, enter eligible names, and browse proposals without an automatic Base signature in automated flows. Desktop runtime additionally verified a guest Mission defeat reaching Pilot name / Skip score without a wallet prompt; the remaining guest feature matrix is not complete.
- **Partially complete - wallet cross-device behavior.** Authenticated wallet profiles synchronize persistent state. A new device, expired session, or different wallet correctly requires authorization; ordinary browsing should reuse the session.
- **Partially complete - proposal selection.** A valid wallet-profile session selects a proposal without a second signature; mismatched wallets are rejected. A real Base-account/mobile browser flow has not been reviewed.

## Phase 15 - score and reward security

- **Partially complete - existing receipt protection.** Server-issued run IDs, signed receipts, weekly cutoff binding, duplicate rejection, and revision checks protect the existing score path. Guest runs are bound to an HMAC digest of the local Pilot identity; an already-authenticated wallet run is bound to that exact wallet/profile and must finish under the same protected session without introducing a guest wallet prompt.
- **Partially complete - Weekly route receipt validation.** A Weekly run-start token now binds the exact canonical active-streak prefix: week/reset, start/current node, creation time, revision, visited/route/event counts, scored duration, and prefix digest. Final proof must preserve that prefix, extend it strictly after the server bind time, and advance revision for each new route, score, and finalization. The server also validates exact visited-node order, unique authored edge commitments, current-source/next-target topology, prerequisites, Weekly eligibility, no revisits, unique ordered score events, source scoring before an edge, score timestamps after incoming commitments, allowlisted finalization reasons, and terminal completion. Route choices and commitment timestamps are still client-attested rather than witnessed live by the server.
- **Partially complete - impossible-state and rate checks.** Signed run-start tokens bind standard versus weekly-streak mode. The server rejects Weekly tokens without a finalized graph proof and standard tokens carrying one, and the story-transmission launch passes the live run mode. Exact authored Wave/boss counts and conservative authored encounter aggregates are enforced alongside bounds for kills, damage, lives, accuracy, completion, score, and coins. Each Mission must report at least 80% of its authored clear-after-duration time, and only post-prefix Mission duration is compared with server-measured wall time plus bounded latency tolerance. Combat outcomes remain client-attested.
- **Partially complete - one-time reward security.** Campaign/mastery receipts, branch settlement, and Boss Archive rewards are idempotent in ordinary retries. Daily replay IDs are kept out of the permanent Campaign claim ledger and use per-Mission epochs, protecting authored first-clear/star/boss/mastery claims from calendar churn; attempt/result and credited-grant caches remain bounded.
- **Blocked - tournament-grade authoritative simulation.** Connected-wallet cloud saves remain client-authored sanitized snapshots, and the server does not replay the game. Strong anti-cheat requires a server-owned ordered event ledger or deterministic authoritative simulation.

## Phase 16 - boss and mini-boss assignments

- **Partially complete - ten canonical assignments.** All ten sectors use actual canonical Boss Factory event IDs, not indexes. Locked presentation uses spoiler-safe canonical silhouettes; defeated presentation reveals canonical names/art.
- **Partially complete - Boss Archive integration.** Authored boss victories unlock the matching Archive entry, replays are noncompetitive, legacy inference is conservative, and focused Archive tests pass.
- **Partially complete - campaign readiness.** The fresh deterministic boss matrix accepts the final boss-event curve and normalized lead-ins at 173/180, with every expected and upgraded trial clear and peak 17. Boss Factory quality gates retain provisional encounter/art/runtime evidence, and no human/device pass has approved all ten fights.
- **Partially complete - mini-bosses.** Ten stable entries cover both checkpoints in every sector. The eight newer anatomies have live runtime choreography and deterministic mobile safe-route/cleanup proof; duration, reward feel, and human gameplay readability remain unapproved.

## Phase 17 - Campaign Map presentation

- **Complete and runtime-verified - desktop graph presentation.** The desktop browser displayed all ten sectors, A/B forks, rejoin connections, locked boss silhouettes, current/unlocked/completed states, mastery branches, node details, and the Weekly panel without replacing the established visual design. A clean desktop run also advanced through Continue Current Streak Mission, loading, transmission, and into live Pixi Wave flight.
- **Partially complete - node detail content.** Route labels, actual Wave counts, risk/reward summaries, recommended supports, power, rewards, and objectives are data-driven. Spoiler and copy review is incomplete.
- **Partially complete - Weekly route states.** Legal outgoing nodes and a backward/disconnected confirmation are implemented. A distinct visible invalid-backward node state and actual Weekly interaction walkthrough have not been confirmed.
- **Partially complete - responsive map.** A same-origin in-app-browser QA harness rendered the Campaign Map at 390px and launched Mission 1 through Pixi flight/result without startup failure; the temporary harness was removed. This is responsive-browser evidence, not a physical phone/touch/performance review.

## Phase 18 - founder-only developer controls

- **Partially complete - founder authorization.** Existing authorized-wallet checks gate Campaign Lab, Boss Archive developer lifecycle, and direct callbacks. No new founder address was guessed.
- **Partially complete - handler protection.** Boss Archive founder controls recheck live authorization, and source tests cover unauthorized callbacks. Coverage of every graph/economy/Weekly control, URL/state manipulation path, and applicable server endpoint is incomplete.
- **Blocked - full live founder authorization matrix.** Automated guards cover important unauthorized paths, but the authorized founder wallet/session needed to exercise founder, disconnect, founder-to-normal switch, and live endpoint cases was not available to this audit.

## Phase 19 - Campaign and Weekly Lab

- **Partially complete - complete requested control surface.** Founder-only tooling now selects sector/Mission/Wave, graph route, ship/support, upgrade levels, low/expected/upgraded presets, Campaign or Weekly launch, route-choice and backward-selection simulation, formation loop, mini-boss/boss skips, guest/wallet auth-flow previews, optional mastery-branch outcomes, and map-node states.
- **Partially complete - complete requested telemetry surface.** Combat budget, roles, hostile-projectile peak, damage, DPS, enemy TTK, FPS, per-Wave coins earned, and Weekly points earned are exposed.
- **Partially complete - guarded integration.** App callbacks recheck live founder authorization, and the combined Weekly receipt/profile/map suite passes 48/48. The full live founder-wallet matrix remains missing, so these controls are not marked runtime-verified.

## Phase 20 - persistence and migration

- **Partially complete - graph persistence.** Version-4 Campaign progress stores unlocked/completed graph nodes, furthest main graph node, recommended/current node, selected routes, completed alternatives, internal Wave checkpoint, stars, rewards, branches, bosses, scores/times, and coins.
- **Partially complete - Weekly persistence.** Weekly Streak state, score, visited route, finalization, and week reset binding are stored in guest and wallet profiles and sanitized at reset.
- **Partially complete - wallet/Pilot persistence.** Ship upgrades, supports, local Pilot profiles, authenticated wallet profiles, and permanent Boss Archive unlock/viewed state are sanitized and merged.
- **Blocked - live Supabase Boss Archive/profile settlement rollout.** The required schema/function changes are prepared in supabase/wallet-cloud-profiles.sql, but this Goal forbids deployment/external mutation and the live migration has not been applied or verified. Production cross-device Boss Archive settlement cannot be called runtime-ready until an authorized operator applies and verifies that migration.
- **Partially complete - documented migration.** game-config/campaign-migration-v23.json maps the former 20 linear Mission IDs and all 60 graph aliases into revision-23 graph IDs. Automated tests cover legacy v3 migration, save/load, anti-skip repair, merge, and replay without checkpoint regression.
- **Blocked - live legacy-profile proof.** Automated migration is green, but no backed-up real historical player profile is available to migrate and verify across browser restart, wallet switch, and second-device synchronization.

## Phase 21 - mandatory balance simulation

- **Complete and runtime-verified - final ten-boss matrix.** docs/CAMPAIGN_BALANCE_MATRIX.md and artifacts/campaign-balance/final-boss-matrix.json contain 180 fresh real GameEngine trials against the final normalized lead-ins: 10 bosses x 2 viewports x 3 power tiers x 3 support states.
- **Complete and runtime-verified - final automated boss metrics.** The current matrix records 173/180 clears, 6 low-power deaths, 1 unsupported timeout, expected 60/60, upgraded 60/60, expected/mobile 30/30, all-mobile 87/90, and global peak 17 below the 80-projectile cap. Per-boss clears are M5 17/18, M10 18/18, M15 16/18, M20 18/18, M25 17/18 plus one timeout, M30 18/18, M35 18/18, M40 17/18, M45 18/18, and M50 16/18. Focused boss/config contracts pass 37/37; syntax, lint, JSON, and diff checks pass.
- **Complete and runtime-verified - real-engine non-boss matrix execution.** The definitive isolated GameEngine harness completed all 600 deterministic cells for 50 non-boss graph nodes (40 main plus 10 alternatives), low/expected/upgraded power, no support versus level-5 Prism+Beacon, and mobile 390x844 versus desktop 1280x720. The current source digest is `fd37c1b3756622387ba38790fb66871e52316f58c83973f63f8c96d122d5adec`. It records outcome, death Wave, damage, coins, enemies/Waves, App-equivalent Weekly points, hostile/player projectile peaks, active entity/firing-enemy peaks, threat/performance-cost peaks, and heavy-scene frames, with detailed Mission 2 and Mission 7 rows. Artifacts: docs/CAMPAIGN_NONBOSS_BALANCE_MATRIX.md and artifacts/campaign-balance/nonboss-runtime-matrix.json; focused validation passes 3/3 plus syntax and ESLint.
- **Complete and runtime-verified - automated non-boss acceptance.** The calibrated frozen matrix produces 564 clears, 27 deaths, and 9 unsupported timeouts (94.0%). Expected+paired and upgraded+paired clear 50/50 on both mobile and desktop; Mission 2 clears 12/12 and Mission 7 clears 10/12. Every Mission has a clear, and there are no power inversions, support inversions, projectile-cap breaches, or performance-mode cells.
- **Partially complete - non-boss performance/readability proxy.** Peak hostile projectiles are 18, peak active entities 127, and peak active firing enemies 12. No cell entered performance mode or crossed the >80 projectile readability threshold; 219 cells entered heavy-scene mode. Actual device FPS/readability remains missing.
- **Complete and runtime-verified - automated boss retune record.** The baseline is preserved as a rejected curve, and the fresh bounded rerun against final authoring produces 173/180 with all expected-power and upgraded cells green.
- **Partially complete - human desktop balance review.** The automated matrices and bounded desktop runtime paths provide substantial evidence, but no complete human desktop playtest covers low/expected/upgraded loadouts, both support combinations, Missions 2 and 7, first armor/mini-boss/fork/mastery/Supply Drop, tiers 1-7, hearts 3-10, and early speed.
- **Blocked - physical mobile/device balance review.** No physical phone/tablet touch and performance session was available to verify the same balance/readability matrix on real hardware.

## Phase 22 - actual runtime review

- **Complete and runtime-verified - desktop Home, Campaign Map, standard/continue launch, pause, and guest-defeat paths.** The local application opened, the 10-sector graph rendered, standard and Continue Current Streak launches reached live Pixi Wave flight, the Mission 1 pause overlay correctly showed Mission/Wave plus music/SFX controls, and a guest defeat reached Pilot name / Skip score without a wallet prompt. These prove bounded paths, not a completed Mission, Weekly submission, or balance result.
- **Partially complete - normal Campaign walkthrough.** Bounded Home, Map, launch, pause, and defeat paths are proven, but Continue, both fork choices, rejoin, alternate replay, checkpoint preservation, Missions 1/2/7, a full normal Mission, mini-boss, boss buildup, boss clear, silhouette reveal, mastery unlock, and Supply Drop have not been completed as one player-driven review.
- **Partially complete - upgrade walkthrough.** Upgrade implementation and automated tier tests exist, but health, speed, Fire Rate tiers, and one-through-seven visible projectiles have not been manually reviewed end to end.
- **Partially complete - Weekly walkthrough.** Weekly state, scoring, route, and isolation tests exist, but start-node choice, route fork, backward warning, finalization, submission, guest Top-100 name, proposal selection, and coin isolation have not been manually reviewed as one flow.
- **Partially complete - standard wallet/session walkthrough.** Automated cloud sync, session reuse, account-switch, and rejection tests pass; a complete real Base account/device walkthrough has not been recorded.
- **Blocked - founder walkthrough.** The live authorized founder wallet/session required to exercise founder-only controls and founder-to-normal transitions was unavailable to this audit.
- **Partially complete - compact responsive-browser review.** Campaign Map and Mission 1 Pixi flight/result rendered at a simulated 390px viewport. Projectile readability, Supply Drop art, boss difficulty, and wallet prompts remain unverified in a complete responsive-browser walkthrough.
- **Blocked - physical mobile/device review.** No physical phone/tablet test session was available for touch input, device performance, audio, readability, or wallet-prompt verification.

## Validation record

| Gate | Current evidence | Status |
| --- | --- | --- |
| TypeScript | Final root typecheck exits 0 with no diagnostics | Complete and runtime-verified |
| ESLint | Whole-release `npm run lint` exits 0 with no errors and 17 unused-symbol warnings; focused Campaign, boss, and non-boss scoped gates also pass | Complete and runtime-verified |
| Production build | Final production build passes with 2,436 modules transformed | Complete and runtime-verified |
| Full automated regression | Final root `npm test` passes 1,029/1,029 with no failures | Complete and runtime-verified |
| Current focused audit | Campaign progression/reward/journal passes 33/33; Campaign/Boss security passes 42/42; final boss/config passes 37/37; non-boss acceptance/artifact passes 3/3; final Campaign/config/graph validation passes 42/42; expansion/space-run passes 9/9 | Complete and runtime-verified for the focused repository gates |
| Director | Authoritative final serial suite passes 318/318 with 0 failures in 360.4 seconds; focused twenty-third-prototype suites pass 20/20 and 26/26; only non-failing Vite CJS and already-occupied WebSocket-port diagnostics remain | Complete and runtime-verified |
| Economy | Revision-23 economy report was regenerated and is current; focused source, server-mirror, reward, and stale-file gates pass 24/24 | Complete and runtime-verified for report freshness and repeat-source guardrails; player pacing/combat-pickup telemetry remains Partially complete |
| Weekly receipt security | Focused receipt/runtime/wallet-attribution suite passes 25/25; server JS syntax checks and root typecheck pass | Partially complete - exact prefixes, order, identity, and impossible aggregates are protected, while route and combat facts remain client-attested |
| Wallet/auth session | Fresh wallet auth/client/proposal-session suite passes 22/22, including a 30-day protected cookie, matching-session reuse even before a profile row exists, routine reconnect reuse, proposal selection without a second signature, and cross-wallet rejection | Complete and runtime-verified for the automated gate; real-device matrix remains Partially complete |
| Production Supabase schema | Boss Archive/profile settlement SQL is prepared but was not applied or verified live because this Goal forbids deployment/external mutation | Blocked - authorized production rollout required |
| Campaign/Weekly Lab | Combined Weekly receipt/profile/map controls suite passes 48/48; typecheck passes | Partially complete for automated controls; live founder-wallet matrix is Blocked by unavailable founder credentials/session |
| Non-boss GameEngine matrix | Definitive digest `fd37c1b3756622387ba38790fb66871e52316f58c83973f63f8c96d122d5adec`; 600/600 cells: 564 clears / 27 deaths / 9 unsupported timeouts; M2 12/12, M7 10/12; every Mission clears; no inversions/cap/performance-mode breaches; acceptance 3/3 | Complete and runtime-verified for the automated matrix; human/device approval remains Partially complete |
| Boss balance | Fresh final matrix: 173/180 clears, 6 low-power deaths, 1 unsupported timeout; expected 60/60; upgraded 60/60; expected/mobile 30/30; all-mobile 87/90; peak 17; contracts 37/37 | Complete and runtime-verified for the automated matrix; human/device approval remains Partially complete |
| Desktop runtime | Home/Map, standard and continue-to-live-Pixi-Wave launches, Mission/Wave pause overlay, and guest defeat/name path rendered | Complete and runtime-verified for those bounded paths only |
| Mobile runtime | Campaign Map and Mission 1 Pixi flight/result rendered at simulated 390px | Partially complete for responsive-browser evidence; physical-device review is Blocked by unavailable hardware/session |
| Git/release safety | Pre-release inventory contains 182 intended files (122 tracked changes plus 60 untracked inclusions), zero files are staged, and 16 unreferenced `artifacts/campaign-proof/*.png` QA images are explicitly excluded. The later user-authorized release process is tracked separately from this audit snapshot. | Complete and runtime-verified |

The prior Mission 5/15 background-continuity defect is fixed at the authoring boundary. Both definitive GameEngine matrices and their focused/config contracts are green. Root regression, typecheck, production build, lint, economy freshness, and the authoritative 318/318 Director suite are current. The documented human/external review gaps remain open.

## Completion gates

- [ ] Campaign progression is an explicit directed graph. Implemented and automated; full runtime traversal is pending.
- [ ] Left/right siblings are distinct routes and never advance into each other implicitly. Automated; player-driven proof pending.
- [ ] Route selections persist and alternate replay cannot reduce the main checkpoint. Automated; real-profile proof pending.
- [ ] Weekly Streak traversal is connected, forward-only, strategic, and duplicate-safe. Automated; actual streak pending.
- [ ] Backtracking/replay/disconnected selection warns, finalizes, and submits the streak. Automated; runtime flow pending.
- [x] Ten five-depth sectors, fifty main depths, ten route alternatives, and ten canonical major bosses are configured.
- [x] Major bosses are assigned at every fifth main-path Mission.
- [x] Normal Missions use five to seven Waves where appropriate.
- [ ] Boss Missions use two or three combat lead-ins, recovery, then boss. Implemented and automated; gameplay pacing review is pending.
- [ ] Elites and mini-bosses have deliberate, readable, balance-approved roles. Implemented but not gameplay-approved.
- [ ] Early firing and Mission 7 pass human/full-engine review. Frozen full-engine result is 10/12 for Mission 7 with all paired-support cells clear; human review remains.
- [ ] Difficulty scales through mechanics/formations within approved hard ceilings.
- [ ] Health, speed, and Fire Rate prices pass live progression review.
- [ ] Seven-projectile main weapon remains readable and performant on actual mobile/desktop devices.
- [ ] Unified economy avoids grind, dominant farms, and flooding. Current simulation flags income risks.
- [ ] Three-star mastery and branches pass the actual runtime flow.
- [ ] Research Supply Drop visibly uses all four correct package sprites and remains one-time.
- [ ] Weekly score and Campaign coins are separate in an actual submitted streak. Automated isolation passes.
- [ ] Guest play completes all required paths without an unexpected wallet prompt.
- [ ] Wallet sessions provide secure cross-device profiles without needless repeated signatures on real devices.
- [ ] Proposal winner identity and Top-100 behavior pass actual end-to-end review.
- [ ] Weekly results gain the strongest practical server route validation or retain the exact documented authority blocker.
- [ ] Boss IDs, silhouettes, portraits, names, and Archive unlocks pass all ten actual clears.
- [ ] Founder controls pass the full authorization matrix.
- [ ] Existing real saves migrate safely to graph and Weekly state.
- [ ] Final balance matrix, current regression, Director, and human mobile/desktop runtime review pass. Both automated balance matrices, root 1,029/1,029 regression, and Director 318/318 pass; human/device review remains.
- [x] Every incomplete item has a specific implementation, validation, balance, authority, or runtime gap recorded above.
- [x] No files are staged and no commit, push, merge, or deployment is performed for this Goal.

## Remaining product/architecture gaps versus evidence-only gaps

### Product or architecture gaps

- **Blocked - server-authoritative valuable-run simulation.** Connected-wallet Campaign saves, Weekly route choices, and combat outcomes are still client-attested within strict server topology/range checks. Closing this gap requires a server-owned deterministic event ledger or authoritative simulation, not another UI or source test.
- **Blocked - production database migration.** supabase/wallet-cloud-profiles.sql requires an authorized live Supabase schema/function rollout and verification. The current no-deploy Goal cannot perform it; production wallet/Boss Archive settlement must not be represented as live-ready beforehand.
- **Partially complete - durable idempotency horizon.** Daily replay IDs no longer share the permanent Campaign claim ledger, so calendar churn cannot evict first-clear, star, boss, or mastery receipts; replay dates remain guarded by the per-Mission epoch map. Attempt/result and credited-grant histories are still bounded, so a permanent or server-compacted claim ledger is required for an indefinite event-retention horizon.
- **Partially complete - role vocabulary; formation policy complete.** Explicit reusable shield, carrier/spawner, kamikaze, and mini-boss role types remain incomplete. Simultaneous-shooter, formation recovery, maximum-pack-instance, exact declaration, and cooldown policies now have focused proof across all 386 grouped events with zero authoring conflicts.
- **Partially complete - mini-boss human approval.** Ten stable definitions and 20 placements cover the ten sectors; eight new anatomies have deterministic runtime safe-route proof, while their player-perceived readability, pacing, and reward feel still need human mobile/desktop approval.
- **Partially complete - score-event authority.** Weekly score events now receive exact runtime regular/elite/mini-boss/major-boss kill counts and deliberately omit unsupported accuracy, but the browser still attests those combat facts to the server. A server-witnessed event stream or authoritative simulation remains required for stronger tournament integrity.
- **Partially complete - non-boss human balance approval.** The frozen real-engine matrix passes automated acceptance at 564/600, every required expected/upgraded paired slice at 50/50, no zero-clear Mission or inversion, and Mission 7 at 10/12. Human reproduction is still required to approve feel, readability, and unsupported difficulty.

### Evidence-only gaps

- **Partially complete - human desktop playtest record.** Automated matrices and bounded desktop paths exist, but they do not prove complete readability, audio, animation, pacing, or player-perceived difficulty.
- **Blocked - physical mobile/device playtest record.** Real touch feel, hardware performance, and device readability cannot be verified without an available physical phone/tablet session.
- **Partially complete - complete normal Campaign and Weekly walkthroughs.** Implemented and automated flows exist, but forks, both routes, rejoin, alternate replay, checkpoint preservation, Weekly backward finalization/submission, Top 100 naming, and proposal selection still need actual player-driven proof.
- **Partially complete - actual Supply Drop visual proof.** The assets and runtime entity exist; all four package variants, transparency, destruction, and burst effects still need inspection at gameplay scale.
- **Partially complete - standard Base wallet matrix.** Automated session reuse, account switching, proposal reuse, and rejection cases pass, but a real Base account/device trace is not recorded.
- **Blocked - founder authorization matrix.** The required authorized founder wallet/session was unavailable for founder disconnect/switch/tampering and live endpoint cases.
- **Blocked - real legacy-profile migration proof.** Automated migration passes, but no backed-up historical browser/wallet profile was available to migrate, restart, switch, and synchronize on a second device.
- **Partially complete - all-ten-boss human clear/Archive proof and full upgrade proof.** Canonical IDs and automated balance pass, but silhouettes, reveals, Archive unlocks, health/speed affordability, projectile tiers 1-7, and hearts 3-10 need actual gameplay review.

## Delivery report index

1. **Graph - Partially complete.** Revision-23 directed graph: 60 nodes, 50 main, 10 alternatives.
2. **Routes/rejoins - Partially complete.** One A/B fork per sector, explicit rejoin, automated sibling isolation.
3. **Migration - Partially complete.** Revision-23 mapping and automated migration exist; live proof is separately Blocked because no backed-up real legacy profile is available.
4. **Ten-sector structure - Partially complete.** Configured; complete gameplay traversal is missing.
5. **Boss assignments - Partially complete.** Ten canonical IDs are assigned and the fresh final 180-cell boss matrix passes; human/device approval remains.
6. **Wave counts - Partially complete.** 330 total; boss Missions now have two combat lead-ins, recovery, and boss, but gameplay pacing review is missing.
7. **Mini-boss placements - Partially complete.** Ten catalog entries occupy 20 deterministic checkpoints; automated runtime/safe-route evidence is complete for the eight newer anatomies, while human/device review remains incomplete.
8. **Early introduction - Partially complete.** Authored holds/limits exist; strict early-fire proof is missing.
9. **Formation/budgets - Complete and runtime-verified at the automated contract level.** Eleven packs plus shooter, recovery, simultaneous-instance, exact-binding, and cooldown policies are proven for all 386 grouped events; human pacing/readability review remains part of the broader runtime review.
10. **Mission 7 - Partially complete.** Frozen full-engine result is 10/12 with every paired-support cell clear; human reproduction remains.
11. **Upgrade prices - Partially complete.** Exact health/speed/fire curves are simulated; live affordability is unapproved.
12. **Fire tiers - Partially complete.** Seven tiers are automated; actual device proof is missing.
13. **Economy - Partially complete.** The full deterministic report exists and the dominant Reward Center/Boss Archive repeat sources now pass bounded guardrails; ordinary combat-pickup replay and live pacing telemetry remain.
14. **Achievements/Reward Center - Partially complete.** The 30-day calendar is 9,450 and all one-time achievement tiers total 10,400, keeping their combined long-horizon value near one expected Campaign; live retention pacing remains unapproved.
15. **Stars/mastery - Partially complete.** Persistent/idempotent and authored; actual runtime flow is missing.
16. **Supply Drop - Partially complete.** Dedicated package entity and settlement exist; visual proof is missing.
17. **Weekly rules - Partially complete.** Forward graph model and ending rules are automated; runtime flow is missing.
18. **Weekly score - Partially complete.** The documented model, exact engine-owned kill-category adapter, signed run-mode binding, and server graph-proof validation exist; route choices and combat facts remain client-attested rather than server-witnessed.
19. **Route balance - Partially complete.** Ten-fork simulation shows tradeoffs; human gameplay is missing.
20. **Guest/wallet behavior - Partially complete.** Local Pilot and cloud wallet profiles exist and automated wallet-session checks pass; a complete standard real-account/device flow is not recorded, while production Supabase rollout is Blocked pending authorized migration.
21. **Prompt cause - Partially complete.** Offchain profile-auth signature documented; real-device trace is missing.
22. **Signature changes - Partially complete.** Cached 30-day session and proposal reuse exist; account/device matrix is missing.
23. **Proposal security - Partially complete.** Session-bound winner checks pass automated tests; end-to-end winner flow is missing.
24. **Top 100 - Partially complete.** Existing leaderboard/display-name integration is reused; actual Weekly submission is missing.
25. **Save migration - Partially complete.** Graph/Weekly/Boss state migration tests exist; live legacy-profile proof is Blocked by the absence of a backed-up real profile, and production Supabase migration is Blocked pending authorized rollout.
26. **Founder tests - Partially complete.** Focused guards exist; the live founder authorization matrix is Blocked by unavailable founder credentials/session.
27. **Mobile/desktop playtests - Partially complete.** Desktop bounded paths and a simulated 390px Map/Mission path render; complete human desktop review is partial, while physical mobile/touch review is Blocked by unavailable hardware/session.
28. **Runtime views - Partially complete.** Desktop Home and Map inspected; all gameplay flows remain.
29. **Validation - Partially complete.** The definitive 600-cell non-boss matrix, final 180-cell boss matrix, root 1,045/1,045 regression, root and Director typechecks, zero-error whole-release lint, 2,437-module production build with Director exclusion verified, current economy report, focused/config gates, and authoritative Director 321/321 suite pass. Human/device evidence remains open.
30. **Changed files - Complete and runtime-verified.** Pre-release scope is 182 intended files: 122 tracked changes plus 60 untracked inclusions, with zero staged files at the audit point. Sixteen unreferenced `artifacts/campaign-proof/*.png` QA images are excluded from release scope.
31. **Limitations - Complete and runtime-verified as documentation.** Exact balance, server-authority, receipt-retention, live authorization, migration, regeneration, and runtime-review limitations are recorded above.

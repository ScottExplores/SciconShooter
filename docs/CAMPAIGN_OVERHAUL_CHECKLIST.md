# SciCon Shooter Campaign Overhaul Checklist

This checklist tracks the mandatory Campaign Mode overhaul requested on 2026-07-27. A checked item means the behavior is present in the actual Campaign path and has direct source/config/test evidence. A panel, type, placeholder, static screenshot, or passing build alone is not enough.

Status vocabulary:

- **Already complete and verified** — implemented in the Campaign runtime and covered by direct evidence.
- **Partially complete** — a usable subsystem exists, but at least one mandatory behavior remains absent or unverified.
- **Missing** — no adequate implementation or validation exists yet.
- **Blocked** — completion requires evidence or work that is not currently available; the exact reason is recorded.

## Audit snapshot — 2026-07-28

Overall status: **Not complete.** The source/configuration overhaul is substantially implemented, but mandatory live playtesting, the actual runtime visual review, and strict Gatekeeper Boss Factory release evidence remain open. Explicit security/trust limitations discovered during the audit are also recorded below.

Section tally (23 numbered sections):

- **Already complete and verified:** 7 sections (1, 2, 6, 13, 17, 19, 21).
- **Partially complete:** 14 sections (3, 4, 5, 7, 9–12, 14–16, 18, 20, 22).
- **Blocked:** 2 sections (8, strict Boss Factory release; 23, runtime visual review blocked by the available browser security policy).
- **Missing:** 0 sections.

Authored revision-22 route:

- 4 sectors × 5 Missions = 20 main-path Missions.
- Each sector uses Wave counts `[5, 6, 5, 7, 1]`, for 96 authored main-path Waves total.
- Major bosses: Mission 5 Gatekeeper Prime, Mission 10 Eclipse Engine, Mission 15 Helix Leviathan, Mission 20 Research Tribunal.
- Checkpoint/preparation encounters: Missions 3/8/18 use Bottleneck Drone; Mission 13 and Missions 4/9/19 use Paywall Wall; Mission 14 uses Bottleneck Drone.
- Optional mastery branches: Present Drop, Formation Challenge, Support Trial, and Elite Remix—one per authored sector.

Primary evidence reviewed:

- `game-config/campaign.json` revision 22 and `game-config/campaign-migration-v22.json`.
- `services/campaignProgression.ts`, `services/campaignBranchProgression.ts`, `services/campaignBranchRuntime.ts`, `services/gameLogic.ts`, `services/squadProgression.ts`, `App.tsx`, and `components/CampaignMap.tsx`.
- Browser/Director validation in `game-config/validate.ts`, `director/server/gameCampaignValidation.mjs`, and `director/tests/campaignOverhaulValidation.test.mjs`.
- Focused Campaign tests including `campaignProgression`, `campaignWeeklyIsolation`, `campaignMapUi`, `campaignBranchExpansion`, `campaignBranchServerSettlement`, `campaignEconomySimulation`, `waveVictoryFlow`, and `gatekeeperPrimeRuntime`.
- `docs/CAMPAIGN_ECONOMY_SIMULATION.md`, `docs/CAMPAIGN_SAVE_MIGRATION_V22.md`, and `docs/CAMPAIGN_OPTIONAL_BRANCH_ROUTES.md`.
- Gatekeeper package verdict in `director-data/prototype-assets/gatekeeper-prime/evidence/visual-verification.md`.

Not performed by this checklist audit: browser operation, screenshot approval, mobile/desktop playthroughs, staging, commit, push, merge, or deployment.

Final automated validation recorded on 2026-07-28:

- Production build: `npm run build` passed (2,428 modules); Director-only source remained excluded from the shipped bundle.
- Root typecheck: `npm run typecheck` passed.
- Repository regression suite: `npm test` passed 937/937 tests with zero failures, skips, cancellations, or todo items (73.5 seconds reported test duration).
- Scoped Campaign/App ESLint passed for the changed runtime and UI files.
- Director typecheck: `npm --prefix director run typecheck` passed with no diagnostics.
- Targeted Director Campaign authoring/runtime suites passed 39/39 tests. The aggregate `npm --prefix director run check` command itself exceeded the five-minute command window because it runs additional expensive route proofs; the separated typecheck and Campaign suites above are the recorded proof.
- Economy verification: `node tools/simulate-campaign-economy.mjs --check` passed and confirmed that `CAMPAIGN_ECONOMY_SIMULATION.md` is current.
- `git diff --check` passed; line-ending conversion warnings are informational only.
- The 16 unreferenced files under `artifacts/campaign-proof/` are excluded from the authored release inventory and were not deleted or modified.

## Pre-change inspection and process

- [x] **Already complete and verified:** Inspect the current Campaign Mode implementation and runtime ownership path.
- [x] **Already complete and verified:** Inspect and preserve the completed Bastion/Present Drop subsystem, one-time settlement, signed wallet attempts, duplicate protection, durable Campaign reserve, save-schema work, and founder controls.
- [x] **Already complete and verified:** Audit missions, Waves, formations, mini-bosses, major bosses, upgrades, support ships, rewards, persistence, Map nodes, UI assets, and founder authorization.
- [x] **Already complete and verified:** Create and maintain this checklist before claiming overall completion.
- [ ] **Partially complete:** Ordered implementation continued across data, runtime, persistence, economy, branches, developer tooling, and tests; it cannot be called complete until the open runtime, visual, security, and playtest items below are resolved.
- [x] **Already complete and verified:** No staging, commit, push, merge, or deployment was performed for this goal/checklist audit.

## 1. Five-Mission sectors

Current status: **Already complete and verified.** Revision 22 and the browser/Director validators enforce four sectors of exactly five Missions.

- [x] Main Campaign is organized into repeatable five-Mission sectors; major bosses occur every fifth Mission.
- [x] Mission 1 is the sector Introduction and teaches one readable family/formation/mechanic.
- [x] Mission 2 is Formation Remix and changes the taught pattern/entry/role response.
- [x] Mission 3 is an Elite/Mini-Boss Checkpoint with one authored climax rather than mechanically forcing a pair.
- [x] Mission 4 is Boss Preparation, combines taught roles, and uses a smaller foreshadow encounter.
- [x] Mission 5 is a one-Wave direct major-boss Mission with entrance timing and boss/sector rewards.
- [x] The Introduction → Remix → Checkpoint → Preparation → Major Boss structure is applied to all four sectors.
- [x] Missions 1–4 lead toward Gatekeeper Prime and Mission 5 is its dedicated encounter.
- [x] Mission 1 is no longer a full major boss.
- [x] Existing progress is preserved through the documented revision-21 → revision-22 migration.

Evidence: `campaign.json`, `campaignOverhaulValidation.test.mjs`, `campaignProgression.test.cjs`, and `CAMPAIGN_SAVE_MIGRATION_V22.md`.

## 2. Dynamic internal-Wave counts

Current status: **Already complete and verified.** Counts are manifest-driven and per-Wave persistence/settlement is wired into the real App flow.

- [x] Non-boss Missions no longer assume exactly three Waves; counts come from each Mission manifest.
- [x] Standard authored Missions use five to seven Waves.
- [x] Introduction Missions use five Waves.
- [x] Formation Remix Missions use six Waves.
- [x] Elite/Mini-Boss Missions use five Waves including the climax.
- [x] Boss Preparation Missions use seven Waves.
- [x] Major Boss Missions use one direct boss Wave.
- [x] Special branches use their own authored one-Wave/timed structure.
- [x] Every Mission stores its actual ordered Wave list.
- [x] Campaign Map, mission details, Home Continue, results, persistence, and Campaign Lab derive the real Wave count/ID.
- [x] User-facing Campaign paths use configured totals rather than the legacy `M01 / 3 WAVES` assumption.
- [x] Home Continue launches the exact durable `recommendedMissionId`/`recommendedWaveId` checkpoint.
- [x] Replays and profile merges cannot move the highest valid checkpoint backward.
- [x] The App settles every authored Campaign Wave, pauses on internal-Wave results, and reserves Mission/mastery evaluation for an eligible full Mission run.

Evidence: `campaignProgression.test.cjs` (dynamic 1/5/6/7-Wave unlocks, checkpoint, replay, merge, migration), `waveVictoryFlow.test.cjs`, `CampaignMap.tsx`, and `App.tsx`.

## 3. Authored Mission rhythm

Current status: **Partially complete.** The authored rhythm exists and recovery events are real; player-facing readability has not been approved in a live playthrough.

- [x] Normal Missions author Warm-up → Introduce → Bounded Variation → optional Support → Recovery → Peak → optional Clear beats.
- [x] Every non-boss Mission contains an explicit recovery beat/event rather than maintaining maximum intensity.
- [x] Formation packs, event labels, Wave names, and rhythm metadata identify the lesson and intensity progression in source.
- [ ] **Partially complete:** Actual player readability—formation entry, priority target, intensity change, recovery, and approaching completion—has not been observed and approved on mobile and desktop.

Evidence: revision-22 Wave `rhythm` values and recovery events; structural validation passes. Remaining evidence belongs to sections 22–23.

## 4. Mechanical difficulty progression and readability limits

Current status: **Partially complete.** The manifests/runtime now use multiple mechanics and bounded costs, but the full route has not been live-balanced.

- [x] Authored difficulty varies formation, entry/pattern, roles, firing, armor/durability, environmental pressure, checkpoints, recovery, and boss foreshadowing—not only speed/health.
- [ ] **Partially complete:** No completed matrix yet proves that no Mission raises every difficulty dimension at once in a way that feels excessive.
- [ ] **Partially complete:** Threat caps, role simultaneous limits, mobile performance budgets, firing limits, and projectile telemetry are implemented, but safe readability/performance across every Mission is not live-verified.
- [ ] **Partially complete:** Later sectors are structurally more intricate in data, but “more intricate rather than merely faster/tougher” remains a gameplay judgment pending section 22.

Evidence: enemy-role/formation-pack manifests, Campaign Lab telemetry, `gameLogic.ts` runtime caps, and `campaignOverhaulValidation.test.mjs`.

## 5. Enemy role and durability manifests

Current status: **Partially complete.** Nineteen roles and four durability classes are authored, validated, and consumed by `GameEngine`; final visual/TTK validation is outstanding.

- [x] The roster is classified into formation, diver, flanker, shooter, burst, suppressor, armored, support, priority, leader, and elite roles using project assets.
- [x] Every role defines threat cost, introduction sector/Mission, durability, fire/entry behavior, compatible packs, synergy tags, cooldown, max simultaneous count, and performance cost.
- [x] Light roles use low durability and can suppress immediate fire.
- [x] Standard roles use moderate durability and authored post-formation firing where appropriate.
- [x] Armored roles reference distinct armored/shield/heavy sprite identities and sustained-damage behavior.
- [x] Elite roles reference distinct identity, bounded counts, mechanics/telegraphs, and increased value.
- [x] Sector introductions progress from Light/Standard reading toward shooters, armor, support, priority, and specialized combinations.
- [ ] **Partially complete:** A live visual/TTK pass has not yet proven that every reused sprite/health increase remains visibly and mechanically legible at gameplay scale.

Evidence: `campaign.json`, both validators, `campaignOverhaulValidation.test.mjs`, and role consumption/limits in `gameLogic.ts`.

## 6. Formation packs and combat budgets

Current status: **Already complete and verified at the data/runtime contract level.** Live tuning quality remains part of section 22, not a missing formation-system feature.

- [x] A data-driven threat-cost system is authored and consumed by runtime spawning.
- [x] Ten reusable packs define roles/count, exact weighted threat, entry/path/shape, firing, synergy, minimum sector, max instances, recovery, compatible Mission/sector themes, and mobile performance cost.
- [x] Every Mission and internal Wave has an authored combat budget.
- [x] Validation enforces exact pack usage, role/sprite references, weighted budget coverage, compatible sectors/Mission roles, introductions, and bounded threat/performance limits.
- [x] Encounter packs are authored/deterministic; no unrestricted procedural pack selection was added.

Evidence: `campaignOverhaulValidation.test.mjs`, browser/Director validators, `gameLogic.ts`, and revision-22 manifests.

## 7. Mini-boss catalog and encounters

Current status: **Partially complete.** Catalog/placement are complete; strict per-mini-boss visual and safe-route evidence is not.

- [x] Bottleneck Drone and Paywall Wall are cataloged with ID, art identity, combat role, two attacks, sectors, threat, recommended power, solo/paired use, Campaign readiness, and validation status.
- [x] Revision 22 places a single checkpoint/preparation mini-boss at each authored climax and grants extra one-time rewards at Missions 3/8/13/18.
- [ ] **Partially complete:** Readable entrance, anatomy-specific motion, telegraph quality, duration, reward feel, and each two-attack sentence have not been visually reviewed as a focused mini-boss package.
- [ ] **Partially complete:** Dedicated deterministic safe-route tests for each mini-boss attack are not present at the same standard as Gatekeeper Prime.
- [x] No paired mini-boss encounter is authored in revision 22; therefore no unproved paired route is shipped. A future pair must add complementary-mechanic and combined-route proof before use.

## 8. Gatekeeper Prime / Paywall boss

Current status: **Blocked for strict Boss Factory release; production runtime logic and deterministic route proof pass.** The one-boss lock remains active.

- [x] Mission 5 is one dedicated direct Gatekeeper Prime encounter with no unrelated approach Waves.
- [x] Runtime patrol stays bounded in the upper arena, changes direction predictably, descends only in attack phases, and does not track/dive at the player.
- [x] Gatekeeper rises/resets to baseline after each attack sequence.
- [x] Runtime size, acceleration, contact bounds, telegraphs, and mobile/desktop projectile caps are bounded.
- [x] Three production attacks have deterministic mobile/desktop routes above the required 6 px post-uncertainty margin; the minimum recorded clearance is 17.58 px.
- [ ] **Blocked:** Strict Boss Factory Gate 1 requires native bounded-palette/binary-alpha structural art rather than the current antialiased legacy raster/overlay composition.
- [ ] **Blocked:** Gate 2 lacks an actual Boss Sandbox neutral-pose opacity comparison and authoritative source-derived modular hierarchy.
- [ ] **Blocked:** Gate 3 lacks the complete open/closed/articulation/fire/strike/charge/phase/stagger/death contact sheet.
- [ ] **Blocked:** Gate 4 requires a fourth anatomy-specific signature and structural phase transformation; the production runtime currently has three attacks.
- [ ] **Blocked:** Gate 5 lacks actual mobile/desktop gameplay captures, five-stage captures per attack, and a clean polished mobile screenshot.

Evidence: `gatekeeperPrimeRuntime.test.cjs`, `GatekeeperPrimeRuntime.ts`, `gameLogic.ts`, route-proof JSON, and the honest `visual-verification.md` verdict.

## 9. Ship-upgrade progression

Current status: **Partially complete.** The real costs, seventh speed level, power guidance, and static economy are integrated; live loadout balance is not proven.

- [x] The Campaign curve references the real fire-rate, seven-level movement-speed, heart/survival, per-ship, persistent weapon, support, and coin systems.
- [x] All 20 Missions define minimum/expected/comfortable power, low/expected/upgraded loadout descriptions, and support-role recommendations.
- [x] A shared power formula counts the main ship plus only the two equipped supports; it no longer inflates the Hangar rating with every owned mini ship. Max main plus two level-five supports equals the authored 8,860 ceiling.
- [x] Campaign Lab shows the live loadout rating against the selected Mission bands and its low/expected/upgraded presets equip zero/one/two concrete recommended supports.
- [ ] **Partially complete:** Skilled low-power, fair expected-power, and meaningful-but-not-mechanic-skipping upgraded clears have not been run for all sectors.
- [ ] **Partially complete:** Static simulation shows no forced replay on the reference basket, but no live evidence yet rules out a mandatory support choice, sudden grind wall, or poor alternate purchase order.
- [x] No arbitrary daily Campaign play cap was introduced; progression is through clears, stars, branches, coins, upgrades, support experimentation, and mastery.

Evidence: `campaign.json`, `upgradeSprites.test.cjs`, and `CAMPAIGN_ECONOMY_SIMULATION.md`.

## 10. Support-ship experimentation

Current status: **Partially complete.** Data and optional routes are implemented; their balance value remains untested.

- [x] Mission recommendations use anti-swarm, anti-armor, lane-control, boss-damage, survival, and anti-summon tags.
- [x] Every recommendation tag maps to actual support-ship IDs/names, and the Map presents the concrete ship choices instead of an abstract tag alone.
- [x] Revision 22 includes optional recommendations and the Sector 3 Ion Support Relay trial route without changing the main checkpoint.
- [x] No main-path Mission requires one exact support ship, and the trial does not permanently grant locked/premium support ownership.
- [x] Branch and Campaign Lab launches reuse the canonical support/GameEngine architecture.
- [ ] **Partially complete:** No completed playtest matrix yet proves that no-support plus two relevant support combinations feel meaningfully different and fair.

## 11. Reward and economy overhaul

Current status: **Partially complete; static economy and settlement contracts verified.** Live earnings and balance remain open.

- [x] Real upgrade costs, coin sources, Mission lengths, first/replay/branch rewards, weekly boundaries, and code-available clear assumptions were audited.
- [x] Wave-clear rewards are configurable and settle exactly once after every authored successful Wave.
- [x] Mission-clear rewards are larger; replay rewards are reduced and limited to one authored payout per Mission per UTC date.
- [ ] **Partially complete:** One-time first-clear bonuses are significant and settle idempotently, but “clearly displayed” still requires the visual pass.
- [x] Missions 3/8/13/18 grant additional one-time checkpoint rewards.
- [x] Missions 5/10/15/20 grant larger boss/sector rewards and advance the next authored sector.
- [x] Star and all-three mastery-set rewards are meaningful one-time receipts.
- [x] Present Drop remains 120–377 coins and is included in the simulation.
- [x] Same-day authored replay farming is bounded to 475 coins across all 20 Missions; long-term replay and ordinary drops remain telemetry questions.
- [x] Clear-only, expected, and full-mastery scenarios cover all sectors, all four branches, real main/support costs, cadence, bounded replay, early/mid/late progression, and weekly isolation.
- [ ] **Partially complete:** The static basket has at most a two-Mission late-tier savings stretch, but actual clear rate, collected drops, purchase order, grind perception, and mandatory-support risk remain untested.
- [x] Final reward-window totals are refreshed at takeoff even when every coin was collected manually, then a stable `:final` settlement reconciles collected coins, score, records, stars, and mastery without repeating clear rewards.

Evidence: `campaignProgression.test.cjs`, `campaignEconomySimulation.test.cjs`, `campaignWeeklyIsolation.test.cjs`, `waveVictoryFlow.test.cjs`, and `CAMPAIGN_ECONOMY_SIMULATION.md`.

## 12. Persistent three-star mastery

Current status: **Partially complete.** Objective/reward persistence now matches the requested model; live presentation remains unapproved.

- [x] Stars are cumulative, persistent, and cannot be lost on a worse replay.
- [x] Star 1 is Mission clear and grants a one-time 45/55/65/75-coin sector-scaled bonus.
- [x] Star 2 is authored per Mission using collected coins, target time, score, or limited damage and grants 70/85/100/115 coins.
- [x] Star 3 defaults to zero-damage Master Clear and grants the largest individual 115/140/165/190-coin star bonus.
- [x] The final missing star grants a separate one-time 145/180/215/250-coin mastery set reward, emits `Mission Mastered`, and unlocks the configured branch.
- [x] Performance stars/mastery require a whole-Mission Wave-1 launch; resuming a later checkpoint cannot fabricate whole-Mission mastery.
- [x] Placeholder 10/16/24 payouts were replaced with economy-calibrated values.
- [x] Static full mastery materially advances the next reference upgrade without trivializing the next sector.
- [x] Campaign results explicitly surface an upgrade that became affordable from clear/mastery or final collected-coin rewards.
- [ ] **Partially complete:** The result presentation has not been visually approved.
- [x] Post-boss final metrics are reconciled after the collection window; the regression test proves later stars/records can be added without duplicating Mission-clear rewards.

Evidence: `campaignProgression.test.cjs`, `CampaignMap.tsx`, `WaveVictoryOverlay.tsx`, and the economy simulation.

## 13. Preserve and expand branches

Current status: **Already complete and verified.** All four routes work through the canonical runtime and one-time settlement. The combat-result trust limitation below is documented for future hardening but does not remove any requested branch behavior.

- [x] Mission 5 mastery, Bastion Protocol, Present Drop, wallet-bound attempts, duplicate protection, durable reserve, branch schema, and founder controls are preserved; the Present Drop definition has a regression hash.
- [x] The original branch is attached to the reorganized first sector without changing its reward envelope.
- [x] Every authored sector has one three-star optional route.
- [x] Routes are varied: Present Drop, Formation Challenge, Support Trial, and Elite Remix.
- [x] Branches remain optional, checkpoint-neutral, main-reward-neutral, and weekly-state-neutral.
- [x] Present Drop and combat routes are one-time only on success; failure/interruption grants zero and remains retryable; claimed nodes stay visible and nonlaunchable.
- [x] Connected wallets use signed wallet-bound attempts, authored timing/bounds, fixed combat rewards, canonical profile locks, CAS/idempotency, and duplicate/race protection for all four routes.
- [x] Founder result simulation routes Present Drop through `verifyPresentDropRuntimeResult` and combat branches through `verifyCampaignCombatBranchRuntimeResult`; focused contracts cover both paths.
- [ ] **Security limitation:** Combat success still relies on client-reported `stageComplete`/bounded objective units rather than server-simulated combat proof. The server controls the fixed envelope, timing, wallet binding, and duplicate protection, but not the underlying play result.

Evidence: branch expansion/app/server tests and `CAMPAIGN_OPTIONAL_BRANCH_ROUTES.md`.

## 14. Expanded Campaign Map

Current status: **Partially complete.** Functional multi-sector Map behavior is source/test verified; actual mobile/desktop usability and final visual quality are not.

- [x] Four named sectors each show five connected main nodes plus their optional mastery branch.
- [x] Source renders completed/current/locked paths, cumulative stars, reward layers, power guidance, and support roles.
- [ ] **Partially complete:** The route is structurally twenty nodes long, but “substantially longer/more substantial” requires actual runtime review.
- [x] Opening centers near the checkpoint, preserves context/replay, supports Return to Current Mission, and cannot replace the checkpoint with replay progress.
- [x] Distinct role classes/styles exist for Introduction, Formation Remix, Elite Checkpoint, Boss Preparation, Major Boss, Bonus, and Claimed Branch nodes.
- [ ] **Partially complete:** Mobile safe-area/tap CSS and source tests exist, but hands-on tap/scroll usability was not reviewed.
- [x] Map/details display actual completed/total Wave counts.
- [x] Primary descriptions are concise and spoiler-free; they expose category/progress/power/reward/star data without listing the internal encounter sequence.
- [x] Short mobile layouts keep mastery objectives and support guidance scrollable instead of hiding mandatory information, and the narrow top line stacks without clipping.
- [x] Claimed optional routes use generic reward-secured copy rather than incorrectly calling every branch a cache.

Evidence: `campaignMapUi.test.cjs`, `CampaignMap.tsx`, and `campaign-map.css`.

## 15. Canonical locked boss silhouettes

Current status: **Partially complete.** Canonical ID resolution and progression are implemented; actual locked/revealed appearance remains unreviewed.

- [x] Major-boss nodes derive `bossId`, event ID, preview asset, and label from the canonical authored encounter rather than position/carousel order.
- [x] Locked nodes apply the canonical encounter preview as a silhouette and never substitute a different real boss; missing art falls back to an encrypted symbol.
- [x] First authored boss victory records the exact event ID, reveals the canonical name/portrait, and unlocks the matching Boss Archive entry; replays remain noncompetitive.
- [x] Boss Archive unlock/seen state survives local storage, wallet sanitization, migration, merge, and weekly rollover.
- [ ] **Partially complete:** The locked and revealed Map/Archive states have not been visually inspected in the actual mobile and desktop runtime.

Evidence: `campaignMapUi.test.cjs`, `bossArchive.test.cjs`, `walletProfileSchema.test.cjs`, `campaignProgression.test.cjs`, `recordBossVictory` integration, and canonical boss IDs in revision 22.

## 16. Campaign Map and Boss Archive visual system

Current status: **Partially complete.** Custom neon-mechanical source/CSS exists; no actual side-by-side visual approval was performed.

- [x] Existing custom Campaign Map/Boss Archive work was preserved rather than replaced with a flattened generated interface.
- [x] Source/CSS use dark navy, steel/blue, cyan/green inner edges, mechanical pixel borders, caps, depth, and restrained green/gold accents.
- [x] Dynamic text remains application-rendered and reusable assets/components are referenced instead of one flattened UI image.
- [ ] **Partially complete:** Generated borders, atlas/nine-slice scaling, corners, rails, buttons, and icons still require an in-runtime asset audit at final sizes.
- [ ] **Partially complete:** Nearest-neighbor sharpness, corner stretch, anti-aliasing, blur/glow restraint, and mobile scaling cannot be approved from source assertions.
- [ ] **Partially complete:** Map route-navigation identity and Archive containment-vault identity have not been reviewed side by side in the current runtime.

## 17. Founder-only developer authorization

Current status: **Already complete and verified at the client authorization boundary.** This does not make browser-reported Campaign combat server-authoritative.

- [x] Campaign and Boss Archive developer tools are created only when the normalized connected address matches the existing configured founder address; no new address was invented.
- [x] No/normal wallet receives no controls or empty panel; disconnect/switch recomputes access immediately.
- [x] Underlying launch/mutation callbacks re-check `founderAuthorizationRef` and reject stale direct calls, not only hidden buttons.
- [x] Direct Campaign Lab launches are rejected without live founder authorization.
- [x] Privileged secrets were not added to client code; authorized/unauthorized control objects are injectable in tests.
- [x] Unauthorized and revoked direct-action guards have focused source/tests.

Evidence: `App.tsx`, `CampaignMap.tsx`, `campaignMapUi.test.cjs`, `campaignBranchAppIntegration.test.cjs`, and Boss Archive authorization tests.

## 18. Founder Campaign Lab

Current status: **Partially complete.** The complete UI/controller/telemetry surface is wired, including branch-type-aware founder simulation, but it has not received an end-to-end runtime pass.

- [x] Supports sector, Mission, Wave, ship, support, and per-track upgrade selection.
- [x] Supports low/expected/upgraded presets and applies selected loadouts to a canonical Campaign Lab run.
- [x] Supports selected launch, formation restart/loop, skip to sector mini-boss checkpoint, and skip to major boss.
- [x] Displays combat budget, threat cap/spend, pack cost, role IDs, active Wave/formations, projectile counts/peak, firing enemies, clear time, damage, DPS, enemy TTK, FPS/frame time, performance cost/cap, and flags.
- [x] Supports saved/current/locked/new/completed node previews, branch-state previews, and star/reward result previews.
- [x] Debug snapshots are published only during an authorized Campaign Lab run; normal gameplay receives no Lab overlay.
- [ ] **Partially complete:** No actual founder-wallet end-to-end Lab run has verified every selector, control, telemetry value, preview state, and result action.
- [x] Founder success/failure simulation uses the correct verifier for Present Drop and combat branch contracts.

Evidence: `CampaignMap.tsx`, `App.tsx`, `GameCanvas.tsx`, `gameLogic.ts`, and `campaignMapUi.test.cjs`.

## 19. Data-driven Campaign definitions

Current status: **Already complete and verified.** Revision 22 and the Map consume authored sector/theme presentation without a four-sector source preset.

- [x] Manifests/types/validators cover sectors, Missions, Waves, roles, formation packs, mini-bosses, canonical major bosses, rewards, mastery, power, support, unlocks, branches, coordinates, and visual themes.
- [x] Browser and Director validators cross-check references, ranges, budgets, roles, pack usage, boss placement, Wave-count ranges, and branch contracts.
- [x] `CampaignMap.tsx` derives ordered sectors and their visual themes from `DEFAULT_GAME_CAMPAIGN`; no four-sector name/accent preset remains.
- [x] Boss Factory encounter behavior is not duplicated in Campaign manifests; Campaign references canonical boss/event/rig IDs.

## 20. Save migration and persistence

Current status: **Partially complete.** Normal save/migration/idempotency behavior is verified, while cloud trust and bounded receipt retention remain explicit security limitations.

- [x] Highest Mission/Wave checkpoint, completed Missions/Waves, stars, first-clear/star/mastery receipts, branch unlock/claim/receipts, boss defeats/Archive, records, upgrades, support loadout, and durable Campaign reserve are preserved and merged monotonically.
- [x] Revision-21 three-Wave saves map through the checked-in v22 alias manifest to valid variable-Wave prefixes without losing completed Missions.
- [x] Replays, sanitization, merges, reconnects, and older snapshots cannot reduce valid progress.
- [x] Per-Wave/final settlement uses stable result IDs; refresh/reconnect/duplicate requests are idempotent and the journal recovers interrupted weekly/permanent pair writes.
- [x] Present Drop and combat branch settlement retain wallet binding, one-time claims, race protection, and duplicate-safe receipts.
- [x] Boss Archive unlock/seen state is sanitized, cloud-round-tripped, legacy-inferred, merged, and preserved through weekly reset.
- [ ] **Security limitation:** The connected-wallet profile API sanitizes and CAS-merges Campaign state but accepts client-provided Campaign unlocks/completion/reward IDs/coin balances; it is not a server-authoritative Campaign simulator.
- [ ] **Security limitation:** Processed result/receipt collections are bounded. Ordinary duplicate/reconnect protection is verified, but a sufficiently old evicted ID is not a forever-replay-proof ledger entry.

Evidence: `CAMPAIGN_SAVE_MIGRATION_V22.md`, `campaignProgression.test.cjs`, `walletProfileSchema.test.cjs`, `campaignWalletRoundtrip.test.cjs`, and wallet profile source.

## 21. Weekly-mode isolation

Current status: **Already complete and verified.** Campaign runs are noncompetitive and Campaign rewards no longer mutate weekly competition metrics.

- [x] Weekly score progression, reset, rewards, boss sequence, checkpoints, coins, lives, and leaderboard routes are unchanged by Campaign settlement.
- [x] Campaign progress/receipts and weekly competition state remain separate; one-time durable Campaign coins survive rollover by design.
- [x] Campaign runs bypass weekly run start/finalize, boss victory, high-score, and leaderboard mutation paths.
- [x] Branches are checkpoint-neutral and weekly-state-neutral.
- [x] Explicit regression tests cover per-Wave/final Campaign settlement, reward credit, App routing, rollover, and branch isolation.

Evidence: `campaignWeeklyIsolation.test.cjs`, `campaignProgression.test.cjs`, branch tests, `App.tsx`, and `CAMPAIGN_ECONOMY_SIMULATION.md`.

## 22. Playtest and balance matrix

Current status: **Partially complete, with a bounded late-sector retune verified headlessly.** Deterministic real-`GameEngine` audits exercise the required device/loadout/support axes, but they remain automation rather than rendered human playtests.

- [x] A real-engine anchor matrix exercised all 72 sector/device/preset/support rows, totaling 144 checkpoint/major-boss Wave runs at 390×844 and 1280×720.
- [x] Presets covered low/expected/upgraded; support combinations covered none, Prism Skimmer + Beacon Kite, and Photon Manta + Ledger Hammer.
- [x] Recorded clears, deaths/timeouts, projectile/entity peaks, update timing, adaptive-performance flags, and matched-seed support differences.
- [ ] Complete rendered human testing of all four sectors, including all 96 Waves, continuous lives/resources, clear time, damage, enemy/boss TTK, coins, stars, input ergonomics, and browser/Pixi performance.
- [x] Retune and rerun the rejected late-sector major bosses: a reproducible focused controller improved M10 from 8/18 to 9/18 clears, M15 from 2/18 to 9/18, and M20 from 1/18 to 9/18, with zero timeouts after the retune.
- [x] Resolve the detected Mission 20 life-floor defect: damage and revival now use a clamped transition, raw life subtraction is removed, and 12/12 focused tests prove lives cannot fall below zero.
- [x] Resolve the expected/comfortable power-model mismatch and support-selector gap through the shared equipped-loadout rating and two-support Campaign Lab presets.
- [ ] Complete rendered human rechecks of the remaining support/device warnings, especially Mission 20 desktop; the headless result is evidence for the retune, not final balance approval.
- [x] Structural checks still reject early bosses and legacy three-Wave assumptions; 56/56 focused config/progression/runtime/economy tests passed.

Automated runtime detail: the original 144-run anchor cleared 38 Waves, with 63 deaths and 43 timeouts. The bounded late-boss follow-up uses `tools/simulate-campaign-boss-balance.mjs` against the real campaign, squad progression, entities, bosses, autofire, and touch movement at 390x844 and 1280x720. Its final per-tier results were M10 1/6 low, 3/6 expected, 5/6 upgraded; M15 1/6 low, 3/6 expected, 5/6 upgraded; and M20 3/6 at each tier (all mobile rows cleared while desktop rows remained open). Median clear times were 39.6s, 69.7s, and 56.6s, and hostile-projectile peaks were 87, 18, and 40 respectively. The retune preserves every boss's shields, three phases, six-shot radial identity, escalating lane count, warnings, recovery system, and projectile-density caps; it changes only health, movement/cadence/speed budgets, and the duration of the two lethal late phases. These measurements exclude Pixi rendering and human input, so full balance approval remains open.

## 23. Mandatory runtime visual review

Current status: **Blocked.** Source/CSS tests are not a substitute for looking at the current runtime. The existing local tab was claimed, but both refresh and DOM inspection were denied by the in-app browser's localhost security policy. The tab was released without navigating or closing it, and no security workaround was attempted. Therefore no visual completion claim is made.

- [ ] Review Home Continue with an internal-Wave checkpoint.
- [ ] Review the four-sector Map and Standard/Remix/Checkpoint/Preparation/Major Boss nodes.
- [ ] Review locked/revealed canonical bosses and matching Boss Archive presentation.
- [ ] Review locked/unlocking/claimed branches including Present Drop and all three combat branch types.
- [ ] Review actual Wave counts, spoiler-free detail copy, three objectives, mastery set, and all reward layers.
- [ ] Review support guidance, founder Campaign Lab, and normal view without controls.
- [ ] Review mobile tap/scroll/safe areas and desktop layout.
- [ ] Capture screenshots where available and document exact capture limitations.
- [ ] Do not claim visual completion before the live review and screenshot/manual evidence are approved.

## Completion standard

Current status: **Not complete.** Functional source work is substantial, but mandatory visual/playtest evidence, strict Gatekeeper gates, and the listed runtime/security defects prevent completion.

- [x] Completed branch subsystem remains present and its original Present Drop definition is regression-protected.
- [x] Four five-Mission sectors place direct major bosses at Missions 5/10/15/20.
- [x] Missions 3/8/13/18 provide checkpoint climaxes and Missions 4/9/14/19 prepare for bosses.
- [x] Normal Missions use dynamic five-to-seven-Wave structures and persistence is per Wave.
- [x] Gatekeeper occupies dedicated Mission 5 and uses bounded arcade patrol/attacks with deterministic safe routes.
- [x] Data-driven roles, packs, durability, budgets, power/support guidance, mastery rewards, and four branch types are implemented.
- [x] Star 1 clear, mission-specific Star 2, no-damage Star 3, one-time rewards, and separate mastery set bonus are implemented.
- [x] Expanded sector/branch Map, concise descriptions, canonical boss IDs/silhouettes, founder authorization, v22 migration, and weekly isolation are implemented in source/tests.
- [x] Founder simulation dispatches Present Drop and combat branches to their matching runtime verifiers.
- [ ] Decide/implement the required security posture for client-reported Campaign progression and combat-branch completion before increasing reward value.
- [ ] Complete Gatekeeper Factory Gates 1–5 or obtain explicit user acceptance of documented exceptions; the one-boss lock is not released.
- [ ] Complete the required mobile/desktop low/expected/upgraded/support playtest matrix and retune failures.
- [ ] Complete and approve the actual runtime visual review for Map, Archive, rewards, branches, founder/normal states, and responsive layouts.
- [x] Remove the hard-coded Map sector presentation dependency so a future sector is presentation-data-driven.
- [ ] No mandatory checklist item remains unaddressed.
- [x] No staging, commit, push, merge, or deployment was performed.

## Final-report evidence status

- [x] Sector/Mission structure, Wave counts, major/mini-boss placements, roles/packs, durability, and Gatekeeper runtime are documented above.
- [x] Upgrade/support metadata, economy simulation, mastery values, four branch routes/types, migration, and weekly isolation are documented above.
- [x] Map/description/canonical-silhouette/founder/Campaign Lab source changes and focused tests are identified above.
- [ ] Add the completed live playtest matrix and balance decisions.
- [ ] Add the exact mobile/desktop runtime views/screenshots reviewed.
- [ ] Add strict Gatekeeper visual artifacts/verdict or explicit accepted exceptions.
- [x] Add final full-suite/typecheck/lint/build/Director results after all source defects are resolved.
- [x] Add the final changed-file inventory and final limitations at handoff; `CAMPAIGN_OVERHAUL_CHANGED_FILES.md` records all 151 authored worktree files and separately discloses the 16 unreferenced proof screenshots excluded from release scope.

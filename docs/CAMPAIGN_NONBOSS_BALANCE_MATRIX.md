# Campaign Non-Boss Runtime Balance Matrix

Generated deterministically from Campaign revision 26 and the real `GameEngine` runtime.

## Result

The bounded autonomous sweep ran **600 trials** across **50 non-boss graph Missions**: 40 main-path Missions and 10 route alternatives. It produced **598 clears**, **0 deaths**, and **2 timeouts** (99.7% clear rate).

The deterministic non-boss matrix found at least one clear route for every covered Mission. This is automated evidence only; human mobile/desktop approval is still required.

## Method

Command:

```text
node tools/simulate-campaign-nonboss-balance.mjs --write
```

- Runtime: production `GameEngine`, normal Campaign mode, real collisions, non-invincible player, passive primary fire, and authored internal-Wave transitions.
- Display hosts: mobile `390x844` and desktop `1280x720`; both resolve through the production fair-arena layout into the same `390x844` simulation world. These axes prove simulation parity, not renderer performance.
- Loadouts: controlled low/minimum, expected, and upgraded/comfortable recommended-power fixtures use the same deterministic Hangar allocation as the boss matrix. Current Campaign flight and wing controllers are enabled. This is a balance stress matrix, not an earned-unlock or affordability simulation.
- Supports: no companions and no research, or level-5 Prism Skimmer + Beacon Kite with the corresponding rank-4 Support research bonuses. Other research branches remain at zero. First-flight wing arrival applies in Mission 1; auto-cast is enabled.
- Controller: deterministic eight-frame lane planner that prioritizes shooters/elites, projects hostile travel lanes, balances projectile/body risk against capped vertical-shot alignment cost, collects nearby coins, uses Research Charge when aligned, and reserves bombs for dense or imminent-danger states.
- Acceleration boundary: presentation-only background, particle-burst, floating-text, ring, explosion-art, and afterimage pools are disabled; scheduling, movement, collision, damage, drops, companions, and fixed-step gameplay remain the production engine paths.
- Maximum simulated Mission time: 180 seconds.
- Weekly points: the same current App adaptation used for a completed Weekly node (regular kills from the Mission summary, authored mini-boss count, no inferred accuracy, mastery-objective quality), evaluated as a standalone node with no previous-node streak bonus.
- Rendering/FPS: Pixi rendering is intentionally absent. Entity, hostile-projectile, active-firing-enemy, performance-budget, and engine performance-mode peaks are recorded instead.
- Source digest: `3a9affbd83aa6cb2bc53630a6c1dbd8cb7ce6aa3659717ef139ded1190c2ec4c`.

Each table cell below is `clears/deaths/timeouts; median damage; median coins; median Weekly points; peak hostile projectiles; peak active entities`.

## Coverage

| Axis | Values |
| --- | --- |
| Graph Missions | 50 (40 main + 10 alternatives) |
| Sectors | 10/10 |
| Power tiers | low, expected, upgraded |
| Support states | none, paired |
| Viewports | mobile, desktop |
| Trials | 600 |

## Mission summary

| Mission | Route | Role | Attempts | C/D/T | Median clear | Damage | Coins | Weekly | First visible | Max dead air | Peak hostile | Peak entities | Peak firing |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| M1 ORBIT ENTRY | main | introduction | 12 | 12/0/0 | 36.3s | 0 | 60 | 3080 | 0.55s | 0.32s | 8 | 63 | 6 |
| M2 CITATION CROSSING | main | formation-remix | 12 | 12/0/0 | 45s | 0 | 76 | 3087 | 1.07s | 0.3s | 7 | 69 | 8 |
| M2B OPEN ORBIT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 41.8s | 0 | 85 | 3434 | 1.17s | 0.3s | 8 | 71 | 8 |
| M3 PAYWALL CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 39.4s | 0 | 65 | 3128 | 0.98s | 0.32s | 15 | 66 | 10 |
| M4 BASTION APPROACH | main | boss-preparation | 12 | 12/0/0 | 50.9s | 0 | 53 | 3360 | 0.98s | 0.87s | 13 | 70 | 12 |
| M6 HELIX SIGNAL | main | introduction | 12 | 10/0/2 | 44s | 0 | 80 | 3084 | 0.2s | 0.28s | 8 | 70 | 12 |
| M7 REDLINE CROSSING | main | formation-remix | 12 | 12/0/0 | 55.6s | 1 | 91 | 3238 | 1.17s | 0.27s | 16 | 76 | 12 |
| M7B REDLINE FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 63.8s | 0 | 90 | 3598 | 1.17s | 0.27s | 14 | 76 | 12 |
| M8 DARK MATTER CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 47.2s | 0 | 62 | 2724 | 1s | 0.28s | 16 | 71 | 12 |
| M9 MIRROR APPROACH | main | boss-preparation | 12 | 12/0/0 | 44.8s | 0 | 58 | 2881 | 1.98s | 0.07s | 28 | 74 | 12 |
| M11 SHARD SIGNAL | main | introduction | 12 | 12/0/0 | 39.1s | 0 | 112 | 3212 | 0.2s | 0.28s | 9 | 76 | 12 |
| M12 QUANTUM CROSSING | main | formation-remix | 12 | 12/0/0 | 65.8s | 1 | 99 | 3385 | 1.23s | 0.27s | 16 | 80 | 12 |
| M12B GRAVITY RIFT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 80s | 0 | 114 | 3808 | 1.02s | 5.83s | 16 | 78 | 12 |
| M13 GRAVITY CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 67.6s | 2 | 67 | 2076 | 1.17s | 0.28s | 16 | 80 | 12 |
| M14 EVENT HORIZON | main | boss-preparation | 12 | 12/0/0 | 53.5s | 1 | 68 | 2201 | 2.22s | 0.15s | 10 | 74 | 12 |
| M16 CRIMSON SIGNAL | main | introduction | 12 | 12/0/0 | 46s | 0 | 68 | 4134 | 1.23s | 4.77s | 3 | 60 | 12 |
| M17 ECLIPSE CROSSING | main | formation-remix | 12 | 12/0/0 | 61.7s | 0 | 145 | 6327 | 0.87s | 0.98s | 3 | 82 | 12 |
| M17B TERMINUS FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 66.6s | 0 | 125 | 6343 | 0.93s | 0.47s | 3 | 102 | 12 |
| M18 FRACTURE CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 55.1s | 0 | 52 | 3622 | 1.18s | 4.43s | 32 | 71 | 12 |
| M19 LAST LIGHT | main | boss-preparation | 12 | 12/0/0 | 43.2s | 0 | 73 | 4484 | 0.1s | 3.83s | 40 | 87 | 12 |
| M21 PRISM SIGNAL | main | introduction | 12 | 12/0/0 | 42.1s | 0 | 67 | 4174 | 1.43s | 4.58s | 3 | 72 | 12 |
| M22 SPECTRUM CROSSING | main | formation-remix | 12 | 12/0/0 | 74.3s | 0 | 161 | 6399 | 0.1s | 4.03s | 3 | 77 | 12 |
| M22B PRISM EXPANSE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 53.9s | 0 | 122 | 6366 | 0.53s | 4.37s | 6 | 90 | 12 |
| M23 BROOD CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 41s | 0 | 54 | 3642 | 1.18s | 4.42s | 25 | 74 | 12 |
| M24 LUMEN APPROACH | main | boss-preparation | 12 | 12/0/0 | 36.9s | 0 | 76 | 4484 | 0.85s | 0.15s | 1 | 92 | 12 |
| M26 RAIL SIGNAL | main | introduction | 12 | 12/0/0 | 38.6s | 0 | 81 | 4463 | 1.3s | 1.98s | 0 | 67 | 12 |
| M27 MERIDIAN CROSSING | main | formation-remix | 12 | 12/0/0 | 69.1s | 0 | 168 | 6729 | 0.17s | 3.7s | 3 | 81 | 12 |
| M27B RAIL MERIDIAN HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 53.3s | 0 | 137 | 6733 | 0.1s | 5.55s | 3 | 94 | 12 |
| M28 COIL CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 37.9s | 0 | 63 | 3686 | 1.18s | 4.88s | 16 | 73 | 12 |
| M29 SERPENT APPROACH | main | boss-preparation | 12 | 12/0/0 | 32.3s | 0 | 78 | 4530 | 0.45s | 2.83s | 0 | 92 | 12 |
| M31 GRAVITY SIGNAL | main | introduction | 12 | 12/0/0 | 47.6s | 0 | 102 | 5153 | 1.73s | 3.85s | 0 | 76 | 12 |
| M32 EVENTIDE CROSSING | main | formation-remix | 12 | 12/0/0 | 59.2s | 0 | 217 | 7748 | 0.87s | 1.18s | 2 | 92 | 12 |
| M32B SINGULARITY REACH HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 46.6s | 0 | 178 | 7971 | 0.47s | 2.7s | 0 | 108 | 12 |
| M33 WELL CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 36.8s | 0 | 75 | 4175 | 1.18s | 4.37s | 4 | 79 | 12 |
| M34 COLLAPSE APPROACH | main | boss-preparation | 12 | 12/0/0 | 30.3s | 0 | 102 | 5294 | 0.87s | 1.12s | 28 | 87 | 12 |
| M36 ORBIT SIGNAL | main | introduction | 12 | 12/0/0 | 38.4s | 0 | 100 | 5201 | 1.27s | 3.33s | 0 | 79 | 12 |
| M37 AXIS CROSSING | main | formation-remix | 12 | 12/0/0 | 61s | 0 | 216 | 8044 | 0.57s | 2.2s | 3 | 106 | 12 |
| M37B GYROSCOPE ARRAY HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 50.2s | 0 | 202 | 8200 | 0.73s | 0.47s | 3 | 96 | 12 |
| M38 GYRO CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 38.1s | 0 | 68 | 4163 | 1.37s | 4.7s | 27 | 76 | 12 |
| M39 ROTATION APPROACH | main | boss-preparation | 12 | 12/0/0 | 42.6s | 0 | 117 | 5307 | 0.8s | 0.87s | 16 | 100 | 12 |
| M41 SIEGE SIGNAL | main | introduction | 12 | 12/0/0 | 38.8s | 0 | 109 | 5582 | 1.65s | 3.23s | 3 | 85 | 12 |
| M42 BREACH CROSSING | main | formation-remix | 12 | 12/0/0 | 54.1s | 0 | 231 | 8488 | 0.6s | 1.3s | 0 | 122 | 12 |
| M42B HAMMERHEAD LINE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 60s | 1 | 202 | 8607 | 0.87s | 1.42s | 3 | 100 | 12 |
| M43 HAMMER CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 37.7s | 0 | 76 | 4322 | 1.37s | 4.98s | 1 | 92 | 12 |
| M44 DREAD APPROACH | main | boss-preparation | 12 | 12/0/0 | 32.8s | 0 | 112 | 5559 | 0.13s | 4.05s | 7 | 113 | 12 |
| M46 FRONTIER SIGNAL | main | introduction | 12 | 12/0/0 | 46.9s | 0 | 106 | 5708 | 1.28s | 5.55s | 0 | 78 | 12 |
| M47 CLAW CROSSING | main | formation-remix | 12 | 12/0/0 | 66.3s | 0 | 229 | 8891 | 0.12s | 4.42s | 3 | 101 | 12 |
| M47B CROWNCLAW FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 61.8s | 0 | 216 | 9158 | 0.53s | 4.83s | 3 | 118 | 12 |
| M48 CROWN CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 37s | 0 | 80 | 4346 | 1.18s | 5.78s | 16 | 83 | 12 |
| M49 REDLINE APPROACH | main | boss-preparation | 12 | 12/0/0 | 33.7s | 0 | 129 | 5584 | 0.77s | 3.82s | 14 | 93 | 12 |

## M2 and M7 detailed checkpoints

These early formation-remix Missions are expanded cell-by-cell because the Campaign brief calls them out as dedicated balance checkpoints.

| Mission | Power | Supports | Viewport | Outcome | Death Wave | Time | Damage | Coins | Weekly | Bombs | Ability | Peak hostile | Peak entities | Budget peak |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| M2 | low | none | mobile | clear | - | 45s | 0 | 74 | 3087 | 2 | 3 | 7 | 46 | 0.7x |
| M2 | low | none | desktop | clear | - | 45s | 0 | 74 | 3087 | 2 | 3 | 7 | 46 | 0.7x |
| M2 | low | paired | mobile | clear | - | 35.5s | 0 | 76 | 3087 | 2 | 3 | 7 | 69 | 0.68x |
| M2 | low | paired | desktop | clear | - | 35.5s | 0 | 76 | 3087 | 2 | 3 | 7 | 69 | 0.68x |
| M2 | expected | none | mobile | clear | - | 45s | 0 | 74 | 3087 | 2 | 3 | 7 | 47 | 0.7x |
| M2 | expected | none | desktop | clear | - | 45s | 0 | 74 | 3087 | 2 | 3 | 7 | 48 | 0.7x |
| M2 | expected | paired | mobile | clear | - | 35.5s | 0 | 76 | 3087 | 2 | 3 | 7 | 69 | 0.68x |
| M2 | expected | paired | desktop | clear | - | 35.5s | 0 | 76 | 3087 | 2 | 3 | 7 | 69 | 0.68x |
| M2 | upgraded | none | mobile | clear | - | 46s | 1 | 71 | 2331 | 2 | 3 | 7 | 45 | 0.68x |
| M2 | upgraded | none | desktop | clear | - | 46s | 1 | 71 | 2331 | 2 | 3 | 7 | 46 | 0.68x |
| M2 | upgraded | paired | mobile | clear | - | 33.6s | 0 | 86 | 3087 | 3 | 2 | 7 | 64 | 0.68x |
| M2 | upgraded | paired | desktop | clear | - | 33.6s | 0 | 86 | 3087 | 3 | 2 | 7 | 64 | 0.68x |
| M7 | low | none | mobile | clear | - | 63.8s | 1 | 73 | 2482 | 3 | 4 | 15 | 51 | 0.82x |
| M7 | low | none | desktop | clear | - | 63.8s | 1 | 73 | 2482 | 3 | 4 | 15 | 52 | 0.82x |
| M7 | low | paired | mobile | clear | - | 55.6s | 1 | 85 | 2482 | 2 | 3 | 15 | 76 | 0.72x |
| M7 | low | paired | desktop | clear | - | 55.6s | 1 | 85 | 2482 | 2 | 3 | 15 | 76 | 0.72x |
| M7 | expected | none | mobile | clear | - | 38.6s | 0 | 82 | 3238 | 3 | 3 | 8 | 59 | 0.8x |
| M7 | expected | none | desktop | clear | - | 38.6s | 0 | 82 | 3238 | 3 | 3 | 8 | 59 | 0.8x |
| M7 | expected | paired | mobile | clear | - | 38.3s | 0 | 96 | 3238 | 3 | 3 | 15 | 74 | 0.72x |
| M7 | expected | paired | desktop | clear | - | 38.3s | 0 | 96 | 3238 | 3 | 3 | 15 | 73 | 0.72x |
| M7 | upgraded | none | mobile | clear | - | 59.3s | 1 | 91 | 2524 | 2 | 4 | 16 | 54 | 0.75x |
| M7 | upgraded | none | desktop | clear | - | 59.3s | 1 | 91 | 2524 | 2 | 4 | 16 | 54 | 0.75x |
| M7 | upgraded | paired | mobile | clear | - | 30.5s | 0 | 99 | 3280 | 4 | 2 | 11 | 71 | 0.78x |
| M7 | upgraded | paired | desktop | clear | - | 30.5s | 0 | 99 | 3280 | 4 | 2 | 11 | 71 | 0.78x |

## Axis summary

| Axis | Value | Cell |
| --- | --- | --- |
| tier | low | 200/0/0; D0; C97; W4463; P40; E122 |
| tier | expected | 198/0/2; D0; C98; W4484; P32; E103 |
| tier | upgraded | 200/0/0; D0; C97; W4526; P28; E113 |
| support | none | 298/0/2; D0; C94; W4490; P40; E108 |
| support | paired | 300/0/0; D0; C97; W4463; P28; E122 |
| viewport | mobile | 299/0/1; D0; C97; W4484; P40; E122 |
| viewport | desktop | 299/0/1; D0; C97; W4484; P40; E122 |

## Findings

- Cells over the provisional 80-hostile-projectile readability ceiling: 0.
- Cells over the 1.25s first-visible-threat ceiling: 48.
- Cells over the 1s in-Wave visible-combat dead-air ceiling: 216.
- Cells that entered engine performance mode: 0.
- Cells that entered heavy-scene mode: 384.
- Missions with no clears across the matrix: none.
- Missions where upgraded clear rate was below low-power clear rate: none.
- Missions where paired supports cleared less often than no supports: none.

## Exact-cell evidence

All 600 individual trial rows, including death Wave, damage source diagnostics, bombs and abilities used, coins, projected Weekly points, first-visible-threat delay, visible-combat dead air, entity peaks, and performance-mode frames, are stored in `artifacts/campaign-balance/nonboss-runtime-matrix.json`.

## Honest limitations

- This is one shared deterministic random stream per Mission, not a distribution of randomized human attempts.
- The autonomous controller can align, dodge immediate threats, use its finite bombs and cooldown ability, and collect nearby coins, but it does not understand every authored formation as a human strategy problem.
- Recommended power is converted to a consistent upgrade mix; it is not an exact player inventory.
- The Weekly score is a projection from the actual runtime Mission result through the current client score adapter. Accuracy remains `null`, elites remain folded into regular kills, and route/consecutive bonuses are intentionally excluded.
- A visible threat is an on-screen live hostile body, an on-screen hostile projectile, or an active encounter warning. First-visible delay excludes the Mission takeoff; in-Wave dead air begins only after the first visible threat and excludes completion/takeoff.
- Headless engine entity peaks and visibility timing are useful readability/performance proxies, not a physical-device FPS measurement or human mobile/desktop playtest.
- This report does not change Campaign tuning. It records evidence for a separate balance decision.

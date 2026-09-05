# Campaign Non-Boss Runtime Balance Matrix

Generated deterministically from Campaign revision 24 and the real `GameEngine` runtime.

## Result

The bounded autonomous sweep ran **600 trials** across **50 non-boss graph Missions**: 40 main-path Missions and 10 route alternatives. It produced **566 clears**, **33 deaths**, and **1 timeouts** (94.3% clear rate).

The deterministic non-boss matrix found at least one clear route for every covered Mission. This is automated evidence only; human mobile/desktop approval is still required.

## Method

Command:

```text
node tools/simulate-campaign-nonboss-balance.mjs --write
```

- Runtime: production `GameEngine`, normal Campaign mode, real collisions, non-invincible player, passive primary fire, and authored internal-Wave transitions.
- Viewports: mobile `390x844` and desktop `1280x720`.
- Loadouts: low/minimum, expected, and upgraded/comfortable recommended power converted with the same deterministic allocation used by the boss matrix.
- Supports: no companions or level-5 Prism Skimmer + Beacon Kite.
- Controller: deterministic eight-frame lane planner that prioritizes shooters/elites, projects hostile travel lanes, balances projectile/body risk against capped vertical-shot alignment cost, collects nearby coins, uses Research Charge when aligned, and reserves bombs for dense or imminent-danger states.
- Acceleration boundary: presentation-only background, particle-burst, floating-text, ring, explosion-art, and afterimage pools are disabled; scheduling, movement, collision, damage, drops, companions, and fixed-step gameplay remain the production engine paths.
- Maximum simulated Mission time: 180 seconds.
- Weekly points: the same current App adaptation used for a completed Weekly node (regular kills from the Mission summary, authored mini-boss count, no inferred accuracy, mastery-objective quality), evaluated as a standalone node with no previous-node streak bonus.
- Rendering/FPS: Pixi rendering is intentionally absent. Entity, hostile-projectile, active-firing-enemy, performance-budget, and engine performance-mode peaks are recorded instead.
- Source digest: `5d0ed12af9282949ec36f335b986d9fc8084f4da8d8b4dd4f472458e91173be2`.

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
| M1 ORBIT ENTRY | main | introduction | 12 | 11/1/0 | 16.2s | 0 | 40 | 3078 | 0.28s | 0.38s | 0 | 75 | 0 |
| M2 CITATION CROSSING | main | formation-remix | 12 | 12/0/0 | 60.5s | 0 | 54 | 3591 | 0.33s | 0.4s | 3 | 81 | 8 |
| M2B OPEN ORBIT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 46.2s | 0 | 62 | 3899 | 0.42s | 0.3s | 0 | 85 | 8 |
| M3 PAYWALL CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 16.7s | 0 | 32 | 2882 | 0.47s | 0.15s | 3 | 73 | 10 |
| M4 BASTION APPROACH | main | boss-preparation | 12 | 12/0/0 | 35.4s | 1 | 28 | 2392 | 0.12s | 0.88s | 3 | 73 | 10 |
| M6 HELIX SIGNAL | main | introduction | 12 | 11/1/0 | 25.7s | 0 | 42 | 3191 | 0.53s | 0.83s | 3 | 72 | 10 |
| M7 REDLINE CROSSING | main | formation-remix | 12 | 9/3/0 | 29.5s | 1 | 64 | 4041 | 0.42s | 0.48s | 3 | 80 | 12 |
| M7B REDLINE FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 11/1/0 | 37.1s | 0 | 69 | 4411 | 0.42s | 0.48s | 3 | 93 | 12 |
| M8 DARK MATTER CHECKPOINT | main | elite-checkpoint | 12 | 9/2/1 | 28.2s | 1 | 36 | 1991 | 0.23s | 0.38s | 30 | 70 | 12 |
| M9 MIRROR APPROACH | main | boss-preparation | 12 | 10/2/0 | 48.6s | 1 | 47 | 2414 | 0.4s | 0.55s | 54 | 102 | 12 |
| M11 SHARD SIGNAL | main | introduction | 12 | 12/0/0 | 24.9s | 0 | 53 | 3271 | 0.53s | 0.62s | 6 | 70 | 10 |
| M12 QUANTUM CROSSING | main | formation-remix | 12 | 11/1/0 | 32.6s | 0 | 74 | 4230 | 0.43s | 0.35s | 6 | 83 | 12 |
| M12B GRAVITY RIFT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 11/1/0 | 32.1s | 0 | 85 | 4593 | 0.43s | 0.52s | 6 | 100 | 12 |
| M13 GRAVITY CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 24.1s | 0 | 36 | 3093 | 0.15s | 0.15s | 7 | 71 | 12 |
| M14 EVENT HORIZON | main | boss-preparation | 12 | 11/1/0 | 32.4s | 0 | 53 | 4066 | 0.15s | 0.27s | 24 | 73 | 12 |
| M16 CRIMSON SIGNAL | main | introduction | 12 | 12/0/0 | 30.4s | 0 | 58 | 4134 | 0.53s | 0.7s | 6 | 77 | 12 |
| M17 ECLIPSE CROSSING | main | formation-remix | 12 | 11/1/0 | 48.4s | 0 | 135 | 6327 | 0.18s | 0.53s | 6 | 87 | 12 |
| M17B TERMINUS FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 10/2/0 | 47.4s | 0 | 101 | 6320 | 0.18s | 0.53s | 6 | 89 | 12 |
| M18 FRACTURE CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 38.1s | 2 | 47 | 2862 | 0.4s | 0.55s | 32 | 79 | 12 |
| M19 LAST LIGHT | main | boss-preparation | 12 | 12/0/0 | 37.8s | 0 | 71 | 4442 | 0.1s | 0.18s | 52 | 97 | 12 |
| M21 PRISM SIGNAL | main | introduction | 12 | 12/0/0 | 39.7s | 0 | 58 | 4134 | 0.53s | 0.38s | 6 | 78 | 12 |
| M22 SPECTRUM CROSSING | main | formation-remix | 12 | 11/1/0 | 50s | 2 | 133 | 6399 | 0.13s | 0.5s | 3 | 106 | 12 |
| M22B PRISM EXPANSE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 9/3/0 | 44.5s | 2 | 92 | 6283 | 0.13s | 0.58s | 6 | 88 | 12 |
| M23 BROOD CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 48.1s | 0 | 53 | 3622 | 0.4s | 0.55s | 27 | 79 | 12 |
| M24 LUMEN APPROACH | main | boss-preparation | 12 | 12/0/0 | 31.5s | 0 | 74 | 4526 | 0.18s | 0.17s | 2 | 93 | 12 |
| M26 RAIL SIGNAL | main | introduction | 12 | 12/0/0 | 34.5s | 0 | 66 | 4391 | 0.53s | 0.37s | 6 | 79 | 12 |
| M27 MERIDIAN CROSSING | main | formation-remix | 12 | 12/0/0 | 46.6s | 0 | 154 | 6841 | 0.17s | 0.42s | 9 | 94 | 12 |
| M27B RAIL MERIDIAN HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 43.6s | 0 | 128 | 6688 | 0.1s | 0.67s | 6 | 98 | 12 |
| M28 COIL CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 50.1s | 1 | 50 | 3666 | 0.4s | 0.57s | 30 | 80 | 12 |
| M29 SERPENT APPROACH | main | boss-preparation | 12 | 12/0/0 | 35.2s | 0 | 70 | 4551 | 0.23s | 0.17s | 7 | 95 | 12 |
| M31 GRAVITY SIGNAL | main | introduction | 12 | 12/0/0 | 44.3s | 0 | 95 | 5113 | 0.4s | 0.38s | 3 | 93 | 12 |
| M32 EVENTIDE CROSSING | main | formation-remix | 12 | 12/0/0 | 54s | 2 | 180 | 7658 | 0.18s | 0.47s | 6 | 111 | 12 |
| M32B SINGULARITY REACH HIGH-RISK ROUTE | alternative | formation-remix | 12 | 11/1/0 | 44.8s | 0 | 159 | 7868 | 0.13s | 0.45s | 6 | 113 | 12 |
| M33 WELL CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 34.3s | 0 | 59 | 4143 | 0.4s | 0.57s | 24 | 89 | 12 |
| M34 COLLAPSE APPROACH | main | boss-preparation | 12 | 12/0/0 | 31.8s | 0 | 97 | 5294 | 0.1s | 0.17s | 52 | 105 | 12 |
| M36 ORBIT SIGNAL | main | introduction | 12 | 12/0/0 | 41.5s | 0 | 93 | 5201 | 0.4s | 0.37s | 4 | 100 | 12 |
| M37 AXIS CROSSING | main | formation-remix | 12 | 11/1/0 | 51s | 2 | 207 | 7336 | 0.18s | 0.45s | 6 | 110 | 12 |
| M37B GYROSCOPE ARRAY HIGH-RISK ROUTE | alternative | formation-remix | 12 | 11/1/0 | 55s | 0 | 184 | 8135 | 0.13s | 0.53s | 6 | 99 | 12 |
| M38 GYRO CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 50.5s | 0 | 57 | 4143 | 0.4s | 0.55s | 54 | 108 | 12 |
| M39 ROTATION APPROACH | main | boss-preparation | 12 | 12/0/0 | 38.3s | 1 | 104 | 4551 | 0.17s | 0.33s | 32 | 94 | 12 |
| M41 SIEGE SIGNAL | main | introduction | 12 | 12/0/0 | 45.5s | 0 | 96 | 5582 | 0.4s | 0.47s | 3 | 87 | 12 |
| M42 BREACH CROSSING | main | formation-remix | 12 | 12/0/0 | 59.5s | 0 | 213 | 8454 | 0.18s | 0.53s | 6 | 106 | 12 |
| M42B HAMMERHEAD LINE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 10/2/0 | 54.3s | 0 | 194 | 8480 | 0.18s | 0.58s | 9 | 124 | 12 |
| M43 HAMMER CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 25.7s | 0 | 64 | 4322 | 0.4s | 0.6s | 2 | 92 | 12 |
| M44 DREAD APPROACH | main | boss-preparation | 12 | 12/0/0 | 55.2s | 0 | 104 | 5559 | 0.1s | 0.3s | 25 | 97 | 12 |
| M46 FRONTIER SIGNAL | main | introduction | 12 | 12/0/0 | 41.7s | 0 | 104 | 5774 | 0.53s | 0.3s | 8 | 92 | 12 |
| M47 CLAW CROSSING | main | formation-remix | 12 | 12/0/0 | 57.7s | 0 | 233 | 8926 | 0.15s | 0.63s | 11 | 121 | 12 |
| M47B CROWNCLAW FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 8/4/0 | 70.8s | 3 | 191 | 8100 | 0.15s | 0.67s | 18 | 110 | 12 |
| M48 CROWN CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 52.7s | 1 | 66 | 3626 | 0.4s | 0.55s | 30 | 89 | 12 |
| M49 REDLINE APPROACH | main | boss-preparation | 12 | 12/0/0 | 31.7s | 0 | 109 | 5584 | 0.18s | 0.17s | 52 | 104 | 12 |

## M2 and M7 detailed checkpoints

These early formation-remix Missions are expanded cell-by-cell because the Campaign brief calls them out as dedicated balance checkpoints.

| Mission | Power | Supports | Viewport | Outcome | Death Wave | Time | Damage | Coins | Weekly | Bombs | Ability | Peak hostile | Peak entities | Budget peak |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| M2 | low | none | mobile | clear | - | 70.2s | 1 | 59 | 2785 | 2 | 4 | 3 | 32 | 0.75x |
| M2 | low | none | desktop | clear | - | 83.4s | 1 | 47 | 2722 | 3 | 5 | 3 | 31 | 0.75x |
| M2 | low | paired | mobile | clear | - | 17.7s | 0 | 53 | 3591 | 2 | 2 | 1 | 80 | 0.75x |
| M2 | low | paired | desktop | clear | - | 21.3s | 0 | 41 | 3591 | 2 | 2 | 1 | 77 | 0.75x |
| M2 | expected | none | mobile | clear | - | 60.5s | 0 | 59 | 3553 | 3 | 4 | 2 | 32 | 0.75x |
| M2 | expected | none | desktop | clear | - | 75.1s | 0 | 47 | 3515 | 2 | 5 | 3 | 32 | 0.75x |
| M2 | expected | paired | mobile | clear | - | 18.5s | 0 | 54 | 3591 | 2 | 2 | 1 | 81 | 0.75x |
| M2 | expected | paired | desktop | clear | - | 20.1s | 0 | 40 | 3591 | 2 | 2 | 1 | 77 | 0.75x |
| M2 | upgraded | none | mobile | clear | - | 65.5s | 0 | 64 | 3562 | 2 | 4 | 3 | 34 | 0.75x |
| M2 | upgraded | none | desktop | clear | - | 78.2s | 2 | 51 | 2734 | 2 | 5 | 3 | 32 | 0.75x |
| M2 | upgraded | paired | mobile | clear | - | 17.7s | 0 | 61 | 3612 | 2 | 1 | 1 | 79 | 0.75x |
| M2 | upgraded | paired | desktop | clear | - | 23.8s | 0 | 60 | 3612 | 2 | 2 | 1 | 66 | 0.75x |
| M7 | low | none | mobile | death | 6 | 76.3s | 3 | 58 | 0 | 3 | 5 | 3 | 29 | 0.85x |
| M7 | low | none | desktop | death | 5 | 85.5s | 3 | 40 | 0 | 2 | 5 | 3 | 28 | 0.8x |
| M7 | low | paired | mobile | clear | - | 28.9s | 0 | 77 | 4041 | 2 | 2 | 0 | 77 | 0.79x |
| M7 | low | paired | desktop | clear | - | 29.5s | 0 | 59 | 4041 | 2 | 2 | 0 | 70 | 0.78x |
| M7 | expected | none | mobile | death | 6 | 80.3s | 4 | 52 | 0 | 2 | 5 | 3 | 29 | 0.82x |
| M7 | expected | none | desktop | clear | - | 148.3s | 2 | 66 | 3306 | 2 | 8 | 3 | 31 | 0.89x |
| M7 | expected | paired | mobile | clear | - | 19.8s | 0 | 96 | 4062 | 2 | 2 | 0 | 75 | 0.72x |
| M7 | expected | paired | desktop | clear | - | 25.4s | 0 | 57 | 4083 | 3 | 2 | 0 | 75 | 0.8x |
| M7 | upgraded | none | mobile | clear | - | 105.4s | 2 | 78 | 3306 | 3 | 7 | 3 | 31 | 1x |
| M7 | upgraded | none | desktop | clear | - | 133.3s | 1 | 64 | 3327 | 2 | 8 | 1 | 31 | 0.8x |
| M7 | upgraded | paired | mobile | clear | - | 25.9s | 0 | 85 | 4083 | 2 | 2 | 0 | 80 | 0.75x |
| M7 | upgraded | paired | desktop | clear | - | 30.9s | 0 | 59 | 4083 | 2 | 2 | 0 | 71 | 0.64x |

## Axis summary

| Axis | Value | Cell |
| --- | --- | --- |
| tier | low | 181/19/0; D0; C67; W4211; P54; E112 |
| tier | expected | 188/11/1; D0; C70; W4346; P54; E121 |
| tier | upgraded | 197/3/0; D0; C69; W4484; P54; E124 |
| support | none | 267/32/1; D1; C69; W4194; P54; E96 |
| support | paired | 299/1/0; D0; C70; W4484; P54; E124 |
| viewport | mobile | 288/12/0; D0; C85; W4457; P54; E124 |
| viewport | desktop | 278/21/1; D1; C61; W4322; P54; E113 |

## Findings

- Cells over the provisional 80-hostile-projectile readability ceiling: 0.
- Cells over the 1.25s first-visible-threat ceiling: 0.
- Cells over the 1s in-Wave visible-combat dead-air ceiling: 0.
- Cells that entered engine performance mode: 0.
- Cells that entered heavy-scene mode: 151.
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

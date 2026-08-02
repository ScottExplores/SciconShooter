# Campaign Non-Boss Runtime Balance Matrix

Generated deterministically from Campaign revision 24 and the real `GameEngine` runtime.

## Result

The bounded autonomous sweep ran **600 trials** across **50 non-boss graph Missions**: 40 main-path Missions and 10 route alternatives. It produced **512 clears**, **88 deaths**, and **0 timeouts** (85.3% clear rate).

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
- Source digest: `b1e4fc2c83cc7c86e1d95bfc9dff4cf90c053874bfa3d3926e109d5c21e13087`.

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
| M1 ORBIT ENTRY | main | introduction | 12 | 12/0/0 | 42.3s | 0 | 32 | 2802 | 0.4s | 0.58s | 0 | 64 | 0 |
| M2 CITATION CROSSING | main | formation-remix | 12 | 12/0/0 | 37.6s | 0 | 64 | 3843 | 0.58s | 0.6s | 5 | 74 | 8 |
| M2B OPEN ORBIT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 67.2s | 0 | 66 | 4200 | 0.52s | 0.77s | 9 | 71 | 8 |
| M3 PAYWALL CHECKPOINT | main | elite-checkpoint | 12 | 10/2/0 | 20.9s | 0 | 38 | 2846 | 0.53s | 0.68s | 3 | 61 | 8 |
| M4 BASTION APPROACH | main | boss-preparation | 12 | 7/5/0 | 32.3s | 3 | 42 | 3056 | 0.3s | 0.88s | 11 | 61 | 12 |
| M6 HELIX SIGNAL | main | introduction | 12 | 9/3/0 | 31.1s | 2 | 42 | 3191 | 0.55s | 0.7s | 13 | 71 | 10 |
| M7 REDLINE CROSSING | main | formation-remix | 12 | 7/5/0 | 40.1s | 3 | 76 | 3285 | 0.53s | 0.85s | 9 | 73 | 12 |
| M7B REDLINE FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 7/5/0 | 32.8s | 1 | 77 | 3635 | 0.53s | 0.87s | 11 | 78 | 12 |
| M8 DARK MATTER CHECKPOINT | main | elite-checkpoint | 12 | 9/3/0 | 33s | 0 | 36 | 2731 | 0.68s | 0.65s | 30 | 68 | 12 |
| M9 MIRROR APPROACH | main | boss-preparation | 12 | 10/2/0 | 49.9s | 0 | 50 | 3170 | 0.53s | 0.7s | 54 | 102 | 12 |
| M11 SHARD SIGNAL | main | introduction | 12 | 11/1/0 | 25.6s | 0 | 57 | 3271 | 0.62s | 0.67s | 9 | 72 | 12 |
| M12 QUANTUM CROSSING | main | formation-remix | 12 | 9/3/0 | 33.4s | 2 | 87 | 4209 | 0.37s | 0.87s | 10 | 77 | 12 |
| M12B GRAVITY RIFT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 9/3/0 | 33.6s | 1 | 88 | 4570 | 0.25s | 0.65s | 16 | 78 | 12 |
| M13 GRAVITY CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 27.2s | 0 | 37 | 3093 | 0.4s | 0.67s | 29 | 69 | 12 |
| M14 EVENT HORIZON | main | boss-preparation | 12 | 11/1/0 | 32.4s | 0 | 57 | 4082 | 0.62s | 0.72s | 24 | 70 | 12 |
| M16 CRIMSON SIGNAL | main | introduction | 12 | 9/3/0 | 28.2s | 2 | 58 | 3907 | 0.62s | 0.85s | 18 | 74 | 12 |
| M17 ECLIPSE CROSSING | main | formation-remix | 12 | 10/2/0 | 43.6s | 2 | 97 | 4682 | 0.62s | 0.88s | 18 | 84 | 12 |
| M17B TERMINUS FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 8/4/0 | 42.6s | 4 | 92 | 4983 | 0.32s | 1s | 18 | 78 | 12 |
| M18 FRACTURE CHECKPOINT | main | elite-checkpoint | 12 | 9/3/0 | 35.6s | 2 | 44 | 2711 | 0.77s | 0.87s | 32 | 72 | 12 |
| M19 LAST LIGHT | main | boss-preparation | 12 | 10/2/0 | 31.6s | 0 | 62 | 4198 | 0.63s | 0.65s | 52 | 95 | 12 |
| M21 PRISM SIGNAL | main | introduction | 12 | 10/2/0 | 29s | 2 | 59 | 3927 | 1.03s | 0.62s | 18 | 69 | 12 |
| M22 SPECTRUM CROSSING | main | formation-remix | 12 | 10/2/0 | 40.2s | 2 | 100 | 4678 | 0.43s | 0.72s | 18 | 89 | 12 |
| M22B PRISM EXPANSE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 7/5/0 | 38.9s | 7 | 79 | 5041 | 0.53s | 0.78s | 18 | 90 | 12 |
| M23 BROOD CHECKPOINT | main | elite-checkpoint | 12 | 10/2/0 | 46.4s | 1 | 43 | 3431 | 0.28s | 0.52s | 27 | 75 | 12 |
| M24 LUMEN APPROACH | main | boss-preparation | 12 | 12/0/0 | 36.3s | 0 | 66 | 4240 | 0.6s | 0.55s | 18 | 84 | 12 |
| M26 RAIL SIGNAL | main | introduction | 12 | 11/1/0 | 30.8s | 2 | 59 | 3267 | 0.9s | 0.55s | 18 | 72 | 12 |
| M27 MERIDIAN CROSSING | main | formation-remix | 12 | 11/1/0 | 34.3s | 2 | 103 | 5408 | 0.92s | 0.78s | 18 | 104 | 12 |
| M27B RAIL MERIDIAN HIGH-RISK ROUTE | alternative | formation-remix | 12 | 10/2/0 | 39.9s | 4 | 93 | 5024 | 0.32s | 0.62s | 18 | 99 | 12 |
| M28 COIL CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 39.6s | 0 | 49 | 3471 | 0.53s | 0.77s | 30 | 80 | 12 |
| M29 SERPENT APPROACH | main | boss-preparation | 12 | 12/0/0 | 32.7s | 0 | 67 | 4240 | 0.72s | 0.58s | 29 | 83 | 12 |
| M31 GRAVITY SIGNAL | main | introduction | 12 | 11/1/0 | 25.8s | 2 | 69 | 4114 | 0.62s | 0.58s | 18 | 77 | 12 |
| M32 EVENTIDE CROSSING | main | formation-remix | 12 | 11/1/0 | 33.1s | 2 | 104 | 5695 | 0.3s | 0.82s | 18 | 86 | 12 |
| M32B SINGULARITY REACH HIGH-RISK ROUTE | alternative | formation-remix | 12 | 10/2/0 | 37.6s | 6 | 113 | 5367 | 0.95s | 0.92s | 18 | 90 | 12 |
| M33 WELL CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 32.8s | 0 | 51 | 3674 | 0.28s | 0.62s | 24 | 77 | 12 |
| M34 COLLAPSE APPROACH | main | boss-preparation | 12 | 12/0/0 | 32.4s | 0 | 70 | 4500 | 0.63s | 0.7s | 52 | 94 | 12 |
| M36 ORBIT SIGNAL | main | introduction | 12 | 11/1/0 | 28.5s | 0 | 67 | 4154 | 0.45s | 0.62s | 18 | 83 | 12 |
| M37 AXIS CROSSING | main | formation-remix | 12 | 9/3/0 | 31.7s | 0 | 112 | 5758 | 0.3s | 0.75s | 18 | 93 | 12 |
| M37B GYROSCOPE ARRAY HIGH-RISK ROUTE | alternative | formation-remix | 12 | 9/3/0 | 36.9s | 4 | 105 | 5331 | 0.32s | 0.48s | 18 | 92 | 12 |
| M38 GYRO CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 44.4s | 1 | 47 | 2918 | 0.87s | 0.55s | 54 | 112 | 12 |
| M39 ROTATION APPROACH | main | boss-preparation | 12 | 12/0/0 | 35.5s | 3 | 73 | 3723 | 0.63s | 0.48s | 32 | 89 | 12 |
| M41 SIEGE SIGNAL | main | introduction | 12 | 12/0/0 | 27.3s | 0 | 68 | 4154 | 0.62s | 0.55s | 18 | 79 | 12 |
| M42 BREACH CROSSING | main | formation-remix | 12 | 11/1/0 | 34.7s | 2 | 108 | 4952 | 0.28s | 0.95s | 18 | 86 | 12 |
| M42B HAMMERHEAD LINE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 8/4/0 | 34.4s | 9 | 107 | 5258 | 0.28s | 0.83s | 18 | 94 | 12 |
| M43 HAMMER CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 28.7s | 0 | 42 | 3638 | 0.68s | 0.5s | 4 | 79 | 12 |
| M44 DREAD APPROACH | main | boss-preparation | 12 | 12/0/0 | 47.6s | 0 | 73 | 4500 | 0.67s | 0.53s | 25 | 89 | 12 |
| M46 FRONTIER SIGNAL | main | introduction | 12 | 11/1/0 | 25s | 2 | 64 | 4154 | 0.62s | 0.6s | 18 | 76 | 12 |
| M47 CLAW CROSSING | main | formation-remix | 12 | 11/1/0 | 30.6s | 2 | 106 | 5002 | 0.27s | 0.68s | 18 | 94 | 12 |
| M47B CROWNCLAW FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 6/6/0 | 36.2s | 10 | 75 | 5076 | 0.43s | 0.42s | 18 | 92 | 12 |
| M48 CROWN CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 40.5s | 0 | 47 | 3638 | 0.58s | 0.9s | 30 | 84 | 12 |
| M49 REDLINE APPROACH | main | boss-preparation | 12 | 12/0/0 | 33s | 0 | 70 | 4500 | 0.7s | 0.58s | 52 | 105 | 12 |

## M2 and M7 detailed checkpoints

These early formation-remix Missions are expanded cell-by-cell because the Campaign brief calls them out as dedicated balance checkpoints.

| Mission | Power | Supports | Viewport | Outcome | Death Wave | Time | Damage | Coins | Weekly | Bombs | Ability | Peak hostile | Peak entities | Budget peak |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| M2 | low | none | mobile | clear | - | 57.1s | 1 | 71 | 2955 | 2 | 4 | 5 | 27 | 0.65x |
| M2 | low | none | desktop | clear | - | 66.9s | 0 | 56 | 3767 | 2 | 4 | 2 | 32 | 0.65x |
| M2 | low | paired | mobile | clear | - | 20.4s | 0 | 71 | 3843 | 0 | 1 | 0 | 74 | 0.3x |
| M2 | low | paired | desktop | clear | - | 23.8s | 0 | 53 | 3843 | 0 | 2 | 0 | 70 | 0.35x |
| M2 | expected | none | mobile | clear | - | 66.7s | 0 | 63 | 3616 | 2 | 4 | 4 | 27 | 0.65x |
| M2 | expected | none | desktop | clear | - | 64.1s | 0 | 56 | 3818 | 2 | 4 | 2 | 31 | 0.6x |
| M2 | expected | paired | mobile | clear | - | 18.5s | 0 | 67 | 3843 | 0 | 1 | 0 | 72 | 0.35x |
| M2 | expected | paired | desktop | clear | - | 25.4s | 0 | 53 | 3843 | 0 | 1 | 0 | 63 | 0.4x |
| M2 | upgraded | none | mobile | clear | - | 37.6s | 0 | 73 | 3826 | 3 | 3 | 2 | 35 | 0.65x |
| M2 | upgraded | none | desktop | clear | - | 57.1s | 1 | 60 | 3032 | 2 | 4 | 2 | 31 | 0.65x |
| M2 | upgraded | paired | mobile | clear | - | 22.3s | 0 | 68 | 3864 | 0 | 1 | 0 | 69 | 0.35x |
| M2 | upgraded | paired | desktop | clear | - | 24.8s | 0 | 64 | 3864 | 1 | 1 | 1 | 63 | 0.4x |
| M7 | low | none | mobile | death | 4 | 57.8s | 3 | 37 | 0 | 2 | 4 | 9 | 31 | 0.75x |
| M7 | low | none | desktop | death | 2 | 33.3s | 3 | 11 | 0 | 2 | 1 | 4 | 20 | 0.65x |
| M7 | low | paired | mobile | clear | - | 32.7s | 0 | 91 | 4041 | 2 | 2 | 1 | 73 | 0.72x |
| M7 | low | paired | desktop | clear | - | 36s | 1 | 63 | 3285 | 4 | 2 | 1 | 68 | 0.66x |
| M7 | expected | none | mobile | death | 4 | 41.5s | 4 | 39 | 0 | 3 | 3 | 7 | 34 | 0.75x |
| M7 | expected | none | desktop | death | 4 | 67.2s | 4 | 24 | 0 | 2 | 3 | 7 | 28 | 0.75x |
| M7 | expected | paired | mobile | clear | - | 41.9s | 0 | 92 | 4062 | 2 | 2 | 4 | 68 | 0.8x |
| M7 | expected | paired | desktop | clear | - | 41.5s | 0 | 76 | 4062 | 2 | 2 | 6 | 62 | 0.78x |
| M7 | upgraded | none | mobile | clear | - | 77.3s | 4 | 90 | 3264 | 3 | 5 | 9 | 38 | 0.93x |
| M7 | upgraded | none | desktop | death | 4 | 75.1s | 5 | 21 | 0 | 2 | 5 | 9 | 33 | 0.82x |
| M7 | upgraded | paired | mobile | clear | - | 33.5s | 0 | 89 | 4083 | 3 | 2 | 2 | 71 | 0.75x |
| M7 | upgraded | paired | desktop | clear | - | 40.1s | 0 | 76 | 4083 | 2 | 2 | 2 | 66 | 0.68x |

## Axis summary

| Axis | Value | Cell |
| --- | --- | --- |
| tier | low | 148/52/0; D2; C58; W3431; P54; E112 |
| tier | expected | 170/30/0; D0; C62; W3744; P54; E107 |
| tier | upgraded | 194/6/0; D0; C65; W4087; P54; E107 |
| support | none | 219/81/0; D2; C58; W3374; P54; E91 |
| support | paired | 293/7/0; D0; C65; W4103; P54; E112 |
| viewport | mobile | 271/29/0; D0; C69; W3987; P53; E104 |
| viewport | desktop | 241/59/0; D2; C55; W3590; P54; E112 |

## Findings

- Cells over the provisional 80-hostile-projectile readability ceiling: 0.
- Cells over the 1.25s first-visible-threat ceiling: 0.
- Cells over the 1s in-Wave visible-combat dead-air ceiling: 0.
- Cells that entered engine performance mode: 0.
- Cells that entered heavy-scene mode: 150.
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

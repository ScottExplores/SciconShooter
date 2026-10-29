# Campaign Non-Boss Runtime Balance Matrix

Generated deterministically from Campaign revision 24 and the real `GameEngine` runtime.

## Result

The bounded autonomous sweep ran **600 trials** across **50 non-boss graph Missions**: 40 main-path Missions and 10 route alternatives. It produced **566 clears**, **17 deaths**, and **17 timeouts** (94.3% clear rate).

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
- Source digest: `e7abf873e25dd94035563659e6ccc335304fd2712b36da2764f6ebfcec897876`.

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
| M1 ORBIT ENTRY | main | introduction | 12 | 12/0/0 | 39.3s | 0 | 36 | 3078 | 0.28s | 0.38s | 0 | 78 | 0 |
| M2 CITATION CROSSING | main | formation-remix | 12 | 12/0/0 | 55s | 0 | 58 | 3591 | 0.33s | 0.4s | 3 | 81 | 8 |
| M2B OPEN ORBIT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 63s | 0 | 61 | 3899 | 0.45s | 0.3s | 0 | 84 | 8 |
| M3 PAYWALL CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 50.8s | 0 | 36 | 2882 | 0.47s | 0.13s | 3 | 71 | 10 |
| M4 BASTION APPROACH | main | boss-preparation | 12 | 12/0/0 | 36.6s | 0 | 28 | 3127 | 0.1s | 0.17s | 3 | 71 | 10 |
| M6 HELIX SIGNAL | main | introduction | 12 | 12/0/0 | 46.8s | 0 | 43 | 3191 | 0.5s | 0.83s | 3 | 76 | 10 |
| M7 REDLINE CROSSING | main | formation-remix | 12 | 10/1/1 | 37.1s | 1 | 71 | 4041 | 0.42s | 0.48s | 3 | 92 | 12 |
| M7B REDLINE FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 50.6s | 0 | 80 | 4411 | 0.42s | 0.48s | 6 | 75 | 12 |
| M8 DARK MATTER CHECKPOINT | main | elite-checkpoint | 12 | 9/2/1 | 28.4s | 0 | 34 | 2711 | 0.23s | 0.37s | 30 | 76 | 12 |
| M9 MIRROR APPROACH | main | boss-preparation | 12 | 9/3/0 | 44.3s | 0 | 47 | 3149 | 0.4s | 0.6s | 54 | 100 | 12 |
| M11 SHARD SIGNAL | main | introduction | 12 | 12/0/0 | 25s | 0 | 47 | 3291 | 0.53s | 0.37s | 6 | 75 | 12 |
| M12 QUANTUM CROSSING | main | formation-remix | 12 | 12/0/0 | 31.7s | 0 | 84 | 4230 | 0.43s | 0.35s | 9 | 96 | 12 |
| M12B GRAVITY RIFT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 41.4s | 0 | 83 | 4593 | 0.15s | 0.53s | 9 | 94 | 12 |
| M13 GRAVITY CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 31s | 0 | 35 | 3093 | 0.17s | 0.15s | 7 | 72 | 12 |
| M14 EVENT HORIZON | main | boss-preparation | 12 | 12/0/0 | 48.9s | 0 | 53 | 4066 | 0.13s | 0.38s | 24 | 79 | 12 |
| M16 CRIMSON SIGNAL | main | introduction | 12 | 12/0/0 | 32.9s | 0 | 59 | 4134 | 0.53s | 0.7s | 3 | 74 | 12 |
| M17 ECLIPSE CROSSING | main | formation-remix | 12 | 11/1/0 | 53.3s | 0 | 129 | 6306 | 0.18s | 0.53s | 3 | 91 | 12 |
| M17B TERMINUS FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 11/1/0 | 45.3s | 0 | 114 | 6311 | 0.18s | 0.53s | 6 | 86 | 12 |
| M18 FRACTURE CHECKPOINT | main | elite-checkpoint | 12 | 10/2/0 | 37.4s | 2 | 44 | 2882 | 0.4s | 0.55s | 32 | 82 | 12 |
| M19 LAST LIGHT | main | boss-preparation | 12 | 12/0/0 | 32.6s | 0 | 72 | 4463 | 0.1s | 0.18s | 52 | 99 | 12 |
| M21 PRISM SIGNAL | main | introduction | 12 | 12/0/0 | 35s | 0 | 59 | 4174 | 0.53s | 0.4s | 3 | 78 | 12 |
| M22 SPECTRUM CROSSING | main | formation-remix | 12 | 12/0/0 | 52.3s | 0 | 146 | 6374 | 0.13s | 0.58s | 3 | 112 | 12 |
| M22B PRISM EXPANSE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 47.3s | 0 | 115 | 6361 | 0.13s | 0.58s | 6 | 101 | 12 |
| M23 BROOD CHECKPOINT | main | elite-checkpoint | 12 | 11/0/1 | 51.2s | 0 | 49 | 3602 | 0.4s | 0.55s | 26 | 79 | 12 |
| M24 LUMEN APPROACH | main | boss-preparation | 12 | 12/0/0 | 34.9s | 0 | 67 | 4484 | 0.23s | 0.18s | 2 | 92 | 12 |
| M26 RAIL SIGNAL | main | introduction | 12 | 12/0/0 | 30.9s | 0 | 64 | 4364 | 0.53s | 0.38s | 6 | 88 | 12 |
| M27 MERIDIAN CROSSING | main | formation-remix | 12 | 12/0/0 | 45.5s | 0 | 155 | 6764 | 0.17s | 0.67s | 9 | 97 | 12 |
| M27B RAIL MERIDIAN HIGH-RISK ROUTE | alternative | formation-remix | 12 | 11/1/0 | 44.7s | 0 | 126 | 6668 | 0.13s | 0.53s | 6 | 96 | 12 |
| M28 COIL CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 47.5s | 1 | 48 | 2946 | 0.4s | 0.55s | 30 | 80 | 12 |
| M29 SERPENT APPROACH | main | boss-preparation | 12 | 12/0/0 | 30.8s | 0 | 67 | 4530 | 0.18s | 0.18s | 7 | 94 | 12 |
| M31 GRAVITY SIGNAL | main | introduction | 12 | 12/0/0 | 39s | 0 | 94 | 5153 | 0.4s | 0.33s | 6 | 103 | 12 |
| M32 EVENTIDE CROSSING | main | formation-remix | 12 | 11/1/0 | 51.6s | 0 | 177 | 7770 | 0.22s | 4.1s | 6 | 97 | 12 |
| M32B SINGULARITY REACH HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 44.3s | 2 | 156 | 7858 | 0.12s | 0.53s | 6 | 103 | 12 |
| M33 WELL CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 26.1s | 0 | 58 | 4151 | 0.4s | 0.55s | 24 | 96 | 12 |
| M34 COLLAPSE APPROACH | main | boss-preparation | 12 | 12/0/0 | 28.5s | 0 | 92 | 5294 | 0.12s | 0.27s | 52 | 96 | 12 |
| M36 ORBIT SIGNAL | main | introduction | 12 | 12/0/0 | 40.9s | 0 | 95 | 5201 | 0.4s | 0.27s | 6 | 82 | 12 |
| M37 AXIS CROSSING | main | formation-remix | 12 | 12/0/0 | 61s | 0 | 195 | 7884 | 0.18s | 0.45s | 6 | 99 | 12 |
| M37B GYROSCOPE ARRAY HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 53.4s | 0 | 163 | 8118 | 0.12s | 0.53s | 9 | 114 | 12 |
| M38 GYRO CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 45.2s | 0 | 57 | 4163 | 0.4s | 0.58s | 54 | 110 | 12 |
| M39 ROTATION APPROACH | main | boss-preparation | 12 | 12/0/0 | 39.4s | 1 | 91 | 4551 | 0.13s | 0.17s | 32 | 95 | 12 |
| M41 SIEGE SIGNAL | main | introduction | 12 | 12/0/0 | 44.6s | 0 | 110 | 5549 | 0.4s | 0.33s | 3 | 85 | 12 |
| M42 BREACH CROSSING | main | formation-remix | 12 | 11/1/0 | 55.7s | 0 | 199 | 8384 | 0.22s | 0.48s | 9 | 110 | 12 |
| M42B HAMMERHEAD LINE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 5/1/6 | 125.6s | 3 | 187 | 0 | 0.1s | 0.53s | 14 | 108 | 12 |
| M43 HAMMER CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 32.4s | 0 | 85 | 4822 | 0.4s | 0.58s | 3 | 88 | 12 |
| M44 DREAD APPROACH | main | boss-preparation | 12 | 12/0/0 | 35.2s | 0 | 130 | 6084 | 0.1s | 0.38s | 2 | 97 | 12 |
| M46 FRONTIER SIGNAL | main | introduction | 12 | 12/0/0 | 40.9s | 0 | 105 | 5774 | 0.62s | 0.35s | 3 | 86 | 12 |
| M47 CLAW CROSSING | main | formation-remix | 12 | 11/1/0 | 61s | 0 | 227 | 8888 | 0.13s | 0.58s | 9 | 111 | 12 |
| M47B CROWNCLAW FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 2/2/8 | 158.8s | 3 | 178 | 0 | 0.15s | 0.53s | 13 | 131 | 12 |
| M48 CROWN CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 38.8s | 0 | 80 | 4846 | 0.4s | 0.55s | 3 | 89 | 12 |
| M49 REDLINE APPROACH | main | boss-preparation | 12 | 12/0/0 | 34.4s | 0 | 119 | 6109 | 0.22s | 0.27s | 3 | 112 | 12 |

## M2 and M7 detailed checkpoints

These early formation-remix Missions are expanded cell-by-cell because the Campaign brief calls them out as dedicated balance checkpoints.

| Mission | Power | Supports | Viewport | Outcome | Death Wave | Time | Damage | Coins | Weekly | Bombs | Ability | Peak hostile | Peak entities | Budget peak |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| M2 | low | none | mobile | clear | - | 64.3s | 1 | 63 | 2747 | 3 | 4 | 2 | 33 | 0.75x |
| M2 | low | none | desktop | clear | - | 72.1s | 0 | 44 | 3490 | 2 | 5 | 2 | 31 | 0.75x |
| M2 | low | paired | mobile | clear | - | 19.8s | 0 | 56 | 3591 | 2 | 2 | 1 | 79 | 0.75x |
| M2 | low | paired | desktop | clear | - | 21.2s | 0 | 49 | 3591 | 3 | 2 | 1 | 78 | 0.75x |
| M2 | expected | none | mobile | clear | - | 67.2s | 1 | 60 | 2810 | 3 | 4 | 2 | 33 | 0.75x |
| M2 | expected | none | desktop | clear | - | 87.4s | 0 | 45 | 3478 | 2 | 4 | 3 | 32 | 0.75x |
| M2 | expected | paired | mobile | clear | - | 17.6s | 0 | 59 | 3591 | 2 | 2 | 1 | 81 | 0.67x |
| M2 | expected | paired | desktop | clear | - | 20s | 0 | 47 | 3591 | 2 | 2 | 1 | 75 | 0.75x |
| M2 | upgraded | none | mobile | clear | - | 55s | 1 | 59 | 2793 | 2 | 4 | 2 | 32 | 0.75x |
| M2 | upgraded | none | desktop | clear | - | 83s | 1 | 42 | 2692 | 3 | 5 | 2 | 32 | 0.75x |
| M2 | upgraded | paired | mobile | clear | - | 17s | 0 | 64 | 3612 | 3 | 1 | 1 | 81 | 0.67x |
| M2 | upgraded | paired | desktop | clear | - | 23.1s | 0 | 58 | 3612 | 2 | 2 | 1 | 65 | 0.75x |
| M7 | low | none | mobile | death | 6 | 68.3s | 3 | 55 | 0 | 2 | 4 | 1 | 31 | 0.8x |
| M7 | low | none | desktop | clear | - | 149.1s | 3 | 63 | 3264 | 2 | 8 | 3 | 31 | 0.93x |
| M7 | low | paired | mobile | clear | - | 26.6s | 0 | 78 | 4062 | 2 | 2 | 0 | 92 | 0.71x |
| M7 | low | paired | desktop | clear | - | 37.1s | 0 | 61 | 4041 | 2 | 2 | 3 | 76 | 0.79x |
| M7 | expected | none | mobile | clear | - | 106s | 4 | 76 | 3264 | 3 | 7 | 3 | 31 | 1x |
| M7 | expected | none | desktop | timeout | - | 180s | 3 | 59 | 0 | 2 | 10 | 3 | 31 | 0.93x |
| M7 | expected | paired | mobile | clear | - | 27.2s | 0 | 92 | 4083 | 3 | 2 | 3 | 75 | 0.79x |
| M7 | expected | paired | desktop | clear | - | 36.5s | 0 | 48 | 4062 | 2 | 3 | 0 | 76 | 0.69x |
| M7 | upgraded | none | mobile | clear | - | 97s | 3 | 94 | 3285 | 2 | 6 | 3 | 31 | 0.93x |
| M7 | upgraded | none | desktop | clear | - | 102.7s | 1 | 68 | 3327 | 3 | 6 | 3 | 32 | 1x |
| M7 | upgraded | paired | mobile | clear | - | 25.9s | 0 | 84 | 4083 | 3 | 2 | 0 | 74 | 0.85x |
| M7 | upgraded | paired | desktop | clear | - | 29.4s | 0 | 71 | 4083 | 2 | 2 | 0 | 71 | 0.75x |

## Axis summary

| Axis | Value | Cell |
| --- | --- | --- |
| tier | low | 183/11/6; D0; C72; W4183; P54; E110 |
| tier | expected | 188/4/8; D0; C77; W4463; P54; E114 |
| tier | upgraded | 195/2/3; D0; C76; W4526; P54; E131 |
| support | none | 273/16/11; D0; C76; W4174; P54; E89 |
| support | paired | 293/1/6; D0; C74; W4509; P54; E131 |
| viewport | mobile | 288/6/6; D0; C90; W4463; P53; E131 |
| viewport | desktop | 278/11/11; D0; C68; W4251; P54; E110 |

## Findings

- Cells over the provisional 80-hostile-projectile readability ceiling: 0.
- Cells over the 1.25s first-visible-threat ceiling: 0.
- Cells over the 1s in-Wave visible-combat dead-air ceiling: 1.
- Cells that entered engine performance mode: 0.
- Cells that entered heavy-scene mode: 153.
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

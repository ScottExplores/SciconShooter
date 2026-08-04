# Campaign Non-Boss Runtime Balance Matrix

Generated deterministically from Campaign revision 24 and the real `GameEngine` runtime.

## Result

The bounded autonomous sweep ran **600 trials** across **50 non-boss graph Missions**: 40 main-path Missions and 10 route alternatives. It produced **584 clears**, **14 deaths**, and **2 timeouts** (97.3% clear rate).

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
- Source digest: `e2da5e6818f7675e2e2c59134caf6cd62e442e8fa11f2970cb0f8405b61db66c`.

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
| M1 ORBIT ENTRY | main | introduction | 12 | 12/0/0 | 38.9s | 0 | 34 | 2802 | 0.52s | 0.43s | 0 | 66 | 0 |
| M2 CITATION CROSSING | main | formation-remix | 12 | 12/0/0 | 52.5s | 0 | 61 | 3566 | 0.45s | 0.43s | 0 | 82 | 8 |
| M2B OPEN ORBIT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 11/1/0 | 20.4s | 0 | 61 | 3899 | 0.45s | 0.25s | 0 | 82 | 8 |
| M3 PAYWALL CHECKPOINT | main | elite-checkpoint | 12 | 10/2/0 | 20.2s | 1 | 39 | 2846 | 0.53s | 0.37s | 2 | 63 | 8 |
| M4 BASTION APPROACH | main | boss-preparation | 12 | 10/2/0 | 30.5s | 1 | 43 | 2043 | 0.1s | 0.88s | 2 | 65 | 12 |
| M6 HELIX SIGNAL | main | introduction | 12 | 12/0/0 | 52s | 0 | 41 | 3191 | 0.48s | 0.62s | 3 | 75 | 9 |
| M7 REDLINE CROSSING | main | formation-remix | 12 | 12/0/0 | 53s | 0 | 73 | 4062 | 0.52s | 0.3s | 6 | 73 | 12 |
| M7B REDLINE FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 11/1/0 | 32.9s | 0 | 74 | 4411 | 0.52s | 0.45s | 3 | 89 | 12 |
| M8 DARK MATTER CHECKPOINT | main | elite-checkpoint | 12 | 8/3/1 | 28.1s | 0 | 31 | 2711 | 0.23s | 0.6s | 31 | 73 | 12 |
| M9 MIRROR APPROACH | main | boss-preparation | 12 | 10/2/0 | 43.4s | 0 | 45 | 3149 | 0.18s | 0.35s | 54 | 103 | 12 |
| M11 SHARD SIGNAL | main | introduction | 12 | 12/0/0 | 24s | 0 | 55 | 3271 | 0.48s | 0.27s | 6 | 76 | 12 |
| M12 QUANTUM CROSSING | main | formation-remix | 12 | 11/1/0 | 37.8s | 0 | 86 | 4230 | 0.25s | 0.37s | 8 | 84 | 12 |
| M12B GRAVITY RIFT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 33.2s | 0 | 89 | 4593 | 0.2s | 0.52s | 9 | 97 | 12 |
| M13 GRAVITY CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 31.9s | 0 | 36 | 3093 | 0.13s | 0.2s | 29 | 68 | 12 |
| M14 EVENT HORIZON | main | boss-preparation | 12 | 11/1/0 | 32.7s | 0 | 47 | 4066 | 0.18s | 0.55s | 24 | 83 | 12 |
| M16 CRIMSON SIGNAL | main | introduction | 12 | 12/0/0 | 30.2s | 0 | 51 | 3927 | 0.47s | 0.33s | 6 | 76 | 12 |
| M17 ECLIPSE CROSSING | main | formation-remix | 12 | 12/0/0 | 41.4s | 0 | 88 | 5438 | 0.17s | 0.6s | 6 | 90 | 12 |
| M17B TERMINUS FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 46s | 0 | 96 | 5918 | 0.17s | 0.6s | 6 | 87 | 12 |
| M18 FRACTURE CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 26.7s | 1 | 44 | 3151 | 0.13s | 0.25s | 32 | 84 | 12 |
| M19 LAST LIGHT | main | boss-preparation | 12 | 12/0/0 | 34.3s | 0 | 66 | 4198 | 0.15s | 0.55s | 52 | 90 | 12 |
| M21 PRISM SIGNAL | main | introduction | 12 | 12/0/0 | 30.7s | 0 | 50 | 3967 | 0.52s | 0.32s | 6 | 80 | 12 |
| M22 SPECTRUM CROSSING | main | formation-remix | 12 | 12/0/0 | 35.4s | 0 | 90 | 5488 | 0.27s | 0.6s | 6 | 86 | 12 |
| M22B PRISM EXPANSE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 39s | 0 | 96 | 5954 | 0.23s | 0.6s | 6 | 95 | 12 |
| M23 BROOD CHECKPOINT | main | elite-checkpoint | 12 | 11/0/1 | 38s | 0 | 40 | 3451 | 0.13s | 0.48s | 26 | 83 | 12 |
| M24 LUMEN APPROACH | main | boss-preparation | 12 | 12/0/0 | 35s | 0 | 59 | 4261 | 0.15s | 0.4s | 2 | 85 | 12 |
| M26 RAIL SIGNAL | main | introduction | 12 | 12/0/0 | 25.8s | 0 | 55 | 3987 | 0.57s | 0.35s | 6 | 85 | 12 |
| M27 MERIDIAN CROSSING | main | formation-remix | 12 | 12/0/0 | 41.5s | 0 | 98 | 5493 | 0.17s | 0.62s | 3 | 98 | 12 |
| M27B RAIL MERIDIAN HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 31.9s | 0 | 96 | 5959 | 0.23s | 0.6s | 6 | 87 | 12 |
| M28 COIL CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 43.1s | 0 | 40 | 3471 | 0.13s | 0.32s | 30 | 81 | 12 |
| M29 SERPENT APPROACH | main | boss-preparation | 12 | 12/0/0 | 29.8s | 0 | 57 | 4240 | 0.15s | 0.35s | 29 | 84 | 12 |
| M31 GRAVITY SIGNAL | main | introduction | 12 | 12/0/0 | 27.3s | 0 | 59 | 4154 | 0.57s | 0.62s | 9 | 81 | 12 |
| M32 EVENTIDE CROSSING | main | formation-remix | 12 | 12/0/0 | 25.9s | 0 | 98 | 5779 | 0.25s | 0.5s | 6 | 91 | 12 |
| M32B SINGULARITY REACH HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 41s | 0 | 102 | 6215 | 0.2s | 0.6s | 6 | 104 | 12 |
| M33 WELL CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 25.6s | 0 | 43 | 3662 | 0.1s | 0.33s | 24 | 86 | 12 |
| M34 COLLAPSE APPROACH | main | boss-preparation | 12 | 12/0/0 | 28.6s | 0 | 69 | 4500 | 0.13s | 0.35s | 52 | 103 | 12 |
| M36 ORBIT SIGNAL | main | introduction | 12 | 12/0/0 | 24.4s | 0 | 60 | 4154 | 0.68s | 0.4s | 3 | 87 | 12 |
| M37 AXIS CROSSING | main | formation-remix | 12 | 12/0/0 | 35.8s | 0 | 103 | 5754 | 0.17s | 0.6s | 6 | 93 | 12 |
| M37B GYROSCOPE ARRAY HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 43.3s | 2 | 102 | 5431 | 0.2s | 0.6s | 6 | 91 | 12 |
| M38 GYRO CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 41.6s | 0 | 45 | 3618 | 0.1s | 0.33s | 54 | 107 | 12 |
| M39 ROTATION APPROACH | main | boss-preparation | 12 | 12/0/0 | 38.8s | 1 | 60 | 3744 | 0.18s | 0.37s | 32 | 89 | 12 |
| M41 SIEGE SIGNAL | main | introduction | 12 | 12/0/0 | 22s | 0 | 58 | 4154 | 0.55s | 0.33s | 3 | 82 | 12 |
| M42 BREACH CROSSING | main | formation-remix | 12 | 12/0/0 | 33.7s | 0 | 108 | 5754 | 0.2s | 0.6s | 6 | 91 | 12 |
| M42B HAMMERHEAD LINE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 34.8s | 0 | 94 | 6234 | 0.23s | 0.6s | 6 | 93 | 12 |
| M43 HAMMER CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 21.3s | 0 | 40 | 3638 | 0.12s | 0.25s | 2 | 92 | 12 |
| M44 DREAD APPROACH | main | boss-preparation | 12 | 12/0/0 | 60.5s | 0 | 64 | 4500 | 0.17s | 0.25s | 27 | 93 | 12 |
| M46 FRONTIER SIGNAL | main | introduction | 12 | 12/0/0 | 26.9s | 0 | 59 | 4154 | 0.57s | 0.4s | 6 | 84 | 12 |
| M47 CLAW CROSSING | main | formation-remix | 12 | 12/0/0 | 32.4s | 0 | 102 | 5754 | 0.2s | 0.58s | 3 | 91 | 12 |
| M47B CROWNCLAW FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 39.2s | 0 | 106 | 6234 | 0.3s | 0.55s | 6 | 92 | 12 |
| M48 CROWN CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 43.6s | 1 | 43 | 3638 | 0.13s | 0.67s | 30 | 91 | 12 |
| M49 REDLINE APPROACH | main | boss-preparation | 12 | 12/0/0 | 28s | 0 | 64 | 4500 | 0.13s | 0.28s | 52 | 101 | 12 |

## M2 and M7 detailed checkpoints

These early formation-remix Missions are expanded cell-by-cell because the Campaign brief calls them out as dedicated balance checkpoints.

| Mission | Power | Supports | Viewport | Outcome | Death Wave | Time | Damage | Coins | Weekly | Bombs | Ability | Peak hostile | Peak entities | Budget peak |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| M2 | low | none | mobile | clear | - | 70.9s | 0 | 64 | 3528 | 2 | 4 | 0 | 28 | 0.56x |
| M2 | low | none | desktop | clear | - | 76.7s | 1 | 36 | 2684 | 2 | 5 | 0 | 28 | 0.5x |
| M2 | low | paired | mobile | clear | - | 15.3s | 0 | 59 | 3566 | 1 | 1 | 0 | 82 | 0.4x |
| M2 | low | paired | desktop | clear | - | 18.3s | 0 | 61 | 3566 | 2 | 1 | 0 | 72 | 0.4x |
| M2 | expected | none | mobile | clear | - | 53.4s | 0 | 67 | 3528 | 2 | 4 | 0 | 30 | 0.5x |
| M2 | expected | none | desktop | clear | - | 74.2s | 0 | 47 | 3415 | 2 | 4 | 0 | 26 | 0.5x |
| M2 | expected | paired | mobile | clear | - | 15.9s | 0 | 68 | 3566 | 1 | 2 | 0 | 78 | 0.4x |
| M2 | expected | paired | desktop | clear | - | 17.2s | 0 | 59 | 3566 | 1 | 1 | 0 | 74 | 0.4x |
| M2 | upgraded | none | mobile | clear | - | 52.5s | 0 | 69 | 3570 | 4 | 3 | 0 | 30 | 0.56x |
| M2 | upgraded | none | desktop | clear | - | 58.3s | 0 | 53 | 3557 | 2 | 4 | 0 | 32 | 0.5x |
| M2 | upgraded | paired | mobile | clear | - | 15.6s | 0 | 67 | 3587 | 1 | 1 | 0 | 82 | 0.4x |
| M2 | upgraded | paired | desktop | clear | - | 20.6s | 0 | 59 | 3587 | 2 | 2 | 0 | 73 | 0.4x |
| M7 | low | none | mobile | clear | - | 89.1s | 1 | 90 | 3285 | 4 | 5 | 3 | 29 | 1x |
| M7 | low | none | desktop | clear | - | 53s | 0 | 48 | 4041 | 4 | 4 | 1 | 48 | 0.96x |
| M7 | low | paired | mobile | clear | - | 32.6s | 0 | 101 | 4041 | 2 | 3 | 0 | 64 | 0.71x |
| M7 | low | paired | desktop | clear | - | 31.1s | 0 | 50 | 4041 | 2 | 2 | 0 | 68 | 0.71x |
| M7 | expected | none | mobile | clear | - | 129.5s | 0 | 73 | 4062 | 2 | 8 | 3 | 29 | 0.89x |
| M7 | expected | none | desktop | clear | - | 75s | 0 | 56 | 4062 | 2 | 5 | 3 | 48 | 1x |
| M7 | expected | paired | mobile | clear | - | 28.4s | 0 | 99 | 4062 | 2 | 2 | 0 | 64 | 0.7x |
| M7 | expected | paired | desktop | clear | - | 31s | 0 | 66 | 4062 | 3 | 2 | 0 | 68 | 0.8x |
| M7 | upgraded | none | mobile | clear | - | 91s | 1 | 78 | 3327 | 4 | 6 | 6 | 33 | 0.8x |
| M7 | upgraded | none | desktop | clear | - | 135.4s | 3 | 58 | 3285 | 3 | 9 | 3 | 32 | 0.89x |
| M7 | upgraded | paired | mobile | clear | - | 30.4s | 0 | 87 | 4083 | 2 | 3 | 3 | 73 | 0.75x |
| M7 | upgraded | paired | desktop | clear | - | 37.7s | 0 | 68 | 4083 | 3 | 3 | 3 | 73 | 0.78x |

## Axis summary

| Axis | Value | Cell |
| --- | --- | --- |
| tier | low | 188/11/1; D0; C59; W4114; P54; E106 |
| tier | expected | 196/3/1; D0; C60; W4154; P54; E105 |
| tier | upgraded | 200/0/0; D0; C61; W4154; P54; E107 |
| support | none | 284/14/2; D0; C61; W4062; P54; E90 |
| support | paired | 300/0/0; D0; C59; W4154; P54; E107 |
| viewport | mobile | 294/6/0; D0; C65; W4154; P54; E96 |
| viewport | desktop | 290/8/2; D0; C50; W4134; P54; E107 |

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

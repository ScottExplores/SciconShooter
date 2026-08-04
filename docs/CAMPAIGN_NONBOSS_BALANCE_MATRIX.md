# Campaign Non-Boss Runtime Balance Matrix

Generated deterministically from Campaign revision 24 and the real `GameEngine` runtime.

## Result

The bounded autonomous sweep ran **600 trials** across **50 non-boss graph Missions**: 40 main-path Missions and 10 route alternatives. It produced **584 clears**, **16 deaths**, and **0 timeouts** (97.3% clear rate).

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
- Source digest: `b855784548cd4f77f1c3b48ff361a21b76704dadd70030bae449347f10ab0e73`.

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
| M1 ORBIT ENTRY | main | introduction | 12 | 12/0/0 | 37.9s | 0 | 34 | 2802 | 0.5s | 0.72s | 0 | 67 | 0 |
| M2 CITATION CROSSING | main | formation-remix | 12 | 12/0/0 | 40.5s | 0 | 61 | 3566 | 0.45s | 0.25s | 0 | 83 | 8 |
| M2B OPEN ORBIT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 67.9s | 0 | 57 | 3899 | 0.45s | 0.4s | 0 | 77 | 8 |
| M3 PAYWALL CHECKPOINT | main | elite-checkpoint | 12 | 10/2/0 | 20.5s | 0 | 38 | 2846 | 0.53s | 0.62s | 2 | 63 | 8 |
| M4 BASTION APPROACH | main | boss-preparation | 12 | 10/2/0 | 27.9s | 1 | 40 | 2778 | 0.1s | 0.88s | 2 | 65 | 12 |
| M6 HELIX SIGNAL | main | introduction | 12 | 12/0/0 | 41.1s | 0 | 44 | 3191 | 0.48s | 0.52s | 4 | 76 | 10 |
| M7 REDLINE CROSSING | main | formation-remix | 12 | 11/1/0 | 32.7s | 1 | 73 | 4041 | 0.52s | 0.62s | 6 | 79 | 12 |
| M7B REDLINE FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 11/1/0 | 35.1s | 0 | 75 | 4411 | 0.52s | 0.5s | 6 | 88 | 12 |
| M8 DARK MATTER CHECKPOINT | main | elite-checkpoint | 12 | 8/4/0 | 28.1s | 1 | 29 | 2711 | 0.23s | 0.67s | 31 | 73 | 12 |
| M9 MIRROR APPROACH | main | boss-preparation | 12 | 11/1/0 | 54.8s | 0 | 42 | 3149 | 0.18s | 0.28s | 54 | 102 | 12 |
| M11 SHARD SIGNAL | main | introduction | 12 | 12/0/0 | 29.3s | 0 | 54 | 3271 | 0.48s | 0.72s | 6 | 73 | 12 |
| M12 QUANTUM CROSSING | main | formation-remix | 12 | 12/0/0 | 38.3s | 0 | 95 | 4230 | 0.25s | 0.58s | 9 | 77 | 12 |
| M12B GRAVITY RIFT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 11/1/0 | 32.7s | 0 | 70 | 4593 | 0.2s | 0.65s | 9 | 103 | 12 |
| M13 GRAVITY CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 29s | 0 | 32 | 3093 | 0.13s | 0.2s | 29 | 67 | 12 |
| M14 EVENT HORIZON | main | boss-preparation | 12 | 12/0/0 | 40.6s | 0 | 57 | 4066 | 0.18s | 0.55s | 24 | 79 | 12 |
| M16 CRIMSON SIGNAL | main | introduction | 12 | 12/0/0 | 26.4s | 0 | 54 | 3927 | 0.48s | 0.5s | 6 | 77 | 12 |
| M17 ECLIPSE CROSSING | main | formation-remix | 12 | 12/0/0 | 33.8s | 0 | 103 | 5476 | 0.17s | 0.82s | 6 | 92 | 12 |
| M17B TERMINUS FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 46.4s | 0 | 92 | 5909 | 0.17s | 0.97s | 6 | 84 | 12 |
| M18 FRACTURE CHECKPOINT | main | elite-checkpoint | 12 | 10/2/0 | 29.3s | 2 | 44 | 2691 | 0.13s | 0.32s | 32 | 82 | 12 |
| M19 LAST LIGHT | main | boss-preparation | 12 | 12/0/0 | 34.8s | 0 | 66 | 4219 | 0.2s | 0.63s | 52 | 94 | 12 |
| M21 PRISM SIGNAL | main | introduction | 12 | 12/0/0 | 30.4s | 0 | 58 | 3967 | 0.55s | 0.95s | 6 | 82 | 12 |
| M22 SPECTRUM CROSSING | main | formation-remix | 12 | 12/0/0 | 43.8s | 0 | 89 | 5488 | 0.2s | 0.6s | 6 | 88 | 12 |
| M22B PRISM EXPANSE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 42.3s | 0 | 95 | 5945 | 0.25s | 0.78s | 6 | 90 | 12 |
| M23 BROOD CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 38.5s | 1 | 37 | 3431 | 0.13s | 0.48s | 27 | 81 | 12 |
| M24 LUMEN APPROACH | main | boss-preparation | 12 | 12/0/0 | 32.3s | 0 | 57 | 4240 | 0.15s | 0.97s | 2 | 83 | 12 |
| M26 RAIL SIGNAL | main | introduction | 12 | 12/0/0 | 30.4s | 0 | 53 | 3987 | 0.57s | 0.95s | 6 | 84 | 12 |
| M27 MERIDIAN CROSSING | main | formation-remix | 12 | 12/0/0 | 42.5s | 0 | 100 | 5505 | 0.2s | 0.62s | 9 | 91 | 12 |
| M27B RAIL MERIDIAN HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 36.6s | 0 | 97 | 5950 | 0.23s | 0.75s | 6 | 87 | 12 |
| M28 COIL CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 29.5s | 1 | 41 | 3471 | 0.13s | 0.28s | 30 | 81 | 12 |
| M29 SERPENT APPROACH | main | boss-preparation | 12 | 12/0/0 | 27.7s | 0 | 58 | 4240 | 0.15s | 0.25s | 29 | 83 | 12 |
| M31 GRAVITY SIGNAL | main | introduction | 12 | 12/0/0 | 27.1s | 0 | 59 | 4154 | 0.57s | 0.85s | 3 | 80 | 12 |
| M32 EVENTIDE CROSSING | main | formation-remix | 12 | 12/0/0 | 36.5s | 0 | 104 | 5754 | 0.22s | 0.6s | 6 | 97 | 12 |
| M32B SINGULARITY REACH HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 41.3s | 0 | 105 | 6247 | 0.2s | 0.78s | 3 | 103 | 12 |
| M33 WELL CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 25.4s | 0 | 44 | 3662 | 0.1s | 0.42s | 24 | 90 | 12 |
| M34 COLLAPSE APPROACH | main | boss-preparation | 12 | 12/0/0 | 32.3s | 0 | 64 | 4500 | 0.15s | 0.42s | 52 | 100 | 12 |
| M36 ORBIT SIGNAL | main | introduction | 12 | 12/0/0 | 23.5s | 0 | 61 | 4154 | 0.65s | 0.58s | 3 | 87 | 12 |
| M37 AXIS CROSSING | main | formation-remix | 12 | 12/0/0 | 35.8s | 0 | 106 | 5754 | 0.17s | 0.77s | 6 | 92 | 12 |
| M37B GYROSCOPE ARRAY HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 41.5s | 0 | 94 | 6192 | 0.2s | 0.6s | 6 | 98 | 12 |
| M38 GYRO CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 47s | 1 | 40 | 2918 | 0.1s | 0.3s | 54 | 108 | 12 |
| M39 ROTATION APPROACH | main | boss-preparation | 12 | 12/0/0 | 40.9s | 2 | 67 | 3744 | 0.18s | 0.33s | 32 | 89 | 12 |
| M41 SIEGE SIGNAL | main | introduction | 12 | 12/0/0 | 23.6s | 0 | 58 | 4154 | 0.52s | 0.48s | 1 | 82 | 12 |
| M42 BREACH CROSSING | main | formation-remix | 12 | 12/0/0 | 29.3s | 0 | 111 | 5754 | 0.2s | 0.6s | 3 | 91 | 12 |
| M42B HAMMERHEAD LINE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 40.2s | 0 | 95 | 6220 | 0.23s | 0.67s | 6 | 97 | 12 |
| M43 HAMMER CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 21.7s | 0 | 38 | 3638 | 0.12s | 0.17s | 2 | 89 | 12 |
| M44 DREAD APPROACH | main | boss-preparation | 12 | 12/0/0 | 44.9s | 0 | 66 | 4500 | 0.15s | 0.4s | 25 | 90 | 12 |
| M46 FRONTIER SIGNAL | main | introduction | 12 | 12/0/0 | 26.2s | 0 | 61 | 4154 | 0.5s | 0.43s | 6 | 89 | 12 |
| M47 CLAW CROSSING | main | formation-remix | 12 | 12/0/0 | 35.7s | 0 | 111 | 5767 | 0.25s | 0.57s | 6 | 111 | 12 |
| M47B CROWNCLAW FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 37s | 0 | 109 | 6234 | 0.28s | 0.6s | 6 | 91 | 12 |
| M48 CROWN CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 41.1s | 1 | 43 | 2918 | 0.13s | 0.3s | 30 | 88 | 12 |
| M49 REDLINE APPROACH | main | boss-preparation | 12 | 12/0/0 | 30.1s | 0 | 65 | 4500 | 0.15s | 0.68s | 52 | 101 | 12 |

## M2 and M7 detailed checkpoints

These early formation-remix Missions are expanded cell-by-cell because the Campaign brief calls them out as dedicated balance checkpoints.

| Mission | Power | Supports | Viewport | Outcome | Death Wave | Time | Damage | Coins | Weekly | Bombs | Ability | Peak hostile | Peak entities | Budget peak |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| M2 | low | none | mobile | clear | - | 64.5s | 0 | 68 | 3503 | 2 | 4 | 0 | 27 | 0.56x |
| M2 | low | none | desktop | clear | - | 76.7s | 1 | 36 | 2709 | 2 | 4 | 0 | 25 | 0.56x |
| M2 | low | paired | mobile | clear | - | 14.8s | 0 | 64 | 3566 | 1 | 1 | 0 | 83 | 0.4x |
| M2 | low | paired | desktop | clear | - | 17.6s | 0 | 60 | 3566 | 2 | 1 | 0 | 71 | 0.4x |
| M2 | expected | none | mobile | clear | - | 52.4s | 1 | 69 | 2797 | 3 | 3 | 0 | 32 | 0.56x |
| M2 | expected | none | desktop | clear | - | 71.4s | 0 | 46 | 3440 | 2 | 4 | 0 | 29 | 0.56x |
| M2 | expected | paired | mobile | clear | - | 19.2s | 0 | 66 | 3566 | 0 | 2 | 0 | 74 | 0.45x |
| M2 | expected | paired | desktop | clear | - | 16.3s | 0 | 57 | 3566 | 1 | 1 | 0 | 74 | 0.4x |
| M2 | upgraded | none | mobile | clear | - | 40.5s | 0 | 63 | 3562 | 4 | 3 | 0 | 30 | 0.56x |
| M2 | upgraded | none | desktop | clear | - | 58.9s | 0 | 56 | 3524 | 2 | 4 | 0 | 30 | 0.5x |
| M2 | upgraded | paired | mobile | clear | - | 16.4s | 0 | 61 | 3587 | 1 | 1 | 0 | 82 | 0.5x |
| M2 | upgraded | paired | desktop | clear | - | 18.6s | 0 | 60 | 3587 | 2 | 2 | 0 | 74 | 0.4x |
| M7 | low | none | mobile | clear | - | 97.2s | 2 | 94 | 3264 | 3 | 6 | 3 | 30 | 0.82x |
| M7 | low | none | desktop | clear | - | 139.2s | 2 | 60 | 3285 | 2 | 7 | 3 | 30 | 0.96x |
| M7 | low | paired | mobile | clear | - | 30.6s | 0 | 99 | 4041 | 2 | 3 | 0 | 64 | 0.72x |
| M7 | low | paired | desktop | clear | - | 30.4s | 0 | 58 | 4041 | 2 | 2 | 0 | 68 | 0.7x |
| M7 | expected | none | mobile | clear | - | 116.1s | 2 | 73 | 3306 | 3 | 8 | 6 | 30 | 0.96x |
| M7 | expected | none | desktop | death | 5 | 78.8s | 4 | 35 | 0 | 2 | 5 | 3 | 28 | 0.8x |
| M7 | expected | paired | mobile | clear | - | 27.1s | 0 | 79 | 4062 | 2 | 2 | 0 | 79 | 0.72x |
| M7 | expected | paired | desktop | clear | - | 32.7s | 0 | 67 | 4062 | 3 | 2 | 0 | 67 | 0.72x |
| M7 | upgraded | none | mobile | clear | - | 136.7s | 4 | 76 | 3264 | 2 | 8 | 3 | 29 | 0.86x |
| M7 | upgraded | none | desktop | clear | - | 135s | 1 | 59 | 3327 | 2 | 8 | 3 | 32 | 0.96x |
| M7 | upgraded | paired | mobile | clear | - | 30.8s | 0 | 78 | 4083 | 2 | 3 | 0 | 72 | 0.78x |
| M7 | upgraded | paired | desktop | clear | - | 24.8s | 0 | 65 | 4083 | 3 | 2 | 0 | 77 | 0.71x |

## Axis summary

| Axis | Value | Cell |
| --- | --- | --- |
| tier | low | 189/11/0; D0; C59; W3927; P54; E103 |
| tier | expected | 195/5/0; D0; C58; W4154; P54; E108 |
| tier | upgraded | 200/0/0; D0; C61; W4154; P54; E111 |
| support | none | 284/16/0; D0; C59; W3967; P54; E88 |
| support | paired | 300/0/0; D0; C60; W4154; P54; E111 |
| viewport | mobile | 292/8/0; D0; C67; W4154; P53; E111 |
| viewport | desktop | 292/8/0; D0; C51; W4083; P54; E108 |

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

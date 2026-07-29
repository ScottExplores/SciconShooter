# Campaign Non-Boss Runtime Balance Matrix

Generated deterministically from Campaign revision 23 and the real `GameEngine` runtime.

## Result

The bounded autonomous sweep ran **600 trials** across **50 non-boss graph Missions**: 40 main-path Missions and 10 route alternatives. It produced **564 clears**, **27 deaths**, and **9 timeouts** (94% clear rate).

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
- Source digest: `fd37c1b3756622387ba38790fb66871e52316f58c83973f63f8c96d122d5adec`.

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

| Mission | Route | Role | Attempts | C/D/T | Median clear | Damage | Coins | Weekly | Peak hostile | Peak entities | Peak firing |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| M1 ORBIT ENTRY | main | introduction | 12 | 12/0/0 | 77s | 0 | 34 | 2808 | 0 | 57 | 3 |
| M2 CITATION CROSSING | main | formation-remix | 12 | 12/0/0 | 90.7s | 0 | 45 | 3452 | 2 | 65 | 5 |
| M2B OPEN ORBIT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 92.5s | 0 | 48 | 3694 | 2 | 62 | 5 |
| M3 PAYWALL CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 96.2s | 0 | 41 | 3268 | 3 | 67 | 8 |
| M4 BASTION APPROACH | main | boss-preparation | 12 | 10/1/1 | 123.6s | 1 | 48 | 3014 | 4 | 65 | 7 |
| M6 HELIX SIGNAL | main | introduction | 12 | 11/1/0 | 77.6s | 0 | 45 | 3104 | 4 | 69 | 8 |
| M7 REDLINE CROSSING | main | formation-remix | 12 | 10/2/0 | 94.5s | 1 | 45 | 3509 | 6 | 66 | 11 |
| M7B REDLINE FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 10/2/0 | 94.5s | 1 | 50 | 3819 | 6 | 69 | 11 |
| M8 DARK MATTER CHECKPOINT | main | elite-checkpoint | 12 | 8/4/0 | 92.5s | 1 | 47 | 2908 | 31 | 89 | 11 |
| M9 MIRROR APPROACH | main | boss-preparation | 12 | 7/2/3 | 120s | 1 | 65 | 3889 | 54 | 105 | 10 |
| M11 SHARD SIGNAL | main | introduction | 12 | 12/0/0 | 76.7s | 0 | 36 | 3136 | 5 | 69 | 12 |
| M12 QUANTUM CROSSING | main | formation-remix | 12 | 10/2/0 | 91.1s | 0 | 47 | 3736 | 9 | 78 | 10 |
| M12B GRAVITY RIFT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 10/2/0 | 91.1s | 0 | 55 | 4015 | 10 | 73 | 10 |
| M13 GRAVITY CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 80.4s | 0 | 50 | 3916 | 29 | 70 | 8 |
| M14 EVENT HORIZON | main | boss-preparation | 12 | 11/0/1 | 115.7s | 1 | 65 | 4633 | 24 | 81 | 8 |
| M16 CRIMSON SIGNAL | main | introduction | 12 | 11/1/0 | 75.5s | 0 | 47 | 3384 | 12 | 76 | 8 |
| M17 ECLIPSE CROSSING | main | formation-remix | 12 | 11/1/0 | 90.4s | 0 | 57 | 4299 | 18 | 80 | 9 |
| M17B TERMINUS FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 11/1/0 | 89.6s | 0 | 64 | 4640 | 17 | 73 | 8 |
| M18 FRACTURE CHECKPOINT | main | elite-checkpoint | 12 | 10/2/0 | 93.1s | 3 | 54 | 3240 | 32 | 74 | 6 |
| M19 LAST LIGHT | main | boss-preparation | 12 | 11/1/0 | 111.6s | 0 | 92 | 5116 | 52 | 102 | 11 |
| M21 PRISM SIGNAL | main | introduction | 12 | 12/0/0 | 74.7s | 0 | 44 | 3492 | 17 | 61 | 7 |
| M22 SPECTRUM CROSSING | main | formation-remix | 12 | 11/1/0 | 89.4s | 0 | 65 | 4332 | 18 | 86 | 8 |
| M22B PRISM EXPANSE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 89.5s | 0 | 59 | 4685 | 18 | 76 | 8 |
| M23 BROOD CHECKPOINT | main | elite-checkpoint | 12 | 11/0/1 | 105.8s | 0 | 62 | 3940 | 25 | 108 | 6 |
| M24 LUMEN APPROACH | main | boss-preparation | 12 | 12/0/0 | 117.8s | 0 | 92 | 5128 | 15 | 95 | 11 |
| M26 RAIL SIGNAL | main | introduction | 12 | 12/0/0 | 73.9s | 0 | 43 | 3504 | 8 | 82 | 7 |
| M27 MERIDIAN CROSSING | main | formation-remix | 12 | 12/0/0 | 89.2s | 0 | 62 | 4337 | 3 | 86 | 6 |
| M27B RAIL MERIDIAN HIGH-RISK ROUTE | alternative | formation-remix | 12 | 11/1/0 | 89s | 0 | 63 | 4708 | 18 | 85 | 8 |
| M28 COIL CHECKPOINT | main | elite-checkpoint | 12 | 11/0/1 | 102.4s | 2 | 69 | 3328 | 30 | 96 | 8 |
| M29 SERPENT APPROACH | main | boss-preparation | 12 | 12/0/0 | 112.5s | 0 | 91 | 5200 | 29 | 110 | 8 |
| M31 GRAVITY SIGNAL | main | introduction | 12 | 12/0/0 | 73s | 0 | 50 | 3548 | 18 | 92 | 7 |
| M32 EVENTIDE CROSSING | main | formation-remix | 12 | 12/0/0 | 89.2s | 0 | 61 | 4349 | 17 | 87 | 6 |
| M32B SINGULARITY REACH HIGH-RISK ROUTE | alternative | formation-remix | 12 | 11/1/0 | 89s | 0 | 65 | 4726 | 16 | 96 | 8 |
| M33 WELL CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 84.3s | 0 | 67 | 4072 | 24 | 99 | 7 |
| M34 COLLAPSE APPROACH | main | boss-preparation | 12 | 12/0/0 | 112.7s | 0 | 96 | 5183 | 52 | 106 | 7 |
| M36 ORBIT SIGNAL | main | introduction | 12 | 12/0/0 | 73s | 0 | 52 | 3572 | 17 | 92 | 7 |
| M37 AXIS CROSSING | main | formation-remix | 12 | 12/0/0 | 89s | 0 | 67 | 4374 | 4 | 93 | 7 |
| M37B GYROSCOPE ARRAY HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 89s | 0 | 67 | 4749 | 12 | 95 | 11 |
| M38 GYRO CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 112.2s | 1 | 65 | 3352 | 54 | 138 | 6 |
| M39 ROTATION APPROACH | main | boss-preparation | 12 | 12/0/0 | 127.9s | 2 | 96 | 4439 | 32 | 96 | 8 |
| M41 SIEGE SIGNAL | main | introduction | 12 | 12/0/0 | 73.2s | 0 | 54 | 3572 | 6 | 99 | 7 |
| M42 BREACH CROSSING | main | formation-remix | 12 | 12/0/0 | 89s | 0 | 66 | 4387 | 3 | 102 | 6 |
| M42B HAMMERHEAD LINE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 11/1/0 | 89s | 0 | 64 | 4749 | 17 | 99 | 9 |
| M43 HAMMER CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 84s | 0 | 63 | 4036 | 2 | 104 | 6 |
| M44 DREAD APPROACH | main | boss-preparation | 12 | 10/0/2 | 131.3s | 0 | 95 | 5208 | 26 | 116 | 8 |
| M46 FRONTIER SIGNAL | main | introduction | 12 | 12/0/0 | 73s | 0 | 51 | 3560 | 6 | 95 | 7 |
| M47 CLAW CROSSING | main | formation-remix | 12 | 12/0/0 | 89s | 0 | 63 | 4349 | 5 | 100 | 6 |
| M47B CROWNCLAW FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 89s | 0 | 66 | 4653 | 17 | 97 | 10 |
| M48 CROWN CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 97s | 1 | 67 | 3340 | 30 | 95 | 6 |
| M49 REDLINE APPROACH | main | boss-preparation | 12 | 12/0/0 | 113.6s | 0 | 96 | 5208 | 52 | 122 | 7 |

## M2 and M7 detailed checkpoints

These early formation-remix Missions are expanded cell-by-cell because the Campaign brief calls them out as dedicated balance checkpoints.

| Mission | Power | Supports | Viewport | Outcome | Death Wave | Time | Damage | Coins | Weekly | Bombs | Ability | Peak hostile | Peak entities | Budget peak |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| M2 | low | none | mobile | clear | - | 90.5s | 0 | 51 | 3427 | 3 | 3 | 1 | 20 | 0.33x |
| M2 | low | none | desktop | clear | - | 104.3s | 0 | 28 | 3226 | 2 | 4 | 2 | 27 | 0.35x |
| M2 | low | paired | mobile | clear | - | 89s | 0 | 54 | 3587 | 0 | 1 | 0 | 65 | 0.17x |
| M2 | low | paired | desktop | clear | - | 90.5s | 0 | 22 | 3364 | 2 | 2 | 0 | 51 | 0.25x |
| M2 | expected | none | mobile | clear | - | 95.8s | 0 | 45 | 3427 | 4 | 4 | 2 | 19 | 0.33x |
| M2 | expected | none | desktop | clear | - | 104.1s | 0 | 26 | 3137 | 2 | 4 | 1 | 17 | 0.45x |
| M2 | expected | paired | mobile | clear | - | 89s | 0 | 57 | 3566 | 0 | 1 | 0 | 56 | 0.22x |
| M2 | expected | paired | desktop | clear | - | 92.3s | 0 | 30 | 3452 | 2 | 2 | 0 | 52 | 0.25x |
| M2 | upgraded | none | mobile | clear | - | 90.7s | 0 | 61 | 3545 | 2 | 3 | 2 | 27 | 0.3x |
| M2 | upgraded | none | desktop | clear | - | 91.5s | 0 | 33 | 3322 | 2 | 4 | 1 | 19 | 0.33x |
| M2 | upgraded | paired | mobile | clear | - | 89s | 0 | 55 | 3608 | 0 | 1 | 0 | 65 | 0.22x |
| M2 | upgraded | paired | desktop | clear | - | 89s | 0 | 31 | 3524 | 0 | 1 | 0 | 51 | 0.25x |
| M7 | low | none | mobile | death | 3 | 62.7s | 3 | 21 | 0 | 2 | 3 | 3 | 24 | 0.72x |
| M7 | low | none | desktop | death | 3 | 96.2s | 3 | 17 | 0 | 2 | 3 | 4 | 21 | 0.71x |
| M7 | low | paired | mobile | clear | - | 94.1s | 0 | 61 | 3686 | 0 | 1 | 0 | 57 | 0.38x |
| M7 | low | paired | desktop | clear | - | 98.6s | 0 | 32 | 3509 | 4 | 2 | 1 | 54 | 0.45x |
| M7 | expected | none | mobile | clear | - | 94.2s | 1 | 60 | 2774 | 2 | 5 | 4 | 32 | 0.71x |
| M7 | expected | none | desktop | clear | - | 137.2s | 1 | 29 | 2510 | 2 | 8 | 6 | 23 | 0.71x |
| M7 | expected | paired | mobile | clear | - | 94.2s | 0 | 56 | 3669 | 0 | 1 | 0 | 66 | 0.38x |
| M7 | expected | paired | desktop | clear | - | 94.5s | 0 | 45 | 3530 | 2 | 3 | 1 | 63 | 0.42x |
| M7 | upgraded | none | mobile | clear | - | 105.3s | 2 | 57 | 2741 | 3 | 5 | 3 | 31 | 0.71x |
| M7 | upgraded | none | desktop | clear | - | 123.9s | 1 | 36 | 2644 | 2 | 6 | 4 | 32 | 0.72x |
| M7 | upgraded | paired | mobile | clear | - | 89.3s | 0 | 64 | 3702 | 0 | 1 | 0 | 65 | 0.46x |
| M7 | upgraded | paired | desktop | clear | - | 93s | 0 | 41 | 3602 | 1 | 2 | 0 | 62 | 0.58x |

## Axis summary

| Axis | Value | Cell |
| --- | --- | --- |
| tier | low | 174/21/5; D0; C53; W3694; P54; E122 |
| tier | expected | 191/6/3; D0; C56; W3884; P54; E121 |
| tier | upgraded | 199/0/1; D0; C58; W4028; P54; E138 |
| support | none | 264/27/9; D0; C53; W3548; P54; E97 |
| support | paired | 300/0/0; D0; C59; W4048; P54; E138 |
| viewport | mobile | 292/8/0; D0; C67; W4048; P53; E116 |
| viewport | desktop | 272/19/9; D0; C44; W3694; P54; E138 |

## Findings

- Cells over the provisional 80-hostile-projectile readability ceiling: 0.
- Cells that entered engine performance mode: 0.
- Cells that entered heavy-scene mode: 219.
- Missions with no clears across the matrix: none.
- Missions where upgraded clear rate was below low-power clear rate: none.
- Missions where paired supports cleared less often than no supports: none.

## Exact-cell evidence

All 600 individual trial rows, including death Wave, damage source diagnostics, bombs and abilities used, coins, projected Weekly points, entity peaks, and performance-mode frames, are stored in `artifacts/campaign-balance/nonboss-runtime-matrix.json`.

## Honest limitations

- This is one shared deterministic random stream per Mission, not a distribution of randomized human attempts.
- The autonomous controller can align, dodge immediate threats, use its finite bombs and cooldown ability, and collect nearby coins, but it does not understand every authored formation as a human strategy problem.
- Recommended power is converted to a consistent upgrade mix; it is not an exact player inventory.
- The Weekly score is a projection from the actual runtime Mission result through the current client score adapter. Accuracy remains `null`, elites remain folded into regular kills, and route/consecutive bonuses are intentionally excluded.
- Headless engine entity peaks are useful readability/performance proxies, not a physical-device FPS measurement or human mobile/desktop playtest.
- This report does not change Campaign tuning. It records evidence for a separate balance decision.

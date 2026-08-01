# Campaign Non-Boss Runtime Balance Matrix

Generated deterministically from Campaign revision 24 and the real `GameEngine` runtime.

## Result

The bounded autonomous sweep ran **600 trials** across **50 non-boss graph Missions**: 40 main-path Missions and 10 route alternatives. It produced **513 clears**, **87 deaths**, and **0 timeouts** (85.5% clear rate).

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
- Source digest: `f4079aaa1653468320ed04dd3d74ae6a9c76ed63d20d1a4ffbaf21f858bb73af`.

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
| M1 ORBIT ENTRY | main | introduction | 12 | 12/0/0 | 25.6s | 0 | 18 | 2346 | 0.4s | 0.88s | 1 | 62 | 5 |
| M2 CITATION CROSSING | main | formation-remix | 12 | 10/2/0 | 19.9s | 0 | 22 | 2841 | 0.33s | 0.87s | 3 | 66 | 6 |
| M2B OPEN ORBIT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 9/3/0 | 18.5s | 0 | 24 | 3112 | 0.28s | 0.63s | 4 | 64 | 8 |
| M3 PAYWALL CHECKPOINT | main | elite-checkpoint | 12 | 10/2/0 | 22.2s | 1 | 38 | 2846 | 0.53s | 0.73s | 3 | 61 | 8 |
| M4 BASTION APPROACH | main | boss-preparation | 12 | 9/3/0 | 33.9s | 3 | 40 | 3056 | 0.33s | 1.17s | 11 | 73 | 12 |
| M6 HELIX SIGNAL | main | introduction | 12 | 9/3/0 | 21.6s | 0 | 28 | 2711 | 0.63s | 0.53s | 9 | 75 | 10 |
| M7 REDLINE CROSSING | main | formation-remix | 12 | 6/6/0 | 22.8s | 3 | 24 | 2964 | 0.57s | 0.67s | 7 | 66 | 12 |
| M7B REDLINE FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 7/5/0 | 21.1s | 3 | 27 | 3241 | 0.57s | 0.75s | 9 | 75 | 12 |
| M8 DARK MATTER CHECKPOINT | main | elite-checkpoint | 12 | 9/3/0 | 32.1s | 0 | 36 | 2731 | 1.05s | 1.18s | 30 | 80 | 12 |
| M9 MIRROR APPROACH | main | boss-preparation | 12 | 11/1/0 | 58.7s | 1 | 55 | 3149 | 0.35s | 0.87s | 54 | 106 | 12 |
| M11 SHARD SIGNAL | main | introduction | 12 | 10/2/0 | 17s | 0 | 31 | 2767 | 0.53s | 0.58s | 5 | 81 | 12 |
| M12 QUANTUM CROSSING | main | formation-remix | 12 | 10/2/0 | 23.2s | 0 | 43 | 3078 | 0.32s | 0.47s | 14 | 83 | 12 |
| M12B GRAVITY RIFT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 9/3/0 | 22.5s | 0 | 43 | 3319 | 0.28s | 0.52s | 14 | 77 | 12 |
| M13 GRAVITY CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 23.6s | 0 | 39 | 3093 | 0.38s | 0.97s | 29 | 73 | 12 |
| M14 EVENT HORIZON | main | boss-preparation | 12 | 11/1/0 | 37s | 1 | 58 | 4024 | 0.25s | 0.85s | 24 | 83 | 12 |
| M16 CRIMSON SIGNAL | main | introduction | 12 | 9/3/0 | 20.5s | 2 | 30 | 3391 | 0.33s | 0.67s | 18 | 81 | 12 |
| M17 ECLIPSE CROSSING | main | formation-remix | 12 | 11/1/0 | 23.6s | 0 | 48 | 4264 | 0.62s | 0.58s | 18 | 91 | 12 |
| M17B TERMINUS FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 10/2/0 | 24s | 0 | 45 | 4607 | 0.3s | 0.65s | 18 | 89 | 12 |
| M18 FRACTURE CHECKPOINT | main | elite-checkpoint | 12 | 9/3/0 | 34.3s | 1 | 40 | 2751 | 0.65s | 0.83s | 32 | 93 | 12 |
| M19 LAST LIGHT | main | boss-preparation | 12 | 11/1/0 | 32.4s | 0 | 66 | 4198 | 0.6s | 0.83s | 52 | 109 | 12 |
| M21 PRISM SIGNAL | main | introduction | 12 | 9/3/0 | 22s | 2 | 42 | 3411 | 0.52s | 0.65s | 18 | 73 | 12 |
| M22 SPECTRUM CROSSING | main | formation-remix | 12 | 10/2/0 | 23.4s | 0 | 45 | 4306 | 0.3s | 0.97s | 18 | 93 | 12 |
| M22B PRISM EXPANSE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 11/1/0 | 25s | 0 | 49 | 4652 | 0.53s | 0.78s | 18 | 95 | 12 |
| M23 BROOD CHECKPOINT | main | elite-checkpoint | 12 | 10/2/0 | 41.6s | 0 | 45 | 3451 | 0.57s | 1.1s | 26 | 94 | 12 |
| M24 LUMEN APPROACH | main | boss-preparation | 12 | 11/1/0 | 36.5s | 0 | 62 | 4219 | 0.58s | 0.87s | 11 | 100 | 12 |
| M26 RAIL SIGNAL | main | introduction | 12 | 10/2/0 | 20.2s | 0 | 33 | 3431 | 0.28s | 0.85s | 18 | 105 | 12 |
| M27 MERIDIAN CROSSING | main | formation-remix | 12 | 10/2/0 | 19.9s | 0 | 42 | 4306 | 0.52s | 0.8s | 18 | 100 | 12 |
| M27B RAIL MERIDIAN HIGH-RISK ROUTE | alternative | formation-remix | 12 | 9/3/0 | 20.3s | 0 | 45 | 4675 | 0.28s | 0.75s | 18 | 108 | 12 |
| M28 COIL CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 37.2s | 0 | 44 | 3471 | 0.52s | 0.78s | 30 | 101 | 12 |
| M29 SERPENT APPROACH | main | boss-preparation | 12 | 11/1/0 | 29.5s | 0 | 65 | 4240 | 0.72s | 1.03s | 28 | 105 | 12 |
| M31 GRAVITY SIGNAL | main | introduction | 12 | 10/2/0 | 18.3s | 0 | 41 | 3598 | 0.2s | 0.52s | 18 | 103 | 12 |
| M32 EVENTIDE CROSSING | main | formation-remix | 12 | 11/1/0 | 21.3s | 0 | 49 | 4576 | 0.28s | 0.65s | 18 | 114 | 12 |
| M32B SINGULARITY REACH HIGH-RISK ROUTE | alternative | formation-remix | 12 | 9/3/0 | 20.2s | 2 | 53 | 4106 | 0.95s | 0.62s | 18 | 100 | 12 |
| M33 WELL CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 27.4s | 0 | 43 | 3638 | 0.88s | 1.47s | 24 | 110 | 12 |
| M34 COLLAPSE APPROACH | main | boss-preparation | 12 | 12/0/0 | 31.7s | 0 | 66 | 4500 | 0.57s | 2.1s | 52 | 121 | 12 |
| M36 ORBIT SIGNAL | main | introduction | 12 | 11/1/0 | 17.7s | 0 | 41 | 3638 | 0.27s | 0.58s | 18 | 104 | 12 |
| M37 AXIS CROSSING | main | formation-remix | 12 | 10/2/0 | 23.2s | 0 | 55 | 4576 | 0.48s | 0.63s | 18 | 104 | 12 |
| M37B GYROSCOPE ARRAY HIGH-RISK ROUTE | alternative | formation-remix | 12 | 10/2/0 | 22.2s | 2 | 52 | 4945 | 0.28s | 0.52s | 18 | 103 | 12 |
| M38 GYRO CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 47.6s | 1 | 48 | 3618 | 0.32s | 1.35s | 54 | 111 | 12 |
| M39 ROTATION APPROACH | main | boss-preparation | 12 | 11/1/0 | 34.3s | 1 | 67 | 3744 | 0.55s | 1.88s | 32 | 112 | 12 |
| M41 SIEGE SIGNAL | main | introduction | 12 | 12/0/0 | 22.9s | 0 | 41 | 3638 | 0.35s | 0.55s | 18 | 110 | 12 |
| M42 BREACH CROSSING | main | formation-remix | 12 | 10/2/0 | 20.4s | 0 | 47 | 4576 | 0.32s | 0.73s | 18 | 106 | 12 |
| M42B HAMMERHEAD LINE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 11/1/0 | 22.7s | 3 | 56 | 4102 | 0.3s | 0.6s | 18 | 107 | 12 |
| M43 HAMMER CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 28.1s | 0 | 40 | 3638 | 0.38s | 1.53s | 18 | 119 | 12 |
| M44 DREAD APPROACH | main | boss-preparation | 12 | 12/0/0 | 55.2s | 0 | 70 | 4500 | 0.8s | 1.6s | 25 | 119 | 12 |
| M46 FRONTIER SIGNAL | main | introduction | 12 | 12/0/0 | 18.3s | 0 | 40 | 3638 | 0.28s | 0.57s | 5 | 115 | 12 |
| M47 CLAW CROSSING | main | formation-remix | 12 | 11/1/0 | 19.4s | 0 | 52 | 4576 | 0.47s | 0.72s | 18 | 115 | 12 |
| M47B CROWNCLAW FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 9/3/0 | 21.2s | 6 | 44 | 4102 | 0.32s | 0.53s | 18 | 117 | 12 |
| M48 CROWN CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 37.5s | 0 | 50 | 3638 | 0.4s | 1.35s | 30 | 110 | 12 |
| M49 REDLINE APPROACH | main | boss-preparation | 12 | 12/0/0 | 30.3s | 0 | 69 | 4500 | 0.72s | 1.42s | 52 | 125 | 12 |

## M2 and M7 detailed checkpoints

These early formation-remix Missions are expanded cell-by-cell because the Campaign brief calls them out as dedicated balance checkpoints.

| Mission | Power | Supports | Viewport | Outcome | Death Wave | Time | Damage | Coins | Weekly | Bombs | Ability | Peak hostile | Peak entities | Budget peak |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| M2 | low | none | mobile | death | 4 | 42.3s | 3 | 27 | 0 | 2 | 2 | 2 | 25 | 0.5x |
| M2 | low | none | desktop | death | 4 | 107.5s | 3 | 22 | 0 | 2 | 5 | 3 | 24 | 0.55x |
| M2 | low | paired | mobile | clear | - | 16.1s | 0 | 25 | 2841 | 0 | 1 | 0 | 61 | 0.22x |
| M2 | low | paired | desktop | clear | - | 19.9s | 0 | 20 | 2841 | 0 | 1 | 0 | 58 | 0.28x |
| M2 | expected | none | mobile | clear | - | 31.4s | 0 | 30 | 2841 | 2 | 2 | 1 | 22 | 0.44x |
| M2 | expected | none | desktop | clear | - | 29.3s | 0 | 27 | 2841 | 4 | 2 | 1 | 32 | 0.44x |
| M2 | expected | paired | mobile | clear | - | 15.7s | 0 | 19 | 2841 | 0 | 1 | 0 | 62 | 0.22x |
| M2 | expected | paired | desktop | clear | - | 17s | 0 | 20 | 2841 | 0 | 1 | 0 | 54 | 0.22x |
| M2 | upgraded | none | mobile | clear | - | 32.2s | 0 | 32 | 2862 | 3 | 2 | 0 | 24 | 0.44x |
| M2 | upgraded | none | desktop | clear | - | 22.9s | 0 | 19 | 2862 | 3 | 2 | 0 | 23 | 0.4x |
| M2 | upgraded | paired | mobile | clear | - | 13.5s | 0 | 21 | 2862 | 0 | 1 | 0 | 66 | 0.3x |
| M2 | upgraded | paired | desktop | clear | - | 18.9s | 0 | 20 | 2862 | 0 | 1 | 0 | 56 | 0.33x |
| M7 | low | none | mobile | death | 3 | 23.4s | 3 | 18 | 0 | 2 | 2 | 4 | 29 | 1x |
| M7 | low | none | desktop | death | 3 | 39.8s | 3 | 13 | 0 | 2 | 3 | 4 | 23 | 0.78x |
| M7 | low | paired | mobile | clear | - | 21.9s | 0 | 51 | 2964 | 0 | 1 | 0 | 62 | 0.46x |
| M7 | low | paired | desktop | clear | - | 25.7s | 0 | 24 | 2964 | 2 | 1 | 1 | 58 | 0.46x |
| M7 | expected | none | mobile | death | 3 | 37.7s | 4 | 21 | 0 | 2 | 2 | 3 | 37 | 0.97x |
| M7 | expected | none | desktop | death | 3 | 58.4s | 4 | 19 | 0 | 2 | 3 | 6 | 31 | 1x |
| M7 | expected | paired | mobile | clear | - | 22.1s | 0 | 40 | 2985 | 1 | 1 | 0 | 63 | 0.46x |
| M7 | expected | paired | desktop | clear | - | 22.8s | 0 | 29 | 2985 | 3 | 1 | 2 | 66 | 0.57x |
| M7 | upgraded | none | mobile | death | 3 | 37.5s | 5 | 17 | 0 | 2 | 2 | 4 | 27 | 0.82x |
| M7 | upgraded | none | desktop | death | 3 | 50.1s | 5 | 23 | 0 | 2 | 3 | 7 | 34 | 1.05x |
| M7 | upgraded | paired | mobile | clear | - | 21.8s | 0 | 51 | 3006 | 0 | 1 | 0 | 66 | 0.54x |
| M7 | upgraded | paired | desktop | clear | - | 23.5s | 0 | 40 | 3006 | 2 | 1 | 1 | 60 | 0.6x |

## Axis summary

| Axis | Value | Cell |
| --- | --- | --- |
| tier | low | 149/51/0; D2; C42; W3149; P54; E117 |
| tier | expected | 173/27/0; D0; C43; W3471; P54; E116 |
| tier | upgraded | 191/9/0; D0; C43; W3638; P54; E125 |
| support | none | 214/86/0; D2; C42; W2898; P54; E99 |
| support | paired | 299/1/0; D0; C44; W3638; P54; E125 |
| viewport | mobile | 278/22/0; D0; C48; W3638; P51; E125 |
| viewport | desktop | 235/65/0; D0; C37; W3310; P54; E121 |

## Findings

- Cells over the provisional 80-hostile-projectile readability ceiling: 0.
- Cells over the 1.25s first-visible-threat ceiling: 0.
- Cells over the 1s in-Wave visible-combat dead-air ceiling: 43.
- Cells that entered engine performance mode: 0.
- Cells that entered heavy-scene mode: 241.
- Missions with no clears across the matrix: none.
- Missions where upgraded clear rate was below low-power clear rate: none.
- Missions where paired supports cleared less often than no supports: M42B.

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

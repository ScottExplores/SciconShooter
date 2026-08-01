# Campaign Non-Boss Runtime Balance Matrix

Generated deterministically from Campaign revision 24 and the real `GameEngine` runtime.

## Result

The bounded autonomous sweep ran **600 trials** across **50 non-boss graph Missions**: 40 main-path Missions and 10 route alternatives. It produced **516 clears**, **84 deaths**, and **0 timeouts** (86% clear rate).

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
- Source digest: `cc176f1d491574bcb9a5a942d89a9d0e974a2b87b5dbd734f3070cd8bbee2805`.

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
| M1 ORBIT ENTRY | main | introduction | 12 | 12/0/0 | 26.9s | 0 | 18 | 2346 | 1.03s | 1.25s | 2 | 60 | 5 |
| M2 CITATION CROSSING | main | formation-remix | 12 | 12/0/0 | 29s | 0 | 25 | 2841 | 1.02s | 1.53s | 2 | 66 | 7 |
| M2B OPEN ORBIT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 11/1/0 | 22s | 0 | 26 | 3112 | 0.28s | 0.8s | 7 | 64 | 8 |
| M3 PAYWALL CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 24s | 1 | 39 | 2846 | 0.53s | 1.02s | 3 | 60 | 8 |
| M4 BASTION APPROACH | main | boss-preparation | 12 | 8/4/0 | 34.2s | 0 | 40 | 3056 | 0.48s | 1.18s | 11 | 72 | 12 |
| M6 HELIX SIGNAL | main | introduction | 12 | 10/2/0 | 23.1s | 1 | 30 | 2711 | 0.63s | 0.53s | 5 | 77 | 10 |
| M7 REDLINE CROSSING | main | formation-remix | 12 | 7/5/0 | 25.5s | 2 | 32 | 2964 | 0.57s | 0.67s | 7 | 69 | 12 |
| M7B REDLINE FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 8/4/0 | 24.8s | 2 | 38 | 3241 | 0.58s | 0.75s | 7 | 70 | 12 |
| M8 DARK MATTER CHECKPOINT | main | elite-checkpoint | 12 | 9/3/0 | 35s | 1 | 33 | 2711 | 0.68s | 0.78s | 30 | 73 | 11 |
| M9 MIRROR APPROACH | main | boss-preparation | 12 | 9/3/0 | 42.5s | 0 | 56 | 3149 | 0.62s | 1.07s | 54 | 104 | 12 |
| M11 SHARD SIGNAL | main | introduction | 12 | 11/1/0 | 19.7s | 0 | 29 | 2767 | 0.53s | 0.53s | 5 | 77 | 12 |
| M12 QUANTUM CROSSING | main | formation-remix | 12 | 12/0/0 | 24s | 0 | 42 | 3078 | 0.32s | 0.75s | 10 | 82 | 12 |
| M12B GRAVITY RIFT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 9/3/0 | 23.8s | 1 | 43 | 3319 | 0.28s | 0.73s | 15 | 75 | 12 |
| M13 GRAVITY CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 25.5s | 0 | 36 | 3093 | 0.75s | 1.23s | 29 | 74 | 10 |
| M14 EVENT HORIZON | main | boss-preparation | 12 | 10/2/0 | 34.4s | 0 | 59 | 4066 | 1.13s | 0.92s | 24 | 83 | 12 |
| M16 CRIMSON SIGNAL | main | introduction | 12 | 8/4/0 | 21.7s | 0 | 34 | 3391 | 0.33s | 0.63s | 18 | 84 | 12 |
| M17 ECLIPSE CROSSING | main | formation-remix | 12 | 9/3/0 | 23.2s | 0 | 46 | 4264 | 0.62s | 0.65s | 18 | 81 | 12 |
| M17B TERMINUS FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 10/2/0 | 21.9s | 0 | 51 | 4630 | 0.28s | 0.67s | 18 | 88 | 12 |
| M18 FRACTURE CHECKPOINT | main | elite-checkpoint | 12 | 10/2/0 | 35.4s | 1 | 39 | 2731 | 0.65s | 0.95s | 32 | 95 | 12 |
| M19 LAST LIGHT | main | boss-preparation | 12 | 12/0/0 | 34.1s | 0 | 66 | 4219 | 0.63s | 1.25s | 52 | 105 | 12 |
| M21 PRISM SIGNAL | main | introduction | 12 | 10/2/0 | 25.6s | 0 | 41 | 3451 | 0.33s | 0.63s | 18 | 87 | 12 |
| M22 SPECTRUM CROSSING | main | formation-remix | 12 | 10/2/0 | 23.1s | 0 | 49 | 4285 | 0.75s | 0.72s | 18 | 90 | 12 |
| M22B PRISM EXPANSE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 10/2/0 | 24s | 0 | 44 | 4675 | 0.53s | 0.78s | 18 | 91 | 12 |
| M23 BROOD CHECKPOINT | main | elite-checkpoint | 12 | 10/2/0 | 49.4s | 0 | 44 | 3451 | 0.57s | 1.17s | 26 | 103 | 12 |
| M24 LUMEN APPROACH | main | boss-preparation | 12 | 11/1/0 | 35.3s | 0 | 60 | 4240 | 0.57s | 1.05s | 18 | 93 | 12 |
| M26 RAIL SIGNAL | main | introduction | 12 | 9/3/0 | 18.9s | 0 | 34 | 3471 | 0.28s | 0.47s | 18 | 107 | 12 |
| M27 MERIDIAN CROSSING | main | formation-remix | 12 | 11/1/0 | 19.3s | 0 | 46 | 4306 | 0.52s | 0.8s | 18 | 102 | 12 |
| M27B RAIL MERIDIAN HIGH-RISK ROUTE | alternative | formation-remix | 12 | 9/3/0 | 21.1s | 0 | 49 | 4675 | 0.28s | 0.57s | 18 | 93 | 12 |
| M28 COIL CHECKPOINT | main | elite-checkpoint | 12 | 10/2/0 | 43.4s | 1 | 46 | 2771 | 0.52s | 1.47s | 30 | 103 | 12 |
| M29 SERPENT APPROACH | main | boss-preparation | 12 | 10/2/0 | 29.9s | 0 | 67 | 4240 | 0.7s | 1.33s | 29 | 100 | 12 |
| M31 GRAVITY SIGNAL | main | introduction | 12 | 10/2/0 | 19.1s | 2 | 36 | 3598 | 0.27s | 0.58s | 18 | 102 | 12 |
| M32 EVENTIDE CROSSING | main | formation-remix | 12 | 11/1/0 | 20.1s | 0 | 49 | 4534 | 0.67s | 0.6s | 18 | 111 | 12 |
| M32B SINGULARITY REACH HIGH-RISK ROUTE | alternative | formation-remix | 12 | 9/3/0 | 20s | 2 | 51 | 4995 | 0.95s | 0.55s | 18 | 105 | 12 |
| M33 WELL CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 28.3s | 0 | 43 | 3650 | 0.88s | 1.37s | 24 | 109 | 12 |
| M34 COLLAPSE APPROACH | main | boss-preparation | 12 | 11/1/0 | 32.6s | 0 | 69 | 4500 | 0.63s | 1.68s | 52 | 125 | 12 |
| M36 ORBIT SIGNAL | main | introduction | 12 | 12/0/0 | 20.3s | 0 | 38 | 3638 | 0.27s | 0.63s | 18 | 100 | 12 |
| M37 AXIS CROSSING | main | formation-remix | 12 | 9/3/0 | 20.3s | 0 | 54 | 4576 | 0.27s | 0.63s | 18 | 106 | 12 |
| M37B GYROSCOPE ARRAY HIGH-RISK ROUTE | alternative | formation-remix | 12 | 11/1/0 | 21.2s | 0 | 53 | 4968 | 0.25s | 0.63s | 18 | 106 | 12 |
| M38 GYRO CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 40s | 0 | 50 | 3638 | 0.32s | 1.28s | 54 | 130 | 12 |
| M39 ROTATION APPROACH | main | boss-preparation | 12 | 11/1/0 | 39.7s | 1 | 80 | 3744 | 0.63s | 1.27s | 32 | 105 | 12 |
| M41 SIEGE SIGNAL | main | introduction | 12 | 12/0/0 | 19.7s | 0 | 37 | 3638 | 0.35s | 0.65s | 18 | 114 | 12 |
| M42 BREACH CROSSING | main | formation-remix | 12 | 10/2/0 | 19.2s | 0 | 51 | 4576 | 0.27s | 0.73s | 18 | 109 | 12 |
| M42B HAMMERHEAD LINE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 9/3/0 | 19.6s | 3 | 48 | 4968 | 0.25s | 0.68s | 18 | 98 | 12 |
| M43 HAMMER CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 28.9s | 1 | 42 | 2918 | 0.38s | 1.5s | 18 | 114 | 12 |
| M44 DREAD APPROACH | main | boss-preparation | 12 | 12/0/0 | 49.6s | 0 | 72 | 4500 | 1.02s | 1.48s | 26 | 124 | 12 |
| M46 FRONTIER SIGNAL | main | introduction | 12 | 12/0/0 | 18.8s | 0 | 39 | 3638 | 0.28s | 0.75s | 18 | 102 | 12 |
| M47 CLAW CROSSING | main | formation-remix | 12 | 11/1/0 | 20.3s | 0 | 48 | 4576 | 0.28s | 0.6s | 18 | 117 | 12 |
| M47B CROWNCLAW FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 9/3/0 | 25s | 6 | 54 | 4102 | 0.33s | 0.53s | 18 | 113 | 12 |
| M48 CROWN CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 38.3s | 1 | 47 | 2918 | 0.58s | 1.77s | 30 | 113 | 12 |
| M49 REDLINE APPROACH | main | boss-preparation | 12 | 12/0/0 | 30s | 0 | 73 | 4500 | 0.7s | 1.75s | 52 | 131 | 12 |

## M2 and M7 detailed checkpoints

These early formation-remix Missions are expanded cell-by-cell because the Campaign brief calls them out as dedicated balance checkpoints.

| Mission | Power | Supports | Viewport | Outcome | Death Wave | Time | Damage | Coins | Weekly | Bombs | Ability | Peak hostile | Peak entities | Budget peak |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| M2 | low | none | mobile | clear | - | 45.3s | 2 | 31 | 2064 | 2 | 2 | 2 | 21 | 0.45x |
| M2 | low | none | desktop | clear | - | 64.2s | 1 | 26 | 2085 | 2 | 3 | 2 | 24 | 0.55x |
| M2 | low | paired | mobile | clear | - | 20.2s | 0 | 23 | 2841 | 0 | 1 | 0 | 58 | 0.2x |
| M2 | low | paired | desktop | clear | - | 22.5s | 0 | 18 | 2841 | 0 | 1 | 0 | 54 | 0.25x |
| M2 | expected | none | mobile | clear | - | 31.2s | 0 | 34 | 2841 | 2 | 2 | 1 | 25 | 0.35x |
| M2 | expected | none | desktop | clear | - | 41.4s | 1 | 29 | 2085 | 3 | 2 | 2 | 24 | 0.4x |
| M2 | expected | paired | mobile | clear | - | 20.8s | 0 | 21 | 2841 | 0 | 1 | 0 | 60 | 0.15x |
| M2 | expected | paired | desktop | clear | - | 21.1s | 0 | 22 | 2841 | 0 | 1 | 0 | 54 | 0.17x |
| M2 | upgraded | none | mobile | clear | - | 29s | 0 | 25 | 2862 | 3 | 2 | 0 | 22 | 0.39x |
| M2 | upgraded | none | desktop | clear | - | 40.5s | 0 | 26 | 2862 | 3 | 2 | 2 | 22 | 0.4x |
| M2 | upgraded | paired | mobile | clear | - | 20.8s | 0 | 23 | 2862 | 0 | 1 | 0 | 58 | 0.17x |
| M2 | upgraded | paired | desktop | clear | - | 21.4s | 0 | 17 | 2862 | 0 | 1 | 0 | 66 | 0.2x |
| M7 | low | none | mobile | death | 3 | 26.9s | 3 | 20 | 0 | 2 | 2 | 4 | 31 | 1x |
| M7 | low | none | desktop | death | 3 | 44.3s | 3 | 12 | 0 | 2 | 3 | 4 | 33 | 0.97x |
| M7 | low | paired | mobile | clear | - | 22.8s | 0 | 50 | 2964 | 0 | 1 | 0 | 64 | 0.46x |
| M7 | low | paired | desktop | clear | - | 25.5s | 0 | 27 | 2964 | 2 | 1 | 1 | 69 | 0.46x |
| M7 | expected | none | mobile | death | 3 | 48.3s | 4 | 29 | 0 | 2 | 3 | 4 | 27 | 0.8x |
| M7 | expected | none | desktop | death | 3 | 61.6s | 4 | 14 | 0 | 2 | 3 | 6 | 32 | 1.02x |
| M7 | expected | paired | mobile | clear | - | 23.9s | 0 | 37 | 2985 | 1 | 1 | 1 | 60 | 0.46x |
| M7 | expected | paired | desktop | clear | - | 26.4s | 0 | 32 | 2985 | 2 | 1 | 2 | 59 | 0.5x |
| M7 | upgraded | none | mobile | clear | - | 44.8s | 2 | 42 | 2229 | 2 | 3 | 4 | 40 | 0.85x |
| M7 | upgraded | none | desktop | death | 3 | 73.5s | 5 | 19 | 0 | 2 | 3 | 7 | 44 | 1.07x |
| M7 | upgraded | paired | mobile | clear | - | 23.6s | 0 | 40 | 3006 | 1 | 1 | 1 | 63 | 0.54x |
| M7 | upgraded | paired | desktop | clear | - | 26s | 0 | 33 | 3006 | 2 | 1 | 1 | 60 | 0.46x |

## Axis summary

| Axis | Value | Cell |
| --- | --- | --- |
| tier | low | 155/45/0; D0; C40; W3149; P54; E127 |
| tier | expected | 168/32/0; D0; C44; W3451; P54; E131 |
| tier | upgraded | 193/7/0; D0; C45; W3638; P54; E126 |
| support | none | 218/82/0; D2; C40; W2878; P54; E100 |
| support | paired | 298/2/0; D0; C45; W3638; P54; E131 |
| viewport | mobile | 282/18/0; D0; C49; W3638; P53; E131 |
| viewport | desktop | 234/66/0; D0; C37; W3153; P54; E130 |

## Findings

- Cells over the provisional 80-hostile-projectile readability ceiling: 0.
- Cells over the 1.25s first-visible-threat ceiling: 0.
- Cells over the 1s in-Wave visible-combat dead-air ceiling: 51.
- Cells that entered engine performance mode: 0.
- Cells that entered heavy-scene mode: 233.
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

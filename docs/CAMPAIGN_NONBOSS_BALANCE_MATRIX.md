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
- Source digest: `a33a509cd27c707107296e57b06363a44cdd08e0e6863518a16d1a4af1218d08`.

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
| M1 ORBIT ENTRY | main | introduction | 12 | 12/0/0 | 25.6s | 0 | 18 | 2346 | 0.4s | 0.77s | 1 | 61 | 5 |
| M2 CITATION CROSSING | main | formation-remix | 12 | 11/1/0 | 16.8s | 0 | 26 | 2841 | 0.32s | 0.87s | 2 | 66 | 8 |
| M2B OPEN ORBIT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 10/2/0 | 17.4s | 0 | 27 | 3112 | 0.27s | 0.73s | 7 | 64 | 8 |
| M3 PAYWALL CHECKPOINT | main | elite-checkpoint | 12 | 10/2/0 | 22.2s | 1 | 38 | 2846 | 0.53s | 0.65s | 3 | 60 | 8 |
| M4 BASTION APPROACH | main | boss-preparation | 12 | 9/3/0 | 31.5s | 2 | 40 | 2342 | 0.25s | 1.23s | 11 | 71 | 12 |
| M6 HELIX SIGNAL | main | introduction | 12 | 9/3/0 | 21.6s | 0 | 28 | 2711 | 0.63s | 0.53s | 9 | 75 | 10 |
| M7 REDLINE CROSSING | main | formation-remix | 12 | 8/4/0 | 22.1s | 1 | 25 | 2964 | 0.57s | 0.67s | 8 | 73 | 12 |
| M7B REDLINE FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 6/6/0 | 19.6s | 4 | 25 | 3241 | 0.57s | 0.75s | 8 | 77 | 12 |
| M8 DARK MATTER CHECKPOINT | main | elite-checkpoint | 12 | 9/3/0 | 32s | 0 | 35 | 2731 | 1.05s | 0.78s | 30 | 80 | 12 |
| M9 MIRROR APPROACH | main | boss-preparation | 12 | 8/4/0 | 38.4s | 0 | 56 | 3149 | 0.35s | 0.63s | 54 | 104 | 12 |
| M11 SHARD SIGNAL | main | introduction | 12 | 10/2/0 | 17s | 0 | 31 | 2767 | 0.53s | 0.58s | 5 | 78 | 12 |
| M12 QUANTUM CROSSING | main | formation-remix | 12 | 12/0/0 | 18.4s | 0 | 39 | 3078 | 0.32s | 0.63s | 9 | 84 | 12 |
| M12B GRAVITY RIFT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 10/2/0 | 18.6s | 0 | 40 | 3319 | 0.28s | 0.68s | 15 | 82 | 12 |
| M13 GRAVITY CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 23.6s | 0 | 39 | 3093 | 0.38s | 0.53s | 29 | 71 | 12 |
| M14 EVENT HORIZON | main | boss-preparation | 12 | 11/1/0 | 35.8s | 1 | 57 | 4024 | 0.6s | 0.62s | 24 | 82 | 12 |
| M16 CRIMSON SIGNAL | main | introduction | 12 | 9/3/0 | 20.5s | 2 | 30 | 3391 | 0.33s | 0.67s | 18 | 81 | 12 |
| M17 ECLIPSE CROSSING | main | formation-remix | 12 | 12/0/0 | 19.6s | 0 | 42 | 4264 | 0.62s | 0.58s | 18 | 100 | 12 |
| M17B TERMINUS FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 10/2/0 | 18.8s | 2 | 40 | 4607 | 0.28s | 0.53s | 18 | 84 | 12 |
| M18 FRACTURE CHECKPOINT | main | elite-checkpoint | 12 | 9/3/0 | 34.5s | 1 | 40 | 3431 | 0.65s | 0.82s | 32 | 93 | 12 |
| M19 LAST LIGHT | main | boss-preparation | 12 | 11/1/0 | 31.7s | 0 | 67 | 4198 | 0.63s | 0.82s | 51 | 98 | 12 |
| M21 PRISM SIGNAL | main | introduction | 12 | 9/3/0 | 22s | 2 | 42 | 3411 | 0.4s | 0.65s | 18 | 72 | 12 |
| M22 SPECTRUM CROSSING | main | formation-remix | 12 | 10/2/0 | 18.9s | 0 | 38 | 4285 | 0.3s | 0.5s | 18 | 92 | 12 |
| M22B PRISM EXPANSE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 11/1/0 | 19.9s | 2 | 43 | 3832 | 0.53s | 0.78s | 18 | 81 | 12 |
| M23 BROOD CHECKPOINT | main | elite-checkpoint | 12 | 10/2/0 | 43.8s | 0 | 48 | 3451 | 0.57s | 0.57s | 26 | 94 | 12 |
| M24 LUMEN APPROACH | main | boss-preparation | 12 | 11/1/0 | 31.3s | 0 | 61 | 4219 | 0.65s | 0.62s | 16 | 103 | 12 |
| M26 RAIL SIGNAL | main | introduction | 12 | 10/2/0 | 20.2s | 0 | 33 | 3431 | 0.28s | 0.85s | 18 | 104 | 12 |
| M27 MERIDIAN CROSSING | main | formation-remix | 12 | 10/2/0 | 16.6s | 2 | 39 | 4264 | 0.52s | 0.8s | 18 | 101 | 12 |
| M27B RAIL MERIDIAN HIGH-RISK ROUTE | alternative | formation-remix | 12 | 9/3/0 | 18.5s | 0 | 41 | 4675 | 0.28s | 0.6s | 18 | 95 | 12 |
| M28 COIL CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 37.4s | 0 | 44 | 3451 | 0.52s | 0.6s | 30 | 102 | 12 |
| M29 SERPENT APPROACH | main | boss-preparation | 12 | 11/1/0 | 31.6s | 0 | 63 | 4219 | 0.88s | 0.77s | 29 | 98 | 12 |
| M31 GRAVITY SIGNAL | main | introduction | 12 | 10/2/0 | 18.3s | 0 | 41 | 3598 | 0.2s | 0.52s | 18 | 104 | 12 |
| M32 EVENTIDE CROSSING | main | formation-remix | 12 | 11/1/0 | 17.9s | 2 | 49 | 3799 | 0.42s | 0.52s | 18 | 105 | 12 |
| M32B SINGULARITY REACH HIGH-RISK ROUTE | alternative | formation-remix | 12 | 9/3/0 | 15.9s | 2 | 43 | 4152 | 0.95s | 0.5s | 18 | 103 | 12 |
| M33 WELL CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 26.2s | 0 | 45 | 3670 | 0.88s | 0.62s | 24 | 110 | 12 |
| M34 COLLAPSE APPROACH | main | boss-preparation | 12 | 12/0/0 | 27.8s | 0 | 66 | 4500 | 0.63s | 1.27s | 52 | 121 | 12 |
| M36 ORBIT SIGNAL | main | introduction | 12 | 11/1/0 | 17.7s | 0 | 41 | 3638 | 0.27s | 0.58s | 18 | 104 | 12 |
| M37 AXIS CROSSING | main | formation-remix | 12 | 11/1/0 | 21.4s | 2 | 55 | 3799 | 0.25s | 0.4s | 18 | 97 | 12 |
| M37B GYROSCOPE ARRAY HIGH-RISK ROUTE | alternative | formation-remix | 12 | 9/3/0 | 18.3s | 2 | 47 | 4125 | 0.28s | 0.5s | 18 | 101 | 12 |
| M38 GYRO CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 42.8s | 0 | 48 | 3638 | 0.32s | 0.5s | 54 | 108 | 12 |
| M39 ROTATION APPROACH | main | boss-preparation | 12 | 12/0/0 | 36.9s | 1 | 75 | 3744 | 0.6s | 0.9s | 32 | 116 | 12 |
| M41 SIEGE SIGNAL | main | introduction | 12 | 12/0/0 | 22.9s | 0 | 41 | 3638 | 0.35s | 0.55s | 18 | 110 | 12 |
| M42 BREACH CROSSING | main | formation-remix | 12 | 10/2/0 | 16.6s | 2 | 39 | 3799 | 0.25s | 0.73s | 18 | 109 | 12 |
| M42B HAMMERHEAD LINE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 10/2/0 | 22.3s | 3 | 59 | 4102 | 0.28s | 0.48s | 18 | 92 | 12 |
| M43 HAMMER CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 27.6s | 1 | 40 | 3638 | 0.38s | 0.52s | 18 | 120 | 12 |
| M44 DREAD APPROACH | main | boss-preparation | 12 | 12/0/0 | 44.7s | 0 | 70 | 4500 | 0.75s | 0.8s | 26 | 115 | 12 |
| M46 FRONTIER SIGNAL | main | introduction | 12 | 12/0/0 | 18.3s | 0 | 40 | 3638 | 0.28s | 0.57s | 5 | 115 | 12 |
| M47 CLAW CROSSING | main | formation-remix | 12 | 11/1/0 | 18s | 2 | 48 | 4576 | 0.28s | 0.47s | 18 | 113 | 12 |
| M47B CROWNCLAW FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 8/4/0 | 20.3s | 6 | 44 | 4102 | 0.28s | 0.5s | 18 | 115 | 12 |
| M48 CROWN CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 35.1s | 0 | 50 | 3638 | 0.4s | 0.78s | 30 | 110 | 12 |
| M49 REDLINE APPROACH | main | boss-preparation | 12 | 12/0/0 | 27.1s | 0 | 68 | 4500 | 1.05s | 0.75s | 52 | 132 | 12 |

## M2 and M7 detailed checkpoints

These early formation-remix Missions are expanded cell-by-cell because the Campaign brief calls them out as dedicated balance checkpoints.

| Mission | Power | Supports | Viewport | Outcome | Death Wave | Time | Damage | Coins | Weekly | Bombs | Ability | Peak hostile | Peak entities | Budget peak |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| M2 | low | none | mobile | clear | - | 39.6s | 1 | 30 | 2085 | 2 | 2 | 2 | 24 | 0.6x |
| M2 | low | none | desktop | death | 4 | 62s | 3 | 23 | 0 | 2 | 4 | 2 | 27 | 0.65x |
| M2 | low | paired | mobile | clear | - | 13.7s | 0 | 20 | 2841 | 0 | 1 | 0 | 66 | 0.4x |
| M2 | low | paired | desktop | clear | - | 16.8s | 0 | 24 | 2841 | 0 | 1 | 0 | 57 | 0.35x |
| M2 | expected | none | mobile | clear | - | 34.8s | 2 | 29 | 2064 | 2 | 2 | 2 | 25 | 0.55x |
| M2 | expected | none | desktop | clear | - | 20.7s | 0 | 28 | 2841 | 3 | 2 | 1 | 28 | 0.65x |
| M2 | expected | paired | mobile | clear | - | 13.9s | 0 | 26 | 2841 | 0 | 1 | 0 | 66 | 0.3x |
| M2 | expected | paired | desktop | clear | - | 14.8s | 0 | 16 | 2841 | 1 | 1 | 0 | 60 | 0.55x |
| M2 | upgraded | none | mobile | clear | - | 33.2s | 1 | 30 | 2106 | 3 | 2 | 1 | 26 | 0.65x |
| M2 | upgraded | none | desktop | clear | - | 21.6s | 0 | 28 | 2862 | 3 | 2 | 0 | 26 | 0.65x |
| M2 | upgraded | paired | mobile | clear | - | 13.7s | 0 | 22 | 2862 | 0 | 1 | 0 | 63 | 0.3x |
| M2 | upgraded | paired | desktop | clear | - | 15.8s | 0 | 22 | 2883 | 0 | 1 | 0 | 63 | 0.35x |
| M7 | low | none | mobile | death | 3 | 23.1s | 3 | 17 | 0 | 2 | 2 | 3 | 33 | 1x |
| M7 | low | none | desktop | death | 3 | 50.8s | 3 | 15 | 0 | 2 | 3 | 4 | 29 | 1.15x |
| M7 | low | paired | mobile | clear | - | 17.7s | 0 | 37 | 2964 | 1 | 1 | 0 | 73 | 0.68x |
| M7 | low | paired | desktop | clear | - | 21.3s | 0 | 23 | 2964 | 2 | 1 | 2 | 68 | 0.6x |
| M7 | expected | none | mobile | clear | - | 55.5s | 3 | 51 | 2187 | 3 | 3 | 4 | 34 | 0.8x |
| M7 | expected | none | desktop | death | 3 | 59.6s | 4 | 18 | 0 | 2 | 3 | 8 | 32 | 0.88x |
| M7 | expected | paired | mobile | clear | - | 20.4s | 0 | 34 | 2985 | 2 | 1 | 1 | 72 | 0.57x |
| M7 | expected | paired | desktop | clear | - | 23s | 0 | 15 | 2985 | 2 | 1 | 3 | 64 | 0.65x |
| M7 | upgraded | none | mobile | death | 3 | 37.4s | 5 | 18 | 0 | 2 | 2 | 4 | 30 | 0.82x |
| M7 | upgraded | none | desktop | clear | - | 87.3s | 1 | 41 | 2250 | 3 | 5 | 5 | 35 | 1.13x |
| M7 | upgraded | paired | mobile | clear | - | 20.7s | 0 | 49 | 3006 | 1 | 1 | 3 | 67 | 0.68x |
| M7 | upgraded | paired | desktop | clear | - | 22.1s | 0 | 25 | 3006 | 2 | 1 | 3 | 67 | 0.55x |

## Axis summary

| Axis | Value | Cell |
| --- | --- | --- |
| tier | low | 153/47/0; D1; C41; W3211; P54; E123 |
| tier | expected | 173/27/0; D0; C42; W3471; P54; E119 |
| tier | upgraded | 190/10/0; D0; C41; W3638; P54; E132 |
| support | none | 219/81/0; D2; C40; W2898; P54; E98 |
| support | paired | 297/3/0; D0; C42; W3638; P54; E132 |
| viewport | mobile | 279/21/0; D0; C47; W3618; P54; E132 |
| viewport | desktop | 237/63/0; D0; C37; W3341; P54; E121 |

## Findings

- Cells over the provisional 80-hostile-projectile readability ceiling: 0.
- Cells over the 1.25s first-visible-threat ceiling: 0.
- Cells over the 1s in-Wave visible-combat dead-air ceiling: 3.
- Cells that entered engine performance mode: 0.
- Cells that entered heavy-scene mode: 235.
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

# Campaign Non-Boss Runtime Balance Matrix

Generated deterministically from Campaign revision 24 and the real `GameEngine` runtime.

## Result

The bounded autonomous sweep ran **600 trials** across **50 non-boss graph Missions**: 40 main-path Missions and 10 route alternatives. It produced **528 clears**, **72 deaths**, and **0 timeouts** (88% clear rate).

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
- Source digest: `4c5000d23db4203ee980cd0c66f394e34422df97132641d9e8d8741ca66be896`.

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
| M1 ORBIT ENTRY | main | introduction | 12 | 12/0/0 | 21.8s | 0 | 15 | 2346 | 0.4s | 0.53s | 0 | 62 | 0 |
| M2 CITATION CROSSING | main | formation-remix | 12 | 12/0/0 | 20.3s | 0 | 26 | 2841 | 0.33s | 0.87s | 2 | 71 | 8 |
| M2B OPEN ORBIT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 9/3/0 | 16.3s | 2 | 27 | 3112 | 0.3s | 0.77s | 5 | 71 | 8 |
| M3 PAYWALL CHECKPOINT | main | elite-checkpoint | 12 | 9/3/0 | 22.4s | 1 | 37 | 2846 | 0.53s | 0.62s | 3 | 59 | 8 |
| M4 BASTION APPROACH | main | boss-preparation | 12 | 8/4/0 | 27.6s | 1 | 42 | 3077 | 0.3s | 0.97s | 10 | 70 | 12 |
| M6 HELIX SIGNAL | main | introduction | 12 | 11/1/0 | 23.7s | 0 | 29 | 2711 | 0.55s | 0.75s | 12 | 76 | 10 |
| M7 REDLINE CROSSING | main | formation-remix | 12 | 10/2/0 | 21.6s | 0 | 38 | 2985 | 0.53s | 0.85s | 6 | 75 | 12 |
| M7B REDLINE FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 8/4/0 | 21.3s | 1 | 36 | 3241 | 0.53s | 0.7s | 6 | 74 | 12 |
| M8 DARK MATTER CHECKPOINT | main | elite-checkpoint | 12 | 9/3/0 | 31.5s | 1 | 36 | 2711 | 0.68s | 0.88s | 30 | 75 | 12 |
| M9 MIRROR APPROACH | main | boss-preparation | 12 | 10/2/0 | 56.2s | 0 | 52 | 3149 | 0.53s | 0.95s | 54 | 111 | 12 |
| M11 SHARD SIGNAL | main | introduction | 12 | 11/1/0 | 19.6s | 0 | 30 | 2767 | 0.53s | 0.7s | 5 | 81 | 12 |
| M12 QUANTUM CROSSING | main | formation-remix | 12 | 12/0/0 | 17.7s | 0 | 40 | 3078 | 0.23s | 0.65s | 13 | 86 | 12 |
| M12B GRAVITY RIFT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 9/3/0 | 17.6s | 0 | 36 | 3319 | 0.28s | 0.67s | 14 | 77 | 12 |
| M13 GRAVITY CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 24.3s | 0 | 30 | 3093 | 0.4s | 0.68s | 29 | 78 | 12 |
| M14 EVENT HORIZON | main | boss-preparation | 12 | 11/1/0 | 33.8s | 0 | 55 | 4045 | 0.62s | 0.62s | 24 | 85 | 12 |
| M16 CRIMSON SIGNAL | main | introduction | 12 | 9/3/0 | 19.4s | 1 | 31 | 3391 | 0.38s | 0.75s | 17 | 87 | 12 |
| M17 ECLIPSE CROSSING | main | formation-remix | 12 | 11/1/0 | 20s | 0 | 47 | 4243 | 0.62s | 0.62s | 18 | 101 | 12 |
| M17B TERMINUS FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 10/2/0 | 17.3s | 2 | 39 | 3809 | 0.22s | 0.53s | 18 | 82 | 12 |
| M18 FRACTURE CHECKPOINT | main | elite-checkpoint | 12 | 9/3/0 | 31.1s | 1 | 44 | 3411 | 0.77s | 0.7s | 32 | 93 | 12 |
| M19 LAST LIGHT | main | boss-preparation | 12 | 11/1/0 | 31.3s | 0 | 61 | 4198 | 0.6s | 0.6s | 52 | 105 | 12 |
| M21 PRISM SIGNAL | main | introduction | 12 | 10/2/0 | 21.7s | 2 | 34 | 2731 | 0.72s | 0.62s | 18 | 94 | 12 |
| M22 SPECTRUM CROSSING | main | formation-remix | 12 | 9/3/0 | 17.8s | 0 | 40 | 4285 | 0.43s | 0.5s | 18 | 92 | 12 |
| M22B PRISM EXPANSE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 10/2/0 | 20.6s | 2 | 44 | 3809 | 0.53s | 0.78s | 18 | 83 | 12 |
| M23 BROOD CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 46.5s | 0 | 47 | 3451 | 0.28s | 0.52s | 26 | 93 | 12 |
| M24 LUMEN APPROACH | main | boss-preparation | 12 | 10/2/0 | 32.3s | 0 | 67 | 4219 | 0.5s | 0.62s | 18 | 102 | 12 |
| M26 RAIL SIGNAL | main | introduction | 12 | 11/1/0 | 17.2s | 0 | 32 | 3471 | 0.6s | 0.6s | 18 | 103 | 12 |
| M27 MERIDIAN CROSSING | main | formation-remix | 12 | 12/0/0 | 20.2s | 0 | 41 | 4306 | 0.92s | 0.78s | 18 | 95 | 12 |
| M27B RAIL MERIDIAN HIGH-RISK ROUTE | alternative | formation-remix | 12 | 9/3/0 | 17.7s | 0 | 41 | 4630 | 0.28s | 0.6s | 18 | 103 | 12 |
| M28 COIL CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 40.9s | 1 | 45 | 3451 | 0.53s | 0.53s | 30 | 99 | 12 |
| M29 SERPENT APPROACH | main | boss-preparation | 12 | 12/0/0 | 31.8s | 2 | 67 | 4219 | 0.72s | 0.68s | 29 | 99 | 12 |
| M31 GRAVITY SIGNAL | main | introduction | 12 | 10/2/0 | 18s | 0 | 42 | 3598 | 0.2s | 0.52s | 18 | 99 | 12 |
| M32 EVENTIDE CROSSING | main | formation-remix | 12 | 11/1/0 | 18.4s | 2 | 48 | 3799 | 0.27s | 0.52s | 18 | 101 | 12 |
| M32B SINGULARITY REACH HIGH-RISK ROUTE | alternative | formation-remix | 12 | 9/3/0 | 16s | 2 | 41 | 4152 | 0.95s | 0.5s | 18 | 101 | 12 |
| M33 WELL CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 28.3s | 0 | 54 | 3650 | 0.27s | 0.62s | 24 | 104 | 12 |
| M34 COLLAPSE APPROACH | main | boss-preparation | 12 | 12/0/0 | 27.2s | 0 | 66 | 4500 | 0.63s | 0.62s | 52 | 120 | 12 |
| M36 ORBIT SIGNAL | main | introduction | 12 | 11/1/0 | 17.1s | 0 | 39 | 3638 | 0.27s | 0.92s | 18 | 110 | 12 |
| M37 AXIS CROSSING | main | formation-remix | 12 | 11/1/0 | 21.1s | 2 | 54 | 3799 | 0.22s | 0.57s | 18 | 100 | 12 |
| M37B GYROSCOPE ARRAY HIGH-RISK ROUTE | alternative | formation-remix | 12 | 10/2/0 | 18.5s | 2 | 45 | 4125 | 0.27s | 0.5s | 18 | 101 | 12 |
| M38 GYRO CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 41.4s | 0 | 47 | 3638 | 0.87s | 0.4s | 54 | 130 | 12 |
| M39 ROTATION APPROACH | main | boss-preparation | 12 | 12/0/0 | 41s | 2 | 76 | 3744 | 0.72s | 0.62s | 32 | 110 | 12 |
| M41 SIEGE SIGNAL | main | introduction | 12 | 12/0/0 | 20.1s | 0 | 44 | 3638 | 0.35s | 0.58s | 18 | 117 | 12 |
| M42 BREACH CROSSING | main | formation-remix | 12 | 11/1/0 | 16.4s | 2 | 45 | 4576 | 0.22s | 0.73s | 18 | 116 | 12 |
| M42B HAMMERHEAD LINE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 21.3s | 3 | 60 | 4102 | 0.28s | 0.48s | 18 | 111 | 12 |
| M43 HAMMER CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 24.3s | 0 | 42 | 3638 | 0.38s | 0.78s | 18 | 107 | 12 |
| M44 DREAD APPROACH | main | boss-preparation | 12 | 12/0/0 | 54.3s | 0 | 74 | 4500 | 0.7s | 0.63s | 25 | 116 | 12 |
| M46 FRONTIER SIGNAL | main | introduction | 12 | 12/0/0 | 17.3s | 0 | 39 | 3638 | 0.28s | 0.58s | 18 | 106 | 12 |
| M47 CLAW CROSSING | main | formation-remix | 12 | 11/1/0 | 18.1s | 2 | 51 | 4576 | 0.25s | 0.72s | 18 | 112 | 12 |
| M47B CROWNCLAW FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 7/5/0 | 21.3s | 6 | 38 | 4033 | 0.43s | 0.35s | 18 | 114 | 12 |
| M48 CROWN CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 41s | 1 | 52 | 3638 | 0.4s | 0.87s | 30 | 111 | 12 |
| M49 REDLINE APPROACH | main | boss-preparation | 12 | 12/0/0 | 26.9s | 0 | 71 | 4500 | 0.48s | 0.62s | 52 | 129 | 12 |

## M2 and M7 detailed checkpoints

These early formation-remix Missions are expanded cell-by-cell because the Campaign brief calls them out as dedicated balance checkpoints.

| Mission | Power | Supports | Viewport | Outcome | Death Wave | Time | Damage | Coins | Weekly | Bombs | Ability | Peak hostile | Peak entities | Budget peak |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| M2 | low | none | mobile | clear | - | 24.3s | 2 | 34 | 2064 | 3 | 2 | 0 | 24 | 0.65x |
| M2 | low | none | desktop | clear | - | 20.6s | 0 | 24 | 2841 | 2 | 2 | 0 | 30 | 0.6x |
| M2 | low | paired | mobile | clear | - | 14s | 0 | 26 | 2841 | 0 | 1 | 0 | 71 | 0.3x |
| M2 | low | paired | desktop | clear | - | 16.9s | 0 | 21 | 2841 | 0 | 1 | 0 | 59 | 0.4x |
| M2 | expected | none | mobile | clear | - | 27.4s | 2 | 30 | 2064 | 2 | 2 | 1 | 33 | 0.65x |
| M2 | expected | none | desktop | clear | - | 34.9s | 0 | 27 | 2841 | 2 | 2 | 2 | 26 | 0.65x |
| M2 | expected | paired | mobile | clear | - | 12.6s | 0 | 26 | 2841 | 0 | 1 | 0 | 65 | 0.35x |
| M2 | expected | paired | desktop | clear | - | 16.6s | 0 | 20 | 2841 | 0 | 1 | 0 | 61 | 0.4x |
| M2 | upgraded | none | mobile | clear | - | 20.3s | 1 | 28 | 2106 | 2 | 2 | 0 | 28 | 0.65x |
| M2 | upgraded | none | desktop | clear | - | 21.8s | 0 | 27 | 2862 | 2 | 2 | 0 | 25 | 0.65x |
| M2 | upgraded | paired | mobile | clear | - | 15.8s | 0 | 26 | 2862 | 0 | 1 | 0 | 62 | 0.35x |
| M2 | upgraded | paired | desktop | clear | - | 16.3s | 0 | 25 | 2862 | 0 | 1 | 0 | 58 | 0.4x |
| M7 | low | none | mobile | clear | - | 33s | 1 | 43 | 2208 | 2 | 3 | 3 | 38 | 0.79x |
| M7 | low | none | desktop | clear | - | 36.9s | 2 | 38 | 2187 | 3 | 2 | 2 | 38 | 0.79x |
| M7 | low | paired | mobile | clear | - | 20.6s | 0 | 29 | 2964 | 1 | 2 | 1 | 64 | 0.68x |
| M7 | low | paired | desktop | clear | - | 20.8s | 0 | 33 | 2964 | 2 | 2 | 1 | 65 | 0.93x |
| M7 | expected | none | mobile | clear | - | 32.4s | 0 | 37 | 2985 | 2 | 2 | 3 | 38 | 1x |
| M7 | expected | none | desktop | death | 3 | 75.3s | 4 | 18 | 0 | 2 | 3 | 6 | 36 | 0.72x |
| M7 | expected | paired | mobile | clear | - | 21.6s | 0 | 37 | 2985 | 0 | 1 | 0 | 75 | 0.53x |
| M7 | expected | paired | desktop | clear | - | 20.8s | 0 | 26 | 3006 | 2 | 1 | 1 | 60 | 1x |
| M7 | upgraded | none | mobile | clear | - | 38.4s | 0 | 44 | 3006 | 3 | 3 | 1 | 39 | 0.68x |
| M7 | upgraded | none | desktop | death | 4 | 81.1s | 5 | 38 | 0 | 3 | 5 | 4 | 33 | 0.93x |
| M7 | upgraded | paired | mobile | clear | - | 20.2s | 0 | 44 | 3006 | 1 | 1 | 1 | 64 | 0.71x |
| M7 | upgraded | paired | desktop | clear | - | 19.2s | 0 | 41 | 3006 | 2 | 1 | 0 | 67 | 0.82x |

## Axis summary

| Axis | Value | Cell |
| --- | --- | --- |
| tier | low | 159/41/0; D1; C43; W3319; P54; E130 |
| tier | expected | 177/23/0; D0; C41; W3471; P54; E129 |
| tier | upgraded | 192/8/0; D0; C42; W3638; P54; E129 |
| support | none | 229/71/0; D2; C41; W3006; P54; E108 |
| support | paired | 299/1/0; D0; C43; W3638; P54; E130 |
| viewport | mobile | 282/18/0; D0; C46; W3638; P51; E129 |
| viewport | desktop | 246/54/0; D0; C37; W3400; P54; E130 |

## Findings

- Cells over the provisional 80-hostile-projectile readability ceiling: 0.
- Cells over the 1.25s first-visible-threat ceiling: 0.
- Cells over the 1s in-Wave visible-combat dead-air ceiling: 0.
- Cells that entered engine performance mode: 0.
- Cells that entered heavy-scene mode: 228.
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

# Campaign Non-Boss Runtime Balance Matrix

Generated deterministically from Campaign revision 24 and the real `GameEngine` runtime.

## Result

The bounded autonomous sweep ran **600 trials** across **50 non-boss graph Missions**: 40 main-path Missions and 10 route alternatives. It produced **562 clears**, **38 deaths**, and **0 timeouts** (93.7% clear rate).

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
- Source digest: `6d5ee7392011ee969d9aa9ffc1f7ad568cdd85809a886740364c3d3e4a9b4150`.

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
| M2 CITATION CROSSING | main | formation-remix | 12 | 12/0/0 | 20.9s | 0 | 26 | 2841 | 0.32s | 0.48s | 5 | 71 | 8 |
| M2B OPEN ORBIT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 33.2s | 0 | 25 | 3112 | 0.3s | 0.77s | 9 | 71 | 8 |
| M3 PAYWALL CHECKPOINT | main | elite-checkpoint | 12 | 10/2/0 | 20.9s | 0 | 37 | 2846 | 0.53s | 0.68s | 3 | 61 | 8 |
| M4 BASTION APPROACH | main | boss-preparation | 12 | 7/5/0 | 29.1s | 1 | 42 | 3056 | 0.3s | 0.95s | 11 | 66 | 12 |
| M6 HELIX SIGNAL | main | introduction | 12 | 10/2/0 | 22.5s | 1 | 31 | 2711 | 0.55s | 0.55s | 13 | 75 | 10 |
| M7 REDLINE CROSSING | main | formation-remix | 12 | 11/1/0 | 21.6s | 0 | 36 | 2985 | 0.53s | 0.85s | 7 | 71 | 12 |
| M7B REDLINE FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 52s | 1 | 36 | 3241 | 0.53s | 0.67s | 10 | 74 | 12 |
| M8 DARK MATTER CHECKPOINT | main | elite-checkpoint | 12 | 9/3/0 | 31.8s | 0 | 34 | 2711 | 0.68s | 1.22s | 30 | 80 | 12 |
| M9 MIRROR APPROACH | main | boss-preparation | 12 | 10/2/0 | 51.4s | 0 | 54 | 3170 | 0.53s | 0.68s | 54 | 115 | 12 |
| M11 SHARD SIGNAL | main | introduction | 12 | 11/1/0 | 18.6s | 0 | 31 | 2767 | 0.53s | 0.67s | 5 | 84 | 12 |
| M12 QUANTUM CROSSING | main | formation-remix | 12 | 12/0/0 | 21.2s | 0 | 40 | 3078 | 0.23s | 0.87s | 10 | 83 | 12 |
| M12B GRAVITY RIFT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 11/1/0 | 19.3s | 0 | 38 | 3341 | 0.22s | 0.65s | 16 | 86 | 12 |
| M13 GRAVITY CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 25.6s | 0 | 37 | 3093 | 0.4s | 0.67s | 29 | 84 | 12 |
| M14 EVENT HORIZON | main | boss-preparation | 12 | 12/0/0 | 38.3s | 0 | 60 | 4099 | 0.62s | 0.72s | 24 | 84 | 12 |
| M16 CRIMSON SIGNAL | main | introduction | 12 | 11/1/0 | 21s | 0 | 32 | 3391 | 0.38s | 0.85s | 18 | 89 | 12 |
| M17 ECLIPSE CROSSING | main | formation-remix | 12 | 11/1/0 | 19.6s | 0 | 40 | 4264 | 0.62s | 0.58s | 18 | 99 | 12 |
| M17B TERMINUS FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 10/2/0 | 18.9s | 0 | 46 | 4630 | 0.22s | 0.53s | 18 | 93 | 12 |
| M18 FRACTURE CHECKPOINT | main | elite-checkpoint | 12 | 10/2/0 | 38.4s | 2 | 46 | 2731 | 0.77s | 0.6s | 32 | 91 | 12 |
| M19 LAST LIGHT | main | boss-preparation | 12 | 11/1/0 | 30.8s | 0 | 65 | 4198 | 0.63s | 0.57s | 52 | 102 | 12 |
| M21 PRISM SIGNAL | main | introduction | 12 | 10/2/0 | 19.6s | 0 | 33 | 3431 | 1.03s | 0.62s | 18 | 90 | 12 |
| M22 SPECTRUM CROSSING | main | formation-remix | 12 | 12/0/0 | 19.4s | 0 | 42 | 4285 | 0.25s | 0.38s | 18 | 97 | 12 |
| M22B PRISM EXPANSE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 11/1/0 | 20.6s | 0 | 44 | 4652 | 0.53s | 0.78s | 18 | 86 | 12 |
| M23 BROOD CHECKPOINT | main | elite-checkpoint | 12 | 10/2/0 | 44.5s | 0 | 44 | 3451 | 0.62s | 0.65s | 26 | 104 | 12 |
| M24 LUMEN APPROACH | main | boss-preparation | 12 | 12/0/0 | 32s | 0 | 63 | 4240 | 0.6s | 0.55s | 17 | 99 | 12 |
| M26 RAIL SIGNAL | main | introduction | 12 | 10/2/0 | 18.1s | 0 | 36 | 3471 | 0.9s | 0.55s | 18 | 87 | 12 |
| M27 MERIDIAN CROSSING | main | formation-remix | 12 | 12/0/0 | 20.5s | 0 | 44 | 4306 | 0.92s | 0.78s | 18 | 97 | 12 |
| M27B RAIL MERIDIAN HIGH-RISK ROUTE | alternative | formation-remix | 12 | 11/1/0 | 19.9s | 0 | 42 | 4652 | 0.25s | 0.6s | 18 | 106 | 12 |
| M28 COIL CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 39.3s | 0 | 49 | 3471 | 0.53s | 0.77s | 30 | 93 | 12 |
| M29 SERPENT APPROACH | main | boss-preparation | 12 | 12/0/0 | 29.8s | 0 | 61 | 4240 | 0.72s | 0.58s | 29 | 87 | 12 |
| M31 GRAVITY SIGNAL | main | introduction | 12 | 12/0/0 | 19.9s | 0 | 41 | 3638 | 0.2s | 0.58s | 18 | 106 | 12 |
| M32 EVENTIDE CROSSING | main | formation-remix | 12 | 11/1/0 | 17.7s | 0 | 50 | 4576 | 0.32s | 0.52s | 18 | 105 | 12 |
| M32B SINGULARITY REACH HIGH-RISK ROUTE | alternative | formation-remix | 12 | 11/1/0 | 17.3s | 0 | 49 | 4899 | 0.95s | 0.5s | 18 | 113 | 12 |
| M33 WELL CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 33.9s | 0 | 51 | 3650 | 0.28s | 0.62s | 24 | 105 | 12 |
| M34 COLLAPSE APPROACH | main | boss-preparation | 12 | 12/0/0 | 27.6s | 0 | 64 | 4500 | 0.95s | 1s | 52 | 121 | 12 |
| M36 ORBIT SIGNAL | main | introduction | 12 | 11/1/0 | 19.3s | 0 | 40 | 3638 | 0.25s | 0.58s | 18 | 104 | 12 |
| M37 AXIS CROSSING | main | formation-remix | 12 | 12/0/0 | 21.9s | 2 | 65 | 4529 | 0.22s | 0.53s | 18 | 100 | 12 |
| M37B GYROSCOPE ARRAY HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 20.9s | 2 | 54 | 4125 | 0.28s | 0.55s | 18 | 114 | 12 |
| M38 GYRO CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 40s | 1 | 47 | 3638 | 0.87s | 0.5s | 54 | 127 | 12 |
| M39 ROTATION APPROACH | main | boss-preparation | 12 | 12/0/0 | 35.1s | 1 | 69 | 3744 | 0.6s | 1.2s | 32 | 117 | 12 |
| M41 SIEGE SIGNAL | main | introduction | 12 | 12/0/0 | 20.8s | 0 | 39 | 3638 | 0.27s | 0.55s | 18 | 115 | 12 |
| M42 BREACH CROSSING | main | formation-remix | 12 | 12/0/0 | 18.5s | 2 | 44 | 4481 | 0.3s | 0.73s | 18 | 116 | 12 |
| M42B HAMMERHEAD LINE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 20.1s | 3 | 55 | 4102 | 0.55s | 0.43s | 18 | 117 | 12 |
| M43 HAMMER CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 29s | 0 | 44 | 3638 | 0.68s | 0.48s | 4 | 112 | 12 |
| M44 DREAD APPROACH | main | boss-preparation | 12 | 12/0/0 | 45.2s | 0 | 74 | 4500 | 0.7s | 0.8s | 25 | 114 | 12 |
| M46 FRONTIER SIGNAL | main | introduction | 12 | 12/0/0 | 19s | 0 | 41 | 3638 | 0.28s | 0.6s | 18 | 105 | 12 |
| M47 CLAW CROSSING | main | formation-remix | 12 | 11/1/0 | 17.9s | 0 | 50 | 4576 | 0.23s | 0.3s | 18 | 122 | 12 |
| M47B CROWNCLAW FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 10/2/0 | 22.9s | 6 | 52 | 3982 | 0.4s | 0.3s | 18 | 97 | 12 |
| M48 CROWN CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 49.9s | 0 | 53 | 3638 | 0.4s | 0.82s | 30 | 115 | 12 |
| M49 REDLINE APPROACH | main | boss-preparation | 12 | 12/0/0 | 29.4s | 0 | 72 | 4500 | 0.72s | 0.87s | 52 | 130 | 12 |

## M2 and M7 detailed checkpoints

These early formation-remix Missions are expanded cell-by-cell because the Campaign brief calls them out as dedicated balance checkpoints.

| Mission | Power | Supports | Viewport | Outcome | Death Wave | Time | Damage | Coins | Weekly | Bombs | Ability | Peak hostile | Peak entities | Budget peak |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| M2 | low | none | mobile | clear | - | 34.1s | 1 | 35 | 1991 | 2 | 3 | 5 | 28 | 0.65x |
| M2 | low | none | desktop | clear | - | 21.4s | 0 | 26 | 2841 | 2 | 2 | 1 | 28 | 0.65x |
| M2 | low | paired | mobile | clear | - | 14s | 0 | 26 | 2841 | 0 | 1 | 0 | 71 | 0.3x |
| M2 | low | paired | desktop | clear | - | 16.4s | 0 | 17 | 2841 | 0 | 1 | 0 | 58 | 0.35x |
| M2 | expected | none | mobile | clear | - | 42.8s | 0 | 28 | 2640 | 2 | 3 | 4 | 26 | 0.65x |
| M2 | expected | none | desktop | clear | - | 27.6s | 0 | 28 | 2841 | 2 | 2 | 2 | 30 | 0.6x |
| M2 | expected | paired | mobile | clear | - | 12.6s | 0 | 26 | 2841 | 0 | 1 | 0 | 65 | 0.35x |
| M2 | expected | paired | desktop | clear | - | 15.2s | 0 | 15 | 2841 | 0 | 1 | 0 | 61 | 0.4x |
| M2 | upgraded | none | mobile | clear | - | 22.7s | 0 | 36 | 2862 | 2 | 2 | 2 | 27 | 0.65x |
| M2 | upgraded | none | desktop | clear | - | 20.9s | 0 | 25 | 2862 | 2 | 2 | 1 | 28 | 0.65x |
| M2 | upgraded | paired | mobile | clear | - | 14.2s | 0 | 21 | 2862 | 0 | 1 | 0 | 61 | 0.35x |
| M2 | upgraded | paired | desktop | clear | - | 16.6s | 0 | 25 | 2862 | 0 | 1 | 0 | 59 | 0.4x |
| M7 | low | none | mobile | clear | - | 43.7s | 1 | 39 | 2208 | 2 | 3 | 5 | 41 | 1x |
| M7 | low | none | desktop | death | 3 | 49.1s | 3 | 21 | 0 | 2 | 2 | 5 | 28 | 0.72x |
| M7 | low | paired | mobile | clear | - | 19.3s | 0 | 35 | 2964 | 1 | 1 | 0 | 71 | 0.89x |
| M7 | low | paired | desktop | clear | - | 21.6s | 0 | 27 | 2964 | 3 | 1 | 1 | 60 | 0.93x |
| M7 | expected | none | mobile | clear | - | 51.8s | 1 | 38 | 2250 | 2 | 3 | 6 | 38 | 0.86x |
| M7 | expected | none | desktop | clear | - | 60.6s | 2 | 43 | 2208 | 2 | 4 | 7 | 32 | 1x |
| M7 | expected | paired | mobile | clear | - | 20.4s | 0 | 34 | 2985 | 2 | 1 | 1 | 65 | 0.86x |
| M7 | expected | paired | desktop | clear | - | 20.2s | 0 | 26 | 2985 | 2 | 1 | 1 | 69 | 0.71x |
| M7 | upgraded | none | mobile | clear | - | 35.1s | 0 | 40 | 3006 | 3 | 3 | 4 | 39 | 0.96x |
| M7 | upgraded | none | desktop | clear | - | 40.7s | 0 | 36 | 3006 | 2 | 3 | 4 | 40 | 0.96x |
| M7 | upgraded | paired | mobile | clear | - | 19.2s | 0 | 28 | 3006 | 1 | 1 | 0 | 66 | 0.86x |
| M7 | upgraded | paired | desktop | clear | - | 18.6s | 0 | 43 | 3006 | 2 | 1 | 1 | 59 | 0.93x |

## Axis summary

| Axis | Value | Cell |
| --- | --- | --- |
| tier | low | 175/25/0; D0; C43; W3442; P54; E127 |
| tier | expected | 189/11/0; D0; C45; W3592; P54; E122 |
| tier | upgraded | 198/2/0; D0; C44; W3638; P52; E130 |
| support | none | 263/37/0; D1; C45; W3471; P54; E97 |
| support | paired | 299/1/0; D0; C43; W3638; P54; E130 |
| viewport | mobile | 290/10/0; D0; C48; W3638; P54; E130 |
| viewport | desktop | 272/28/0; D0; C40; W3471; P54; E127 |

## Findings

- Cells over the provisional 80-hostile-projectile readability ceiling: 0.
- Cells over the 1.25s first-visible-threat ceiling: 0.
- Cells over the 1s in-Wave visible-combat dead-air ceiling: 2.
- Cells that entered engine performance mode: 0.
- Cells that entered heavy-scene mode: 244.
- Missions with no clears across the matrix: none.
- Missions where upgraded clear rate was below low-power clear rate: none.
- Missions where paired supports cleared less often than no supports: M47.

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

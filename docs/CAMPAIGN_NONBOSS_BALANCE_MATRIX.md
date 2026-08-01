# Campaign Non-Boss Runtime Balance Matrix

Generated deterministically from Campaign revision 24 and the real `GameEngine` runtime.

## Result

The bounded autonomous sweep ran **600 trials** across **50 non-boss graph Missions**: 40 main-path Missions and 10 route alternatives. It produced **518 clears**, **82 deaths**, and **0 timeouts** (86.3% clear rate).

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
- Source digest: `4172aad6d2989b34cdedaf0779b3f625d360085f0a47840493b24659479f3bb4`.

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
| M1 ORBIT ENTRY | main | introduction | 12 | 12/0/0 | 25.6s | 0 | 18 | 2346 | 0.4s | 0.77s | 1 | 62 | 5 |
| M2 CITATION CROSSING | main | formation-remix | 12 | 11/1/0 | 16.8s | 0 | 24 | 2841 | 0.32s | 0.87s | 2 | 67 | 8 |
| M2B OPEN ORBIT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 10/2/0 | 17.4s | 1 | 27 | 3112 | 0.27s | 0.73s | 7 | 65 | 8 |
| M3 PAYWALL CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 22.2s | 1 | 38 | 2846 | 0.53s | 0.62s | 3 | 60 | 8 |
| M4 BASTION APPROACH | main | boss-preparation | 12 | 7/5/0 | 30.4s | 2 | 40 | 2321 | 0.25s | 1.23s | 11 | 71 | 12 |
| M6 HELIX SIGNAL | main | introduction | 12 | 9/3/0 | 21.6s | 0 | 28 | 2711 | 0.63s | 0.83s | 6 | 75 | 10 |
| M7 REDLINE CROSSING | main | formation-remix | 12 | 7/5/0 | 21.3s | 2 | 25 | 2964 | 0.57s | 0.67s | 8 | 73 | 12 |
| M7B REDLINE FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 6/6/0 | 19.6s | 4 | 25 | 3241 | 0.57s | 0.75s | 8 | 79 | 12 |
| M8 DARK MATTER CHECKPOINT | main | elite-checkpoint | 12 | 8/4/0 | 33.6s | 0 | 34 | 2731 | 1.05s | 0.78s | 30 | 80 | 12 |
| M9 MIRROR APPROACH | main | boss-preparation | 12 | 9/3/0 | 38.1s | 0 | 53 | 3149 | 0.35s | 0.63s | 54 | 103 | 12 |
| M11 SHARD SIGNAL | main | introduction | 12 | 10/2/0 | 17s | 0 | 31 | 2767 | 0.53s | 0.52s | 5 | 77 | 12 |
| M12 QUANTUM CROSSING | main | formation-remix | 12 | 12/0/0 | 20.8s | 0 | 41 | 3078 | 0.32s | 0.63s | 9 | 84 | 12 |
| M12B GRAVITY RIFT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 10/2/0 | 18.5s | 0 | 40 | 3319 | 0.28s | 0.68s | 14 | 82 | 12 |
| M13 GRAVITY CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 23.8s | 0 | 31 | 3073 | 0.38s | 0.53s | 29 | 75 | 12 |
| M14 EVENT HORIZON | main | boss-preparation | 12 | 11/1/0 | 34.8s | 0 | 52 | 4045 | 0.6s | 0.62s | 24 | 83 | 12 |
| M16 CRIMSON SIGNAL | main | introduction | 12 | 9/3/0 | 19.9s | 0 | 31 | 3391 | 0.33s | 0.67s | 18 | 75 | 12 |
| M17 ECLIPSE CROSSING | main | formation-remix | 12 | 12/0/0 | 19.6s | 0 | 41 | 4264 | 0.62s | 0.58s | 18 | 101 | 12 |
| M17B TERMINUS FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 10/2/0 | 18.2s | 2 | 43 | 3809 | 0.23s | 0.53s | 18 | 82 | 12 |
| M18 FRACTURE CHECKPOINT | main | elite-checkpoint | 12 | 9/3/0 | 34.5s | 1 | 42 | 3431 | 0.65s | 0.82s | 32 | 94 | 12 |
| M19 LAST LIGHT | main | boss-preparation | 12 | 11/1/0 | 31.5s | 0 | 61 | 4219 | 1.02s | 0.82s | 52 | 101 | 12 |
| M21 PRISM SIGNAL | main | introduction | 12 | 9/3/0 | 20.7s | 2 | 42 | 2731 | 0.4s | 0.65s | 18 | 79 | 12 |
| M22 SPECTRUM CROSSING | main | formation-remix | 12 | 9/3/0 | 17.9s | 0 | 39 | 4285 | 0.43s | 0.5s | 18 | 92 | 12 |
| M22B PRISM EXPANSE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 11/1/0 | 21.5s | 2 | 46 | 3809 | 0.53s | 0.78s | 18 | 81 | 12 |
| M23 BROOD CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 43.5s | 0 | 47 | 3451 | 0.57s | 0.57s | 27 | 95 | 12 |
| M24 LUMEN APPROACH | main | boss-preparation | 12 | 12/0/0 | 35.5s | 0 | 58 | 4198 | 0.58s | 0.62s | 17 | 103 | 12 |
| M26 RAIL SIGNAL | main | introduction | 12 | 10/2/0 | 21s | 2 | 35 | 2731 | 0.28s | 0.85s | 18 | 105 | 12 |
| M27 MERIDIAN CROSSING | main | formation-remix | 12 | 10/2/0 | 17.1s | 0 | 41 | 4264 | 0.57s | 0.8s | 18 | 100 | 12 |
| M27B RAIL MERIDIAN HIGH-RISK ROUTE | alternative | formation-remix | 12 | 9/3/0 | 17.9s | 0 | 39 | 4630 | 0.28s | 0.6s | 18 | 105 | 12 |
| M28 COIL CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 44.2s | 0 | 47 | 3471 | 0.52s | 0.57s | 30 | 103 | 12 |
| M29 SERPENT APPROACH | main | boss-preparation | 12 | 11/1/0 | 29.9s | 0 | 68 | 4219 | 0.88s | 0.77s | 29 | 101 | 12 |
| M31 GRAVITY SIGNAL | main | introduction | 12 | 10/2/0 | 17.8s | 0 | 42 | 3598 | 0.2s | 0.52s | 18 | 100 | 12 |
| M32 EVENTIDE CROSSING | main | formation-remix | 12 | 11/1/0 | 18.3s | 2 | 48 | 3799 | 0.25s | 0.52s | 18 | 100 | 12 |
| M32B SINGULARITY REACH HIGH-RISK ROUTE | alternative | formation-remix | 12 | 9/3/0 | 15.8s | 2 | 41 | 4152 | 0.95s | 0.5s | 18 | 105 | 12 |
| M33 WELL CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 26.2s | 0 | 44 | 3638 | 0.88s | 0.62s | 24 | 105 | 12 |
| M34 COLLAPSE APPROACH | main | boss-preparation | 12 | 12/0/0 | 31s | 0 | 66 | 4500 | 0.6s | 0.68s | 52 | 115 | 12 |
| M36 ORBIT SIGNAL | main | introduction | 12 | 11/1/0 | 17.3s | 0 | 37 | 3638 | 0.27s | 0.58s | 18 | 105 | 12 |
| M37 AXIS CROSSING | main | formation-remix | 12 | 11/1/0 | 18.6s | 2 | 54 | 3799 | 0.25s | 0.4s | 18 | 97 | 12 |
| M37B GYROSCOPE ARRAY HIGH-RISK ROUTE | alternative | formation-remix | 12 | 9/3/0 | 18.8s | 2 | 48 | 4125 | 0.27s | 0.5s | 18 | 105 | 12 |
| M38 GYRO CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 33.3s | 0 | 45 | 3638 | 0.32s | 0.62s | 54 | 131 | 12 |
| M39 ROTATION APPROACH | main | boss-preparation | 12 | 12/0/0 | 37.1s | 2 | 68 | 3744 | 0.62s | 0.62s | 32 | 112 | 12 |
| M41 SIEGE SIGNAL | main | introduction | 12 | 12/0/0 | 18.9s | 0 | 42 | 3638 | 0.35s | 0.63s | 18 | 112 | 12 |
| M42 BREACH CROSSING | main | formation-remix | 12 | 10/2/0 | 16.4s | 2 | 45 | 4576 | 0.25s | 0.73s | 18 | 113 | 12 |
| M42B HAMMERHEAD LINE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 21.9s | 3 | 64 | 4102 | 0.28s | 0.48s | 18 | 110 | 12 |
| M43 HAMMER CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 24.4s | 1 | 43 | 2918 | 0.38s | 0.48s | 18 | 106 | 12 |
| M44 DREAD APPROACH | main | boss-preparation | 12 | 12/0/0 | 43s | 0 | 75 | 4500 | 0.75s | 0.85s | 26 | 116 | 12 |
| M46 FRONTIER SIGNAL | main | introduction | 12 | 12/0/0 | 17.3s | 0 | 39 | 3638 | 0.28s | 0.57s | 15 | 109 | 12 |
| M47 CLAW CROSSING | main | formation-remix | 12 | 11/1/0 | 18s | 2 | 48 | 4576 | 0.25s | 0.42s | 18 | 114 | 12 |
| M47B CROWNCLAW FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 8/4/0 | 20.6s | 9 | 47 | 4033 | 0.28s | 0.35s | 18 | 115 | 12 |
| M48 CROWN CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 34.9s | 0 | 52 | 3638 | 0.4s | 0.87s | 30 | 111 | 12 |
| M49 REDLINE APPROACH | main | boss-preparation | 12 | 12/0/0 | 26.8s | 0 | 68 | 4500 | 0.9s | 0.67s | 52 | 128 | 12 |

## M2 and M7 detailed checkpoints

These early formation-remix Missions are expanded cell-by-cell because the Campaign brief calls them out as dedicated balance checkpoints.

| Mission | Power | Supports | Viewport | Outcome | Death Wave | Time | Damage | Coins | Weekly | Bombs | Ability | Peak hostile | Peak entities | Budget peak |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| M2 | low | none | mobile | clear | - | 39.6s | 1 | 30 | 2085 | 2 | 2 | 2 | 24 | 0.6x |
| M2 | low | none | desktop | death | 4 | 62s | 3 | 23 | 0 | 2 | 4 | 2 | 26 | 0.65x |
| M2 | low | paired | mobile | clear | - | 13.7s | 0 | 20 | 2841 | 0 | 1 | 0 | 66 | 0.4x |
| M2 | low | paired | desktop | clear | - | 16.8s | 0 | 24 | 2841 | 0 | 1 | 0 | 56 | 0.35x |
| M2 | expected | none | mobile | clear | - | 37.8s | 2 | 30 | 2064 | 2 | 2 | 2 | 25 | 0.55x |
| M2 | expected | none | desktop | clear | - | 20.4s | 0 | 24 | 2841 | 3 | 2 | 1 | 27 | 0.65x |
| M2 | expected | paired | mobile | clear | - | 13.9s | 0 | 26 | 2841 | 0 | 1 | 0 | 67 | 0.3x |
| M2 | expected | paired | desktop | clear | - | 14.8s | 0 | 16 | 2841 | 1 | 1 | 0 | 61 | 0.55x |
| M2 | upgraded | none | mobile | clear | - | 33.2s | 1 | 30 | 2106 | 3 | 2 | 1 | 25 | 0.65x |
| M2 | upgraded | none | desktop | clear | - | 21.6s | 0 | 27 | 2862 | 3 | 2 | 0 | 27 | 0.65x |
| M2 | upgraded | paired | mobile | clear | - | 13.7s | 0 | 22 | 2862 | 0 | 1 | 0 | 63 | 0.3x |
| M2 | upgraded | paired | desktop | clear | - | 15.8s | 0 | 22 | 2883 | 0 | 1 | 0 | 64 | 0.35x |
| M7 | low | none | mobile | death | 3 | 23.1s | 3 | 17 | 0 | 2 | 2 | 3 | 32 | 1x |
| M7 | low | none | desktop | death | 3 | 46.8s | 3 | 11 | 0 | 2 | 3 | 4 | 30 | 1.15x |
| M7 | low | paired | mobile | clear | - | 17.7s | 0 | 37 | 2964 | 1 | 1 | 0 | 73 | 0.68x |
| M7 | low | paired | desktop | clear | - | 21.3s | 0 | 23 | 2964 | 2 | 1 | 2 | 68 | 0.6x |
| M7 | expected | none | mobile | death | 4 | 50.9s | 4 | 47 | 0 | 3 | 3 | 4 | 35 | 0.8x |
| M7 | expected | none | desktop | death | 3 | 59.6s | 4 | 18 | 0 | 2 | 3 | 8 | 33 | 0.88x |
| M7 | expected | paired | mobile | clear | - | 20.4s | 0 | 34 | 2985 | 2 | 1 | 1 | 73 | 0.57x |
| M7 | expected | paired | desktop | clear | - | 23s | 0 | 15 | 2985 | 2 | 1 | 3 | 63 | 0.65x |
| M7 | upgraded | none | mobile | clear | - | 47.5s | 2 | 34 | 2229 | 2 | 3 | 4 | 41 | 0.9x |
| M7 | upgraded | none | desktop | death | 3 | 53.7s | 5 | 13 | 0 | 2 | 3 | 6 | 35 | 1.07x |
| M7 | upgraded | paired | mobile | clear | - | 20.7s | 0 | 49 | 3006 | 1 | 1 | 3 | 67 | 0.68x |
| M7 | upgraded | paired | desktop | clear | - | 22.1s | 0 | 25 | 3006 | 2 | 1 | 3 | 67 | 0.55x |

## Axis summary

| Axis | Value | Cell |
| --- | --- | --- |
| tier | low | 160/40/0; D1; C42; W3391; P54; E128 |
| tier | expected | 170/30/0; D0; C41; W3471; P54; E131 |
| tier | upgraded | 188/12/0; D0; C42; W3638; P54; E118 |
| support | none | 218/82/0; D2; C40; W2898; P54; E102 |
| support | paired | 300/0/0; D0; C43; W3638; P54; E131 |
| viewport | mobile | 282/18/0; D0; C46; W3638; P54; E128 |
| viewport | desktop | 236/64/0; D0; C36; W3411; P54; E131 |

## Findings

- Cells over the provisional 80-hostile-projectile readability ceiling: 0.
- Cells over the 1.25s first-visible-threat ceiling: 0.
- Cells over the 1s in-Wave visible-combat dead-air ceiling: 2.
- Cells that entered engine performance mode: 0.
- Cells that entered heavy-scene mode: 236.
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

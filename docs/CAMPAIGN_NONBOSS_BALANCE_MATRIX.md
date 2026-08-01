# Campaign Non-Boss Runtime Balance Matrix

Generated deterministically from Campaign revision 24 and the real `GameEngine` runtime.

## Result

The bounded autonomous sweep ran **600 trials** across **50 non-boss graph Missions**: 40 main-path Missions and 10 route alternatives. It produced **509 clears**, **91 deaths**, and **0 timeouts** (84.8% clear rate).

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
- Source digest: `9ac011c257122051f741f6347c56665e23258ec7ee3bfb73ef3f51411192a9b0`.

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
| M1 ORBIT ENTRY | main | introduction | 12 | 12/0/0 | 40.5s | 0 | 20 | 2346 | 2.2s | 7.57s | 2 | 58 | 4 |
| M2 CITATION CROSSING | main | formation-remix | 12 | 12/0/0 | 46.2s | 0 | 29 | 2841 | 2.2s | 6.28s | 2 | 71 | 7 |
| M2B OPEN ORBIT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 40.5s | 0 | 32 | 3135 | 0.3s | 6.47s | 4 | 61 | 7 |
| M3 PAYWALL CHECKPOINT | main | elite-checkpoint | 12 | 10/2/0 | 44s | 0 | 36 | 2846 | 0.23s | 6.83s | 3 | 63 | 8 |
| M4 BASTION APPROACH | main | boss-preparation | 12 | 6/6/0 | 47.5s | 3 | 41 | 3056 | 0.48s | 5.7s | 11 | 68 | 12 |
| M6 HELIX SIGNAL | main | introduction | 12 | 11/1/0 | 40.5s | 0 | 36 | 2711 | 0.37s | 6.8s | 10 | 72 | 10 |
| M7 REDLINE CROSSING | main | formation-remix | 12 | 7/5/0 | 40.5s | 3 | 32 | 2964 | 0.58s | 7.03s | 6 | 71 | 12 |
| M7B REDLINE FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 7/5/0 | 40.5s | 2 | 35 | 3241 | 0.58s | 7.3s | 8 | 82 | 12 |
| M8 DARK MATTER CHECKPOINT | main | elite-checkpoint | 12 | 8/4/0 | 51.7s | 0 | 46 | 3231 | 0.35s | 6.6s | 30 | 70 | 10 |
| M9 MIRROR APPROACH | main | boss-preparation | 12 | 9/3/0 | 67.6s | 0 | 69 | 3674 | 0.43s | 6.17s | 54 | 104 | 12 |
| M11 SHARD SIGNAL | main | introduction | 12 | 11/1/0 | 40.5s | 0 | 32 | 2767 | 0.33s | 6.57s | 5 | 82 | 9 |
| M12 QUANTUM CROSSING | main | formation-remix | 12 | 9/3/0 | 40.5s | 1 | 45 | 3057 | 0.25s | 6.53s | 14 | 75 | 12 |
| M12B GRAVITY RIFT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 10/2/0 | 40.5s | 0 | 47 | 3319 | 0.22s | 6.67s | 14 | 83 | 12 |
| M13 GRAVITY CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 47.2s | 1 | 45 | 3573 | 0.38s | 7.45s | 28 | 86 | 12 |
| M14 EVENT HORIZON | main | boss-preparation | 12 | 9/3/0 | 47.8s | 1 | 77 | 4570 | 0.62s | 5.88s | 24 | 86 | 12 |
| M16 CRIMSON SIGNAL | main | introduction | 12 | 11/1/0 | 40.5s | 0 | 40 | 3391 | 0.33s | 5.92s | 18 | 88 | 12 |
| M17 ECLIPSE CROSSING | main | formation-remix | 12 | 9/3/0 | 40.5s | 2 | 56 | 3487 | 0.72s | 6.53s | 18 | 85 | 12 |
| M17B TERMINUS FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 9/3/0 | 40.5s | 0 | 58 | 4607 | 0.23s | 6.82s | 18 | 81 | 12 |
| M18 FRACTURE CHECKPOINT | main | elite-checkpoint | 12 | 10/2/0 | 60.9s | 2 | 63 | 3191 | 0.67s | 6.98s | 32 | 98 | 12 |
| M19 LAST LIGHT | main | boss-preparation | 12 | 10/2/0 | 47s | 0 | 82 | 4723 | 0.55s | 5.35s | 52 | 98 | 12 |
| M21 PRISM SIGNAL | main | introduction | 12 | 11/1/0 | 40.5s | 0 | 44 | 3431 | 0.27s | 6.3s | 18 | 96 | 12 |
| M22 SPECTRUM CROSSING | main | formation-remix | 12 | 10/2/0 | 40.5s | 0 | 52 | 4285 | 0.67s | 6.72s | 18 | 98 | 12 |
| M22B PRISM EXPANSE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 9/3/0 | 41.7s | 0 | 53 | 4652 | 0.28s | 7.4s | 18 | 96 | 12 |
| M23 BROOD CHECKPOINT | main | elite-checkpoint | 12 | 10/2/0 | 70s | 1 | 55 | 3951 | 0.63s | 7.18s | 26 | 95 | 12 |
| M24 LUMEN APPROACH | main | boss-preparation | 12 | 11/1/0 | 49.7s | 0 | 82 | 4723 | 0.55s | 6.5s | 18 | 86 | 12 |
| M26 RAIL SIGNAL | main | introduction | 12 | 12/0/0 | 40.5s | 0 | 37 | 3471 | 0.28s | 6.7s | 18 | 103 | 12 |
| M27 MERIDIAN CROSSING | main | formation-remix | 12 | 10/2/0 | 40.5s | 0 | 55 | 4306 | 0.63s | 6.95s | 18 | 107 | 12 |
| M27B RAIL MERIDIAN HIGH-RISK ROUTE | alternative | formation-remix | 12 | 8/4/0 | 40.5s | 0 | 53 | 4630 | 0.22s | 7.6s | 18 | 96 | 12 |
| M28 COIL CHECKPOINT | main | elite-checkpoint | 12 | 10/2/0 | 59.7s | 1 | 58 | 3971 | 0.83s | 7.62s | 30 | 106 | 12 |
| M29 SERPENT APPROACH | main | boss-preparation | 12 | 11/1/0 | 45.4s | 0 | 75 | 4765 | 0.72s | 6.9s | 28 | 109 | 12 |
| M31 GRAVITY SIGNAL | main | introduction | 12 | 11/1/0 | 40.5s | 2 | 42 | 3638 | 0.6s | 6.9s | 18 | 93 | 12 |
| M32 EVENTIDE CROSSING | main | formation-remix | 12 | 9/3/0 | 40.5s | 0 | 54 | 4576 | 0.3s | 6.95s | 18 | 110 | 12 |
| M32B SINGULARITY REACH HIGH-RISK ROUTE | alternative | formation-remix | 12 | 10/2/0 | 40.5s | 2 | 57 | 4152 | 0.25s | 7.13s | 18 | 106 | 12 |
| M33 WELL CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 52.9s | 0 | 65 | 4138 | 0.9s | 6.75s | 24 | 107 | 12 |
| M34 COLLAPSE APPROACH | main | boss-preparation | 12 | 11/1/0 | 49.1s | 0 | 92 | 5025 | 0.63s | 6.93s | 52 | 111 | 12 |
| M36 ORBIT SIGNAL | main | introduction | 12 | 12/0/0 | 40.5s | 0 | 43 | 3618 | 0.23s | 6.78s | 18 | 107 | 12 |
| M37 AXIS CROSSING | main | formation-remix | 12 | 11/1/0 | 40.8s | 2 | 54 | 3799 | 0.28s | 6.95s | 18 | 110 | 12 |
| M37B GYROSCOPE ARRAY HIGH-RISK ROUTE | alternative | formation-remix | 12 | 9/3/0 | 40.5s | 4 | 60 | 4945 | 0.25s | 7.9s | 18 | 109 | 12 |
| M38 GYRO CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 74.1s | 0 | 62 | 4138 | 0.82s | 7.45s | 54 | 112 | 12 |
| M39 ROTATION APPROACH | main | boss-preparation | 12 | 12/0/0 | 54s | 2 | 83 | 4248 | 0.57s | 6.8s | 32 | 105 | 12 |
| M41 SIEGE SIGNAL | main | introduction | 12 | 12/0/0 | 40.5s | 0 | 44 | 3638 | 0.23s | 7.47s | 17 | 104 | 12 |
| M42 BREACH CROSSING | main | formation-remix | 12 | 8/4/0 | 40.5s | 0 | 59 | 4576 | 0.23s | 7.4s | 18 | 97 | 12 |
| M42B HAMMERHEAD LINE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 9/3/0 | 40.5s | 3 | 57 | 4968 | 0.52s | 7.9s | 18 | 109 | 12 |
| M43 HAMMER CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 50.8s | 1 | 59 | 3418 | 0.9s | 7.45s | 4 | 116 | 12 |
| M44 DREAD APPROACH | main | boss-preparation | 12 | 12/0/0 | 59.7s | 0 | 91 | 5025 | 0.7s | 6.07s | 25 | 125 | 12 |
| M46 FRONTIER SIGNAL | main | introduction | 12 | 12/0/0 | 40.5s | 0 | 44 | 3638 | 0.28s | 7.45s | 18 | 105 | 12 |
| M47 CLAW CROSSING | main | formation-remix | 12 | 10/2/0 | 40.5s | 0 | 51 | 4576 | 0.25s | 7.72s | 18 | 109 | 12 |
| M47B CROWNCLAW FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 7/5/0 | 41.1s | 9 | 40 | 3965 | 0.3s | 8s | 18 | 111 | 12 |
| M48 CROWN CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 62.4s | 0 | 67 | 4138 | 0.55s | 7.58s | 30 | 119 | 12 |
| M49 REDLINE APPROACH | main | boss-preparation | 12 | 12/0/0 | 49s | 0 | 85 | 5025 | 0.57s | 6.03s | 52 | 132 | 12 |

## M2 and M7 detailed checkpoints

These early formation-remix Missions are expanded cell-by-cell because the Campaign brief calls them out as dedicated balance checkpoints.

| Mission | Power | Supports | Viewport | Outcome | Death Wave | Time | Damage | Coins | Weekly | Bombs | Ability | Peak hostile | Peak entities | Budget peak |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| M2 | low | none | mobile | clear | - | 46.2s | 1 | 30 | 2106 | 3 | 2 | 2 | 23 | 0.39x |
| M2 | low | none | desktop | clear | - | 82.9s | 1 | 19 | 2085 | 2 | 5 | 2 | 27 | 0.5x |
| M2 | low | paired | mobile | clear | - | 40.5s | 0 | 25 | 2841 | 0 | 1 | 0 | 58 | 0.17x |
| M2 | low | paired | desktop | clear | - | 40.5s | 0 | 29 | 2841 | 0 | 1 | 0 | 52 | 0.22x |
| M2 | expected | none | mobile | clear | - | 52.4s | 2 | 32 | 2064 | 2 | 2 | 2 | 25 | 0.44x |
| M2 | expected | none | desktop | clear | - | 49.6s | 0 | 21 | 2841 | 2 | 3 | 2 | 23 | 0.44x |
| M2 | expected | paired | mobile | clear | - | 40.5s | 0 | 30 | 2841 | 0 | 1 | 0 | 60 | 0.17x |
| M2 | expected | paired | desktop | clear | - | 40.5s | 0 | 24 | 2841 | 0 | 1 | 0 | 54 | 0.2x |
| M2 | upgraded | none | mobile | clear | - | 49.5s | 1 | 35 | 2106 | 2 | 3 | 1 | 23 | 0.39x |
| M2 | upgraded | none | desktop | clear | - | 52.5s | 0 | 26 | 2862 | 3 | 3 | 2 | 26 | 0.5x |
| M2 | upgraded | paired | mobile | clear | - | 40.5s | 0 | 30 | 2862 | 0 | 1 | 0 | 71 | 0.2x |
| M2 | upgraded | paired | desktop | clear | - | 40.5s | 0 | 25 | 2862 | 0 | 1 | 0 | 52 | 0.28x |
| M7 | low | none | mobile | death | 3 | 32.2s | 3 | 29 | 0 | 2 | 2 | 3 | 27 | 0.8x |
| M7 | low | none | desktop | death | 3 | 46.5s | 3 | 16 | 0 | 2 | 2 | 4 | 28 | 1.07x |
| M7 | low | paired | mobile | clear | - | 40.5s | 0 | 44 | 2964 | 1 | 1 | 1 | 71 | 0.46x |
| M7 | low | paired | desktop | clear | - | 40.5s | 0 | 42 | 2985 | 1 | 1 | 1 | 60 | 0.46x |
| M7 | expected | none | mobile | death | 3 | 37.1s | 4 | 20 | 0 | 2 | 2 | 3 | 29 | 0.82x |
| M7 | expected | none | desktop | death | 3 | 54s | 4 | 19 | 0 | 2 | 3 | 5 | 34 | 1.15x |
| M7 | expected | paired | mobile | clear | - | 40.5s | 0 | 47 | 2985 | 2 | 1 | 1 | 57 | 0.46x |
| M7 | expected | paired | desktop | clear | - | 40.5s | 0 | 29 | 2985 | 2 | 1 | 1 | 58 | 0.5x |
| M7 | upgraded | none | mobile | clear | - | 49.2s | 4 | 50 | 2187 | 3 | 3 | 5 | 45 | 0.88x |
| M7 | upgraded | none | desktop | death | 3 | 75.1s | 5 | 21 | 0 | 2 | 4 | 6 | 31 | 1.02x |
| M7 | upgraded | paired | mobile | clear | - | 40.5s | 0 | 46 | 3006 | 1 | 1 | 1 | 63 | 0.54x |
| M7 | upgraded | paired | desktop | clear | - | 40.5s | 0 | 32 | 3006 | 3 | 1 | 1 | 62 | 0.46x |

## Axis summary

| Axis | Value | Cell |
| --- | --- | --- |
| tier | low | 156/44/0; D1; C45; W3319; P54; E120 |
| tier | expected | 169/31/0; D0; C47; W3638; P54; E123 |
| tier | upgraded | 184/16/0; D0; C50; W3638; P54; E132 |
| support | none | 213/87/0; D2; C43; W2918; P54; E112 |
| support | paired | 296/4/0; D0; C50; W3799; P54; E132 |
| viewport | mobile | 281/19/0; D0; C57; W3715; P53; E132 |
| viewport | desktop | 228/72/0; D0; C40; W3341; P54; E120 |

## Findings

- Cells over the provisional 80-hostile-projectile readability ceiling: 0.
- Cells over the 1.25s first-visible-threat ceiling: 3.
- Cells over the 1s in-Wave visible-combat dead-air ceiling: 595.
- Cells that entered engine performance mode: 0.
- Cells that entered heavy-scene mode: 239.
- Missions with no clears across the matrix: none.
- Missions where upgraded clear rate was below low-power clear rate: M6, M42B.
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

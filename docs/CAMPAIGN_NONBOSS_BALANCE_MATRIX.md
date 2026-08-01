# Campaign Non-Boss Runtime Balance Matrix

Generated deterministically from Campaign revision 24 and the real `GameEngine` runtime.

## Result

The bounded autonomous sweep ran **600 trials** across **50 non-boss graph Missions**: 40 main-path Missions and 10 route alternatives. It produced **513 clears**, **86 deaths**, and **1 timeouts** (85.5% clear rate).

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
- Source digest: `a163847335a8a53997767a36ce1f1a819d407fd90126d26649d9300e744cd399`.

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
| M2 CITATION CROSSING | main | formation-remix | 12 | 11/1/0 | 16.8s | 0 | 25 | 2841 | 0.32s | 0.57s | 2 | 68 | 8 |
| M2B OPEN ORBIT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 10/2/0 | 17.7s | 1 | 27 | 3112 | 0.27s | 0.33s | 7 | 64 | 8 |
| M3 PAYWALL CHECKPOINT | main | elite-checkpoint | 12 | 9/3/0 | 21.5s | 1 | 39 | 2846 | 0.53s | 0.58s | 3 | 59 | 9 |
| M4 BASTION APPROACH | main | boss-preparation | 12 | 8/4/0 | 30.9s | 2 | 40 | 3056 | 0.27s | 1.23s | 11 | 71 | 12 |
| M6 HELIX SIGNAL | main | introduction | 12 | 9/3/0 | 19.6s | 1 | 30 | 2711 | 0.63s | 0.82s | 11 | 74 | 10 |
| M7 REDLINE CROSSING | main | formation-remix | 12 | 7/5/0 | 20.2s | 2 | 31 | 2964 | 0.57s | 0.33s | 6 | 73 | 12 |
| M7B REDLINE FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 7/5/0 | 19.6s | 2 | 30 | 3241 | 0.57s | 0.48s | 7 | 78 | 12 |
| M8 DARK MATTER CHECKPOINT | main | elite-checkpoint | 12 | 8/4/0 | 33.6s | 0 | 34 | 2731 | 0.8s | 0.58s | 30 | 75 | 12 |
| M9 MIRROR APPROACH | main | boss-preparation | 12 | 9/2/1 | 43.3s | 0 | 54 | 3149 | 0.47s | 0.58s | 54 | 111 | 12 |
| M11 SHARD SIGNAL | main | introduction | 12 | 10/2/0 | 17s | 0 | 31 | 2767 | 0.53s | 0.52s | 5 | 72 | 12 |
| M12 QUANTUM CROSSING | main | formation-remix | 12 | 12/0/0 | 22.2s | 0 | 42 | 3078 | 0.32s | 0.63s | 9 | 83 | 12 |
| M12B GRAVITY RIFT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 10/2/0 | 17.8s | 0 | 36 | 3341 | 0.28s | 0.57s | 14 | 84 | 12 |
| M13 GRAVITY CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 22.9s | 0 | 31 | 3073 | 0.38s | 0.48s | 29 | 75 | 12 |
| M14 EVENT HORIZON | main | boss-preparation | 12 | 11/1/0 | 33.9s | 0 | 56 | 4066 | 0.58s | 0.55s | 24 | 83 | 12 |
| M16 CRIMSON SIGNAL | main | introduction | 12 | 9/3/0 | 18.9s | 0 | 33 | 3391 | 0.33s | 0.7s | 18 | 85 | 12 |
| M17 ECLIPSE CROSSING | main | formation-remix | 12 | 9/3/0 | 22s | 0 | 45 | 4243 | 0.62s | 0.62s | 18 | 82 | 12 |
| M17B TERMINUS FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 8/4/0 | 19.1s | 0 | 40 | 4607 | 0.28s | 0.52s | 18 | 86 | 12 |
| M18 FRACTURE CHECKPOINT | main | elite-checkpoint | 12 | 9/3/0 | 31s | 1 | 42 | 2731 | 0.52s | 0.45s | 32 | 93 | 12 |
| M19 LAST LIGHT | main | boss-preparation | 12 | 11/1/0 | 30.5s | 0 | 61 | 4198 | 0.9s | 0.43s | 52 | 104 | 12 |
| M21 PRISM SIGNAL | main | introduction | 12 | 10/2/0 | 21.4s | 0 | 36 | 3411 | 0.33s | 0.47s | 18 | 99 | 12 |
| M22 SPECTRUM CROSSING | main | formation-remix | 12 | 10/2/0 | 20.3s | 0 | 39 | 4285 | 0.3s | 0.68s | 18 | 105 | 12 |
| M22B PRISM EXPANSE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 10/2/0 | 21.3s | 2 | 43 | 3809 | 0.5s | 0.7s | 18 | 86 | 12 |
| M23 BROOD CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 43.2s | 0 | 46 | 3451 | 0.43s | 0.52s | 27 | 97 | 12 |
| M24 LUMEN APPROACH | main | boss-preparation | 12 | 10/2/0 | 34.8s | 0 | 62 | 4219 | 0.58s | 0.62s | 18 | 104 | 12 |
| M26 RAIL SIGNAL | main | introduction | 12 | 10/2/0 | 18.1s | 2 | 33 | 3431 | 0.28s | 0.52s | 18 | 104 | 12 |
| M27 MERIDIAN CROSSING | main | formation-remix | 12 | 10/2/0 | 17.9s | 0 | 44 | 4264 | 0.43s | 0.93s | 18 | 101 | 12 |
| M27B RAIL MERIDIAN HIGH-RISK ROUTE | alternative | formation-remix | 12 | 9/3/0 | 17.8s | 0 | 39 | 4630 | 0.28s | 0.62s | 18 | 99 | 12 |
| M28 COIL CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 38.2s | 0 | 47 | 3451 | 0.42s | 0.45s | 30 | 109 | 12 |
| M29 SERPENT APPROACH | main | boss-preparation | 12 | 11/1/0 | 29.5s | 0 | 65 | 4240 | 0.88s | 0.4s | 28 | 96 | 12 |
| M31 GRAVITY SIGNAL | main | introduction | 12 | 10/2/0 | 17.8s | 0 | 43 | 3598 | 0.2s | 0.38s | 18 | 110 | 12 |
| M32 EVENTIDE CROSSING | main | formation-remix | 12 | 11/1/0 | 18.6s | 0 | 44 | 4576 | 0.28s | 0.55s | 18 | 107 | 12 |
| M32B SINGULARITY REACH HIGH-RISK ROUTE | alternative | formation-remix | 12 | 9/3/0 | 18.9s | 2 | 47 | 4152 | 0.63s | 0.42s | 18 | 101 | 12 |
| M33 WELL CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 27.4s | 0 | 50 | 3650 | 0.6s | 0.65s | 24 | 93 | 12 |
| M34 COLLAPSE APPROACH | main | boss-preparation | 12 | 12/0/0 | 31.6s | 0 | 72 | 4500 | 0.6s | 0.47s | 52 | 123 | 12 |
| M36 ORBIT SIGNAL | main | introduction | 12 | 11/1/0 | 17.1s | 0 | 37 | 3638 | 0.27s | 0.45s | 18 | 102 | 12 |
| M37 AXIS CROSSING | main | formation-remix | 12 | 11/1/0 | 18.9s | 0 | 47 | 4576 | 0.42s | 0.37s | 18 | 96 | 12 |
| M37B GYROSCOPE ARRAY HIGH-RISK ROUTE | alternative | formation-remix | 12 | 10/2/0 | 23.3s | 2 | 51 | 4125 | 0.28s | 0.48s | 18 | 109 | 12 |
| M38 GYRO CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 48.4s | 1 | 46 | 2918 | 0.32s | 0.45s | 54 | 125 | 12 |
| M39 ROTATION APPROACH | main | boss-preparation | 12 | 12/0/0 | 39.8s | 2 | 71 | 3744 | 0.62s | 0.67s | 32 | 112 | 12 |
| M41 SIEGE SIGNAL | main | introduction | 12 | 12/0/0 | 19.4s | 0 | 44 | 3638 | 0.77s | 0.53s | 18 | 115 | 12 |
| M42 BREACH CROSSING | main | formation-remix | 12 | 11/1/0 | 18.9s | 0 | 45 | 4576 | 0.38s | 0.6s | 18 | 100 | 12 |
| M42B HAMMERHEAD LINE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 17.6s | 3 | 45 | 4968 | 0.28s | 0.42s | 18 | 108 | 12 |
| M43 HAMMER CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 26.8s | 1 | 38 | 2918 | 0.38s | 0.58s | 18 | 110 | 12 |
| M44 DREAD APPROACH | main | boss-preparation | 12 | 12/0/0 | 50.5s | 0 | 73 | 4500 | 0.72s | 1.08s | 26 | 119 | 12 |
| M46 FRONTIER SIGNAL | main | introduction | 12 | 12/0/0 | 19s | 0 | 40 | 3638 | 0.28s | 0.47s | 17 | 102 | 12 |
| M47 CLAW CROSSING | main | formation-remix | 12 | 9/3/0 | 18.3s | 0 | 41 | 4576 | 0.27s | 0.68s | 18 | 116 | 12 |
| M47B CROWNCLAW FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 9/3/0 | 20.2s | 6 | 50 | 4033 | 0.28s | 0.35s | 18 | 115 | 12 |
| M48 CROWN CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 49.1s | 1 | 51 | 2918 | 0.42s | 0.77s | 30 | 114 | 12 |
| M49 REDLINE APPROACH | main | boss-preparation | 12 | 12/0/0 | 27.1s | 0 | 68 | 4500 | 0.72s | 1.03s | 52 | 123 | 12 |

## M2 and M7 detailed checkpoints

These early formation-remix Missions are expanded cell-by-cell because the Campaign brief calls them out as dedicated balance checkpoints.

| Mission | Power | Supports | Viewport | Outcome | Death Wave | Time | Damage | Coins | Weekly | Bombs | Ability | Peak hostile | Peak entities | Budget peak |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| M2 | low | none | mobile | clear | - | 39.6s | 1 | 30 | 2085 | 2 | 2 | 2 | 24 | 0.6x |
| M2 | low | none | desktop | death | 4 | 62s | 3 | 23 | 0 | 2 | 4 | 2 | 26 | 0.65x |
| M2 | low | paired | mobile | clear | - | 13.8s | 0 | 22 | 2862 | 0 | 1 | 0 | 68 | 0.4x |
| M2 | low | paired | desktop | clear | - | 16.8s | 0 | 24 | 2841 | 0 | 1 | 0 | 56 | 0.35x |
| M2 | expected | none | mobile | clear | - | 32.2s | 0 | 30 | 2841 | 2 | 2 | 2 | 23 | 0.55x |
| M2 | expected | none | desktop | clear | - | 20.4s | 0 | 24 | 2841 | 3 | 2 | 1 | 27 | 0.65x |
| M2 | expected | paired | mobile | clear | - | 13.9s | 0 | 25 | 2841 | 0 | 1 | 0 | 60 | 0.39x |
| M2 | expected | paired | desktop | clear | - | 16.6s | 0 | 22 | 2841 | 1 | 1 | 0 | 60 | 0.55x |
| M2 | upgraded | none | mobile | clear | - | 33.2s | 1 | 30 | 2106 | 3 | 2 | 1 | 26 | 0.65x |
| M2 | upgraded | none | desktop | clear | - | 21.6s | 0 | 27 | 2862 | 3 | 2 | 0 | 27 | 0.65x |
| M2 | upgraded | paired | mobile | clear | - | 14s | 0 | 28 | 2883 | 0 | 1 | 0 | 64 | 0.3x |
| M2 | upgraded | paired | desktop | clear | - | 15.8s | 0 | 22 | 2883 | 0 | 1 | 0 | 63 | 0.35x |
| M7 | low | none | mobile | death | 4 | 41.4s | 3 | 29 | 0 | 3 | 3 | 3 | 29 | 1x |
| M7 | low | none | desktop | death | 3 | 46.8s | 3 | 11 | 0 | 2 | 3 | 4 | 30 | 1.15x |
| M7 | low | paired | mobile | clear | - | 18.4s | 0 | 30 | 2964 | 1 | 1 | 0 | 70 | 0.6x |
| M7 | low | paired | desktop | clear | - | 20.2s | 0 | 28 | 2985 | 2 | 1 | 1 | 65 | 0.68x |
| M7 | expected | none | mobile | death | 4 | 50.9s | 4 | 47 | 0 | 3 | 3 | 4 | 34 | 0.8x |
| M7 | expected | none | desktop | death | 3 | 48.6s | 4 | 16 | 0 | 2 | 3 | 6 | 33 | 0.97x |
| M7 | expected | paired | mobile | clear | - | 19.2s | 0 | 31 | 2985 | 2 | 1 | 2 | 72 | 0.6x |
| M7 | expected | paired | desktop | clear | - | 20.6s | 0 | 36 | 2985 | 2 | 1 | 1 | 60 | 0.7x |
| M7 | upgraded | none | mobile | clear | - | 47.5s | 2 | 34 | 2229 | 2 | 3 | 4 | 41 | 0.9x |
| M7 | upgraded | none | desktop | death | 3 | 59.8s | 5 | 14 | 0 | 2 | 3 | 6 | 32 | 0.93x |
| M7 | upgraded | paired | mobile | clear | - | 18.9s | 0 | 36 | 3006 | 1 | 1 | 0 | 73 | 0.68x |
| M7 | upgraded | paired | desktop | clear | - | 20.3s | 0 | 48 | 3006 | 2 | 1 | 1 | 63 | 0.72x |

## Axis summary

| Axis | Value | Cell |
| --- | --- | --- |
| tier | low | 156/44/0; D0; C40; W3264; P54; E125 |
| tier | expected | 169/31/0; D0; C41; W3451; P54; E121 |
| tier | upgraded | 188/11/1; D0; C42; W3550; P54; E123 |
| support | none | 213/86/1; D2; C40; W2878; P54; E102 |
| support | paired | 300/0/0; D0; C42; W3638; P54; E125 |
| viewport | mobile | 283/17/0; D0; C46; W3638; P54; E125 |
| viewport | desktop | 230/69/1; D0; C36; W3264; P54; E115 |

## Findings

- Cells over the provisional 80-hostile-projectile readability ceiling: 0.
- Cells over the 1.25s first-visible-threat ceiling: 0.
- Cells over the 1s in-Wave visible-combat dead-air ceiling: 4.
- Cells that entered engine performance mode: 0.
- Cells that entered heavy-scene mode: 234.
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

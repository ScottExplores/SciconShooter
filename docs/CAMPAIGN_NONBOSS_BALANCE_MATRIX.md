# Campaign Non-Boss Runtime Balance Matrix

Generated deterministically from Campaign revision 24 and the real `GameEngine` runtime.

## Result

The bounded autonomous sweep ran **600 trials** across **50 non-boss graph Missions**: 40 main-path Missions and 10 route alternatives. It produced **586 clears**, **12 deaths**, and **2 timeouts** (97.7% clear rate).

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
- Source digest: `aafe29897b0b01480b386510f517980a98127c8a292fdd3d93eb5fda0b27624c`.

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
| M1 ORBIT ENTRY | main | introduction | 12 | 12/0/0 | 41.5s | 0 | 34 | 2802 | 0.55s | 0.13s | 0 | 61 | 0 |
| M2 CITATION CROSSING | main | formation-remix | 12 | 12/0/0 | 55.1s | 0 | 63 | 3566 | 0.48s | 0.22s | 0 | 85 | 8 |
| M2B OPEN ORBIT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 66.8s | 0 | 54 | 3899 | 0.48s | 0.28s | 0 | 87 | 8 |
| M3 PAYWALL CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 47.8s | 0 | 36 | 2846 | 0.55s | 0.32s | 2 | 63 | 8 |
| M4 BASTION APPROACH | main | boss-preparation | 12 | 11/1/0 | 28.2s | 1 | 42 | 2568 | 0.15s | 0.93s | 2 | 66 | 12 |
| M6 HELIX SIGNAL | main | introduction | 12 | 12/0/0 | 61.2s | 0 | 40 | 3191 | 0.53s | 0.95s | 4 | 75 | 10 |
| M7 REDLINE CROSSING | main | formation-remix | 12 | 10/2/0 | 36s | 0 | 77 | 4062 | 0.53s | 0.5s | 6 | 90 | 12 |
| M7B REDLINE FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 72.4s | 0 | 73 | 4411 | 0.53s | 0.5s | 6 | 84 | 12 |
| M8 DARK MATTER CHECKPOINT | main | elite-checkpoint | 12 | 9/2/1 | 26.6s | 2 | 29 | 2011 | 0.25s | 0.38s | 31 | 71 | 12 |
| M9 MIRROR APPROACH | main | boss-preparation | 12 | 9/3/0 | 47.6s | 1 | 43 | 3149 | 0.47s | 0.62s | 54 | 103 | 12 |
| M11 SHARD SIGNAL | main | introduction | 12 | 12/0/0 | 20s | 0 | 49 | 3271 | 0.55s | 0.25s | 6 | 78 | 12 |
| M12 QUANTUM CROSSING | main | formation-remix | 12 | 12/0/0 | 30.9s | 0 | 84 | 4230 | 0.5s | 0.62s | 6 | 87 | 12 |
| M12B GRAVITY RIFT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 38.9s | 0 | 86 | 4593 | 0.63s | 0.92s | 6 | 87 | 12 |
| M13 GRAVITY CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 31.1s | 0 | 34 | 3113 | 0.15s | 0.15s | 7 | 73 | 12 |
| M14 EVENT HORIZON | main | boss-preparation | 12 | 11/1/0 | 30.9s | 0 | 49 | 4066 | 0.23s | 0.27s | 24 | 84 | 12 |
| M16 CRIMSON SIGNAL | main | introduction | 12 | 12/0/0 | 25.1s | 0 | 62 | 4134 | 1.05s | 0.63s | 3 | 76 | 12 |
| M17 ECLIPSE CROSSING | main | formation-remix | 12 | 12/0/0 | 55.9s | 0 | 136 | 6272 | 0.18s | 0.63s | 6 | 88 | 12 |
| M17B TERMINUS FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 51.5s | 0 | 110 | 6314 | 0.17s | 0.87s | 6 | 85 | 12 |
| M18 FRACTURE CHECKPOINT | main | elite-checkpoint | 12 | 10/2/0 | 29.1s | 2 | 39 | 2862 | 1.05s | 0.33s | 32 | 90 | 12 |
| M19 LAST LIGHT | main | boss-preparation | 12 | 12/0/0 | 34.1s | 0 | 70 | 4484 | 0.18s | 0.25s | 52 | 96 | 12 |
| M21 PRISM SIGNAL | main | introduction | 12 | 12/0/0 | 34.1s | 0 | 53 | 4174 | 0.45s | 0.28s | 6 | 90 | 12 |
| M22 SPECTRUM CROSSING | main | formation-remix | 12 | 12/0/0 | 50.5s | 0 | 133 | 6378 | 0.2s | 0.58s | 6 | 93 | 12 |
| M22B PRISM EXPANSE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 50.3s | 2 | 112 | 6184 | 0.2s | 0.53s | 6 | 93 | 12 |
| M23 BROOD CHECKPOINT | main | elite-checkpoint | 12 | 11/0/1 | 44.9s | 1 | 43 | 3602 | 0.97s | 0.33s | 28 | 87 | 12 |
| M24 LUMEN APPROACH | main | boss-preparation | 12 | 12/0/0 | 38.8s | 0 | 62 | 4484 | 0.18s | 0.52s | 2 | 86 | 12 |
| M26 RAIL SIGNAL | main | introduction | 12 | 12/0/0 | 30.6s | 0 | 64 | 4457 | 0.45s | 0.33s | 6 | 91 | 12 |
| M27 MERIDIAN CROSSING | main | formation-remix | 12 | 12/0/0 | 44.8s | 0 | 154 | 6750 | 0.17s | 0.57s | 6 | 94 | 12 |
| M27B RAIL MERIDIAN HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 43s | 0 | 136 | 6733 | 0.2s | 0.58s | 6 | 97 | 12 |
| M28 COIL CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 41.2s | 1 | 42 | 3666 | 0.85s | 0.17s | 30 | 87 | 12 |
| M29 SERPENT APPROACH | main | boss-preparation | 12 | 12/0/0 | 30.8s | 0 | 63 | 4530 | 0.22s | 0.17s | 7 | 92 | 12 |
| M31 GRAVITY SIGNAL | main | introduction | 12 | 12/0/0 | 40.9s | 0 | 93 | 5153 | 0.42s | 0.38s | 6 | 82 | 12 |
| M32 EVENTIDE CROSSING | main | formation-remix | 12 | 12/0/0 | 52.1s | 0 | 189 | 7741 | 0.23s | 0.4s | 6 | 99 | 12 |
| M32B SINGULARITY REACH HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 53.8s | 0 | 158 | 7758 | 0.2s | 0.35s | 6 | 113 | 12 |
| M33 WELL CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 34.3s | 0 | 53 | 4151 | 0.83s | 0.33s | 24 | 89 | 12 |
| M34 COLLAPSE APPROACH | main | boss-preparation | 12 | 12/0/0 | 32.8s | 0 | 90 | 5294 | 0.18s | 0.5s | 52 | 99 | 12 |
| M36 ORBIT SIGNAL | main | introduction | 12 | 12/0/0 | 39.6s | 0 | 86 | 5201 | 0.2s | 0.33s | 6 | 89 | 12 |
| M37 AXIS CROSSING | main | formation-remix | 12 | 12/0/0 | 63.3s | 0 | 207 | 7916 | 0.17s | 0.45s | 6 | 111 | 12 |
| M37B GYROSCOPE ARRAY HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 66s | 2 | 170 | 7274 | 0.2s | 0.55s | 6 | 111 | 12 |
| M38 GYRO CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 41.9s | 0 | 54 | 4163 | 0.85s | 0.33s | 54 | 112 | 12 |
| M39 ROTATION APPROACH | main | boss-preparation | 12 | 12/0/0 | 44.5s | 2 | 84 | 4551 | 0.23s | 0.27s | 32 | 103 | 12 |
| M41 SIEGE SIGNAL | main | introduction | 12 | 12/0/0 | 38.2s | 0 | 97 | 5516 | 0.22s | 0.33s | 6 | 86 | 12 |
| M42 BREACH CROSSING | main | formation-remix | 12 | 12/0/0 | 57s | 0 | 204 | 8432 | 0.2s | 0.47s | 6 | 110 | 12 |
| M42B HAMMERHEAD LINE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 48.1s | 3 | 185 | 7600 | 0.2s | 0.5s | 9 | 102 | 12 |
| M43 HAMMER CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 28.1s | 0 | 53 | 4322 | 0.85s | 0.32s | 2 | 90 | 12 |
| M44 DREAD APPROACH | main | boss-preparation | 12 | 12/0/0 | 52s | 0 | 104 | 5559 | 0.18s | 0.35s | 25 | 97 | 12 |
| M46 FRONTIER SIGNAL | main | introduction | 12 | 12/0/0 | 38.8s | 0 | 103 | 5741 | 0.42s | 0.5s | 6 | 95 | 12 |
| M47 CLAW CROSSING | main | formation-remix | 12 | 12/0/0 | 57.9s | 0 | 206 | 8945 | 0.17s | 0.82s | 9 | 109 | 12 |
| M47B CROWNCLAW FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 11/1/0 | 58.7s | 3 | 187 | 8239 | 0.2s | 0.5s | 17 | 127 | 12 |
| M48 CROWN CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 41.6s | 1 | 57 | 3626 | 0.95s | 0.33s | 30 | 90 | 12 |
| M49 REDLINE APPROACH | main | boss-preparation | 12 | 12/0/0 | 30.5s | 0 | 105 | 5584 | 0.18s | 0.28s | 52 | 103 | 12 |

## M2 and M7 detailed checkpoints

These early formation-remix Missions are expanded cell-by-cell because the Campaign brief calls them out as dedicated balance checkpoints.

| Mission | Power | Supports | Viewport | Outcome | Death Wave | Time | Damage | Coins | Weekly | Bombs | Ability | Peak hostile | Peak entities | Budget peak |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| M2 | low | none | mobile | clear | - | 55.2s | 1 | 72 | 2797 | 2 | 3 | 0 | 27 | 0.56x |
| M2 | low | none | desktop | clear | - | 58.6s | 1 | 51 | 2734 | 4 | 4 | 0 | 29 | 0.56x |
| M2 | low | paired | mobile | clear | - | 17.6s | 0 | 67 | 3566 | 1 | 2 | 0 | 79 | 0.41x |
| M2 | low | paired | desktop | clear | - | 19s | 0 | 49 | 3566 | 2 | 1 | 0 | 72 | 0.5x |
| M2 | expected | none | mobile | clear | - | 56.5s | 0 | 69 | 3528 | 2 | 4 | 0 | 29 | 0.5x |
| M2 | expected | none | desktop | clear | - | 70.2s | 2 | 57 | 2688 | 2 | 4 | 0 | 27 | 0.5x |
| M2 | expected | paired | mobile | clear | - | 18.3s | 0 | 54 | 3566 | 1 | 2 | 0 | 85 | 0.4x |
| M2 | expected | paired | desktop | clear | - | 18.9s | 0 | 54 | 3566 | 2 | 2 | 0 | 74 | 0.45x |
| M2 | upgraded | none | mobile | clear | - | 55.1s | 0 | 63 | 3511 | 2 | 4 | 0 | 30 | 0.5x |
| M2 | upgraded | none | desktop | clear | - | 59.8s | 0 | 64 | 3562 | 2 | 4 | 0 | 27 | 0.5x |
| M2 | upgraded | paired | mobile | clear | - | 16.9s | 0 | 69 | 3587 | 1 | 2 | 0 | 82 | 0.4x |
| M2 | upgraded | paired | desktop | clear | - | 18.8s | 0 | 59 | 3587 | 1 | 2 | 0 | 79 | 0.4x |
| M7 | low | none | mobile | clear | - | 73.3s | 1 | 81 | 3285 | 4 | 5 | 6 | 34 | 0.8x |
| M7 | low | none | desktop | death | 4 | 69.1s | 3 | 30 | 0 | 2 | 4 | 3 | 25 | 0.85x |
| M7 | low | paired | mobile | clear | - | 28s | 0 | 85 | 4041 | 2 | 2 | 0 | 81 | 0.82x |
| M7 | low | paired | desktop | clear | - | 19.8s | 0 | 70 | 4041 | 2 | 2 | 0 | 89 | 0.71x |
| M7 | expected | none | mobile | clear | - | 114s | 0 | 83 | 4062 | 3 | 7 | 3 | 32 | 0.8x |
| M7 | expected | none | desktop | death | 6 | 93.5s | 4 | 44 | 0 | 2 | 5 | 3 | 30 | 0.85x |
| M7 | expected | paired | mobile | clear | - | 34s | 0 | 80 | 4062 | 2 | 3 | 0 | 77 | 0.8x |
| M7 | expected | paired | desktop | clear | - | 31.4s | 0 | 48 | 4062 | 3 | 3 | 3 | 74 | 0.8x |
| M7 | upgraded | none | mobile | clear | - | 103.6s | 0 | 84 | 4083 | 2 | 7 | 3 | 30 | 1x |
| M7 | upgraded | none | desktop | clear | - | 91.2s | 0 | 65 | 4083 | 4 | 6 | 1 | 31 | 1x |
| M7 | upgraded | paired | mobile | clear | - | 26.2s | 0 | 77 | 4083 | 2 | 2 | 0 | 90 | 0.8x |
| M7 | upgraded | paired | desktop | clear | - | 36s | 0 | 56 | 4083 | 2 | 3 | 0 | 74 | 0.8x |

## Axis summary

| Axis | Value | Cell |
| --- | --- | --- |
| tier | low | 192/7/1; D0; C67; W4430; P54; E112 |
| tier | expected | 194/5/1; D0; C70; W4484; P54; E107 |
| tier | upgraded | 200/0/0; D0; C69; W4509; P54; E127 |
| support | none | 286/12/2; D0; C70; W4457; P54; E106 |
| support | paired | 300/0/0; D0; C69; W4488; P54; E127 |
| viewport | mobile | 295/5/0; D0; C83; W4484; P54; E127 |
| viewport | desktop | 291/7/2; D0; C62; W4470; P54; E112 |

## Findings

- Cells over the provisional 80-hostile-projectile readability ceiling: 0.
- Cells over the 1.25s first-visible-threat ceiling: 0.
- Cells over the 1s in-Wave visible-combat dead-air ceiling: 0.
- Cells that entered engine performance mode: 0.
- Cells that entered heavy-scene mode: 152.
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

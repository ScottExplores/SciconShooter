# Campaign Non-Boss Runtime Balance Matrix

Generated deterministically from Campaign revision 24 and the real `GameEngine` runtime.

## Result

The bounded autonomous sweep ran **600 trials** across **50 non-boss graph Missions**: 40 main-path Missions and 10 route alternatives. It produced **587 clears**, **13 deaths**, and **0 timeouts** (97.8% clear rate).

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
- Source digest: `609bd5eb44d46cdb92e620610abba64e54021b909f643000f362d8e2084b8140`.

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
| M1 ORBIT ENTRY | main | introduction | 12 | 12/0/0 | 41.5s | 0 | 34 | 2802 | 0.55s | 0.13s | 0 | 62 | 0 |
| M2 CITATION CROSSING | main | formation-remix | 12 | 12/0/0 | 55.1s | 0 | 58 | 3566 | 0.48s | 0.3s | 0 | 84 | 8 |
| M2B OPEN ORBIT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 66.8s | 0 | 54 | 3899 | 0.48s | 0.28s | 0 | 87 | 8 |
| M3 PAYWALL CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 21.9s | 1 | 38 | 2846 | 0.55s | 0.32s | 2 | 61 | 8 |
| M4 BASTION APPROACH | main | boss-preparation | 12 | 10/2/0 | 30.1s | 1 | 40 | 2778 | 0.12s | 0.93s | 2 | 63 | 12 |
| M6 HELIX SIGNAL | main | introduction | 12 | 12/0/0 | 50s | 0 | 47 | 3191 | 0.53s | 0.62s | 6 | 75 | 10 |
| M7 REDLINE CROSSING | main | formation-remix | 12 | 11/1/0 | 36.3s | 0 | 74 | 4062 | 0.53s | 0.37s | 6 | 82 | 12 |
| M7B REDLINE FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 84.9s | 0 | 78 | 4411 | 0.57s | 0.5s | 3 | 81 | 12 |
| M8 DARK MATTER CHECKPOINT | main | elite-checkpoint | 12 | 8/4/0 | 26.7s | 1 | 30 | 2011 | 0.25s | 0.38s | 31 | 72 | 12 |
| M9 MIRROR APPROACH | main | boss-preparation | 12 | 11/1/0 | 53.2s | 0 | 47 | 3149 | 0.47s | 0.62s | 54 | 104 | 12 |
| M11 SHARD SIGNAL | main | introduction | 12 | 12/0/0 | 20s | 0 | 49 | 3271 | 0.55s | 0.25s | 6 | 77 | 12 |
| M12 QUANTUM CROSSING | main | formation-remix | 12 | 12/0/0 | 30.9s | 0 | 87 | 4230 | 0.5s | 0.62s | 9 | 88 | 12 |
| M12B GRAVITY RIFT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 11/1/0 | 28.8s | 0 | 81 | 4593 | 0.52s | 0.62s | 10 | 87 | 12 |
| M13 GRAVITY CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 23.7s | 0 | 38 | 3113 | 0.13s | 0.28s | 29 | 74 | 12 |
| M14 EVENT HORIZON | main | boss-preparation | 12 | 12/0/0 | 28.8s | 0 | 49 | 4066 | 0.18s | 0.27s | 24 | 84 | 12 |
| M16 CRIMSON SIGNAL | main | introduction | 12 | 12/0/0 | 22s | 0 | 52 | 3927 | 1.05s | 0.62s | 3 | 78 | 12 |
| M17 ECLIPSE CROSSING | main | formation-remix | 12 | 12/0/0 | 44.1s | 0 | 115 | 5915 | 0.17s | 0.57s | 3 | 86 | 12 |
| M17B TERMINUS FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 42.4s | 0 | 87 | 5895 | 0.17s | 0.58s | 6 | 88 | 12 |
| M18 FRACTURE CHECKPOINT | main | elite-checkpoint | 12 | 10/2/0 | 29.3s | 2 | 37 | 2711 | 0.55s | 0.25s | 32 | 78 | 12 |
| M19 LAST LIGHT | main | boss-preparation | 12 | 12/0/0 | 30.7s | 0 | 70 | 4219 | 0.18s | 0.23s | 52 | 93 | 12 |
| M21 PRISM SIGNAL | main | introduction | 12 | 12/0/0 | 24.4s | 0 | 54 | 3967 | 0.48s | 0.37s | 6 | 85 | 12 |
| M22 SPECTRUM CROSSING | main | formation-remix | 12 | 12/0/0 | 50.6s | 0 | 114 | 5944 | 0.15s | 0.57s | 6 | 100 | 12 |
| M22B PRISM EXPANSE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 36.8s | 0 | 95 | 5936 | 0.2s | 0.55s | 6 | 110 | 12 |
| M23 BROOD CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 43.2s | 0 | 37 | 3451 | 0.45s | 0.17s | 28 | 81 | 12 |
| M24 LUMEN APPROACH | main | boss-preparation | 12 | 12/0/0 | 34.1s | 0 | 55 | 4219 | 0.18s | 0.28s | 2 | 96 | 12 |
| M26 RAIL SIGNAL | main | introduction | 12 | 12/0/0 | 18s | 0 | 56 | 3987 | 0.47s | 0.23s | 6 | 82 | 12 |
| M27 MERIDIAN CROSSING | main | formation-remix | 12 | 12/0/0 | 32.5s | 0 | 121 | 5948 | 0.17s | 0.98s | 6 | 107 | 12 |
| M27B RAIL MERIDIAN HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 40.2s | 0 | 101 | 5963 | 0.27s | 0.57s | 6 | 89 | 12 |
| M28 COIL CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 36.1s | 1 | 39 | 2771 | 0.35s | 0.17s | 30 | 84 | 12 |
| M29 SERPENT APPROACH | main | boss-preparation | 12 | 12/0/0 | 29.1s | 0 | 50 | 4261 | 0.18s | 0.25s | 29 | 92 | 12 |
| M31 GRAVITY SIGNAL | main | introduction | 12 | 12/0/0 | 27.2s | 0 | 63 | 4436 | 0.42s | 0.45s | 6 | 84 | 12 |
| M32 EVENTIDE CROSSING | main | formation-remix | 12 | 12/0/0 | 39.1s | 0 | 119 | 6214 | 0.2s | 0.55s | 6 | 102 | 12 |
| M32B SINGULARITY REACH HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 31s | 0 | 101 | 6275 | 0.2s | 0.55s | 3 | 89 | 12 |
| M33 WELL CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 20.9s | 0 | 42 | 3638 | 0.35s | 0.35s | 24 | 83 | 12 |
| M34 COLLAPSE APPROACH | main | boss-preparation | 12 | 12/0/0 | 28.7s | 0 | 64 | 4500 | 0.18s | 0.27s | 52 | 99 | 12 |
| M36 ORBIT SIGNAL | main | introduction | 12 | 12/0/0 | 27.3s | 0 | 68 | 4436 | 0.42s | 0.45s | 6 | 83 | 12 |
| M37 AXIS CROSSING | main | formation-remix | 12 | 12/0/0 | 36.9s | 0 | 139 | 6227 | 0.17s | 0.57s | 3 | 89 | 12 |
| M37B GYROSCOPE ARRAY HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 41.2s | 0 | 100 | 6220 | 0.2s | 0.62s | 6 | 92 | 12 |
| M38 GYRO CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 44.3s | 0 | 40 | 3618 | 0.35s | 0.27s | 54 | 106 | 12 |
| M39 ROTATION APPROACH | main | boss-preparation | 12 | 12/0/0 | 35.6s | 1 | 64 | 3744 | 0.23s | 0.33s | 32 | 91 | 12 |
| M41 SIEGE SIGNAL | main | introduction | 12 | 12/0/0 | 28.4s | 0 | 69 | 4436 | 0.45s | 0.53s | 6 | 85 | 12 |
| M42 BREACH CROSSING | main | formation-remix | 12 | 12/0/0 | 39.7s | 0 | 135 | 6227 | 0.2s | 0.55s | 3 | 103 | 12 |
| M42B HAMMERHEAD LINE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 11/1/0 | 29.6s | 0 | 107 | 6261 | 0.2s | 0.55s | 6 | 90 | 12 |
| M43 HAMMER CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 21.9s | 0 | 35 | 3638 | 0.35s | 0.3s | 2 | 88 | 12 |
| M44 DREAD APPROACH | main | boss-preparation | 12 | 12/0/0 | 54.3s | 1 | 60 | 4500 | 0.18s | 0.18s | 27 | 89 | 12 |
| M46 FRONTIER SIGNAL | main | introduction | 12 | 12/0/0 | 29.5s | 0 | 63 | 4436 | 0.23s | 0.63s | 6 | 85 | 12 |
| M47 CLAW CROSSING | main | formation-remix | 12 | 12/0/0 | 36.2s | 0 | 121 | 6227 | 0.13s | 0.65s | 6 | 115 | 12 |
| M47B CROWNCLAW FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 36.7s | 0 | 100 | 6234 | 0.2s | 0.58s | 6 | 92 | 12 |
| M48 CROWN CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 42.6s | 0 | 41 | 3638 | 0.45s | 0.2s | 30 | 89 | 12 |
| M49 REDLINE APPROACH | main | boss-preparation | 12 | 12/0/0 | 27.1s | 0 | 65 | 4500 | 0.18s | 0.25s | 52 | 106 | 12 |

## M2 and M7 detailed checkpoints

These early formation-remix Missions are expanded cell-by-cell because the Campaign brief calls them out as dedicated balance checkpoints.

| Mission | Power | Supports | Viewport | Outcome | Death Wave | Time | Damage | Coins | Weekly | Bombs | Ability | Peak hostile | Peak entities | Budget peak |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| M2 | low | none | mobile | clear | - | 63.1s | 0 | 58 | 3515 | 2 | 4 | 0 | 29 | 0.5x |
| M2 | low | none | desktop | clear | - | 76.7s | 1 | 43 | 2684 | 2 | 5 | 0 | 26 | 0.56x |
| M2 | low | paired | mobile | clear | - | 17.6s | 0 | 67 | 3566 | 1 | 2 | 0 | 79 | 0.41x |
| M2 | low | paired | desktop | clear | - | 19s | 0 | 49 | 3566 | 2 | 1 | 0 | 72 | 0.5x |
| M2 | expected | none | mobile | clear | - | 56.5s | 0 | 69 | 3528 | 2 | 4 | 0 | 29 | 0.5x |
| M2 | expected | none | desktop | clear | - | 69.8s | 0 | 50 | 3478 | 2 | 5 | 0 | 26 | 0.5x |
| M2 | expected | paired | mobile | clear | - | 18.3s | 0 | 54 | 3566 | 1 | 2 | 0 | 84 | 0.4x |
| M2 | expected | paired | desktop | clear | - | 18.9s | 0 | 54 | 3566 | 2 | 2 | 0 | 73 | 0.45x |
| M2 | upgraded | none | mobile | clear | - | 55.1s | 0 | 63 | 3511 | 2 | 4 | 0 | 31 | 0.5x |
| M2 | upgraded | none | desktop | clear | - | 61.8s | 0 | 57 | 3511 | 2 | 4 | 0 | 27 | 0.5x |
| M2 | upgraded | paired | mobile | clear | - | 16.9s | 0 | 69 | 3587 | 1 | 2 | 0 | 82 | 0.4x |
| M2 | upgraded | paired | desktop | clear | - | 18.8s | 0 | 59 | 3587 | 1 | 2 | 0 | 80 | 0.4x |
| M7 | low | none | mobile | clear | - | 96s | 1 | 74 | 3306 | 2 | 6 | 3 | 40 | 0.8x |
| M7 | low | none | desktop | death | 4 | 80.7s | 3 | 35 | 0 | 2 | 5 | 6 | 26 | 0.85x |
| M7 | low | paired | mobile | clear | - | 25.6s | 0 | 80 | 4041 | 3 | 2 | 3 | 78 | 0.8x |
| M7 | low | paired | desktop | clear | - | 32.7s | 0 | 54 | 4041 | 2 | 2 | 3 | 73 | 0.72x |
| M7 | expected | none | mobile | clear | - | 106.5s | 0 | 85 | 4083 | 3 | 6 | 6 | 34 | 1x |
| M7 | expected | none | desktop | clear | - | 127.5s | 0 | 61 | 4083 | 4 | 7 | 3 | 29 | 1x |
| M7 | expected | paired | mobile | clear | - | 24.6s | 0 | 88 | 4062 | 3 | 2 | 0 | 82 | 0.79x |
| M7 | expected | paired | desktop | clear | - | 34s | 0 | 57 | 4062 | 2 | 3 | 0 | 69 | 0.78x |
| M7 | upgraded | none | mobile | clear | - | 83.3s | 2 | 85 | 3306 | 3 | 6 | 3 | 32 | 0.89x |
| M7 | upgraded | none | desktop | clear | - | 49s | 0 | 60 | 4083 | 3 | 4 | 1 | 56 | 1x |
| M7 | upgraded | paired | mobile | clear | - | 28.6s | 0 | 85 | 4083 | 2 | 2 | 3 | 81 | 0.82x |
| M7 | upgraded | paired | desktop | clear | - | 36.3s | 0 | 56 | 4083 | 2 | 3 | 0 | 70 | 0.75x |

## Axis summary

| Axis | Value | Cell |
| --- | --- | --- |
| tier | low | 192/8/0; D0; C56; W3947; P54; E104 |
| tier | expected | 195/5/0; D0; C60; W4219; P54; E107 |
| tier | upgraded | 200/0/0; D0; C62; W4230; P54; E115 |
| support | none | 287/13/0; D0; C60; W4045; P54; E93 |
| support | paired | 300/0/0; D0; C59; W4219; P54; E115 |
| viewport | mobile | 295/5/0; D0; C69; W4198; P52; E115 |
| viewport | desktop | 292/8/0; D0; C52; W4083; P54; E106 |

## Findings

- Cells over the provisional 80-hostile-projectile readability ceiling: 0.
- Cells over the 1.25s first-visible-threat ceiling: 0.
- Cells over the 1s in-Wave visible-combat dead-air ceiling: 0.
- Cells that entered engine performance mode: 0.
- Cells that entered heavy-scene mode: 150.
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

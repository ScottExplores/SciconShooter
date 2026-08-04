# Campaign Non-Boss Runtime Balance Matrix

Generated deterministically from Campaign revision 24 and the real `GameEngine` runtime.

## Result

The bounded autonomous sweep ran **600 trials** across **50 non-boss graph Missions**: 40 main-path Missions and 10 route alternatives. It produced **588 clears**, **11 deaths**, and **1 timeouts** (98% clear rate).

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
- Source digest: `c13c412dcfd32c078b4ebdfd3987a55930af1d5c4e5b736a13ca7a5fbe3c707b`.

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
| M1 ORBIT ENTRY | main | introduction | 12 | 12/0/0 | 47.3s | 0 | 35 | 2802 | 0.55s | 0.32s | 0 | 61 | 0 |
| M2 CITATION CROSSING | main | formation-remix | 12 | 12/0/0 | 55.1s | 0 | 58 | 3566 | 0.48s | 0.2s | 0 | 85 | 8 |
| M2B OPEN ORBIT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 71.9s | 0 | 56 | 3899 | 0.48s | 0.22s | 0 | 87 | 8 |
| M3 PAYWALL CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 21.9s | 1 | 39 | 2846 | 0.55s | 0.32s | 2 | 61 | 8 |
| M4 BASTION APPROACH | main | boss-preparation | 12 | 10/2/0 | 31.1s | 1 | 44 | 2778 | 0.12s | 0.93s | 2 | 63 | 12 |
| M6 HELIX SIGNAL | main | introduction | 12 | 12/0/0 | 69.5s | 0 | 46 | 3191 | 0.53s | 0.52s | 4 | 74 | 10 |
| M7 REDLINE CROSSING | main | formation-remix | 12 | 11/1/0 | 37.1s | 0 | 76 | 4062 | 0.53s | 0.5s | 6 | 81 | 12 |
| M7B REDLINE FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 75s | 0 | 78 | 4411 | 0.57s | 0.52s | 3 | 86 | 12 |
| M8 DARK MATTER CHECKPOINT | main | elite-checkpoint | 12 | 9/3/0 | 26.7s | 1 | 30 | 2011 | 0.25s | 0.38s | 31 | 72 | 12 |
| M9 MIRROR APPROACH | main | boss-preparation | 12 | 12/0/0 | 57.9s | 1 | 45 | 3149 | 0.47s | 0.62s | 54 | 105 | 12 |
| M11 SHARD SIGNAL | main | introduction | 12 | 12/0/0 | 19.6s | 0 | 48 | 3271 | 0.55s | 0.35s | 6 | 77 | 12 |
| M12 QUANTUM CROSSING | main | formation-remix | 12 | 12/0/0 | 29.8s | 0 | 82 | 4230 | 0.5s | 0.62s | 8 | 85 | 12 |
| M12B GRAVITY RIFT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 11/1/0 | 32.8s | 0 | 85 | 4593 | 0.52s | 0.57s | 8 | 87 | 12 |
| M13 GRAVITY CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 21.9s | 0 | 38 | 3093 | 0.13s | 0.15s | 29 | 73 | 12 |
| M14 EVENT HORIZON | main | boss-preparation | 12 | 11/1/0 | 27.2s | 0 | 52 | 4066 | 0.18s | 0.3s | 24 | 84 | 12 |
| M16 CRIMSON SIGNAL | main | introduction | 12 | 12/0/0 | 22s | 0 | 52 | 3927 | 1.05s | 0.62s | 3 | 77 | 12 |
| M17 ECLIPSE CROSSING | main | formation-remix | 12 | 12/0/0 | 38.8s | 0 | 118 | 5927 | 0.2s | 0.57s | 6 | 81 | 12 |
| M17B TERMINUS FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 43.3s | 0 | 95 | 5931 | 0.17s | 0.67s | 6 | 85 | 12 |
| M18 FRACTURE CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 29s | 2 | 38 | 2711 | 0.55s | 0.25s | 32 | 79 | 12 |
| M19 LAST LIGHT | main | boss-preparation | 12 | 12/0/0 | 30s | 0 | 64 | 4198 | 0.18s | 0.23s | 52 | 91 | 12 |
| M21 PRISM SIGNAL | main | introduction | 12 | 12/0/0 | 24.5s | 0 | 55 | 3967 | 0.48s | 0.37s | 6 | 85 | 12 |
| M22 SPECTRUM CROSSING | main | formation-remix | 12 | 12/0/0 | 50.9s | 0 | 114 | 5948 | 0.17s | 0.57s | 6 | 102 | 12 |
| M22B PRISM EXPANSE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 36.8s | 0 | 91 | 5936 | 0.2s | 0.55s | 6 | 111 | 12 |
| M23 BROOD CHECKPOINT | main | elite-checkpoint | 12 | 11/0/1 | 43.2s | 0 | 36 | 3451 | 0.45s | 0.17s | 27 | 81 | 12 |
| M24 LUMEN APPROACH | main | boss-preparation | 12 | 12/0/0 | 32.9s | 0 | 56 | 4219 | 0.18s | 0.28s | 2 | 97 | 12 |
| M26 RAIL SIGNAL | main | introduction | 12 | 12/0/0 | 19s | 0 | 57 | 3987 | 0.47s | 0.23s | 6 | 82 | 12 |
| M27 MERIDIAN CROSSING | main | formation-remix | 12 | 12/0/0 | 35.7s | 0 | 115 | 5965 | 0.17s | 0.55s | 6 | 110 | 12 |
| M27B RAIL MERIDIAN HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 37.8s | 0 | 94 | 5963 | 0.2s | 0.57s | 6 | 84 | 12 |
| M28 COIL CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 40.8s | 1 | 37 | 3451 | 0.35s | 0.17s | 30 | 82 | 12 |
| M29 SERPENT APPROACH | main | boss-preparation | 12 | 12/0/0 | 28.6s | 0 | 55 | 4261 | 0.18s | 0.18s | 29 | 92 | 12 |
| M31 GRAVITY SIGNAL | main | introduction | 12 | 12/0/0 | 28.8s | 0 | 66 | 4436 | 0.42s | 0.45s | 6 | 84 | 12 |
| M32 EVENTIDE CROSSING | main | formation-remix | 12 | 12/0/0 | 38.4s | 0 | 112 | 6197 | 0.2s | 0.55s | 3 | 100 | 12 |
| M32B SINGULARITY REACH HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 32.3s | 0 | 106 | 6256 | 0.2s | 0.55s | 6 | 90 | 12 |
| M33 WELL CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 22.2s | 0 | 40 | 3638 | 0.35s | 0.35s | 24 | 83 | 12 |
| M34 COLLAPSE APPROACH | main | boss-preparation | 12 | 12/0/0 | 28.1s | 0 | 66 | 4500 | 0.18s | 0.4s | 52 | 99 | 12 |
| M36 ORBIT SIGNAL | main | introduction | 12 | 12/0/0 | 26.4s | 0 | 66 | 4436 | 0.42s | 0.45s | 6 | 83 | 12 |
| M37 AXIS CROSSING | main | formation-remix | 12 | 12/0/0 | 37.8s | 0 | 136 | 6227 | 0.17s | 0.57s | 6 | 89 | 12 |
| M37B GYROSCOPE ARRAY HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 34.9s | 0 | 103 | 6247 | 0.2s | 0.55s | 3 | 92 | 12 |
| M38 GYRO CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 44.1s | 0 | 42 | 3618 | 0.35s | 0.27s | 54 | 108 | 12 |
| M39 ROTATION APPROACH | main | boss-preparation | 12 | 12/0/0 | 43.9s | 1 | 66 | 3744 | 0.23s | 0.33s | 32 | 87 | 12 |
| M41 SIEGE SIGNAL | main | introduction | 12 | 12/0/0 | 27.6s | 0 | 66 | 4436 | 0.45s | 0.53s | 6 | 86 | 12 |
| M42 BREACH CROSSING | main | formation-remix | 12 | 12/0/0 | 34.1s | 0 | 128 | 6239 | 0.2s | 0.55s | 6 | 100 | 12 |
| M42B HAMMERHEAD LINE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 32.9s | 0 | 110 | 6234 | 0.2s | 0.55s | 3 | 89 | 12 |
| M43 HAMMER CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 23.3s | 0 | 37 | 3638 | 0.35s | 0.3s | 2 | 88 | 12 |
| M44 DREAD APPROACH | main | boss-preparation | 12 | 12/0/0 | 39.4s | 0 | 64 | 4500 | 0.18s | 0.27s | 26 | 89 | 12 |
| M46 FRONTIER SIGNAL | main | introduction | 12 | 12/0/0 | 27.8s | 0 | 64 | 4436 | 0.2s | 0.63s | 6 | 86 | 12 |
| M47 CLAW CROSSING | main | formation-remix | 12 | 12/0/0 | 36.3s | 0 | 122 | 6239 | 0.18s | 0.65s | 6 | 116 | 12 |
| M47B CROWNCLAW FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 37.8s | 0 | 108 | 6206 | 0.2s | 0.58s | 6 | 92 | 12 |
| M48 CROWN CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 42.6s | 0 | 38 | 3638 | 0.45s | 0.2s | 30 | 89 | 12 |
| M49 REDLINE APPROACH | main | boss-preparation | 12 | 12/0/0 | 26.2s | 0 | 62 | 4500 | 0.18s | 0.23s | 52 | 102 | 12 |

## M2 and M7 detailed checkpoints

These early formation-remix Missions are expanded cell-by-cell because the Campaign brief calls them out as dedicated balance checkpoints.

| Mission | Power | Supports | Viewport | Outcome | Death Wave | Time | Damage | Coins | Weekly | Bombs | Ability | Peak hostile | Peak entities | Budget peak |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| M2 | low | none | mobile | clear | - | 63.1s | 0 | 58 | 3515 | 2 | 4 | 0 | 29 | 0.5x |
| M2 | low | none | desktop | clear | - | 76.7s | 1 | 43 | 2684 | 2 | 5 | 0 | 26 | 0.56x |
| M2 | low | paired | mobile | clear | - | 17.6s | 0 | 67 | 3566 | 1 | 2 | 0 | 80 | 0.41x |
| M2 | low | paired | desktop | clear | - | 19s | 0 | 49 | 3566 | 2 | 1 | 0 | 72 | 0.5x |
| M2 | expected | none | mobile | clear | - | 55.1s | 0 | 72 | 3528 | 2 | 4 | 0 | 31 | 0.5x |
| M2 | expected | none | desktop | clear | - | 70.4s | 0 | 44 | 3490 | 2 | 5 | 0 | 29 | 0.5x |
| M2 | expected | paired | mobile | clear | - | 18.3s | 0 | 54 | 3566 | 1 | 2 | 0 | 85 | 0.4x |
| M2 | expected | paired | desktop | clear | - | 18.8s | 0 | 54 | 3566 | 2 | 2 | 0 | 75 | 0.45x |
| M2 | upgraded | none | mobile | clear | - | 56.9s | 0 | 60 | 3524 | 2 | 4 | 0 | 30 | 0.5x |
| M2 | upgraded | none | desktop | clear | - | 69.4s | 0 | 48 | 3461 | 2 | 5 | 0 | 26 | 0.5x |
| M2 | upgraded | paired | mobile | clear | - | 16.9s | 0 | 69 | 3587 | 1 | 2 | 0 | 81 | 0.4x |
| M2 | upgraded | paired | desktop | clear | - | 18.8s | 0 | 59 | 3587 | 1 | 2 | 0 | 80 | 0.4x |
| M7 | low | none | mobile | clear | - | 73.8s | 1 | 76 | 3285 | 3 | 5 | 3 | 42 | 0.8x |
| M7 | low | none | desktop | death | 7 | 157.1s | 3 | 64 | 0 | 3 | 7 | 3 | 30 | 0.93x |
| M7 | low | paired | mobile | clear | - | 25.6s | 0 | 80 | 4041 | 3 | 2 | 3 | 78 | 0.8x |
| M7 | low | paired | desktop | clear | - | 32.7s | 0 | 54 | 4041 | 2 | 2 | 3 | 73 | 0.72x |
| M7 | expected | none | mobile | clear | - | 104.9s | 1 | 89 | 3306 | 2 | 6 | 3 | 30 | 0.8x |
| M7 | expected | none | desktop | clear | - | 121.2s | 0 | 61 | 4062 | 4 | 7 | 3 | 32 | 0.89x |
| M7 | expected | paired | mobile | clear | - | 25.5s | 0 | 80 | 4062 | 2 | 2 | 0 | 81 | 0.75x |
| M7 | expected | paired | desktop | clear | - | 34s | 0 | 57 | 4062 | 2 | 3 | 0 | 69 | 0.78x |
| M7 | upgraded | none | mobile | clear | - | 100.4s | 1 | 92 | 3327 | 3 | 7 | 6 | 32 | 1x |
| M7 | upgraded | none | desktop | clear | - | 71.5s | 0 | 69 | 4083 | 4 | 5 | 3 | 37 | 0.8x |
| M7 | upgraded | paired | mobile | clear | - | 28.6s | 0 | 85 | 4083 | 2 | 2 | 3 | 81 | 0.82x |
| M7 | upgraded | paired | desktop | clear | - | 37.1s | 0 | 59 | 4083 | 2 | 3 | 0 | 72 | 0.75x |

## Axis summary

| Axis | Value | Cell |
| --- | --- | --- |
| tier | low | 191/8/1; D0; C58; W4024; P54; E105 |
| tier | expected | 197/3/0; D0; C60; W4219; P54; E110 |
| tier | upgraded | 200/0/0; D0; C62; W4251; P54; E116 |
| support | none | 288/11/1; D0; C61; W4045; P54; E94 |
| support | paired | 300/0/0; D0; C59; W4219; P54; E116 |
| viewport | mobile | 295/5/0; D0; C67; W4219; P54; E116 |
| viewport | desktop | 293/6/1; D0; C52; W4083; P54; E108 |

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

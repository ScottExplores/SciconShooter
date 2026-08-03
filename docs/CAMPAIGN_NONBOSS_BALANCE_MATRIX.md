# Campaign Non-Boss Runtime Balance Matrix

Generated deterministically from Campaign revision 24 and the real `GameEngine` runtime.

## Result

The bounded autonomous sweep ran **600 trials** across **50 non-boss graph Missions**: 40 main-path Missions and 10 route alternatives. It produced **587 clears**, **11 deaths**, and **2 timeouts** (97.8% clear rate).

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
- Source digest: `1f7bf3590ba42f3f52ccbca2b5fa733324f9ed8e286b4185a1d772eda28f198c`.

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
| M1 ORBIT ENTRY | main | introduction | 12 | 12/0/0 | 43.8s | 0 | 28 | 2802 | 0.72s | 0.8s | 0 | 61 | 0 |
| M2 CITATION CROSSING | main | formation-remix | 12 | 12/0/0 | 49.1s | 0 | 61 | 3566 | 0.63s | 0.62s | 0 | 74 | 8 |
| M2B OPEN ORBIT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 71.4s | 0 | 62 | 3899 | 0.53s | 0.57s | 0 | 71 | 8 |
| M3 PAYWALL CHECKPOINT | main | elite-checkpoint | 12 | 8/4/0 | 21.6s | 0 | 36 | 2846 | 0.55s | 0.6s | 2 | 59 | 8 |
| M4 BASTION APPROACH | main | boss-preparation | 12 | 10/2/0 | 35.8s | 1 | 43 | 2778 | 0.32s | 0.88s | 2 | 65 | 12 |
| M6 HELIX SIGNAL | main | introduction | 12 | 12/0/0 | 56.9s | 0 | 45 | 3191 | 0.6s | 0.63s | 6 | 65 | 9 |
| M7 REDLINE CROSSING | main | formation-remix | 12 | 12/0/0 | 41.7s | 0 | 85 | 4062 | 0.55s | 0.7s | 3 | 75 | 12 |
| M7B REDLINE FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 11/1/0 | 38.6s | 0 | 80 | 4411 | 0.55s | 0.7s | 6 | 71 | 12 |
| M8 DARK MATTER CHECKPOINT | main | elite-checkpoint | 12 | 9/1/2 | 34.3s | 0 | 35 | 2731 | 0.68s | 0.75s | 30 | 67 | 12 |
| M9 MIRROR APPROACH | main | boss-preparation | 12 | 10/2/0 | 50.9s | 0 | 44 | 3170 | 0.62s | 0.67s | 54 | 108 | 12 |
| M11 SHARD SIGNAL | main | introduction | 12 | 12/0/0 | 32.8s | 0 | 49 | 3271 | 0.65s | 0.85s | 6 | 68 | 12 |
| M12 QUANTUM CROSSING | main | formation-remix | 12 | 12/0/0 | 43.6s | 0 | 91 | 4230 | 0.43s | 0.63s | 6 | 77 | 12 |
| M12B GRAVITY RIFT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 11/1/0 | 40.6s | 0 | 90 | 4593 | 0.3s | 0.65s | 9 | 78 | 12 |
| M13 GRAVITY CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 31.1s | 0 | 33 | 3093 | 0.38s | 0.52s | 29 | 66 | 12 |
| M14 EVENT HORIZON | main | boss-preparation | 12 | 12/0/0 | 50.3s | 0 | 58 | 4061 | 0.65s | 0.92s | 24 | 68 | 12 |
| M16 CRIMSON SIGNAL | main | introduction | 12 | 12/0/0 | 40.2s | 0 | 57 | 3927 | 0.65s | 0.67s | 6 | 73 | 12 |
| M17 ECLIPSE CROSSING | main | formation-remix | 12 | 12/0/0 | 42.3s | 0 | 87 | 5467 | 0.43s | 0.58s | 6 | 85 | 12 |
| M17B TERMINUS FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 48.5s | 0 | 101 | 5913 | 0.37s | 0.5s | 3 | 80 | 12 |
| M18 FRACTURE CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 40.8s | 2 | 46 | 3151 | 0.37s | 0.68s | 32 | 74 | 12 |
| M19 LAST LIGHT | main | boss-preparation | 12 | 12/0/0 | 36.5s | 0 | 64 | 4198 | 0.72s | 0.57s | 52 | 97 | 12 |
| M21 PRISM SIGNAL | main | introduction | 12 | 12/0/0 | 30.9s | 0 | 58 | 3967 | 0.77s | 0.73s | 6 | 71 | 12 |
| M22 SPECTRUM CROSSING | main | formation-remix | 12 | 12/0/0 | 45s | 0 | 94 | 5488 | 0.4s | 0.8s | 6 | 82 | 12 |
| M22B PRISM EXPANSE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 45.5s | 2 | 94 | 5876 | 0.48s | 0.72s | 6 | 89 | 12 |
| M23 BROOD CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 51.6s | 0 | 48 | 3451 | 0.4s | 0.78s | 25 | 74 | 12 |
| M24 LUMEN APPROACH | main | boss-preparation | 12 | 12/0/0 | 37.7s | 0 | 64 | 4219 | 0.72s | 0.65s | 2 | 76 | 12 |
| M26 RAIL SIGNAL | main | introduction | 12 | 12/0/0 | 28.3s | 0 | 62 | 3987 | 0.73s | 0.6s | 6 | 72 | 12 |
| M27 MERIDIAN CROSSING | main | formation-remix | 12 | 12/0/0 | 40s | 0 | 99 | 5509 | 1.22s | 0.78s | 9 | 87 | 12 |
| M27B RAIL MERIDIAN HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 39.6s | 0 | 104 | 5954 | 0.5s | 0.58s | 6 | 88 | 12 |
| M28 COIL CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 47.4s | 0 | 49 | 3471 | 0.4s | 0.58s | 30 | 78 | 12 |
| M29 SERPENT APPROACH | main | boss-preparation | 12 | 12/0/0 | 31.8s | 0 | 66 | 4240 | 0.77s | 0.52s | 29 | 76 | 12 |
| M31 GRAVITY SIGNAL | main | introduction | 12 | 12/0/0 | 29s | 0 | 65 | 4154 | 0.72s | 0.7s | 6 | 75 | 12 |
| M32 EVENTIDE CROSSING | main | formation-remix | 12 | 12/0/0 | 33.5s | 0 | 106 | 5737 | 0.4s | 0.82s | 3 | 88 | 12 |
| M32B SINGULARITY REACH HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 40.6s | 0 | 110 | 6261 | 0.4s | 0.78s | 6 | 88 | 12 |
| M33 WELL CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 28.5s | 0 | 49 | 3670 | 0.38s | 0.68s | 24 | 80 | 12 |
| M34 COLLAPSE APPROACH | main | boss-preparation | 12 | 12/0/0 | 35s | 0 | 74 | 4500 | 0.72s | 0.65s | 52 | 102 | 12 |
| M36 ORBIT SIGNAL | main | introduction | 12 | 12/0/0 | 27.4s | 0 | 63 | 4154 | 0.68s | 0.57s | 3 | 77 | 12 |
| M37 AXIS CROSSING | main | formation-remix | 12 | 12/0/0 | 40.7s | 0 | 102 | 5779 | 0.38s | 0.53s | 6 | 93 | 12 |
| M37B GYROSCOPE ARRAY HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 45.2s | 2 | 113 | 5963 | 0.4s | 0.52s | 6 | 88 | 12 |
| M38 GYRO CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 48.7s | 0 | 47 | 3618 | 0.4s | 0.63s | 54 | 107 | 12 |
| M39 ROTATION APPROACH | main | boss-preparation | 12 | 12/0/0 | 41s | 2 | 69 | 3744 | 0.72s | 0.93s | 32 | 84 | 12 |
| M41 SIEGE SIGNAL | main | introduction | 12 | 12/0/0 | 27.9s | 0 | 65 | 4154 | 0.52s | 0.58s | 0 | 79 | 12 |
| M42 BREACH CROSSING | main | formation-remix | 12 | 12/0/0 | 40s | 0 | 96 | 5779 | 0.4s | 0.72s | 6 | 101 | 12 |
| M42B HAMMERHEAD LINE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 39.6s | 0 | 114 | 6223 | 0.4s | 0.53s | 6 | 93 | 12 |
| M43 HAMMER CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 27.8s | 0 | 41 | 3638 | 0.55s | 0.98s | 2 | 77 | 12 |
| M44 DREAD APPROACH | main | boss-preparation | 12 | 12/0/0 | 40.3s | 0 | 69 | 4500 | 0.67s | 0.53s | 26 | 84 | 12 |
| M46 FRONTIER SIGNAL | main | introduction | 12 | 12/0/0 | 26.8s | 0 | 68 | 4154 | 0.67s | 0.7s | 3 | 74 | 12 |
| M47 CLAW CROSSING | main | formation-remix | 12 | 12/0/0 | 41.4s | 0 | 104 | 5779 | 0.4s | 0.72s | 6 | 96 | 12 |
| M47B CROWNCLAW FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 45.3s | 3 | 103 | 5353 | 0.48s | 0.48s | 6 | 90 | 12 |
| M48 CROWN CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 42.5s | 0 | 50 | 3638 | 0.47s | 0.7s | 30 | 91 | 12 |
| M49 REDLINE APPROACH | main | boss-preparation | 12 | 12/0/0 | 32.7s | 0 | 74 | 4500 | 0.75s | 0.48s | 52 | 100 | 12 |

## M2 and M7 detailed checkpoints

These early formation-remix Missions are expanded cell-by-cell because the Campaign brief calls them out as dedicated balance checkpoints.

| Mission | Power | Supports | Viewport | Outcome | Death Wave | Time | Damage | Coins | Weekly | Bombs | Ability | Peak hostile | Peak entities | Budget peak |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| M2 | low | none | mobile | clear | - | 54.2s | 1 | 64 | 2785 | 2 | 4 | 0 | 30 | 0.65x |
| M2 | low | none | desktop | clear | - | 73.7s | 1 | 52 | 2734 | 2 | 5 | 0 | 26 | 0.65x |
| M2 | low | paired | mobile | clear | - | 21.2s | 0 | 61 | 3566 | 0 | 1 | 0 | 74 | 0.35x |
| M2 | low | paired | desktop | clear | - | 24.3s | 0 | 51 | 3566 | 1 | 2 | 0 | 67 | 0.4x |
| M2 | expected | none | mobile | clear | - | 52.1s | 1 | 72 | 2797 | 2 | 4 | 0 | 30 | 0.65x |
| M2 | expected | none | desktop | clear | - | 68.9s | 2 | 48 | 2726 | 3 | 4 | 0 | 30 | 0.6x |
| M2 | expected | paired | mobile | clear | - | 21.9s | 0 | 67 | 3566 | 0 | 1 | 0 | 73 | 0.35x |
| M2 | expected | paired | desktop | clear | - | 27.1s | 0 | 40 | 3566 | 1 | 2 | 0 | 69 | 0.45x |
| M2 | upgraded | none | mobile | clear | - | 49.1s | 0 | 66 | 3587 | 3 | 3 | 0 | 30 | 0.65x |
| M2 | upgraded | none | desktop | clear | - | 70.3s | 0 | 47 | 3499 | 3 | 5 | 0 | 32 | 0.65x |
| M2 | upgraded | paired | mobile | clear | - | 21.2s | 0 | 67 | 3587 | 0 | 1 | 0 | 72 | 0.33x |
| M2 | upgraded | paired | desktop | clear | - | 21.7s | 0 | 58 | 3587 | 2 | 2 | 0 | 64 | 0.5x |
| M7 | low | none | mobile | clear | - | 54.7s | 1 | 90 | 3285 | 4 | 4 | 1 | 40 | 0.75x |
| M7 | low | none | desktop | clear | - | 125.4s | 2 | 60 | 3285 | 2 | 8 | 3 | 29 | 0.96x |
| M7 | low | paired | mobile | clear | - | 32.8s | 0 | 89 | 4041 | 2 | 2 | 0 | 70 | 0.68x |
| M7 | low | paired | desktop | clear | - | 39.9s | 0 | 56 | 4041 | 2 | 2 | 0 | 64 | 0.6x |
| M7 | expected | none | mobile | clear | - | 41.7s | 0 | 106 | 4062 | 3 | 3 | 0 | 32 | 0.72x |
| M7 | expected | none | desktop | clear | - | 124.6s | 1 | 65 | 3306 | 3 | 6 | 3 | 28 | 0.89x |
| M7 | expected | paired | mobile | clear | - | 33.9s | 0 | 93 | 4062 | 2 | 2 | 0 | 70 | 0.65x |
| M7 | expected | paired | desktop | clear | - | 36.6s | 0 | 67 | 4062 | 3 | 2 | 0 | 64 | 0.6x |
| M7 | upgraded | none | mobile | clear | - | 82s | 1 | 85 | 3348 | 4 | 5 | 3 | 34 | 0.89x |
| M7 | upgraded | none | desktop | clear | - | 132.3s | 0 | 62 | 4104 | 2 | 8 | 3 | 31 | 0.96x |
| M7 | upgraded | paired | mobile | clear | - | 33.7s | 0 | 90 | 4104 | 2 | 2 | 0 | 69 | 0.68x |
| M7 | upgraded | paired | desktop | clear | - | 34.2s | 0 | 68 | 4083 | 2 | 2 | 0 | 75 | 0.6x |

## Axis summary

| Axis | Value | Cell |
| --- | --- | --- |
| tier | low | 193/6/1; D0; C61; W4041; P54; E108 |
| tier | expected | 194/5/1; D0; C63; W4154; P54; E106 |
| tier | upgraded | 200/0/0; D0; C60; W4154; P54; E107 |
| support | none | 287/11/2; D0; C61; W3987; P54; E86 |
| support | paired | 300/0/0; D0; C62; W4154; P54; E108 |
| viewport | mobile | 294/6/0; D0; C69; W4154; P52; E101 |
| viewport | desktop | 293/5/2; D0; C55; W4083; P54; E108 |

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

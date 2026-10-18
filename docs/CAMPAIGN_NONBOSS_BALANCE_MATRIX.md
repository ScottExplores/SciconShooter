# Campaign Non-Boss Runtime Balance Matrix

Generated deterministically from Campaign revision 26 and the real `GameEngine` runtime.

## Result

The bounded autonomous sweep ran **600 trials** across **50 non-boss graph Missions**: 40 main-path Missions and 10 route alternatives. It produced **598 clears**, **0 deaths**, and **2 timeouts** (99.7% clear rate).

The deterministic non-boss matrix found at least one clear route for every covered Mission. This is automated evidence only; human mobile/desktop approval is still required.

## Method

Command:

```text
node tools/simulate-campaign-nonboss-balance.mjs --write
```

- Runtime: production `GameEngine`, normal Campaign mode, real collisions, non-invincible player, passive primary fire, and authored internal-Wave transitions.
- Display hosts: mobile `390x844` and desktop `1280x720`; both resolve through the production fair-arena layout into the same `390x844` simulation world. These axes prove simulation parity, not renderer performance.
- Loadouts: controlled low/minimum, expected, and upgraded/comfortable recommended-power fixtures use the same deterministic Hangar allocation as the boss matrix. Current Campaign flight and wing controllers are enabled. This is a balance stress matrix, not an earned-unlock or affordability simulation.
- Supports: no companions and no research, or level-5 Prism Skimmer + Beacon Kite with the corresponding rank-4 Support research bonuses. Other research branches remain at zero. First-flight wing arrival applies in Mission 1; auto-cast is enabled.
- Controller: deterministic eight-frame lane planner that prioritizes shooters/elites, projects hostile travel lanes, balances projectile/body risk against capped vertical-shot alignment cost, collects nearby coins, uses Research Charge when aligned, and reserves bombs for dense or imminent-danger states.
- Acceleration boundary: presentation-only background, particle-burst, floating-text, ring, explosion-art, and afterimage pools are disabled; scheduling, movement, collision, damage, drops, companions, and fixed-step gameplay remain the production engine paths.
- Maximum simulated Mission time: 180 seconds.
- Weekly points: the same current App adaptation used for a completed Weekly node (regular kills from the Mission summary, authored mini-boss count, no inferred accuracy, mastery-objective quality), evaluated as a standalone node with no previous-node streak bonus.
- Rendering/FPS: Pixi rendering is intentionally absent. Entity, hostile-projectile, active-firing-enemy, performance-budget, and engine performance-mode peaks are recorded instead.
- Source digest: `8f51d828f154f975fdaa4045fffb3a75bca7424eb6d57766b03fc17918fc91ca`.

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
| M1 ORBIT ENTRY | main | introduction | 12 | 12/0/0 | 39.1s | 0 | 63 | 3080 | 0.52s | 0.28s | 7 | 61 | 6 |
| M2 CITATION CROSSING | main | formation-remix | 12 | 12/0/0 | 37.1s | 0 | 73 | 3087 | 0.95s | 0.3s | 8 | 72 | 8 |
| M2B OPEN ORBIT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 43.1s | 0 | 89 | 3434 | 1.17s | 0.27s | 6 | 76 | 8 |
| M3 PAYWALL CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 33.2s | 0 | 73 | 3128 | 0.95s | 0.28s | 15 | 65 | 10 |
| M4 BASTION APPROACH | main | boss-preparation | 12 | 12/0/0 | 44.8s | 1 | 58 | 3360 | 0.93s | 0.92s | 12 | 70 | 12 |
| M6 HELIX SIGNAL | main | introduction | 12 | 12/0/0 | 33.8s | 0 | 87 | 3084 | 0.18s | 0.27s | 8 | 70 | 12 |
| M7 REDLINE CROSSING | main | formation-remix | 12 | 12/0/0 | 54.2s | 0 | 82 | 3259 | 1.17s | 0.23s | 15 | 73 | 12 |
| M7B REDLINE FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 48.1s | 1 | 88 | 3598 | 1.17s | 0.23s | 14 | 75 | 12 |
| M8 DARK MATTER CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 62.6s | 1 | 59 | 2724 | 0.95s | 0.25s | 16 | 72 | 12 |
| M9 MIRROR APPROACH | main | boss-preparation | 12 | 12/0/0 | 44.3s | 0 | 61 | 2881 | 0.88s | 1.03s | 28 | 78 | 12 |
| M11 SHARD SIGNAL | main | introduction | 12 | 12/0/0 | 53.2s | 0 | 115 | 3240 | 0.18s | 0.25s | 9 | 73 | 12 |
| M12 QUANTUM CROSSING | main | formation-remix | 12 | 12/0/0 | 60.8s | 0 | 98 | 3398 | 1.13s | 0.23s | 16 | 77 | 12 |
| M12B GRAVITY RIFT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 49.6s | 0 | 124 | 3767 | 0.97s | 0.23s | 14 | 77 | 12 |
| M13 GRAVITY CHECKPOINT | main | elite-checkpoint | 12 | 10/0/2 | 49.4s | 0 | 70 | 2816 | 1.17s | 0.25s | 16 | 81 | 12 |
| M14 EVENT HORIZON | main | boss-preparation | 12 | 12/0/0 | 37.2s | 1 | 67 | 2957 | 2.07s | 0.15s | 10 | 74 | 12 |
| M16 CRIMSON SIGNAL | main | introduction | 12 | 12/0/0 | 40.7s | 0 | 73 | 4134 | 1.23s | 4.28s | 3 | 65 | 12 |
| M17 ECLIPSE CROSSING | main | formation-remix | 12 | 12/0/0 | 56.2s | 0 | 145 | 6327 | 0.88s | 0.47s | 0 | 82 | 12 |
| M17B TERMINUS FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 63.1s | 0 | 130 | 6329 | 0.4s | 0.47s | 3 | 75 | 12 |
| M18 FRACTURE CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 44.4s | 0 | 55 | 3602 | 1.18s | 4.43s | 16 | 61 | 12 |
| M19 LAST LIGHT | main | boss-preparation | 12 | 12/0/0 | 38.9s | 0 | 86 | 4463 | 0.07s | 4.13s | 0 | 76 | 12 |
| M21 PRISM SIGNAL | main | introduction | 12 | 12/0/0 | 37.6s | 0 | 71 | 4194 | 0.6s | 4.9s | 3 | 72 | 12 |
| M22 SPECTRUM CROSSING | main | formation-remix | 12 | 12/0/0 | 62.8s | 0 | 147 | 6420 | 0.07s | 1.72s | 3 | 83 | 12 |
| M22B PRISM EXPANSE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 48.8s | 0 | 124 | 6389 | 0.08s | 1.08s | 3 | 91 | 12 |
| M23 BROOD CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 44.7s | 0 | 57 | 3642 | 1.18s | 4.93s | 25 | 67 | 12 |
| M24 LUMEN APPROACH | main | boss-preparation | 12 | 12/0/0 | 35.1s | 0 | 75 | 4484 | 0.87s | 0.23s | 1 | 84 | 12 |
| M26 RAIL SIGNAL | main | introduction | 12 | 12/0/0 | 35.9s | 0 | 78 | 4404 | 0.9s | 2.7s | 6 | 67 | 12 |
| M27 MERIDIAN CROSSING | main | formation-remix | 12 | 12/0/0 | 62.1s | 0 | 156 | 6724 | 0.07s | 5.4s | 6 | 96 | 12 |
| M27B RAIL MERIDIAN HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 54.1s | 0 | 138 | 6770 | 0.08s | 4.6s | 3 | 103 | 12 |
| M28 COIL CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 38.8s | 0 | 59 | 3666 | 1.18s | 4.93s | 16 | 67 | 12 |
| M29 SERPENT APPROACH | main | boss-preparation | 12 | 12/0/0 | 33.4s | 0 | 71 | 4530 | 0.45s | 2.43s | 0 | 88 | 12 |
| M31 GRAVITY SIGNAL | main | introduction | 12 | 12/0/0 | 47.1s | 0 | 106 | 5153 | 0.82s | 5.25s | 6 | 73 | 12 |
| M32 EVENTIDE CROSSING | main | formation-remix | 12 | 12/0/0 | 59.2s | 0 | 215 | 7783 | 0.4s | 2.02s | 1 | 115 | 12 |
| M32B SINGULARITY REACH HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 49.5s | 0 | 180 | 7948 | 0.07s | 2.95s | 3 | 123 | 12 |
| M33 WELL CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 39s | 0 | 72 | 4175 | 1.18s | 4.93s | 0 | 73 | 12 |
| M34 COLLAPSE APPROACH | main | boss-preparation | 12 | 12/0/0 | 29.4s | 0 | 107 | 5294 | 0.07s | 1.52s | 39 | 95 | 12 |
| M36 ORBIT SIGNAL | main | introduction | 12 | 12/0/0 | 39.2s | 0 | 112 | 5201 | 0.52s | 1.97s | 0 | 85 | 12 |
| M37 AXIS CROSSING | main | formation-remix | 12 | 12/0/0 | 63.8s | 0 | 220 | 8079 | 0.4s | 5.6s | 3 | 100 | 12 |
| M37B GYROSCOPE ARRAY HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 52.4s | 0 | 199 | 8125 | 0.08s | 2.22s | 6 | 96 | 12 |
| M38 GYRO CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 39s | 0 | 81 | 4163 | 1.37s | 4.45s | 32 | 75 | 12 |
| M39 ROTATION APPROACH | main | boss-preparation | 12 | 12/0/0 | 36.1s | 0 | 106 | 5307 | 0.12s | 1.1s | 15 | 98 | 12 |
| M41 SIEGE SIGNAL | main | introduction | 12 | 12/0/0 | 42.3s | 0 | 101 | 5582 | 0.83s | 3.62s | 6 | 83 | 12 |
| M42 BREACH CROSSING | main | formation-remix | 12 | 12/0/0 | 62.4s | 0 | 231 | 8454 | 0.42s | 0.65s | 0 | 94 | 12 |
| M42B HAMMERHEAD LINE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 51.3s | 0 | 205 | 8593 | 0.4s | 3.6s | 0 | 126 | 12 |
| M43 HAMMER CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 36.7s | 0 | 63 | 4322 | 1.37s | 5.9s | 1 | 81 | 12 |
| M44 DREAD APPROACH | main | boss-preparation | 12 | 12/0/0 | 32.9s | 0 | 114 | 5559 | 0.08s | 4.22s | 10 | 99 | 12 |
| M46 FRONTIER SIGNAL | main | introduction | 12 | 12/0/0 | 43.3s | 0 | 120 | 5708 | 1.37s | 5.75s | 0 | 84 | 12 |
| M47 CLAW CROSSING | main | formation-remix | 12 | 12/0/0 | 53.3s | 0 | 240 | 8926 | 0.07s | 4.13s | 3 | 118 | 12 |
| M47B CROWNCLAW FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 12/0/0 | 59.8s | 0 | 214 | 9082 | 0.08s | 3.23s | 6 | 107 | 12 |
| M48 CROWN CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 36s | 0 | 77 | 4346 | 1.18s | 5.57s | 6 | 85 | 12 |
| M49 REDLINE APPROACH | main | boss-preparation | 12 | 12/0/0 | 36s | 0 | 109 | 5584 | 0.75s | 3.73s | 0 | 99 | 12 |

## M2 and M7 detailed checkpoints

These early formation-remix Missions are expanded cell-by-cell because the Campaign brief calls them out as dedicated balance checkpoints.

| Mission | Power | Supports | Viewport | Outcome | Death Wave | Time | Damage | Coins | Weekly | Bombs | Ability | Peak hostile | Peak entities | Budget peak |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| M2 | low | none | mobile | clear | - | 44.4s | 0 | 73 | 3087 | 2 | 3 | 8 | 47 | 0.7x |
| M2 | low | none | desktop | clear | - | 44.4s | 0 | 73 | 3087 | 2 | 3 | 8 | 47 | 0.7x |
| M2 | low | paired | mobile | clear | - | 24.9s | 0 | 71 | 3087 | 3 | 2 | 6 | 72 | 0.72x |
| M2 | low | paired | desktop | clear | - | 24.9s | 0 | 71 | 3087 | 3 | 2 | 6 | 72 | 0.72x |
| M2 | expected | none | mobile | clear | - | 44.4s | 0 | 73 | 3087 | 2 | 3 | 8 | 48 | 0.7x |
| M2 | expected | none | desktop | clear | - | 44.4s | 0 | 73 | 3087 | 2 | 3 | 8 | 48 | 0.7x |
| M2 | expected | paired | mobile | clear | - | 24.9s | 0 | 71 | 3087 | 3 | 2 | 6 | 72 | 0.72x |
| M2 | expected | paired | desktop | clear | - | 24.9s | 0 | 71 | 3087 | 3 | 2 | 6 | 72 | 0.72x |
| M2 | upgraded | none | mobile | clear | - | 37.1s | 0 | 74 | 3087 | 3 | 3 | 8 | 45 | 0.68x |
| M2 | upgraded | none | desktop | clear | - | 37.1s | 0 | 74 | 3087 | 3 | 3 | 8 | 44 | 0.68x |
| M2 | upgraded | paired | mobile | clear | - | 23.5s | 0 | 84 | 3087 | 2 | 2 | 3 | 67 | 0.57x |
| M2 | upgraded | paired | desktop | clear | - | 23.5s | 0 | 84 | 3087 | 2 | 2 | 3 | 67 | 0.57x |
| M7 | low | none | mobile | clear | - | 56s | 0 | 66 | 3238 | 3 | 3 | 14 | 54 | 0.78x |
| M7 | low | none | desktop | clear | - | 56s | 0 | 66 | 3238 | 3 | 3 | 14 | 55 | 0.78x |
| M7 | low | paired | mobile | clear | - | 49.8s | 0 | 80 | 3259 | 2 | 3 | 14 | 73 | 0.78x |
| M7 | low | paired | desktop | clear | - | 49.8s | 0 | 80 | 3259 | 2 | 3 | 14 | 73 | 0.78x |
| M7 | expected | none | mobile | clear | - | 54.2s | 1 | 79 | 2482 | 2 | 3 | 15 | 55 | 0.75x |
| M7 | expected | none | desktop | clear | - | 54.2s | 1 | 79 | 2482 | 2 | 3 | 15 | 54 | 0.75x |
| M7 | expected | paired | mobile | clear | - | 37.9s | 0 | 82 | 3259 | 3 | 3 | 15 | 72 | 0.75x |
| M7 | expected | paired | desktop | clear | - | 37.9s | 0 | 82 | 3259 | 3 | 3 | 15 | 73 | 0.75x |
| M7 | upgraded | none | mobile | clear | - | 72.2s | 0 | 94 | 3259 | 2 | 4 | 15 | 54 | 0.78x |
| M7 | upgraded | none | desktop | clear | - | 72.2s | 0 | 94 | 3259 | 2 | 4 | 15 | 54 | 0.78x |
| M7 | upgraded | paired | mobile | clear | - | 49.1s | 0 | 89 | 3280 | 2 | 3 | 14 | 70 | 0.75x |
| M7 | upgraded | paired | desktop | clear | - | 49.1s | 0 | 89 | 3280 | 2 | 3 | 14 | 70 | 0.75x |

## Axis summary

| Axis | Value | Cell |
| --- | --- | --- |
| tier | low | 200/0/0; D0; C95; W4442; P39; E109 |
| tier | expected | 198/0/2; D0; C88; W4424; P27; E126 |
| tier | upgraded | 200/0/0; D0; C96; W4484; P28; E107 |
| support | none | 298/0/2; D0; C94; W4463; P39; E123 |
| support | paired | 300/0/0; D0; C91; W4404; P32; E126 |
| viewport | mobile | 299/0/1; D0; C92; W4442; P39; E126 |
| viewport | desktop | 299/0/1; D0; C92; W4442; P39; E125 |

## Findings

- Cells over the provisional 80-hostile-projectile readability ceiling: 0.
- Cells over the 1.25s first-visible-threat ceiling: 18.
- Cells over the 1s in-Wave visible-combat dead-air ceiling: 230.
- Cells that entered engine performance mode: 0.
- Cells that entered heavy-scene mode: 382.
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

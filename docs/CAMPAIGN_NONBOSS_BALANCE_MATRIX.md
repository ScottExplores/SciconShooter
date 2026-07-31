# Campaign Non-Boss Runtime Balance Matrix

Generated deterministically from Campaign revision 24 and the real `GameEngine` runtime.

## Result

The bounded autonomous sweep ran **600 trials** across **50 non-boss graph Missions**: 40 main-path Missions and 10 route alternatives. It produced **495 clears**, **102 deaths**, and **3 timeouts** (82.5% clear rate).

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
- Source digest: `021392fce870bf259176f4ef3f1a23834e883be69e032da41823806e6f85ef63`.

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
| M1 ORBIT ENTRY | main | introduction | 12 | 12/0/0 | 40.5s | 0 | 17 | 2298 | 0.05s | 0.13s | 2 | 63 | 6 |
| M2 CITATION CROSSING | main | formation-remix | 12 | 12/0/0 | 41.9s | 0 | 24 | 2766 | 0.1s | 0.27s | 2 | 66 | 7 |
| M2B OPEN ORBIT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 11/1/0 | 40.9s | 1 | 20 | 3030 | 0.05s | 0.27s | 2 | 62 | 7 |
| M3 PAYWALL CHECKPOINT | main | elite-checkpoint | 12 | 10/2/0 | 44.7s | 0 | 29 | 2810 | 0.02s | 0.28s | 3 | 67 | 8 |
| M4 BASTION APPROACH | main | boss-preparation | 12 | 8/4/0 | 52.9s | 1 | 26 | 2955 | 0.08s | 0.88s | 4 | 69 | 12 |
| M6 HELIX SIGNAL | main | introduction | 12 | 11/1/0 | 40.5s | 1 | 24 | 2711 | 0.08s | 0.42s | 13 | 76 | 10 |
| M7 REDLINE CROSSING | main | formation-remix | 12 | 9/3/0 | 40.5s | 2 | 34 | 2238 | 0.05s | 0.33s | 5 | 66 | 12 |
| M7B REDLINE FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 10/2/0 | 40.5s | 1 | 36 | 3214 | 0.05s | 0.42s | 4 | 78 | 12 |
| M8 DARK MATTER CHECKPOINT | main | elite-checkpoint | 12 | 8/3/1 | 59.2s | 2 | 45 | 3211 | 0.1s | 0.37s | 30 | 81 | 12 |
| M9 MIRROR APPROACH | main | boss-preparation | 12 | 8/3/1 | 65.2s | 1 | 57 | 2960 | 0.13s | 0.38s | 54 | 114 | 12 |
| M11 SHARD SIGNAL | main | introduction | 12 | 11/1/0 | 40.5s | 0 | 32 | 2743 | 0.05s | 0.37s | 5 | 66 | 12 |
| M12 QUANTUM CROSSING | main | formation-remix | 12 | 11/1/0 | 40.5s | 1 | 40 | 3044 | 0.02s | 0.37s | 8 | 87 | 12 |
| M12B GRAVITY RIFT HIGH-RISK ROUTE | alternative | formation-remix | 12 | 10/2/0 | 40.5s | 1 | 41 | 3319 | 0.13s | 0.4s | 9 | 81 | 12 |
| M13 GRAVITY CHECKPOINT | main | elite-checkpoint | 12 | 10/2/0 | 47.4s | 0 | 44 | 3561 | 0.08s | 0.57s | 29 | 83 | 11 |
| M14 EVENT HORIZON | main | boss-preparation | 12 | 9/3/0 | 50.4s | 2 | 69 | 4540 | 0.1s | 0.4s | 24 | 92 | 12 |
| M16 CRIMSON SIGNAL | main | introduction | 12 | 9/3/0 | 40.5s | 0 | 37 | 3391 | 0.05s | 0.4s | 18 | 92 | 12 |
| M17 ECLIPSE CROSSING | main | formation-remix | 12 | 10/2/0 | 42.8s | 1 | 47 | 3387 | 0.08s | 0.42s | 18 | 83 | 12 |
| M17B TERMINUS FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 8/4/0 | 43.6s | 4 | 39 | 3632 | 0.08s | 0.4s | 18 | 77 | 12 |
| M18 FRACTURE CHECKPOINT | main | elite-checkpoint | 12 | 10/2/0 | 57.5s | 2 | 60 | 3199 | 0.08s | 0.32s | 32 | 99 | 12 |
| M19 LAST LIGHT | main | boss-preparation | 12 | 10/2/0 | 46.9s | 0 | 85 | 4681 | 0.1s | 0.27s | 52 | 106 | 12 |
| M21 PRISM SIGNAL | main | introduction | 12 | 9/3/0 | 40.5s | 2 | 38 | 3375 | 0.05s | 0.37s | 18 | 77 | 12 |
| M22 SPECTRUM CROSSING | main | formation-remix | 12 | 10/2/0 | 40.5s | 0 | 48 | 4247 | 0.08s | 0.42s | 18 | 94 | 12 |
| M22B PRISM EXPANSE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 7/5/0 | 40.5s | 6 | 31 | 2910 | 0.05s | 0.33s | 18 | 96 | 12 |
| M23 BROOD CHECKPOINT | main | elite-checkpoint | 12 | 10/1/1 | 69.2s | 1 | 54 | 3927 | 0.02s | 0.42s | 27 | 110 | 12 |
| M24 LUMEN APPROACH | main | boss-preparation | 12 | 10/2/0 | 48.9s | 0 | 84 | 4719 | 0.08s | 0.4s | 18 | 95 | 12 |
| M26 RAIL SIGNAL | main | introduction | 12 | 11/1/0 | 40.5s | 2 | 40 | 2715 | 0.08s | 0.37s | 18 | 87 | 12 |
| M27 MERIDIAN CROSSING | main | formation-remix | 12 | 11/1/0 | 44.1s | 4 | 38 | 2913 | 0.08s | 0.38s | 18 | 96 | 12 |
| M27B RAIL MERIDIAN HIGH-RISK ROUTE | alternative | formation-remix | 12 | 8/4/0 | 40.5s | 2 | 45 | 3735 | 0.02s | 0.42s | 18 | 99 | 12 |
| M28 COIL CHECKPOINT | main | elite-checkpoint | 12 | 10/2/0 | 64.2s | 2 | 56 | 3215 | 0.08s | 0.3s | 30 | 119 | 12 |
| M29 SERPENT APPROACH | main | boss-preparation | 12 | 10/2/0 | 45s | 0 | 83 | 4744 | 0.1s | 0.4s | 28 | 110 | 12 |
| M31 GRAVITY SIGNAL | main | introduction | 12 | 12/0/0 | 40.5s | 2 | 38 | 3242 | 0.05s | 0.42s | 18 | 107 | 12 |
| M32 EVENTIDE CROSSING | main | formation-remix | 12 | 8/4/0 | 40.5s | 4 | 53 | 3765 | 0.05s | 0.4s | 18 | 107 | 12 |
| M32B SINGULARITY REACH HIGH-RISK ROUTE | alternative | formation-remix | 12 | 8/4/0 | 41.4s | 6 | 60 | 3712 | 0.08s | 0.45s | 18 | 102 | 12 |
| M33 WELL CHECKPOINT | main | elite-checkpoint | 12 | 10/2/0 | 49.2s | 2 | 60 | 3426 | 0.08s | 0.42s | 24 | 103 | 12 |
| M34 COLLAPSE APPROACH | main | boss-preparation | 12 | 12/0/0 | 47.7s | 0 | 91 | 4975 | 0.05s | 0.47s | 52 | 114 | 12 |
| M36 ORBIT SIGNAL | main | introduction | 12 | 11/1/0 | 40.5s | 0 | 42 | 3614 | 0.08s | 0.42s | 18 | 109 | 12 |
| M37 AXIS CROSSING | main | formation-remix | 12 | 10/2/0 | 42.4s | 4 | 50 | 3620 | 0.13s | 0.5s | 18 | 106 | 12 |
| M37B GYROSCOPE ARRAY HIGH-RISK ROUTE | alternative | formation-remix | 12 | 6/6/0 | 41.8s | 9 | 31 | 3592 | 0.08s | 0.42s | 18 | 108 | 12 |
| M38 GYRO CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 70s | 1 | 69 | 3406 | 0.08s | 0.37s | 54 | 132 | 12 |
| M39 ROTATION APPROACH | main | boss-preparation | 12 | 11/1/0 | 55.6s | 3 | 90 | 4190 | 0.08s | 0.42s | 32 | 111 | 12 |
| M41 SIEGE SIGNAL | main | introduction | 12 | 12/0/0 | 40.5s | 0 | 48 | 3626 | 0.08s | 0.33s | 18 | 116 | 12 |
| M42 BREACH CROSSING | main | formation-remix | 12 | 10/2/0 | 40.5s | 4 | 53 | 3786 | 0.05s | 0.4s | 18 | 107 | 12 |
| M42B HAMMERHEAD LINE HIGH-RISK ROUTE | alternative | formation-remix | 12 | 7/5/0 | 42.4s | 9 | 36 | 3397 | 0.02s | 0.4s | 18 | 107 | 12 |
| M43 HAMMER CHECKPOINT | main | elite-checkpoint | 12 | 11/1/0 | 49.7s | 2 | 67 | 3353 | 0.08s | 0.42s | 18 | 113 | 12 |
| M44 DREAD APPROACH | main | boss-preparation | 12 | 11/1/0 | 62.6s | 0 | 91 | 4975 | 0.05s | 0.43s | 25 | 112 | 12 |
| M46 FRONTIER SIGNAL | main | introduction | 12 | 12/0/0 | 40.5s | 0 | 41 | 3614 | 0.08s | 0.42s | 18 | 115 | 12 |
| M47 CLAW CROSSING | main | formation-remix | 12 | 11/1/0 | 40.8s | 4 | 56 | 3761 | 0.08s | 0.35s | 18 | 103 | 12 |
| M47B CROWNCLAW FRONTIER HIGH-RISK ROUTE | alternative | formation-remix | 12 | 4/8/0 | 40.9s | 10 | 33 | 0 | 0.05s | 0.42s | 18 | 112 | 12 |
| M48 CROWN CHECKPOINT | main | elite-checkpoint | 12 | 12/0/0 | 57.7s | 2 | 66 | 3398 | 0.08s | 0.47s | 30 | 113 | 12 |
| M49 REDLINE APPROACH | main | boss-preparation | 12 | 12/0/0 | 48.7s | 2 | 90 | 4597 | 0.05s | 0.38s | 52 | 133 | 12 |

## M2 and M7 detailed checkpoints

These early formation-remix Missions are expanded cell-by-cell because the Campaign brief calls them out as dedicated balance checkpoints.

| Mission | Power | Supports | Viewport | Outcome | Death Wave | Time | Damage | Coins | Weekly | Bombs | Ability | Peak hostile | Peak entities | Budget peak |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| M2 | low | none | mobile | clear | - | 41.9s | 1 | 26 | 2000 | 2 | 3 | 2 | 34 | 0.5x |
| M2 | low | none | desktop | clear | - | 52.3s | 1 | 11 | 1733 | 2 | 3 | 2 | 21 | 0.6x |
| M2 | low | paired | mobile | clear | - | 40.5s | 0 | 26 | 2841 | 0 | 2 | 0 | 60 | 0.3x |
| M2 | low | paired | desktop | clear | - | 40.5s | 0 | 8 | 2766 | 2 | 2 | 1 | 61 | 0.5x |
| M2 | expected | none | mobile | clear | - | 45.6s | 1 | 32 | 2048 | 2 | 3 | 2 | 31 | 0.55x |
| M2 | expected | none | desktop | clear | - | 49.9s | 1 | 13 | 1733 | 2 | 3 | 2 | 23 | 0.5x |
| M2 | expected | paired | mobile | clear | - | 40.5s | 0 | 33 | 2841 | 0 | 2 | 0 | 63 | 0.3x |
| M2 | expected | paired | desktop | clear | - | 40.5s | 0 | 21 | 2778 | 0 | 2 | 0 | 54 | 0.39x |
| M2 | upgraded | none | mobile | clear | - | 43.7s | 0 | 24 | 2752 | 2 | 3 | 2 | 21 | 0.5x |
| M2 | upgraded | none | desktop | clear | - | 49.3s | 0 | 12 | 2380 | 2 | 3 | 2 | 22 | 0.5x |
| M2 | upgraded | paired | mobile | clear | - | 40.5s | 0 | 33 | 2862 | 0 | 2 | 0 | 60 | 0.3x |
| M2 | upgraded | paired | desktop | clear | - | 40.5s | 0 | 19 | 2799 | 1 | 2 | 1 | 66 | 0.35x |
| M7 | low | none | mobile | clear | - | 43s | 2 | 39 | 2033 | 3 | 3 | 4 | 41 | 0.88x |
| M7 | low | none | desktop | death | 3 | 40.4s | 3 | 11 | 0 | 2 | 2 | 4 | 34 | 1.18x |
| M7 | low | paired | mobile | clear | - | 40.5s | 0 | 40 | 2964 | 1 | 3 | 1 | 62 | 0.63x |
| M7 | low | paired | desktop | clear | - | 40.5s | 0 | 34 | 2926 | 2 | 3 | 4 | 60 | 0.6x |
| M7 | expected | none | mobile | death | 4 | 50.4s | 4 | 24 | 0 | 2 | 3 | 4 | 29 | 1x |
| M7 | expected | none | desktop | clear | - | 59.1s | 3 | 13 | 1548 | 2 | 2 | 4 | 34 | 1.2x |
| M7 | expected | paired | mobile | clear | - | 40.5s | 0 | 42 | 2985 | 3 | 3 | 0 | 60 | 0.47x |
| M7 | expected | paired | desktop | clear | - | 40.7s | 0 | 26 | 2935 | 2 | 2 | 5 | 62 | 0.5x |
| M7 | upgraded | none | mobile | death | 4 | 51.2s | 5 | 18 | 0 | 2 | 3 | 4 | 29 | 1x |
| M7 | upgraded | none | desktop | clear | - | 58s | 3 | 21 | 1818 | 2 | 3 | 4 | 36 | 0.83x |
| M7 | upgraded | paired | mobile | clear | - | 40.5s | 0 | 44 | 3006 | 2 | 2 | 1 | 66 | 0.6x |
| M7 | upgraded | paired | desktop | clear | - | 40.5s | 1 | 43 | 2238 | 2 | 3 | 1 | 56 | 0.58x |

## Axis summary

| Axis | Value | Cell |
| --- | --- | --- |
| tier | low | 141/57/2; D2; C38; W2898; P54; E127 |
| tier | expected | 163/36/1; D2; C43; W3146; P54; E129 |
| tier | upgraded | 191/9/0; D0; C48; W3613; P54; E133 |
| support | none | 208/89/3; D3; C36; W2499; P54; E104 |
| support | paired | 287/13/0; D0; C49; W3487; P54; E133 |
| viewport | mobile | 256/44/0; D1; C53; W3440; P53; E133 |
| viewport | desktop | 239/58/3; D2; C34; W2918; P54; E132 |

## Findings

- Cells over the provisional 80-hostile-projectile readability ceiling: 0.
- Cells over the 1.25s first-visible-threat ceiling: 0.
- Cells over the 1s in-Wave visible-combat dead-air ceiling: 0.
- Cells that entered engine performance mode: 0.
- Cells that entered heavy-scene mode: 226.
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

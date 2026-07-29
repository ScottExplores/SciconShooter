# Campaign Boss Balance Matrix

Generated July 29, 2026 from Campaign revision 23 using the real `GameEngine` runtime.

## Automated gate result

The final ten-boss matrix passes its automated safety gate: **173 of 180 trials cleared, 6 ended in player death, and 1 timed out**. All 60 expected-power trials cleared, including all 30 expected-power/mobile trials. The global peak was **17 hostile projectiles**, below the hard cap of 80.

This approves the authored boss curve for automated regression against the final normalized lead-ins. It does not replace a human mobile/desktop playtest. The separate final 600-cell non-boss run is documented in [CAMPAIGN_NONBOSS_BALANCE_MATRIX.md](./CAMPAIGN_NONBOSS_BALANCE_MATRIX.md).

## Method

Command:

```text
node tools/simulate-campaign-boss-balance.mjs --write
```

Artifact: `artifacts/campaign-balance/final-boss-matrix.json`

The harness runs all ten major bosses across:

- 2 viewports: mobile `390x844` and desktop `1280x720`.
- 3 power tiers: low, expected, and upgraded.
- 3 support states: none, level-5 Prism + Beacon, and level-5 Photon + Ledger.
- 18 deterministic real-engine trials per boss, 180 total.
- Real collisions, configured boss weapons, shields/components, bombs, special ability use, and a deterministic skilled-pilot controller.

Seeds are shared across power, support, and viewport variants for a boss. This avoids confusing controller-route differences with balance changes. Clear time starts when the boss becomes active. `Peak` is the maximum simultaneous hostile, damaging, non-telegraph projectile count.

## Before and after

The baseline exposed a rejected curve: 46 clears, 119 deaths, 15 timeouts, three bosses with no clears, and a 185-projectile peak. The bounded retune preserved distinct boss techniques while making counterplay readable.

| Metric | Baseline | Frozen revision 23 |
| --- | ---: | ---: |
| Clears | 46/180 | **173/180** |
| Deaths | 119 | **6** |
| Timeouts | 15 | **1** |
| Expected-power failures | Not acceptable | **0/60** |
| Expected-power/mobile failures | Not acceptable | **0/30** |
| Peak hostile projectiles | 185 | **17** |

## Frozen ten-boss summary

| Mission | Boss | Clears | Deaths | Timeouts | Median clear | Peak |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 5 | Gatekeeper Prime | 17/18 | 1 | 0 | 7.6s | 6 |
| 10 | Eclipse Engine | 18/18 | 0 | 0 | 33.1s | 10 |
| 15 | Helix Leviathan | 16/18 | 2 | 0 | 52.4s | 8 |
| 20 | Research Tribunal | 18/18 | 0 | 0 | 65.1s | 17 |
| 25 | Prism Moth | 17/18 | 0 | 1 | 71.7s | 9 |
| 30 | Rail Serpent | 18/18 | 0 | 0 | 73.7s | 5 |
| 35 | Singularity Crab | 18/18 | 0 | 0 | 59.0s | 8 |
| 40 | Orbit Gyroscope | 17/18 | 1 | 0 | 71.3s | 10 |
| 45 | Hammerhead Siege | 18/18 | 0 | 0 | 65.5s | 4 |
| 50 | Frontier Crownclaw | 16/18 | 2 | 0 | 60.9s | 7 |
| **Total** |  | **173/180** | **6** | **1** |  | **17** |

## Required-axis summary

| Axis | Clears | Deaths | Timeouts | Peak |
| --- | ---: | ---: | ---: | ---: |
| Low power | 53/60 | 6 | 1 | 17 |
| Expected power | **60/60** | **0** | **0** | 17 |
| Upgraded power | **60/60** | **0** | **0** | 11 |
| Mobile, all tiers | 87/90 | 3 | 0 | 10 |
| Desktop, all tiers | 86/90 | 3 | 1 | 17 |
| Expected power on mobile | **30/30** | **0** | **0** | 10 |

## Frozen authored values

Each major-boss Mission has four Waves: 11-second warm-up, 12-second variation, 7-second recovery, then the boss. Every Wave uses its Mission background.

| Mission | HP | Speed | Shot speed | Interval | Burst | Phase speed multipliers |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 5 | 170 | 2.12 | 6.52 | 1.465s | 2 | 1.00, 1.00 |
| 10 | 650 | 2.15 | 7.00 | 1.52s | 3 | 0.82, 0.90, 1.00 |
| 15 | 950 | 2.18 | 6.00 | 2.00s | 1 | 0.80, 0.88, 0.98 |
| 20 | 1,400 | 2.20 | 6.40 | 1.48s | 3 | 0.84, 0.92, 1.02 |
| 25 | 1,750 | 2.22 | 6.20 | 1.46s | 2 | 0.78, 0.86, 0.96 |
| 30 | 1,850 | 2.25 | 6.80 | 1.44s | 3 | 0.82, 0.90, 1.00 |
| 35 | 1,950 | 2.28 | 4.60 | 1.42s | 1 | 0.72, 0.80, 0.90 |
| 40 | 2,100 | 2.30 | 6.20 | 1.40s | 2 | 0.68, 0.76, 0.86 |
| 45 | 2,300 | 2.32 | 5.60 | 1.38s | 1 | 0.70, 0.78, 0.88 |
| 50 | 2,450 | 2.35 | 7.60 | 5.40s | 3 | 0.72, 0.80, 0.90 |

## Runtime defects corrected during the audit

- Campaign major-boss damage, speed, and cadence now retain authored values instead of being multiplied again by ambient Mission difficulty.
- Provenance is assigned before the first configured phase is applied, so the Campaign-only rule is active from spawn.
- Generated patterns use the authored burst count as a per-technique projectile budget; preview/sandbox bosses retain their bespoke defaults.
- Generated cadence honors the authored interval and suppresses duplicate cues.
- Legacy escalation rings and target strikes no longer stack on graph-authored `*-major-boss` encounters.
- Singularity warnings retain the exact collapse target rather than drifting with the player.
- The simulator uses stable seeds, viewport-aware aim prediction, hostile lookahead, and prioritizes shields/components before hull damage.

## Separate non-boss gate

The final real-engine 600-cell non-boss matrix completed with 564 clears, 27 deaths, and 9 unsupported timeouts (94.0%). Mission 2 cleared 12/12, Mission 7 cleared 10/12 with every paired-support case clear, every Mission has at least one clear, and no power/support inversion or projectile/performance cap breach remains. Its source digest is `fd37c1b3756622387ba38790fb66871e52316f58c83973f63f8c96d122d5adec`; see `docs/CAMPAIGN_NONBOSS_BALANCE_MATRIX.md` and `artifacts/campaign-balance/nonboss-runtime-matrix.json` for the complete evidence.

## Honest limitations

- The matrix is deterministic automated evidence, not a distribution of human runs.
- The driver uses the ResearchHub ship and two prescribed support pairs; it does not cover every ship/support combination.
- Boss trials start on the final Wave and therefore exclude attrition from the three lead-in Waves.
- Projectile peaks exclude bodies, active beams, telegraphs, and rendered particles.
- No physical-device frame-time capture or full human Campaign traversal was performed.

The automated boss and non-boss curves are current against the same final revision-23 authoring. They should remain frozen unless a regression test or human playtest exposes a specific defect.

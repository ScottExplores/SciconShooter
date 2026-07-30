# Campaign boss economy protocol

Campaign Missions use the exact approved Test Boss package for art, animation,
socket ownership, phases, attacks, and revival behavior. Promotion changes only
the stable Campaign event ID/schedule and the Mission economy fields listed in
`services/campaignBossEconomy.ts`.

## Approved first-six-sector durability

| Mission | Boss | Authored hull | Destructible parts | Full hull bars |
| --- | --- | ---: | --- | ---: |
| M05 | Gatekeeper Prime | 500 | 165 per cannon (33% of hull) | 1 |
| M10 | Paywall Decimator | 800 | Helmet is hull-linked; no authored helmet pool | 1 |
| M15 | Prism Moth Broodkeeper | 1,300 | Hull-only | 1 |
| M20 | Frontier Crownclaw | 1,600 | 400 per claw | 1 |
| M25 | Helios Clawcarrier | 2,350 | 600 per claw | 1 |
| M30 | Nullwake Revenant | 2,500 | Hull-only | 2 (one full revival) |
| M35 | Singularity Crab | 2,700 | Preserve authored component model | 1 |
| M40 | Orbit Gyroscope | 2,900 | Preserve authored component model | 1 |
| M45 | Hammerhead Siege | 3,150 | Preserve authored component model | 1 |
| M50 | Frontier Crownclaw | 3,400 | Preserve authored component model | 1 |

These are authored values before each wave's runtime difficulty multiplier. The
Revenant's second full bar makes its effective authored durability 5,000. That
revival is tracked separately: the authored health shown for one hull bar remains
part of a monotonic 500-to-3,400 Mission sequence.

## Moving a boss to another Mission

1. Keep its Test Boss definition and promoted artwork package unchanged.
2. Recalculate authored hull with `recommendCampaignBossHullHealth` using the
   expected production ship DPS, that Mission's runtime difficulty multiplier,
   the intended fight duration, and the number of full hull bars.
3. Preserve at least 150 authored hull over the previous boss slot, then round up
   to the nearest 50. A Mission floor of `500 + 300 x (boss slot - 1)` prevents a
   later placement from becoming a shorter raw-health fight by accident.
4. Tune destructible parts as explicit fractions of hull and verify that losing a
   part changes behavior. Cosmetic or hull-linked armor receives no separate HP.
5. Run the deterministic promotion check and playtest with the expected loadout.

The recommendation is a repeatable starting point, not a substitute for mobile
route safety, time-to-kill measurement, or real campaign playtesting.

## Promotion workflow

The approved Test Boss remains the choreography and artwork source. Campaign
promotion must not reimplement it as a second boss.

1. Run `npm run promote:campaign-bosses` to copy the approved Test event into
   its Campaign slot while preserving the Campaign event ID and schedule.
2. Run `npm run compile:campaign-boss-artwork` to copy only the approved runtime
   sprites, atlases, masks, sockets, and VFX into the production-owned public
   package and regenerate its hash-closed registry.
3. Run `npm run check:campaign-bosses`; a stale or hand-diverged Campaign event
   fails this check.
4. Validate the real Campaign path and the Boss Sandbox Campaign selection.
   Both resolve the same promoted artwork package through the canonical
   `GameCanvas -> GameEngine -> PixiGameRenderer` path.

Test-only reviews, source-generation files, and Director storage never enter the
production bundle.

# Campaign Economy Simulation - Revision 22

Generated from `game-config/campaign.json` and the real upgrade catalogs in `services/squadProgression.ts`. This is a static authored-reward model; it is not a substitute for combat telemetry or a full player-economy forecast.

## Scenario definitions

- **Clear-only:** first successful clear of every main-path Mission, including all Wave/Mission grants, one-time first-clear or boss/checkpoint grants, and the automatic Mission-clear Star 1. It excludes Star 2, Star 3, mastery-set bonuses, branches, ordinary in-wave coin pickups, and replay.
- **Expected:** clear-only plus every Mission-specific Star 2. It assumes a capable run but not a no-damage Master Clear. Three-star branches therefore remain locked.
- **Full mastery:** all main-path first-clear grants, all three stars, all mastery-set bonuses, and every optional one-time branch. The range comes only from Present Drop performance (120-377); the other three branches are fixed.

## Sector earnings

| Sector | Waves | Wave + Mission clear | First-clear + challenge | Star 1 | Star 2 | Star 3 | Mastery set | Branch | Clear-only | Expected | Full mastery |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 - OPEN ORBIT | 24 | 634 | 850 | 225 | 350 | 575 | 725 | 120-377 | 1,709 | 2,059 | 3,479-3,736 |
| 2 - REDLINE FRONTIER | 24 | 805 | 1,115 | 275 | 425 | 700 | 900 | 210-210 | 2,195 | 2,620 | 4,430-4,430 |
| 3 - GRAVITY RIFT | 24 | 976 | 1,380 | 325 | 500 | 825 | 1,075 | 260-260 | 2,681 | 3,181 | 5,341-5,341 |
| 4 - TERMINUS FRONTIER | 24 | 1,147 | 1,645 | 375 | 575 | 950 | 1,250 | 330-330 | 3,167 | 3,742 | 6,272-6,272 |
| **Campaign** | **96** | **3,562** | **4,990** | **1,200** | **1,850** | **3,050** | **3,950** | **920-1,177** | **9,752** | **11,602** | **19,522-19,779** |

The three scenarios award **9,752**, **11,602**, and **19,522-19,779** authored coins respectively. Ordinary dropped coins are deliberately excluded because their realized value depends on kills, pickup skill, and support loadout.

## Upgrade costs from the runtime catalog

- One complete main-ship set for one ship costs **44,765**: Fire Rate 40,250, Movement Speed 1,835, and Starting Hearts 2,680.
- Main-ship choices begin at **55-90 coins**. The final Fire Rate purchase is **6,050 coins**.
- Squad-slot gates are **50** for left and **500** for right. The left unlock includes Citation Dart at level 1.
- Support level costs are not a flat 2,220. The runtime adds a ship-price premium at each step: `round(base[level] + purchaseCost * (0.55 + level * 0.15))`.
- An already-owned Citation Dart costs **2,220** to take from level 1 to 5. The cheapest paid support (Helix Wasp) costs **2,644** to buy and max; the premium Nebula Tern costs **5,792**.

| Support ship | Buy | L1->2 | L2->3 | L3->4 | L4->5 | L1->5 upgrades | Buy + max |
|---|---:|---:|---:|---:|---:|---:|---:|
| Citation Dart | 0 | 160 | 360 | 650 | 1,050 | 2,220 | 2,220 |
| Helix Wasp | 90 | 223 | 437 | 740 | 1,154 | 2,554 | 2,644 |
| Photon Manta | 140 | 258 | 479 | 790 | 1,211 | 2,738 | 2,878 |
| Quorum Crab | 200 | 300 | 530 | 850 | 1,280 | 2,960 | 3,160 |
| Axiom Orbiter | 260 | 342 | 581 | 910 | 1,349 | 3,182 | 3,442 |
| Archive Beetle | 330 | 391 | 641 | 980 | 1,430 | 3,442 | 3,772 |
| Beacon Kite | 410 | 447 | 709 | 1,060 | 1,522 | 3,738 | 4,148 |
| Prism Skimmer | 500 | 510 | 785 | 1,150 | 1,625 | 4,070 | 4,570 |
| Ledger Hammer | 620 | 594 | 887 | 1,270 | 1,763 | 4,514 | 5,134 |
| Nebula Tern | 760 | 692 | 1,006 | 1,410 | 1,924 | 5,032 | 5,792 |

## Meaningful-upgrade cadence

For comparison, the simulator spends on one deterministic, balanced main-ship basket: Movement Speed, Fire Rate, and Starting Hearts alternate through level 7; remaining purchases advance Fire Rate. This is a reference path, not a required build. Branches are credited after their source sector and full-mastery cadence uses the conservative branch floor.

| Scenario | Authored coins | Basket upgrades funded | Average Missions per funded upgrade | Longest no-purchase stretch | Bank | Next basket purchase |
|---|---:|---:|---:|---:|---:|---|
| Clear-only | 9,752 | 24/35 | 0.83 | 1 | 1,197 | fireRate 11 (1,260) |
| Expected (Stars 1 + 2) | 11,602 | 26/35 | 0.77 | 1 | 257 | fireRate 13 (1,830) |
| Full mastery (branch floor) | 19,522 | 29/35 | 0.69 | 2 | 1,557 | fireRate 16 (3,050) |
| Full mastery (branch ceiling) | 19,779 | 29/35 | 0.69 | 1 | 1,814 | fireRate 16 (3,050) |

The expected path supplies **25.92%** of one fully maxed main ship if the player saves every authored coin. Full mastery supplies **43.61%-44.18%**. Because support purchases compete for the same balance, actual main-ship completion will be slower; this is an intentional long-tail constraint that still needs player telemetry.

### Early, mid, and late progression

| Segment | Expected authored coins | Full-mastery authored coins | Reference-basket purchases by segment end (expected / mastery floor) |
|---|---:|---:|---:|
| 1 - OPEN ORBIT | 2,059 | 3,479-3,736 | 13 / 16 |
| 2 - REDLINE FRONTIER | 2,620 | 4,430-4,430 | 18 / 23 |
| 3 - GRAVITY RIFT | 3,181 | 5,341-5,341 | 23 / 27 |
| 4 - TERMINUS FRONTIER | 3,742 | 6,272-6,272 | 26 / 29 |

- **Early (Sector 1):** starter costs are covered without replay; saving mastery income can also open a slot or begin a support build.
- **Mid (Sectors 2-3):** authored income reaches 630-2,190 coin main choices and meaningful support premiums without a single sector buying an entire advanced track.
- **Late (Sector 4):** rewards materially advance 2,600+ Fire Rate decisions, but the 3,050-6,050 tail remains a long-term choice rather than an automatic max-out.
- The reference basket's longest authored savings stretch is one Mission for clear-only/expected and two Missions at the advanced full-mastery tail. This avoids a long static drought, but does not prove that every player-selected purchase order feels equally smooth.

## Support affordability checkpoints

If a player saves authored income instead of buying main upgrades, every support's first upgrade becomes affordable at the following Mission. Slot gates and purchase costs are separate, so this table is an affordability signal rather than an equip guarantee.

| Support | First upgrade | Clear-only Mission | Expected Mission | Full-mastery Mission |
|---|---:|---:|---:|---:|
| Citation Dart | 160 | 1 | 1 | 1 |
| Helix Wasp | 223 | 1 | 1 | 1 |
| Photon Manta | 258 | 1 | 1 | 1 |
| Quorum Crab | 300 | 2 | 1 | 1 |
| Axiom Orbiter | 342 | 2 | 1 | 1 |
| Archive Beetle | 391 | 2 | 2 | 1 |
| Beacon Kite | 447 | 2 | 2 | 1 |
| Prism Skimmer | 510 | 2 | 2 | 1 |
| Ledger Hammer | 594 | 2 | 2 | 1 |
| Nebula Tern | 692 | 3 | 2 | 2 |

## Bounded replay policy

Completed Missions can pay one reduced authored replay grant per Mission per UTC date. The runtime pays one reduced Wave grant plus one reduced Mission grant on the final Wave; same-day repeats pay zero authored replay coins. Stars, first-clear, boss, mastery, and branch rewards remain one-time.

| Sector | Maximum authored replay coins per UTC day after all five Missions are complete |
|---|---:|
| 1 - OPEN ORBIT | 85 |
| 2 - REDLINE FRONTIER | 105 |
| 3 - GRAVITY RIFT | 130 |
| 4 - TERMINUS FRONTIER | 155 |
| **All 20 Missions** | **475** |

The authored daily replay ceiling is **2.43%** of the one-time full-mastery floor. It prevents result-ID or same-day easy-Mission spam from dominating immediately. It is not a lifetime cap: over many days replay income and unmodeled dropped coins can still become substantial, so retention telemetry is required before calling the long-term economy final.

## Weekly isolation

- The simulation counts no weekly leaderboard reward or weekly-run earnings.
- `creditCampaignRewardGrants` adds Campaign grants to spendable coins without incrementing `weeklyStats`; Campaign progress and reward receipt IDs remain separate from weekly score/lives/checkpoints.
- One-time first-clear, boss, star, mastery, and branch coins enter the protected durable Campaign reserve and survive the Sunday rollover when unspent.
- Repeatable Wave/Mission/replay grants are intentionally not added to that durable reserve. Any unspent repeatable portion can be removed at rollover; this anti-farm distinction should be made clear to players if balances are surfaced as permanent Campaign currency.
- Ship/support upgrades and Campaign records persist independently of the weekly competition reset.

## Acceptance and honest limitations

- **Pass (static authored model):** clear-only and expected paths fund starter and mid-tier choices without forced replay; every fully mastered sector gives a meaningful step toward the next reference purchase; branches are useful but never replace the following sector.
- **Pass (reward bounds):** Present Drop remains 120-377, the other branches are fixed at 210/260/330, all are one-time, and the daily authored replay ceiling is bounded to 475 across the entire campaign.
- **Warning:** full mastery yields only 43.61%-44.18% of one complete main-ship set before support spending. That preserves a long tail, but late-tier grind perception must be tested rather than inferred.
- **Warning:** ordinary enemy/boss coin drops, coin-magnet effects, deaths, clear rates, play time, and player purchase order are not modeled. Actual earnings will be higher and more variable.
- **Warning:** the model covers the authored four-sector, 20-Mission revision-22 campaign only. It must be rerun when rewards, branches, upgrade prices, or new sectors change.
- **Not yet proven:** low/expected/upgraded loadout clear rates, mandatory-support risk, mobile/desktop performance, damage, death Wave, enemy/boss TTK, projectile peaks, and power-guidance accuracy require live Campaign Lab playtests.
- **Security limitation:** wallet persistence sanitizes and de-duplicates receipts, but browser-reported Campaign combat is not fully server-authoritative. Higher-value rewards still need the existing integrity roadmap.

## Required playtest matrix

Static economy validation is complete; the following runtime matrix remains open and must be recorded before final balance sign-off.

| Sector | Low power | Expected power | Upgraded power | No support | Support combo A | Support combo B | Mobile | Desktop | Status |
|---|---|---|---|---|---|---|---|---|---|
| 1 - OPEN ORBIT | Required | Required | Required | Required | Required | Required | Required | Required | **Not run** |
| 2 - REDLINE FRONTIER | Required | Required | Required | Required | Required | Required | Required | Required | **Not run** |
| 3 - GRAVITY RIFT | Required | Required | Required | Required | Required | Required | Required | Required | **Not run** |
| 4 - TERMINUS FRONTIER | Required | Required | Required | Required | Required | Required | Required | Required | **Not run** |

Record completion, clear time, damage, death Wave, enemy/boss TTK, projectile peak, performance, collected coins, stars, and whether the recommended-power guidance was accurate for every row.

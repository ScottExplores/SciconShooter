# Campaign Economy Simulation - Revision 24

Generated deterministically from the Campaign, Hangar, Reward Center, Boss Archive, and boss-coin runtime sources. Run `node tools/simulate-campaign-economy.mjs` to regenerate this file or `node tools/simulate-campaign-economy.mjs --check` to verify it.

This model covers **10 sectors, 50 main-path Missions, 10 route-alternative Missions, and 10 major bosses**. Authored grants are exact. Combat pickup totals are ceilings because kills and pickups depend on play.

## Scenario definitions

- **Clear-only:** first successful clear of every main-path Mission, including Wave/Mission grants, one-time first-clear or boss/checkpoint grants, and automatic Star 1. It excludes Star 2, Star 3, mastery-set bonuses, alternate routes, branches, combat pickups, and replay.
- **Expected:** clear-only plus every Mission-specific Star 2. It assumes a capable run but not a no-damage Master Clear. Three-star branches therefore remain locked.
- **Full mastery:** every main-path and route-alternative first clear, all three stars, all mastery-set bonuses, and every optional one-time mastery branch. The range comes from variable branch performance.

Weekly leaderboard points and proposal funding are never converted into Campaign coins and are excluded.

## Exact persistent source inventory

| Source | Exact value or curve | Persistence and repeat rule |
|---|---|---|
| Main-path authored grants | Clear-only 17,045; expected 19,520; full mastery with alternates/branches 38,287-38,544 | First-clear, boss, star, mastery, alternate, and branch receipt IDs are one-time and durable. Wave/Mission clear grants are repeatable and seasonal. |
| Route-alternative authored grants | Clear-only 3,357; expected 3,852; full mastery 5,772 | One separate reward ledger per alternate Mission; included only in the full-mastery scenario. |
| Authored daily replay | 825 maximum across all completed main Missions per UTC day | One reduced grant per Mission per UTC date; no same-day repeat grant. Seasonal balance. |
| Daily Gift calendar | 9,450 over 30 consecutive days | Each day is claimable once; missing a day resets the calendar. Coins enter the seasonal balance. |
| Achievements | 10,400 across 6 five-tier tracks | Each tier is one-time per Pilot; coins enter the seasonal balance. |
| Boss Archive challenge | 3 paid clears/day; 100-280 per clear; maximum 840/day after final unlock | Daily charge limit is global. Practice pays zero. Seasonal balance. |
| Boss Archive mastery | 5,700 across all authored bosses | Three one-time mastery receipts per boss; seasonal balance after claim. |
| Ordinary combat coin | 1 coin per credited coin entity | Repeatable. Enemy kills, recovery drops, bonus targets, and boss bursts settle through the run boundary. |
| Main-route configured pickup ceiling | 4,597 (2,042 configured kills + 200 recovery + 0 mini-boss + 2,355 major-boss) | Ceiling, not forecast: formation-generated enemies, missed kills/pickups, bonus targets, and the 128-coin active cap can change realized income. |
| Alternate-route configured pickup ceiling | 531 | Same variable combat conditions as the main route. |

### Reward Center totals

| Reward Center source | Tier values | Total |
|---|---|---:|
| Daily Gifts | 30 authored days | 9,450 |
| Sector Pioneer | 75 / 150 / 250 / 400 / 650 | 1,525 |
| Boss Breaker | 100 / 200 / 300 / 500 / 800 | 1,900 |
| Research Hunter | 100 / 200 / 300 / 500 / 800 | 1,900 |
| Grant Collector | 50 / 100 / 200 / 350 / 600 | 1,300 |
| Mission Veteran | 75 / 150 / 250 / 450 / 700 | 1,625 |
| Arcade Ace | 100 / 200 / 350 / 600 / 900 | 2,150 |
| **Daily cycle + all achievement tiers** | | **19,850** |

### Boss Archive rewards

| Boss Mission | Challenge clear | Mastery 1 | Mastery 2 | Mastery 3 | One-time mastery total |
|---:|---:|---:|---:|---:|---:|
| 5 | 100 | 75 | 100 | 125 | 300 |
| 10 | 120 | 90 | 120 | 150 | 360 |
| 15 | 140 | 105 | 140 | 175 | 420 |
| 20 | 160 | 120 | 160 | 200 | 480 |
| 25 | 180 | 135 | 180 | 225 | 540 |
| 30 | 200 | 150 | 200 | 250 | 600 |
| 35 | 220 | 165 | 220 | 275 | 660 |
| 40 | 240 | 180 | 240 | 300 | 720 |
| 45 | 260 | 195 | 260 | 325 | 780 |
| 50 | 280 | 210 | 280 | 350 | 840 |

## Sector earnings

| Sector | Main Waves | Clear-only | Expected | Alternate full mastery | Branch | Full mastery |
|---|---:|---:|---:|---:|---:|---:|
| 1 - OPEN ORBIT | 18 | 911 | 1,046 | 310 | 120-377 | 1,986-2,243 |
| 2 - REDLINE FRONTIER | 18 | 1,082 | 1,242 | 368 | 210-210 | 2,430-2,430 |
| 3 - GRAVITY RIFT | 18 | 1,265 | 1,450 | 430 | 260-260 | 2,850-2,850 |
| 4 - TERMINUS FRONTIER | 18 | 1,436 | 1,646 | 488 | 330-330 | 3,274-3,274 |
| 5 - PRISM EXPANSE | 18 | 1,619 | 1,854 | 546 | 325-325 | 3,635-3,635 |
| 6 - RAIL MERIDIAN | 18 | 1,790 | 2,050 | 603 | 360-360 | 4,023-4,023 |
| 7 - SINGULARITY REACH | 18 | 1,973 | 2,258 | 670 | 395-395 | 4,433-4,433 |
| 8 - GYROSCOPE ARRAY | 18 | 2,144 | 2,454 | 728 | 430-430 | 4,822-4,822 |
| 9 - HAMMERHEAD LINE | 18 | 2,327 | 2,662 | 785 | 465-465 | 5,222-5,222 |
| 10 - CROWNCLAW FRONTIER | 18 | 2,498 | 2,858 | 844 | 500-500 | 5,612-5,612 |
| **Campaign** | **180** | **17,045** | **19,520** | **5,772** | **3,395-3,652** | **38,287-38,544** |

Detailed main-path authored grants: Wave + Mission clear 7,735, first-clear + boss/checkpoint 7,785, Star 1 1,525, Star 2 2,475, Star 3 3,900, main mastery sets 5,700, and branches 3,395-3,652.

## Exact persistent sink inventory

- One complete main-ship set costs **562,475** per ship: Fire Rate 551,350, Movement Speed 1,835, and Starting Hearts 600. All four ships cost 2,249,900.
- Fire Rate remains accessible at **60** and Speed at **55**. Fire Rate keeps the shipped first 21 prices exactly, then adds 28 premium purchases for Tiers 4-7.
- Starting Hearts cost **180 / 420**, totaling **600**. Three base hearts plus seven purchases produces the hard **10-heart cap**.
- Squad-slot gates are **50** for left and **500** for right. The left unlock includes Citation Dart at level 1.
- Support level costs are not a flat 2,220. The runtime adds a ship-price premium at each step: `round(base[level] + purchaseCost * (0.55 + level * 0.15))`.
- An already-owned Citation Dart costs **2,220** to take from level 1 to 5. The cheapest paid support (Helix Wasp) costs **2,644** to buy and max; the premium Nebula Tern costs **5,792**.
- Buying both slots and buying/maxing every support costs **38,310**.

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

For comparison, the simulator spends on one deterministic basket: Movement Speed, Fire Rate, and Starting Hearts alternate through level 7; remaining purchases advance Fire Rate. Route-alternative and branch income is credited only after the owning sector boss, so the cadence never assumes optional rewards before they are reachable.

| Scenario | Authored coins | Basket upgrades funded | Average Missions per funded upgrade | Longest no-purchase stretch | Bank | Next basket purchase |
|---|---:|---:|---:|---:|---:|---|
| Clear-only | 17,045 | 30/68 | 1.67 | 6 | 620 | fireRate 12 (1,530) |
| Expected (Stars 1 + 2) | 19,520 | 31/68 | 1.61 | 5 | 1,565 | fireRate 13 (1,830) |
| Full mastery (branch floor) | 38,287 | 37/68 | 1.35 | 4 | 3,012 | fireRate 19 (4,700) |
| Full mastery (branch ceiling) | 38,544 | 37/68 | 1.35 | 4 | 3,269 | fireRate 19 (4,700) |

The expected path supplies **3.47%** of one fully maxed main ship if the player saves every authored coin. Full mastery supplies **6.81%-6.85%**. Because support purchases compete for the same balance, actual main-ship completion will be slower; this is an intentional long-tail constraint that still needs player telemetry.

### Sector-by-sector affordability

| Segment | Expected authored coins | Full-mastery authored coins | Reference-basket purchases by segment end (expected / mastery floor) |
|---|---:|---:|---:|
| 1 - OPEN ORBIT | 1,046 | 1,986-2,243 | 7 / 9 |
| 2 - REDLINE FRONTIER | 1,242 | 2,430-2,430 | 12 / 16 |
| 3 - GRAVITY RIFT | 1,450 | 2,850-2,850 | 14 / 20 |
| 4 - TERMINUS FRONTIER | 1,646 | 3,274-3,274 | 16 / 21 |
| 5 - PRISM EXPANSE | 1,854 | 3,635-3,635 | 20 / 28 |
| 6 - RAIL MERIDIAN | 2,050 | 4,023-4,023 | 20 / 31 |
| 7 - SINGULARITY REACH | 2,258 | 4,433-4,433 | 23 / 33 |
| 8 - GYROSCOPE ARRAY | 2,454 | 4,822-4,822 | 27 / 34 |
| 9 - HAMMERHEAD LINE | 2,662 | 5,222-5,222 | 30 / 36 |
| 10 - CROWNCLAW FRONTIER | 2,858 | 5,612-5,612 | 31 / 37 |

- Sector 1 covers multiple low-cost Speed/Fire upgrades without replay, while the first heart is deliberately no longer the cheapest purchase.
- The health curve is 0.22x the former 2,680-coin curve. Expected authored Campaign income can max health only by deferring offense and support purchases.
- The seven-tier Fire Rate tail is a deliberate long-term sink: 49 purchases cost 551,350 per ship, while the complete authored Campaign funds only part of that track before repeatable rewards and combat drops.

## Support affordability checkpoints

If a player saves authored income instead of buying main upgrades, every support's first upgrade becomes affordable at the following Mission. Slot gates and purchase costs are separate, so this table is an affordability signal rather than an equip guarantee.

| Support | First upgrade | Clear-only Mission | Expected Mission | Full-mastery Mission |
|---|---:|---:|---:|---:|
| Citation Dart | 160 | 2 | 1 | 1 |
| Helix Wasp | 223 | 2 | 2 | 1 |
| Photon Manta | 258 | 2 | 2 | 1 |
| Quorum Crab | 300 | 2 | 2 | 2 |
| Axiom Orbiter | 342 | 3 | 2 | 2 |
| Archive Beetle | 391 | 3 | 3 | 2 |
| Beacon Kite | 447 | 3 | 3 | 2 |
| Prism Skimmer | 510 | 4 | 3 | 2 |
| Ledger Hammer | 594 | 4 | 4 | 3 |
| Nebula Tern | 692 | 5 | 4 | 3 |

## Bounded replay policy

Completed Missions can pay one reduced authored replay grant per Mission per UTC date. The runtime pays one reduced Wave grant plus one reduced Mission grant on the final Wave; same-day repeats pay zero authored replay coins. Stars, first-clear, boss, mastery, and branch rewards remain one-time.

| Sector | Maximum authored replay coins per UTC day after all five Missions are complete |
|---|---:|
| 1 - OPEN ORBIT | 47 |
| 2 - REDLINE FRONTIER | 54 |
| 3 - GRAVITY RIFT | 63 |
| 4 - TERMINUS FRONTIER | 70 |
| 5 - PRISM EXPANSE | 78 |
| 6 - RAIL MERIDIAN | 86 |
| 7 - SINGULARITY REACH | 96 |
| 8 - GYROSCOPE ARRAY | 102 |
| 9 - HAMMERHEAD LINE | 111 |
| 10 - CROWNCLAW FRONTIER | 118 |
| **All 50 main-path Missions** | **825** |

The authored daily replay ceiling is **2.15%** of the one-time full-mastery floor. It prevents result-ID or same-day easy-Mission spam from dominating immediately. It is not a lifetime cap: over many days replay income and unmodeled dropped coins can still become substantial, so retention telemetry is required before calling the long-term economy final.

## Inflation and farming review

- **Bounded Campaign replay:** 825/day is 2.15% of the one-time full-mastery floor. Same-Mission repeats in one UTC day pay no additional authored replay grant.
- **Unbounded combat pickup risk:** ordinary kill/drop coins remain replayable and are skill/loadout dependent. A per-run or diminishing-return policy is still absent.
- **Boss Archive challenge income is sector-tiered and bounded:** 3 clears of the highest unlocked boss can pay 840/day, or 5,880/week. That is 30.12% of the expected ten-sector authored path, so Archive play remains useful without replacing Campaign progression.
- **Reward Center gross is long-horizon income:** one 30-day calendar plus every lifetime achievement tier is 19,850, 101.69% of expected authored Campaign income. Only the 9,450 calendar repeats; the 10,400 achievement inventory is one-time per Pilot.
- **Weekly isolation remains correct:** Campaign reward credit does not increment weekly score statistics. One-time Campaign grants are durable; repeatable grants, Daily Gifts, achievements, Boss Archive payments, and ordinary run coins enter the seasonal balance. Upgrades survive the reset.

## Seven-projectile-tier validation

The runtime now supports seven visible Fire Rate tiers across 49 upgrade levels. Each tier still contains seven purchases, existing numeric levels are preserved, and the shipped level-0 through level-21 cadence and costs remain unchanged. Tiers 4-7 add premium long-tail prices and only tighten cadence from five frames to four frames.

Seven-round volleys are simulated as one collision bundle per center or Triple Shot lane. Max Shot doubles each visible pattern without multiplying collision entities or shot audio. Total per-lane damage scales through 1x / 2x / 3x / 3.45x / 3.85x / 4.2x / 4.5x, so Tier 7 does not become seven full-strength hits. Focused headless mobile/desktop tests cover pooled render counts, collision admission, Max Shot, BIO twin rails, audio cadence, and representative boss TTK.

## Acceptance and honest limitations

- **Pass:** all ten sectors, fifty main-path Missions, ten alternate-route Missions, ten mastery branches, exact first-clear/star/mastery rewards, Reward Center rewards, Boss Archive rewards, replays, and every persistent coin sink are represented.
- **Pass:** total lives are capped at ten and the seven-heart Hangar track is 600 coins while early Speed/Fire prices remain unchanged.
- **Pass:** the 49-level, seven-tier Fire Rate sink is included in every affordability percentage and deterministic purchase cadence above.
- **Pass:** the report is generated from runtime source files and has a deterministic stale-file check.
- **Affordability:** expected authored income supplies 3.47% of one maxed main ship; full mastery supplies 6.81%-6.85% before support spending.
- **Pass with telemetry:** a full week of maximum Boss Archive charges remains below one third of expected authored Campaign income, while one 30-day gift cycle plus all lifetime achievement tiers stays near one expected Campaign. Combat pickups still require live retention telemetry.
- **Not modeled as guaranteed income:** dropped coins, magnet collection, player deaths, clear rate, play time, and performance-dependent Present Drop results.
- **Security limitation:** browser Campaign combat remains server-verifiable, not fully server-authoritative. Valuable rewards require the existing receipt/integrity controls.

## Required playtest matrix

Static economy validation is complete; the following runtime matrix remains open and must be recorded before final balance sign-off.

| Sector | Low power | Expected power | Upgraded power | No support | Support combo A | Support combo B | Mobile | Desktop | Status |
|---|---|---|---|---|---|---|---|---|---|
| 1 - OPEN ORBIT | Required | Required | Required | Required | Required | Required | Required | Required | **Not run** |
| 2 - REDLINE FRONTIER | Required | Required | Required | Required | Required | Required | Required | Required | **Not run** |
| 3 - GRAVITY RIFT | Required | Required | Required | Required | Required | Required | Required | Required | **Not run** |
| 4 - TERMINUS FRONTIER | Required | Required | Required | Required | Required | Required | Required | Required | **Not run** |
| 5 - PRISM EXPANSE | Required | Required | Required | Required | Required | Required | Required | Required | **Not run** |
| 6 - RAIL MERIDIAN | Required | Required | Required | Required | Required | Required | Required | Required | **Not run** |
| 7 - SINGULARITY REACH | Required | Required | Required | Required | Required | Required | Required | Required | **Not run** |
| 8 - GYROSCOPE ARRAY | Required | Required | Required | Required | Required | Required | Required | Required | **Not run** |
| 9 - HAMMERHEAD LINE | Required | Required | Required | Required | Required | Required | Required | Required | **Not run** |
| 10 - CROWNCLAW FRONTIER | Required | Required | Required | Required | Required | Required | Required | Required | **Not run** |

Record completion, clear time, damage, death Wave, enemy/boss TTK, projectile peak, performance, collected coins, stars, and whether the recommended-power guidance was accurate for every row.

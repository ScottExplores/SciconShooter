# SciCon Shooter — "Revamp" Design Doc (v1, Oct 17 2026)

Owner: Scott Explores. Branch: `revamp` (built on `remaster` @ 9b1894b + PR #44 Vercel 12-function fix).
North star: feel like a top-tier mobile space shooter (Galaxiga / Galaxy Attack / Sky Force Reloaded / HAWK level of polish), but
clearly *SciCon*: Scott's art style, science-funding theme, ResearchHub proposals, Weekly Run prize. Not vibe-coded: every
system tuned, readable, fair, tested.

## 0. Current state (audit of remaster)
- React 18 + Pixi v8 renderer, monolithic `services/gameLogic.ts` (~1 MB), `services/pixi/PixiGameRenderer.ts`.
- Content in `game-config/campaign.json` (rev 24): 60 levels, 10 sectors, 10 branches, 25 enemy roles, 41 formation packs,
  10 mini-bosses, campaign graph; boss runtimes in `services/gameplay/bosses/*` (Abyssal Octarch, Frontier Crownclaw,
  Helios Clawcarrier, Prism Moth, Singularity Commander, Umbra Needlewing, Gatekeeper Prime, Paywall, Rotating Emitter Core,
  Nullwake, Gloamforge, …) with safe-route proofs.
- Systems present: squad hangar (wing support ships), weapon tiers, overdrive, powerups, story beats/transmissions,
  campaign map, boss archive, weekly run generator + streaks, ResearchHub proposals (api/researchhub-proposals.js,
  public funding_feed, no key), weekly competitions/claim/funding approval, leaderboards (Supabase), Base wallet, record mint.
- Gaps (what keeps it from premium): hit feedback & juice inconsistent; formation entries feel scripted-flat rather than
  Galaga choreography; boss telegraphs not always readable on phone; first 60 s slow (menus before action); meta loop
  (daily goals, unlock cadence) thin; difficulty curve has spikes; wing ships under-tuned; Vercel preview broken (13 fns).

## 1. What makes the reference games feel premium (research notes) → what we adopt
| Pillar | Galaxiga / Galaxy Attack | Sky Force Reloaded | HAWK / bullet-hell classics | SciCon adoption |
|---|---|---|---|---|
| Wave choreography | Enemies fly in on curved splines from top + flagged side/bottom entries (warning triangles), settle into a grid, then peel off in dive attacks | Hand-authored set pieces, ground + air layers | Danmaku patterns as "puzzles" with safe lanes | Spline entry library (swoop, loop-de-loop, S-curve, side-sweep, mirrored pincer, corkscrew), grid "breathing", Galaga dive-bombers that return to slot, off-screen entry warning chevrons |
| Boss design | 50+ bosses; pattern, random, multi-part (destroy parts to disable attacks), color flash when hurt, explode into pieces | Big multi-turret bosses, destroyable parts | Clear telegraph → attack → recovery windows, phase changes at HP thresholds | Every boss: 3 phases (100/66/33%), each attack has a ≥0.6 s telegraph (glow + line/zone preview + sound), destroyable sub-parts that remove an attack, a "stagger" window after part break, rage phase at 15% |
| Power-ups & drones | Power level 1–10 (bullets), drones with cooldown specials, homing missiles, magnet, reset cooldown; lose half power on death | Support drones on both wings, magnet | Options/orbitals that mirror the player | Power 1–10 visible pips; left/right wing ships each with a cooldown special; magnet; on death lose 3 power levels (not half) for fairness |
| Upgrade economy | Coins → ship/drone/stone upgrades; cards; tech tree | Stars buy upgrades; 4 medals per stage (70% kills, 100% kills, rescue, no-hit) gate harder variants | — | Science Credits (coins) + Research Data (per-stage medals) → upgrade tree; 3 stars/medals per mission (clear, 90% kills, no-hit) |
| Hit feedback | Enemy white flash, debris, coin bursts | Chunky explosions, camera shake | Hit-stop on big kills, bullet cancel on boss phase change | White hit-flash (60 ms), sparks at impact point, 3-tier explosions, trauma-based screen shake (capped, with setting), 40–80 ms hit-stop on elite/boss part kills, bullet-cancel → score sparkle on phase change, damage numbers optional |
| UI polish | Big readable HUD, power/lives top, skills left edge | Clean medal screens | — | Thumb-safe HUD (skills bottom-left/right above thumb), results screen with count-up, medals, unlock toasts |
| Pacing | 5→10 waves per level, boss every few levels; short runs | 3–5 min stages | Rhythm: calm → swarm → elite → breath | Mission = 6–9 waves + mini-boss or boss, 2.5–4 min; "breath" waves after spikes |
| Audio | Punchy shots, layered explosions | Strong music | — | WebAudio SFX layering with pitch variance, ducking under boss warnings, boss warning siren |
| Monetization lessons | Players hate pay-to-win, ad walls | Praised for restraint | — | No pay-to-win: wallet/RSC only cosmetic + continues; Weekly Run is skill-only |

## 2. First 60 seconds (strong hook)
1. Cold open: tap "PLAY" → in combat in <5 s (no modal chain). Story transmission overlays as a 2-line comm, skippable.
2. 0–10 s: easy swoop wave, power-up drops at 6 s (power 2 → 3), first "PERFECT WAVE" toast.
3. 10–30 s: left wing ship joins (cinematic fly-in), second wave dives; magnet drop.
4. 30–50 s: mini-boss "Peer Reviewer" with one telegraphed attack and a breakable shield part.
5. 50–60 s: big explosion + hit-stop, results count-up, first unlock (right wing ship) and a daily goal ticks.

## 3. Story — Campaign "The Open Science Frontier"
Premise: The Paywall Syndicate has walled off the galaxy's knowledge. Pilot Scott (call sign "Explorer") and the SciCon
fleet fly sector by sector to liberate research stations; each liberated station unlocks a real ResearchHub proposal
"signal" shown in the hangar.
Sector beats (10 sectors, reuse existing sector ids/themes):
1. Launch Bay — training, meet Comms officer Dr. Vega. Boss: Gatekeeper Prime.
2. Citation Storm — swarms of citation drones. Boss: Prism Moth.
3. Peer Review Nebula — elite shield enemies. Boss: Frontier Crownclaw.
4. Grant Desert — resource scarcity, coin-rich waves. Boss: Helios Clawcarrier.
5. Replication Reef — enemies that clone. Boss: Abyssal Octarch.
6. Data Graveyard — teleporters. Boss: Umbra Needlewing.
7. Impact Factor Forge — armored formations. Boss: Gloamforge.
8. The Paywall — wall segments, shutters. Boss: Paywall Boss.
9. Null Hypothesis Void — reversal gimmicks. Boss: Nullwake.
10. Singularity Archive — finale. Boss: Singularity Commander (3 phases + finale escape).
Each sector: intro transmission (2–3 lines), mid-sector twist, boss taunt, victory line. Text lives in `services/storyBeats.ts`.

## 4. Enemy roster (adds to the 25 existing roles)
Swooper (spline entry, returns to slot) · Diver (Galaga dive-bomb, fires 1 aimed shot at bottom of arc) · Escort pair
(diver + 2 wingmen, bonus if killed in order) · Shield Bearer (front shield, flank to kill) · Splitter (splits in 2 small) ·
Mine Layer (drops slow mines with timer ring) · Sniper (charges a visible laser line 0.8 s then fires) · Teleporter
(blink with 0.4 s ghost preview) · Carrier (spawns 3 minis, drops coins) · Kamikaze Spinner (exists; add warning chevron).
Rules: every enemy bullet visually distinct from player bullets (warm magenta/orange cores with dark outline; player = cyan/white),
no enemy fires within 0.7 s of entering screen, max on-screen enemy bullets capped per difficulty tier.

## 5. Bosses (target ≥ 12 polished for revamp milestone; 43 designs in Boss Test Runner V0.34 as blueprint)
Polish pass for all existing boss runtimes + port additional designs as content using existing runtimes (BossPatternRuntime,
BossTimelineRuntime, weapon sockets, collision masks). Every boss must have: name card intro (1.2 s), HP bar with phase ticks,
3 phases, ≥ 4 distinct attacks, telegraphs, one breakable part, safe-route proof passing, defeat sequence (chain explosions + debris + coin burst + slow-mo 0.4 s).
Weekly Run rotates 3 bosses per week from the pool (seeded by week key) so "new bosses weekly" holds.

## 6. Wing support ships (left/right)
- Left = offense (e.g. Laser Lance, Homing Swarm, Flak), Right = utility (Shield Pulse, Bullet Eraser, Magnet Field).
- Each: passive fire (≈ 15–20% of main DPS), active special on cooldown (8–20 s) with HUD button + auto-cast option on mobile.
- Formation: hug ship at ±38 px, lag-follow with spring (not rigid), tilt on movement; never block player's hitbox view.
- Upgrade levels 1–5 increase damage/cooldown; level 5 unlocks special evolution.

## 7. Upgrade tree & meta-progression
Currencies: Science Credits (soft, from kills/coins), Research Data (medals), RSC (wallet, cosmetic/continue only).
Tree branches (each 5 nodes): Firepower (main dmg, bullet count), Survival (shield HP, i-frames, extra life at node 5),
Support (wing DPS, cooldown), Fortune (coin magnet radius, credit gain), Overdrive (charge rate, duration).
Daily goals (3/day, e.g. "Destroy 150 enemies", "Clear a mission no-hit", "Break 2 boss parts") → Credits + Data;
Weekly goals (5) → cosmetic trail/ship skin unlock. Login streak shown but never punitive.
Unlocks cadence: something new every ~5 min of play for the first hour.

## 8. Difficulty curve
- Difficulty score per wave = Σ threatCost × fire-rate multiplier; target curve rises 6–8% per mission with a "breath" dip
  after each boss; sector start resets 10% lower than previous sector end.
- Player-power expectation table per mission; enemy HP scaled so time-to-kill stays in 0.4–1.2 s for regulars.
- Fairness: identical simulation on mobile and desktop (fixed timestep 60 Hz, same world size, desktop gets no extra view
  area — letterbox), touch relative-drag with 1:1 + optional 1.2× sensitivity, ship offset above finger.

## 9. Weekly Run + ResearchHub (core loop, must stay working)
- Weekly Run: seeded by ISO week (shared/weeklyRunPlan.js), new boss rotation each week, attempts, leaderboard, finalize job,
  winner claim → winner selects which ResearchHub proposal receives the prize (weekly-claim, weekly-funding-approval via
  api/events route after PR #44 fix).
- Proposals: live from `https://backend.prod.researchhub.com/api/funding_feed/?fundraise_status=OPEN…` (public, keyless),
  cached in Supabase, shown in-game: hangar "Signals" panel, pre-run card ("This week's prize goes to a proposal chosen by the winner"),
  results screen nudge. Graceful offline fallback (cached snapshot + link to researchhub.com/fund).
- Leaderboards: weekly + all-time, wallet or guest name, anti-cheat validation stays server-side.

## 10. Quality bar / review loop
Each round: build → unit/smoke tests → headless mobile (390×844, DPR 2, touch) scripted playthrough with autoplay bot →
screenshots + short video clips → critique vs references (feel, readability, fairness, curve, polish) → Codex fix round.

## 11. Codex job split (round 1, parallel worktrees)
A Juice/VFX/SFX · B Enemies & formation choreography + curve · C Bosses polish/port + telegraphs · D Meta (wing ships, upgrade
tree, daily/weekly goals, story) · E Weekly Run + ResearchHub + leaderboards E2E + preview mode · F Test harness (autoplay bot,
headless mobile playthrough, screenshots/video, smoke tests).

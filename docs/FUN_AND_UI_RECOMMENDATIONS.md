# Fun and UI recommendations (2026-08-04 review pass)

Written after the Galaxiga-style swarm overhaul, the paid-hull weapon revamp,
and the sector escalation pass. Each item names the concrete change, why it
would make the game more fun, and the rough cost. Nothing here is started;
this is the menu for Scott to pick from.

## Highest impact first

1. **Chain-kill combo multiplier (Galaxiga's core loop).** Kills within ~1.2s
   of each other build a chain (x2, x3, x5, x8) shown as a floating counter
   near the ship; the chain breaks on a miss window or when the player takes
   a hit. Coins and score scale with the chain. This is the single biggest
   "one more run" hook in the reference game and it rewards exactly the
   train-clearing the new entrances invite. Cost: engine counter + HUD text,
   one economy re-pin. Balance-neutral if coins from chains come out of the
   existing per-wave bounty ceiling.

2. **Enemy fire that reads.** Enemy projectiles are small and share colours
   with the field. Give each family a signature shot (spinner: red spark,
   jets: cyan needle, journals: orange orb) and add a half-second muzzle
   glow before an aimed volley. Players die to shots they never saw; that
   feels unfair, and unfair is the fastest way to lose a mobile player.
   Cost: renderer + three small sprites (procedural pixel-canvas works).

3. **"WAVE CLEAR" beat.** Right now a cleared wave rolls straight into the
   next. A 0.6s freeze-frame with the coin sweep, a "PERFECT" tag when no
   damage was taken, and the chain total gives each wave a payoff. Cost:
   presentation-only, no balance impact (the sweep window already exists).

4. **Per-hull stat card in the Hangar and ship picker.** Now that the hulls
   are genuinely different, show it: four bars (Damage / Coverage / Cadence
   / Pierce) next to each ship, plus the one-line spec. Paid ships need a
   visible reason to buy; today the difference is only felt in play.
   Cost: UI only; the numbers already live in `playerShipWeapons.ts`.

5. **Danger telegraph for the loop trains.** The first time a train boards
   from a flank, flash a small edge marker on that side for 0.4s. It teaches
   the pattern without nerfing it and stops the "where did that come from"
   deaths on sector 7+ where the trains are fuller. Cost: HUD sprite +
   engine event; no balance change.

## Feel and pacing

6. **Boss intro stinger.** Bosses warp in with a name banner but no music
   or camera beat. A one-bar drum fill (the techno synth already has one),
   a 0.3s slow-motion, and a low camera push sells the moment. Cost: audio
   cue + small renderer tween.

7. **Dive-return wrap polish.** Returning divers teleport to the top of the
   screen (Galaga-faithful) but with no fade. A 6-frame alpha fade-out at
   the bottom and fade-in at the top hides the pop; this also covers the one
   remaining ~90px handoff step logged in the ledger. Cost: renderer only.

8. **Late-sector "closer" waves.** Sectors 8-10 could end each combat Mission
   with a short all-out train (every pack in the Mission entering at once
   from both flanks) as the final beat before the boss-prep Mission. Cost:
   authoring via the surge tool; needs a matrix re-run.

## UI and onboarding

9. **Tutorial hint on the first Overdrive pickup.** "Projectile Upgrade I -
   bigger, stronger shots this Mission" as a one-time toast. Players read
   the pickup as a generic powerup and do not understand why their gun
   changed colour. Cost: one toast, one flag in the pilot profile.

10. **Pause menu: show the current hull's weapon line.** The pause card has
    mission and wave; adding "Hull: BTC - Hash bolt" ties the Hangar copy to
    the moment the player is wondering what they are flying. Cost: trivial.

11. **Home screen ship carousel: swipe hint on first visit.** The arrows are
    small on a phone; the group already announces swipe support to screen
    readers, so a single animated nudge on first launch is enough.

12. **Hangar weapon preview: fire against a target.** The preview dialog
    shows bolts flying into empty space. A dummy enemy silhouette that the
    preview rounds hit (and that BTC's bolt punches through) would make the
    pierce and spread differences instantly legible. Cost: preview-only.

## Systems worth a design conversation before building

13. **Difficulty toggle for Campaign replays.** The matrix shows 98% clears
    at the recommended power; a "Hard" replay mode (x1.3 enemy health,
    -1 starting life, x1.5 coins) would give the mastery loop teeth without
    touching the first-run curve.

14. **Daily contract.** One rotating goal ("clear Sector 3 with BIO",
    "chain 15 kills") for a small coin bonus. Cheap retention that reuses
    the achievement machinery.

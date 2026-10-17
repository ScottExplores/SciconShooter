# Remaster design notes

Lessons taken from public write-ups of Galaxiga (OneSoft) and a few other mobile shmups. No assets, names, or patterns were copied. SciCon keeps its ships, bosses, and ResearchHub story.

## What those games actually do

Galaxiga (Play Store / App Store, OneSoft) is a portrait shooter. Public pages (the Galaxiga Fandom overview and drone pages, the Level Winner guide, TouchArcade-style classic-shmup reviews, and player threads on r/Galaxiga) describe:

- The ship is dragged with a finger and fires on its own. A second finger is for a cooldown skill, not for aiming.
- Each squad is a ship plus two drones. Drones add a passive gun and one skill with a cooldown. The interesting choice is pairing a drone whose fire shape covers the ship's blind spot.
- Formations enter from the top and the sides, hold a shape, then peel. The readable moment is the peel, not the spawn.
- Bosses have a movement of their own. Guides tell the player to sit low, dodge first, and shoot the part that glows. Hunter-mode bosses are the same body with a new attack, not a new sprite.
- Campaign is a long chain of short stages. The story is thin. The loop that keeps people is "one more stage" plus a weekly or competitive board. The part players complain about is paying to get past a difficulty wall. SciCon should not copy that.

Comparable games, from reviews rather than from playing them here:

- Sky Force Reloaded (TouchArcade, TheSixthAxis, Pocket Gamer): each stage introduces an enemy job, and the boss attack changes. Stars teach you to watch bullets. Grinding the same stage is the part reviewers got tired of.
- Phoenix 2 (TouchArcade): one hit, dense patterns, a daily reset. The bullet has to be readable or the run feels random. Covering the ship with a thumb is the mobile failure mode, so the playfield has to stay in one portrait shape.
- Galaga Wars (TouchArcade): lines enter from any side, a rescued helper ship fires with you, and lifting the finger pauses. Little strategy beyond the formation.

## What that means here

- One portrait arena, 390 by 844, on every device. A desktop window letterboxes. Score, lanes, and bullet speed do not grow with the monitor. The step is fixed at 60 Hz.
- Wings are the two drones: distinct guns (fan, pierce, homing, heavy) that get more visible as the hangar level rises, plus a cooldown trick on the orbiter and the magnet. They are not a second player.
- Regular waves keep Scott's roles and add one sector signature so sector 6 is not sector 4 again: a shield you have to break, a hull that splits, a commit that does not return, or a turret that sits and fans shots. The choice is seeded from the event id.
- Bosses that already have clip timelines keep those attacks. A phase change now names the clip, opens a glowing core, and calls one orbiting drone from the existing drone art. Bosses without a timeline change pattern by health: a named phase, a short telegraph, the same drone, a fan, and a ram. Destructible cannons that were already authored stay the weak points. The boss-sandbox zip is a read-only runner around prototype sheets; those sheets stay out of the campaign.
- A sector signature is visible. Shields draw a plate. A splitter sheds two smaller hulls. A kamikaze bends into the ship and does not loop home. A turret sits and fans gold shots.
- The campaign letter is still short and skippable. Boss missions are briefed by the same four people, and the brief says what the boss will do.
- The weekly board is the competitive mode. The winner picks a proposal. Nothing in the game sends the prize. An admin approves, then records a transfer they already sent.

## What was deliberately left out

Galaxiga's gem grind, ad continues, four-squad swapping, and paid ship walls. Sky Force's star grind. Phoenix 2's one-hit death. Those are retention tricks, not the part that makes the shooting feel good.

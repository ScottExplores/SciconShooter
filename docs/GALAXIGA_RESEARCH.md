# What makes top mobile space shooters top tier — and how close SciCon can get

Scope: Galaxiga (OneSoft), Galaxy Attack: Alien Shooter (OneSoft), Sky Force Reloaded (Infinite Dreams), HAWK / Space Shooter-style arcade shooters, plus bullet-hell classics. Sources: official store pages, community wikis (galaxiga.fandom.com, alienshooter.org, sky-force-reloaded-2016.fandom.com), reviews (Nintendo Life, Level Winner, Talk Android), and our own headless captures. No assets are copied; we adopt design ideas only.
Scott's play-test feedback (Oct 17) is folded in at the end and overrides anything above it.

## 1. Enemy formations (Galaxiga / Galaxy Attack)
- Every wave is choreography. Ships stream in on mirrored spline paths in groups of 4–8, settle into a grid (5–8 wide), the grid breathes/sways, and individual ships peel off into dives, swoops and loops, then return to their slots. That is the Galaga DNA.
- Variety comes from shape, not just count: V, diamond, ring, spiral, "wall", two-column pincer, snake trains, escort pods (leader + guards).
- Levels are short: 5–10 waves, 2–4 minutes, with a boss every 4th level (Galaxy Attack: wave 10 of every 4th level). A breather or pickup moment comes between peaks.
- Late-game spice comes from enemy modifiers rather than new art: shields that drop briefly, teleporters, freezers, death-warheads, traps.
- **SciCon status:** job B (splines, dives) and job I (24–40 ship grids in sectors 1–2) done. Gap: formation variety in later sectors, plus enemy modifiers.

## 2. Boss design (Sky Force Reloaded is the gold standard)
- Bosses are huge (often 60–100% of screen width). They are assemblies of armaments: turrets, cannons, flamethrowers, engines, armor plates, a protected core.
- **Phases are gated by destruction.** You destroy all of the current armaments, the next layer opens up (shield drops, new cannons emerge), and finally the core is exposed. Every destroyed part gives a satisfying mini explosion, stars and points, and that weapon stops firing.
- Patterns are readable and learnable: charge-up glows, rotating laser sweeps with safe lanes, chevron bullet walls, and mines that home in once you are near. Omega rotates its lasers, and destroying generators narrows the beams.
- Entrance and exit are spectacle: portals, a warning siren and banner, a slow fly-in, a multi-stage death explosion with debris, then a short invulnerability window and coin rain.
- Galaxy Attack classifies bosses as pattern, random, multi-part, dual, mini, and world/clan bosses. Variety of type matters as much as variety of art. Boss Mode practice at max power gives learnability and retention.
- **SciCon status:** job C did 15 phased bosses with telegraphs and breakable emitters. Gap: more visible destructible parts with their own HP bars and art states, weak points that physically open, arena changes per phase (walls, hazards, background shift), minion summons, transformation mid-fight, dramatic entrance/death cinematics.

## 3. Background design
- Sky Force: hand-painted 2D backgrounds with lots of variety (rock, desert, factory, ocean with bobbing boats, night stages in dark blue so bullets pop), interactive/destructible ground objects, weather (clouds you can hide in).
- Galaxiga / Galaxy Attack: per-planet themes. Each world has its own colour grade, nebula, planets and debris, and backgrounds scroll with 3–5 parallax layers. Speed lines and warp transitions play between waves/levels.
- The rule in all of them: the background is darker and lower-contrast than the action layer.
- **SciCon status:** I dimmed the backgrounds, but Scott says they feel repetitive (same planets). Gap: a per-sector theme system, set pieces and warp transitions (see §7).

## 4. Juice / VFX
- Every hit gives feedback: a small spark, a number or chain popup, a brief tint. Every kill gets an explosion sized to the enemy, debris and a coin pop. Big kills add screen shake plus a short hit-stop, a flash and an audio stinger.
- Projectiles are bright, chunky and colour-coded. Player shots are cool colours and enemy shots hot or pink with dark outlines.
- Pickups bob, spin and glint, magnetise to the player with a trail, and collecting one gives a satisfying ping plus a counter tick.
- Power-level growth is visible: bullet count and width grow; super/overdrive modes change the screen.
- Glow and bloom come from additive sprites, not post-process blur (cheap on mobile).

## 5. Progression and upgrade loops
- Galaxiga: ships (gold upgrades → evolve with cards + gems → merge two maxed T1 ships into T2), 2 drones per ship, 1 stone (passive/ult, e.g. a bullet-erasing swan), technology passives, a 4-ship squad (next ship glides in on death), boosters (overdrive, power +3–10, shield, heart), daily chests, try-before-buy.
- Galaxy Attack: Power (30), Bullet Level (8→16 via evolve stones), Evolve (3), Rank (6), expert items, 2 drones of 10 types, endless mode, boss mode, PvP, world/clan bosses.
- The key is that every run pays out something visible, upgrades change how the ship looks and fires, and there is always a next goal on screen.
- **SciCon status:** job D's research tree, wings, medals and goals exist. Keep it fair and no pay-to-win (Weekly Run uses a fixed ranked loadout).

## 6. Mobile UI
- One-thumb play: drag anywhere, auto-fire, abilities in the bottom corners in the thumb zone. The HUD stays thin at the top, and nothing sits in the middle of the playfield.
- Home is a single hub: big ship showcase, a big PLAY button, mode tiles, and a bottom tab bar. Everything animates (idle ship, glowing buttons, badges, chests that shake when ready). Result screens count up, stamp stars and reveal rewards.
- Scott tested the round-2 home re-layout and **rejected it**. Use the original remaster layout, only fix clipped text and add subtle animation.

## 7. Scott's play-test feedback (Oct 17, overrides the above)
1. Home: revert to the original remaster/live layout. Only fix clipped text (Weekly Funding card, title) and add subtle animation; no restructuring.
2. Backgrounds: much cooler and less repetitive. Varied per-sector and per-mission backdrops: multi-layer parallax nebulae, star fields with speed streaks, drifting asteroids/debris, space stations, distant battles, colour-shifting themes per world, set-piece events (capital-ship flybys, warp transitions between waves). Pixel art.
3. Bosses more interactive: destructible parts/turrets, weak points that open, multi-phase with arena changes, minion summons, telegraphed dodge patterns, transformation, dramatic entrance and death.
4. Everything alive: motion everywhere, idle animations, screen shake, hit-stop, particles, glow/bloom, animated UI transitions, juicy pickups, combo/score popups.

## 8. How close can we get without Unity?
Galaxiga and Galaxy Attack are Unity 2D games. Their look is sprite animation + particles + additive blending + simple shaders, all of which Pixi v8 does natively on WebGL/WebGPU:
- Sprite-sheet animation, particle containers (tens of thousands of sprites), additive glow, colour-matrix and custom fragment filters (nebula noise, heat shimmer, warp streaks), render-to-texture caching and batching are all available. Job J already reached 48–57 FPS median in a CPU-only headless browser.
- **About 85–90% of the feel is reachable:** formations, multi-part bosses, parallax worlds, set pieces, VFX, UI animation and audio.
- **Harder:** Sky Force-style 3D destructible objects and real-time shadows. We fake them with pre-rendered pixel sprite states and layered parallax, which suits Scott's pixel style better anyway. Very heavy full-screen shader stacks on low-end Android are also harder; we gate them behind job J's Auto/High/Low quality governor.
- **The real limit is art volume:** Galaxiga ships hundreds of hand-drawn assets. We use procedural pixel generation (palette-locked noise nebulae, tiled debris, modular station kits), plus a small number of generated pixel assets that match Scott's style, reused with palette swaps per sector.

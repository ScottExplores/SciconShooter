# Scicon Animation and Audio Style Guide

This is the shared design language for Scicon Shooter sprites, menu animations,
boss mechanisms, borders, themes, and synchronized sound packs. Check this file
before creating a new asset so new work complements the existing library instead
of repeating an established idea.

## Core identity

- Semi-pixel presentation: crisp silhouettes and readable pixel clusters with
  enough painted detail to feel premium rather than extremely low resolution.
- Midnight navy and cobalt machinery, cyan/teal energy, violet crystal or core
  accents, and restrained bronze/gold structural highlights.
- Technology should feel engineered and slightly alien: visible hinges, sockets,
  armor seams, energy channels, pressure locks, and purposeful moving parts.
- Avoid generic mobile-game gloss, comedy science-fiction bleeps, and unrelated
  fantasy ornament unless a specific game system calls for it.

## Motion language

- Build important animations from separate transparent PNG parts with documented
  pivots and anchors. GIF files are gallery previews, not production assets.
- Large UI entrances use anticipation, a clear mechanical action, one restrained
  overshoot, and a soft settle. Do not stack several bounces.
- Mechanical parts move on believable hinges. Paired parts should have slightly
  different timing or phase so the object feels alive without becoming messy.
- Hovering is subtle: generally 2–4 pixels of travel, less than 1% scale change,
  and a loop around 1.2–1.6 seconds.
- Effects should support the silhouette rather than obscure it. Prefer short
  cyan/violet glows and controlled particles over continuous visual noise.

## Audio language

- Primary character: futuristic pressure doors, compact servos, low mechanical
  latches, filtered air movement, and restrained energy resonance.
- Audio follows visible mechanisms. A hinge sound belongs to a hinge event; a
  lock sound belongs to the instant the plaque or armor stops moving.
- Use few layers. A normal UI mechanism should usually contain one opening sound,
  one soft lock, one optional energy settle, and a very quiet idle loop.
- Keep machinery mostly in the 55–1,600 Hz range. Air and energy texture may
  extend higher, but should remain soft rather than piercing.
- Tonal energy should be non-melodic or use a stable low interval. Avoid arcade
  bleeps, repeated dings, bell runs, reward jingles, and excessive sparkle notes.
- Hover loops remain well below the entrance sound and fade out when the screen
  closes. Silence between actions is part of the design.
- Production format is stereo 48 kHz PCM WAV. Gallery mixdowns are previews only;
  the game triggers individual cues through animation events.

## Consistency and reuse protocol

1. Search the gallery and this registry before designing a new mechanism.
2. Give every animation a unique ID and functional description.
3. Reuse an existing sound family when the same mechanism reappears. Make a new
   cue only when the material, size, or action is meaningfully different.
4. Store layered PNGs, pivots, motion timing, audio events, and preview paths in
   the animation manifest.
5. Add one main animated preview to the Animations library. Show a sound badge on
   that preview when synchronized audio exists; do not create waveform artwork or
   a separate decorative PNG for the sound.
6. Record the finished asset in the registry below.

## Asset registry

| ID | Function | Visual signature | Motion signature | Audio family | Reuse notes |
|---|---|---|---|---|---|
| `scicon-victory-signet` | Victory/menu announcement | Navy plaque, cyan hinges, violet crystals, bronze honeycomb wings | Drop, horizontal plaque reveal, paired wing unfold, restrained settle, quiet hover | Compact pressure-door servo, soft latch, subtle power settle, low hover | Reuse this family for prestigious menu panels and achievement borders; change proportions and accent arrangement rather than duplicating the signet. |
| `scicon-defeated-banner-v1` | Defeat/menu announcement | Decayed navy/cobalt armor, torn violet membranes, exposed cables, rust wear, weak cyan rails, and paired crimson warning rotors | Drop and horizontal reveal, damaged wing unfold, weak settle, then a restrained live loop with opposing rotor turns, traveling light lines, slight independent wing movement, emergency flicker, and 2 px hover | Audio not yet authored; reserve hooks for damaged mechanism open, weak latch, rotor start, and low-power idle | Render DEFEATED as live text. Runtime uses registered layered PNGs and the manifest timeline; GIF and sequence PNG are gallery/approval previews only. Keep the decay asymmetrical and the loop subtle. |
| `scicon-boss-alert-banners-v1` | Encounter-intro alerts for Mini-Boss, Boss Incoming, and Apex/Final Boss tiers | Shared navy/cobalt command construction with escalating accents: amber/cyan compact hardware, crimson breach machinery, then violet/emerald/gold crown-and-claw armor | Drop and horizontal reveal, brief text glitch/fade, warning-core power-up, rotating core overlays, traveling rail scans, restrained flicker, and a quiet hold before HUD handoff | Audio not yet authored; reserve one mechanical alert family with intensity and gain increasing by tier | Render tier labels and boss names as live text. Play once when the encounter begins, then exit and reveal the existing boss-name/integrity HUD. Production frames share a registered 1024 × 360 canvas; GIFs are previews only. |
| `scicon-interface-pack-v1` | Core menus, buttons, settings, communication, rewards, and navigation | Midnight navy machinery, electric cyan seams, orange/gold action accents, beveled semi-pixel forms | Press/settle for controls; optional 2-4 px hover for featured windows; thrusters flicker independently | Existing Scicon compact servo/pressure-door family; quiet UI clicks only where an action needs confirmation | This is the canonical base UI family. Compose screens from these parts before designing another frame language. Runtime text stays separate from the artwork. |
| `scicon-ui-system-v2` | Full React/Pixi product UI: shell, HUD, podiums, weekly funding, records, wallet, forms, tutorial, results, and status | Orbital Research Command: navy/cobalt die-cast frames, cyan rails, gold action clamps, emerald funding/verified state, violet research sockets | Four layered mechanisms plus hover/pressed/selected/disabled component states; text and values remain live above the art | Reuse the existing servo/pressure-door family; manifests name champion, vault, verification, and alert event hooks | Canonical full-product UI system. Prefer its 392 production PNGs and implementation map before adding another component family. |
| `scicon-first-place-row-component-idle-v2` | First-place leaderboard living-machinery idle | Existing gold/cobalt podium row plus generated semi-pixel turbine housings, asymmetric blade disks, four crown-diamond energy drawings, six rail-lamp illumination drawings, and block-pixel energy pieces | Fixed 752 x 306 registration; opposing turbine blades physically rotate, crown diamond and twelve rail lamps use registered frame swaps, and brief pixel beams fire only between nearby sockets; the complete row never moves | Silent idle; reserve a short champion cue for the transition into first place, not for each loop | This is a component animation rather than a full-row glow overlay. Rank, player, and score remain live UI. Runtime uses the registered PNG parts; GIF and sequence PNG are previews only. |
| `start-mission-floating-window` | Home-screen player-ship showcase and primary Start Mission action | Tall navy/cobalt mission console, cyan energy rails, symmetrical wing thrusters, orange-gold launch cradle | 1.92-second sine-wave hover at 6 px amplitude with restrained cyan glow; scale remains fixed; reduced-motion mode is static | Hover stays silent; reuse the compact launch servo only when the mission actually begins | Keep the center available for live ship-selection content. Render START MISSION and the play icon as accessible live UI over the orange cradle; GIF and labeled PNG are previews only. |
| `scicon-flight-motion-pack-v1` | Player steering, player-ship selection idles, regular-enemy idle motion, and early mini-boss damage presentation | Four logo-embodied ship identities: laboratory-flask ResearchHub, organic BIO, crystalline-diamond ETH, and coin-hull/double-hash BTC; enemy faction palettes preserved; violet Bottleneck and rose Paywall mini-boss families | Five-view input-driven banking from broad neutral through 3/4 to narrow edge-on hard-bank profiles; localized identity-specific selection pulses at 8 fps with fixed hulls, identical registration, and resting boosters; 7-9 fps ping-pong enemy loops; boss idle/attack plus 50% and 15% damage states | Reuse current engine/thruster and damage-impact audio families when implemented | Never rotate one flat steering texture in the image plane. Selection idles never scale, translate, or animate thrust. Production uses transparent PNG frames and fixed collision geometry. GIF files are gallery previews only. |
| `scicon-parallax-terrain-pack-v1` | Long scrolling round backgrounds and independently placed environmental landmarks for Desert, River, and Space stages | Semi-pixel terrain with an open central combat lane; warm sandstone and violet ravines, mossy teal waterways, or navy/cyan/violet research space | Background scroll is continuous and understated; props occupy separately tuned parallax layers and never imply collision by artwork alone | Ambient terrain audio remains a separate system; no audio is baked into gallery previews | Use one 512 x 4096 round master for a normal stage. For longer stages, queue a second master with a 256 px crossfade instead of hard-wrapping. Keep the 27 transparent props separate for procedural variety. |
| `scicon-compact-top-hud-v1` | Compact mobile gameplay top bar for lives, flask charge, score, wave, boss name/integrity, and pause | Blank navy/cobalt semi-pixel frames with cyan seams, restrained gold clamps, registered hollow-heart/red-health and hollow-beaker/cyan-liquid layer pairs, wave chevrons, and research medallion | Heart health drains top-to-bottom; beaker charge rises bottom-to-top while its horizontal rail fills left-to-right; beaker and rail are both 128 px high; pause has normal, selected, and pressed states; live text remains separate | No top-bar sound control or dedicated audio cue | Never bake changing values into PNGs. Mask registered fills without rescaling their shells. Keep the number panel blank for live code-driven values. The sound button has intentionally been retired from this HUD family. |
| `scicon-dashboard-icons-v1` | Dashboard cards, shortcuts, and primary/secondary navigation | Twenty original research-command pictograms on shared 256 px canvases: structures, spacecraft, holograms, separate Science and Proposals identities, trophies, funding, systems, profile, communication, market, records, network, help, and security | Normal icons remain crisp and restrained; selected icons add a controlled cyan focus glow without changing registration or scale | No dedicated sound family; reuse the quiet navigation confirmation cue only when selection changes | Labels, counts, attention dots, and lock overlays remain live UI. Use normal for inactive and selected for active/hover/focus. Do not bake status indicators into icon art. Retain the combined Research icon only for backward compatibility. |

## Interface Pack v1 rules

- Use the blank primary orange plaque for the strongest action and the cyan
  secondary plaque for navigation or a less destructive alternative.
- Keep labels, numbers, prices, and localization out of the PNG artwork. The
  game renders them at runtime over the blank controls and window title rails.
- System and communication icons share one square frame size, so they may be
  swapped without rebuilding surrounding layout.
- The floating window is a production rig made from separate window, wing,
  thruster, flame, bracket, and glow PNGs. Its GIF is only the gallery proof.
- Hover motion should remain subtle. Change flame sprites out of phase instead
  of bouncing the whole panel dramatically.

## Victory Signet timing reference

- `0 ms`: pressure/servo opening begins.
- `620 ms`: plaque reaches its mechanical lock.
- `700 ms`: quiet energy pressure settles around the crystals.
- `1,120 ms`: low hover loop begins and remains nearly subliminal.

The synchronized gallery mix is for approval. Runtime code should trigger the
individual cue files from `animation-manifest.json`.

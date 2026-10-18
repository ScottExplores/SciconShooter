# Revamp boss encounters

The pool contains 15 encounters: the ten existing campaign commanders plus five authored story variants available in Weekly Run and the boss lab. Scott's installed artwork, rigs, asset files and reward source identities are preserved. Variants select existing art through `sourceBossId`; no asset is replaced.

## Encounter roster

Attack warnings below are simulation seconds at 60 Hz. They never shorten in rage. Every boss has a 1.2 s title/epithet intro, phases at 100/66/33%, a one-second invulnerable phase transition, rage at 15%, one targetable part, and an exposed-core recovery.

| ID | Name | Sector | Phases | Attacks / warning time | Breakable part | Safe-route status |
| --- | --- | --- | --- | --- | --- | --- |
| `gatekeeper-prime` | Gatekeeper Prime | Launch Bay | 100% Gate Check<br>66% Restricted Access<br>33% Open Resistance | Rejection Volley: 0.80 s<br>Access Ring: 0.90 s<br>Embargo Lattice: 1.20 s<br>Final Notice: 1.10 s | Access Cannon; removes Rejection Volley | Proven: 4,860 scenarios |
| `prism-moth` | Prism Moth | Citation Storm | 100% Crystal Nursery<br>66% Prism Metamorphosis<br>33% Brood Eclipse | Crystal Fan: 0.85 s<br>Prism Bloom: 0.95 s<br>Wingbeat Weave: 1.25 s<br>Kaleidoscope Gate: 1.15 s | Brood Prism; removes Crystal Fan | Proven: 4,860 scenarios |
| `frontier-crownclaw` | Frontier Crownclaw | Peer Review Nebula | 100% Bastion Lock<br>66% Crown Cross Link<br>33% Critical Review | Claw Crossfire: 0.90 s<br>Crown Aperture: 1.00 s<br>Bastion Crabwalk: 1.30 s<br>Critical Cross Link: 1.20 s | Harpoon Claw; removes Claw Crossfire | Proven: 4,860 scenarios |
| `helios-clawcarrier` | Helios Clawcarrier | Grant Desert | 100% Siege Calibration<br>66% Armor Shear<br>33% Reactor Overload | Claw Battery: 0.80 s<br>Reactor Aperture: 0.90 s<br>Machine Gun Channel: 1.20 s<br>Solar Foreclosure: 1.10 s | Port Battery; removes Claw Battery | Proven: 4,860 scenarios |
| `nullwake-revenant` | Nullwake Revenant | Null Hypothesis Void | 100% Borrowed Charge<br>66% False Recovery<br>33% Backplane Crown | Borrowed Charge: 0.85 s<br>Null Halo: 0.95 s<br>Memory Lattice: 1.25 s<br>Backplane Divide: 1.15 s | Memory Relay; removes Borrowed Charge | Proven: 4,860 scenarios |
| `singularity-crab` | Singularity Commander | Singularity Archive | 100% Gravitational Calibration<br>66% Event Horizon Gaze<br>33% Archive Liberation | Pylon Barrage: 0.90 s<br>Event Horizon: 1.00 s<br>Tidal Channel: 1.30 s<br>Archive Collapse: 1.20 s | Gravity Pylon; removes Pylon Barrage | Proven: 4,860 scenarios |
| `orbit-gyroscope` | Aurora Oculus | Replication Reef | 100% Survey Orbit<br>66% Reverse Overdrive<br>33% Signal Lock | Survey Fan: 0.80 s<br>Orbital Aperture: 0.90 s<br>Reverse Orbit: 1.20 s<br>Oculus Divide: 1.10 s | Survey Lens; removes Survey Fan | Proven: 4,860 scenarios |
| `hammerhead-siege` | Gloamforge Mantis | Impact Factor Forge | 100% Crucible Measure<br>66% Cleaver Unfurl<br>33% Forge Unbound | Crucible Barrage: 0.85 s<br>Smelter Halo: 0.95 s<br>Cleaver Weave: 1.25 s<br>Furnace Shutters: 1.15 s | Crucible Arm; removes Crucible Barrage | Proven: 4,860 scenarios |
| `paywall-decimator` | Paywall Decimator | The Paywall | 100% Metered Access<br>66% Premium Lock<br>33% Subscription Collapse | Invoice Volley: 0.90 s<br>Premium Perimeter: 1.00 s<br>Shutter Channel: 1.30 s<br>Renewal Deadline: 1.20 s | Billing Cannon; removes Invoice Volley | Proven: 4,860 scenarios |
| `umbra-needlewing` | Umbra Needlewing | Data Graveyard | 100% Wing Survey<br>66% Blackout Hunt<br>33% Last Evidence | Predator Needles: 0.80 s<br>Wing Shard Gate: 0.90 s<br>Needle Lattice: 1.20 s<br>Blackout Ambush: 1.10 s | Needle Projector; removes Predator Needles | Proven: 4,860 scenarios |
| `peer-reviewer` | The Peer Reviewer | Peer Review Nebula | 100% Initial Submission<br>66% Major Revisions<br>33% Decision Pending | Reviewer Two: 0.85 s<br>Circular Reasoning: 0.95 s<br>Revision Queue: 1.25 s<br>Desk Rejection: 1.15 s | Review Stamp; removes Reviewer Two | Proven: 4,860 scenarios |
| `impact-factor` | Impact Factor | Impact Factor Forge | 100% Measure<br>66% Rank<br>33% Reject | Metric Scatter: 0.90 s<br>Prestige Orbit: 1.00 s<br>Ranking Ladder: 1.30 s<br>Quartile Cutoff: 1.20 s | Citation Counter; removes Metric Scatter | Proven: 4,860 scenarios |
| `grant-reaper` | Grant Reaper | Grant Desert | 100% Application<br>66% Panel Review<br>33% Final Cut | Budget Cuts: 0.80 s<br>Funding Cycle: 0.90 s<br>Austerity Channel: 1.20 s<br>Deadline Guillotine: 1.10 s | Budget Siphon; removes Budget Cuts | Proven: 4,860 scenarios |
| `citation-hydra` | Citation Hydra | Citation Storm | 100% One More Source<br>66% Recursive Review<br>33% Infinite Appendix | Reference Fork: 0.85 s<br>Recursive Halo: 0.95 s<br>Bibliography Weave: 1.25 s<br>Retraction Gate: 1.15 s | Reference Crown; removes Reference Fork | Proven: 4,860 scenarios |
| `replication-crisis` | Replication Crisis | Replication Reef | 100% Observation<br>66% Independent Trial<br>33% Null Hypothesis | Duplicate Signal: 0.90 s<br>Confidence Halo: 1.00 s<br>Control Group: 1.30 s<br>Null Result: 1.20 s | Replication Prism; removes Duplicate Signal | Proven: 4,860 scenarios |

## Learnable attack rules

1. **Aimed fan:** the emitting socket glows amber and the fan locks to the ship's location at warning start. Move sideways after the lock. No fire-time tracking. A narrow fan envelope preserves a route for the conservative, unupgraded ship even in phase-three rage.
2. **Gap ring:** magenta radial trajectories reveal an omitted sector aimed at one of four lower-arena waypoints. The aperture follows the existing BossPatternRuntime ping-pong rule, reversing direction in phase two.
3. **Weave wall:** amber columns leave two of seven lanes completely clear. The two-lane opening moves one step and reverses at the boundary, avoiding an impossible edge-to-edge wrap. Later phases add rows rather than closing the opening.
4. **Lane salvo:** two magenta danger columns commit to the old player position for at least 1.1 s before firing. They damage for 0.4–0.5 s; the ship can move out during the warning.

Phase one teaches fan/ring, phase two introduces weave, and phase three introduces lane salvo. The destroyable emitter removes the fan permanently and immediately interrupts a committed attack. Its HP is 15% of boss HP. The exposed emitter sits on the lower hull edge, with a small procedural metal housing and connector, so ordinary upward shots reach it before the hull; a real-engine travelling-shot test covers all fifteen bosses. Part break staggers the boss for 1.2 s with 1.75× damage; recovery gives 1.45× damage. All attack windows cancel remaining boss hazards at age 180 frames, then leave 1.0–1.4 s of completely quiet recovery. This explicit boundary prevents overlapping patterns from invalidating an individual attack proof.

Warnings use amber/magenta geometry plus emitter glow and a warning sound event. Colour is never the only cue: trajectories, the gap, growing charge and the part target ring communicate the rules. The encounter controller locks the entire immutable plan on the warning frame; both the renderer and projectile/beam spawning consume that plan.

## Safe-route proof and its limits

Run `node --test tests-revamp/C/catalog.test.mjs`. The suite replays **72,900 scenarios**, using the same `createBossAttackPlan` that the live adapter spawns. Each successful route is simulated a second time and its witness hash must match. Tests also reject an arena-filling danger zone and warnings under 0.6 s, so proof results are computed rather than asserted metadata.

The player bounds/speed/acceleration come from the existing `services/gameplay/bosses/BossSafeRouteProof.ts`: 51.24 × 63.44 px, 2.5 px/frame and 0.38 px/frame². Proof collision uses swept rectangles larger than the live bullet hitboxes, 3 px geometry uncertainty, and at least 6 px additional clearance. No upgrades, invulnerability, part removal or touch-speed advantage are assumed.

For every boss, coverage includes three phases, normal/rage speeds, all six ring positions and ten weave positions, three runtime muzzle heights (155, 230 and 300), five starting columns (52/123/195/267/338), and three lower-arena starting heights (55/70/85%). Routes begin at the specified position with zero velocity, accelerate continuously, and survive through the frame-180 bullet cancel. All patterns share the fixed **390 × 844 world** on phone and desktop.

This is a bounded, replayed combat-space proof, not a claim that every possible position touching the boss hull is survivable. The controller keeps its emitter at arena centre and within the tested 155–300 px height envelope. Starts beside the hull, simultaneous external enemy hazards and unmodeled custom arena dimensions are outside this certificate. Phase changes and part breaks cancel hazards and create a safe reset, so they only reduce this attack envelope.

## Art/design provenance and pool selection

Blueprint references were inspected read-only in Boss Test Runner V0.34's prebuilt `public/runner/assets/index-zUOQETCN.js` and `public/runner-assets/manifest.json`. The existing Prism Moth nursery/metamorphosis, Frontier bastion/cross-link, Helios siege/reactor, Nullwake backplane and Aurora/Gloamforge identities informed the authored attack names and phase presentation. The new revamp patterns deliberately use the installed campaign art and shared deterministic primitives; the runner bundle is not imported or modified.

Canonical `stage-*` events retain their ten familiar commander identities. Weekly major encounter slots alternate variants within each source identity; the existing week-seeded source-boss shuffle determines which variant occurs. Tests use the authoritative shared weekly planner across 52 weeks and verify that all fifteen encounters are reachable in the first 40 stages, preserving source gameplay/reward provenance. Other generated event IDs use a deterministic hash. Explicit `revamp:<id>` events select a particular profile. The five additional story identities are The Peer Reviewer (Gatekeeper art), Impact Factor (Aurora art), Grant Reaper (Helios art), Citation Hydra (Frontier art), and Replication Crisis (Prism art). They are authored encounter variants, not five newly drawn rigs.

## Boss lab and tuning

Open `?bosslab=gatekeeper-prime`, or substitute any roster ID. The lab starts a dedicated encounter at full power; each entry can be reproduced for a phone screenshot with the same world geometry.

Content/timing lives in `services/revamp/bosses/catalog.ts`; geometry and the 180-frame lifetime live in `patterns.ts`; proof coverage lives in `safeRoute.ts`. The controller owns intro/phase/stagger/recovery timings and vulnerability multipliers. Re-run the focused suite after changing projectile speed/count, aperture width, warning time, emitter height, player collision, or lifetime. Never reduce warnings below 36 frames or remove the cancellation boundary without updating the proof.

## Effect/event contract (job A / progression consumers)

`services/revamp/events.ts` exports `RevampEvent = { type: string; [key: string]: unknown }` and `revampEvents.on(name, listener)`, `.off(name, listener)`, `.emit(name, payload)`. `on` returns an unsubscribe function; `'*'` observes all events. Delivery is synchronous and listener failures cannot interrupt combat. Consumers must unsubscribe on teardown.

All boss payloads include `bossId` (content profile), `entityId` (this encounter), `frame` (simulation frame), `phase`, and world-space `x/y`. Durations expressed as frames freeze with pause. Optional VFX must never own damage, invulnerability, rewards, or attack timing.

| Event | Additional payload / consumer behavior |
| --- | --- |
| `boss:intro` | `name`, `epithet`, `durationFrames: 72`; title card already rendered by C. |
| `boss:warning` | `attackId`, `durationFrames`, `sockets`, `lines`, `zones`, `color`, `sound`; C renders mandatory cues and plays warning audio even without a subscriber. Avoid playing a duplicate warning sample. |
| `boss:attack` | `attackId`; optional muzzle flash/recoil. |
| `boss:phase-transition` | `durationFrames: 60`, `sound: 'boss_roar'`; C enforces immunity and plays roar/flash. |
| `boss:bullet-cancel` | `reason: 'phase' | 'part-break' | 'recovery' | 'defeat'`, `bullets: {x,y}[]`; bullets are already removed. Render sparkles only. |
| `boss:rage` | Rage begins at 15% HP; no warning reduction. |
| `boss:recovery` | `durationFrames`, `damageMultiplier: 1.45`; all old hazards are already cancelled. |
| `boss:part-break` | `partId`, `disablesAttackId`, part-center `x/y`, `durationFrames: 72`, `damageMultiplier: 1.75`; progression can count one part break per encounter. |
| `boss:defeat` | Once per encounter; common engine path still records score/kill/coins. |
| `boss:explosion` | Six events, `offsetFrames: 0,5,10,15,20,25`, `x/y`, `scale`; schedule these offsets relative to the supplied defeat frame. |
| `boss:debris` | `count: 12`, `color`; presentation only. |
| `boss:coin-burst` | `count` from existing `bossCoinBurst.ts`, `visualOnly: true`; do not award coins again. |
| `boss:slow-mo` | `durationMs: 400`, `timeScale: 0.3`; job A's presentation clock can consume this request. |

The local defeat path retains the existing explosion and physical coin burst. The extra chain/debris/slow-motion events deliberately await job A's effect subscriber. Avoid slowing only enemies or changing the shared 60 Hz simulation based on display device.

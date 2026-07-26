# Helios Clawcarrier V2

## Authority and scope

- Sandbox ID: `helios-clawcarrier`
- Status: Sandbox-only Helios refinement; runtime, rig, safe-route, and viewport evidence must pass together before promotion
- Canonical execution path: `GameStage -> GameCanvas -> GameEngine -> PixiGameRenderer`
- Authoritative gameplay visual: the registered `modular-hierarchy-v1` rig, not the concept board, legacy `articulated-pincer-v1` presenter, assembled fallback, or review overlay
- Authoritative attack source: the compiled 23.5-second looping timeline with exactly three core attacks and one signature attack, each with a variant for all three phases
- Campaign status: no Mission reference and no promotion approval

## Identity

- Fantasy: a disciplined solar siege carrier that uses two crescent claws, paired rotary housings, and an exposed reactor as readable physical weapons.
- Combat role: deliberate route-control and anatomy-reading boss; its challenge comes from sequential mounted fire, corner-clamp routing, staged mines, and a bait-and-escape signature rather than blanket speed escalation.
- Silhouette: broad teal central shell, two native-handed crescent claws, paired mounted rotary guns, inner mandibles, four small stabilizer legs, and a visible amber reactor.
- Unique mechanism: every projectile samples its current animated rotary/reactor socket, while melee damage follows only the visible operational claw tip during its close window.
- Player learning arc: learn alternating rotary rhythm, then two corner clamps and their destruction remixes, then downward reactor fans and armed-mine routes, then combine tracking, locking, diving, and closing claws in Clawcarrier Crush.

## Locked art and rig contract

- Locked reference board: `director-data/prototype-assets/helios-clawcarrier-v2/source/reference-board.png`
- Reference board SHA-256: `9b0edf76349b45ebf2b0ede41cc87e14e1dc9ee60ea8e3f87b60ce5763cd43e9`
- Review-only neutral crop: `helios-clawcarrier-v2-canonical-reference.png`, SHA-256 `8d6ce675283e1bb3dfd684247c13efaf80f1230400b529032dea3467f9177cb4`
- Authoritative neutral assembly: `helios-clawcarrier-v2-neutral.png`, 460 x 330, SHA-256 `a4797077b4da9c1569d861cb11273383913f5a71dbb05ddadbac53e80c93d8d0`
- Authoritative atlas: `helios-clawcarrier-v2-atlas.png`, 2048 x 1024, binary structural alpha, SHA-256 `47e8fd0f33c6e6a53589567327f7325c73e1a7d70f964025023b71a820c405ea`
- Asset-usage proof: `helios-clawcarrier-v2.asset-usage.json`; all 60 source cells are classified, all 40 runtime frames have consumers, and future/archived cells remain forbidden from runtime.
- Rendering: nearest-neighbor, aspect-preserved scaling; structural sprites stay opaque. Glow and warning presentation are separate effects.

### Authoritative anatomy

| Mechanism | Registered parts and sprite frames | Owned sockets | Runtime responsibility |
|---|---|---|---|
| Central carrier | `body.closed`, `body.open`, `body.damaged` | `reactor-core` on `body` | Phase silhouette, significant damage, recovery exposure, reactor origin |
| Port claw | `claw.port.mount`, `claw.port.shell`, `claw.port.attack`, `mandible.port` | `claw-joint-port`, `claw-tip-port` | Port sweep, pincer articulation, moving melee hit region |
| Starboard claw | `claw.starboard.mount`, `claw.starboard.shell`, `claw.starboard.attack`, `mandible.starboard` | `claw-joint-starboard`, `claw-tip-starboard` | Starboard sweep, pincer articulation, moving melee hit region |
| Mounted rotaries | `weapons.mount`, `rotary.port.0` through `.3`, `rotary.starboard.0` through `.3`, `muzzle.flash.2` | both heavy/rotary muzzle pairs | Inherit body motion; sample live sockets; synchronize each sequential shot with one starburst and recoil |
| Stabilizer legs | `leg.outer-port`, `leg.inner-port`, `leg.inner-starboard`, `leg.outer-starboard` | none | Small body-owned secondary motion only; never a hitbox or projectile source |
| Reactor aperture | `reactor.closed`, `reactor.open` | `reactor-core` | Downward fan origin, visible mine deployment, recovery vulnerability |

The registered projectile sprite families are `boss-heavy-shell`, `boss-gatling-tracer`, `boss-reactor-pellet`, and `boss-helios-mine`, each backed by four equal-registration pixel frames. Helios currently uses the tracer, reactor-pellet, and mine vocabulary in the rebuilt attacks; the heavy-shell family remains a classified runtime-ready Helios asset but is not a separate fifth attack.

## Communication contract: anatomy, never instructions

- Helios must not spawn attack-name text, `SAFE GAP` text, generic gap guides, or generic side-barrage guides during its attack timeline.
- Standard HUD information is allowed; it is not part of the attack teaching language.
- Recognition must come from claw opening/closing, shoulder rotation, body/reactor frame changes, barrel spin, muzzle animation, physical movement, and exact origin-linked warnings.
- Debug socket, collision, landmark, and safe-route overlays are review tools only. They default off and may appear only in explicitly labeled proof captures.
- The canonical reference-comparison sprite is review-only, defaults off, and can never become gameplay art, collision, a projectile source, or a socket source.
- `director/tests/heliosSafeRouteProof.test.mjs` rejects `isBossGapGuide`, `isBossSideBarrageGuide`, and text-effect entities on every captured attack frame.

## Implemented attack sentences

### 1. Twin Rotary Crossfire — core

- Player skill: rhythm dodge and side-order recognition.
- Anatomy: `rotary.port` and `rotary.starboard` under `weapons.mount`; every round uses the exact current live port/starboard rotary origin.
- Recognition cue: one four-frame rotary spins and braces first, the opposite housing answers, then both commit together.
- Beats: three individually timed opening shots, a delayed three-shot reply, then eight alternating coordinated shots, with a barrel-frame step, starburst muzzle flash, and recoil only on each shot frame.
- Safe rule: clear the first short burst, cross behind the delayed reply, then hold the center gap during the twin volley.
- Bounded remix: phase variants change the first side and coordinated sequence while preserving the three-beat rule.

### 2. Claw Sweep Pincer — core

- Player skill: shifting-channel routing around visible moving anatomy.
- Anatomy: both claw mounts, claw/mandible sprites, and live `claw-tip-port` / `claw-tip-starboard` hit regions.
- Recognition cue: Helios travels to one corner with its connected claw open, tracks briefly, locks, closes, releases, and then answers from the other corner.
- Beats: port/starboard order varies by phase, but each side always reads `move -> open -> track -> lock -> close -> release -> return`.
- Safe rule: cross away during travel, leave the tracked corner before lock, and remain outside the visibly closing live claw tip.
- Destruction matrix: intact uses one lower-corner beat per live claw; if either arm is destroyed, its requested beat is skipped and the surviving arm performs only its own valid corner attempt. Both destroyed skip the clamp and select sequential rotary fallback fire. A hidden or destroyed claw cannot render, animate, or damage.

### 3. Reactor Maze — core

- Player skill: cross sequential downward fan lanes while accounting for a separately staged secondary hazard.
- Anatomy: open body/reactor frames and the live `reactor-core` warning/fire origin.
- Recognition cue: the body braces and reactor opens before drawing a bounded fan downward one round at a time; the mine beat visibly deploys, arms, detects proximity, explodes, and cleans up.
- Beats: fan, reordered fan, deterministic three-mine formation, final fan, vent and recovery.
- Safe rule: cross between staggered fan lanes and route around armed mines before their visible explosion-active frames.
- Bounded remix: every angle remains within the 8-through-4-o'clock envelope; sequence changes only emission order and mine formation. Deploying and armed mines do no damage.

### 4. Clawcarrier Crush — signature

- Player skill: bait a tracker, recognize the lock, escape the committed dive, and respect the closing claw tips.
- Anatomy: whole carrier translation plus both claw mounts, claw/mandible frame swaps, and live claw-tip hit regions.
- Recognition cue: the carrier rises, opens both claws, follows briefly, freezes its target, dives, then closes.
- Four repeated typed stages: `rise-open -> track-lock -> dive-close -> hold-release-return`.
- Safe rule: bait during tracking, leave the locked area before the dive, remain outside the closing tips, then punish the release/return recovery.
- Bounded remix: the phase sequence changes the deterministic stage offset without introducing unrestricted tracking or random target changes.
- The former temporary center exhaust/deployment sprite, mount, socket, and hitbox are archived and absent; Crush uses only the permanent hull, reactor, rotaries, claws, legs, and thrusters, then returns to the identical neutral rig.

## Meaningful phase transformation

| Phase | Visible anatomy change | Rule remix |
|---|---|---|
| Siege Calibration | Closed body, concealed reactor, narrow neutral claws, slow dormant rotary tick | Port-first crossfire, port-first sweep, clockwise reactor order `[0,1,2,3]`, Crush sequence `0` |
| Armor Shear | Body opens, amber reactor becomes continuously visible, claws spread and roll outward, stabilizer legs brace, rotaries remain visibly active | Starboard-first crossfire and clamp, reversed fan order `[5,4,3,2]`, Crush sequence `4` |
| Reactor Overdrive | Damaged body persists, port claw droops while starboard braces, legs tuck asymmetrically, reactor reverses its ambient rotation | Port-first crossfire, starboard-first clamp, center-out fan order `[2,4,1,3]`, Crush sequence `8` |

Phase speed multipliers move only from `0.72` to `0.75` to `0.78`. Those small changes support the presentation; side order, anatomy, aperture order, and signature staging are the actual escalation.

## Lifecycle

- Entrance: folded claw mounts unfold into the connected neutral pose.
- Idle: restrained whole-body hover, opposing claw motion, and slow rotary frame progression without non-uniform sprite distortion.
- Anticipation/recoil: each primitive drives its owning mechanism; crossfire spins/recoils barrels, sweeps rotate the selected claw, Reactor Maze exposes the core, and Crush opens then closes both claws.
- Significant hit/stagger: short directional whole-rig reaction is reserved for meaningful impact; ordinary damage does not make the entire boss flinch.
- Persistent damage: `body.damaged`, asymmetric claw posture, exposed reactor, and leg bracing remain visible in Reactor Overdrive.
- Recovery: claws release, barrels spin down, body/reactor stay open, and the player receives a real punish window.
- Destruction: a deterministic 90-frame sequence detaches registered structural fragments, including the outer stabilizer legs. Sockets stop being combat sources once death begins.

## Evidence and proof gates

### Programmatic evidence already present

- Fixed gameplay seed: `helios-v2-safe-route-proof`.
- `director/tests/heliosSafeRouteProof.test.mjs` reconstructs the real compiled attacks through `GameEngine`.
- Four attacks x three phases x mobile `390x844` and desktop `1280x720` = 24 deterministic cases.
- Every case proves at least 6 px replayed clearance after 3 px geometry uncertainty and reproduces its warning/fire evidence and witness hash.
- Crossfire rounds sample their current animated rotary muzzle on each pulse; Reactor fan rounds and mine deployments sample the current reactor core; corner-clamp and Crush damage use only operational sampled claw tips.
- `director/tests/heliosFactoryRig.test.mjs` covers hierarchy, sockets, fixed-frame spin, muzzle visibility, significant reaction, phase/damage frames, and all four projectile sprite families.

### Required canonical visual artifacts

Store ignored review evidence under `director-data/prototype-assets/helios-clawcarrier-v2/review/`:

1. `neutral-mobile-clean.png` and `neutral-desktop-clean.png` — clean canonical stage, overlays off.
2. `neutral-reference-under.png` and `neutral-reference-over.png` — explicitly labeled review-only comparison at identical center/height.
3. Preparation, telegraph, first-beat, peak-danger, and recovery captures for Twin Rotary Crossfire.
4. Preparation, telegraph, first-beat, peak-danger, and recovery captures for Claw Sweep Pincer.
5. Preparation, telegraph, first-beat, peak-danger, and recovery captures for Reactor Maze.
6. Preparation/rise, target lock, first beat, committed dive, and recovery captures for Clawcarrier Crush.
7. `armor-shear-transition.png`, `reactor-overdrive-damage.png`, `stagger-heavy-hit.png`, and the actual breakup/explosion frame `destruction-peak.png`.
8. `socket-overlay-crossfire.png`, `socket-overlay-reactor.png`, and `claw-hit-regions.png` — debug-labeled proof only, paired with clean captures.
9. `helios-clawcarrier-v2-key-pose-contact-sheet.png` and `visual-verification-result.md`.

### Visual acceptance gate

- Both mobile and desktop clean captures show connected claws/mandibles and an aspect-preserved 460 x 330 rig.
- Every emitted sprite visibly leaves its owning rotary/reactor mechanism; melee damage stays on visible claw tips.
- Anticipation, damage, recovery, Armor Shear transformation, Reactor Overdrive asymmetry, and destruction are recognizable without attack text or generic guides.
- Structural art is opaque and nearest-neighbor; no chopped frames, transient white texture, detached parts, or non-uniform breathing distortion appear.
- Review overlays never appear in the corresponding clean gameplay captures.
- This artifact set is complete and reviewed. Factory-ready status applies to the reusable Sandbox implementation; campaign placement still requires a separate content and balance decision.

# Helios Clawcarrier V2

## Authority and scope

- Sandbox ID: `helios-clawcarrier`
- Status: Sandbox-only V0.24 gun-registration, uniform-fan, and channel-gutter polish is route-certified and privately published; refreshed dynamic visual acceptance remains pending. V0.20 remains the last fully accepted visual release.
- Canonical execution path: `GameStage -> GameCanvas -> GameEngine -> PixiGameRenderer`
- Authoritative gameplay visual: the registered `modular-hierarchy-v1` rig, not the concept board, legacy `articulated-pincer-v1` presenter, assembled fallback, or review overlay
- Authoritative attack source: the compiled looping timeline with exactly three core attacks and one signature attack, each with a variant for all three phases. The retired claw-sweep Attack 2 is not part of the active rotation.
- Campaign status: no Mission reference and no promotion approval

## Identity

- Fantasy: a disciplined solar siege carrier that uses two crescent claws, paired rotary housings, and an exposed reactor as readable physical weapons.
- Combat role: deliberate route-control and anatomy-reading boss; its challenge comes from short mounted machine-gun pressure, a longer moving safe-channel signature, staged reactor-and-mine routing, and one physical tracking clamp rather than redundant claw attacks or blanket speed escalation.
- Silhouette: broad teal central shell, two native-handed crescent claws, paired mounted rotary guns, inner mandibles, four small stabilizer legs, and a visible amber reactor.
- Durability: the hull starts at `8,000` HP and each authored claw component (`left-cannon` and `right-cannon`) starts at `2,000` HP.
- Unique mechanism: every projectile samples its current animated rotary/reactor socket. During Clawcarrier Crush, damage-active contact follows the operational claw tips and the swept visible boss silhouette so the fast continuous dive cannot tunnel through the player.
- Player learning arc: learn rapid sequential rotary fire, apply that weapon read while following Helios's moving two-stream channel, route through downward reactor fire plus varied armed mines, then bait and escape the physical Clawcarrier Crush.

## Locked art and rig contract

- Locked reference board: `director-data/prototype-assets/helios-clawcarrier-v2/source/reference-board.png`
- Reference board SHA-256: `9b0edf76349b45ebf2b0ede41cc87e14e1dc9ee60ea8e3f87b60ce5763cd43e9`
- Review-only neutral crop: `helios-clawcarrier-v2-canonical-reference.png`, SHA-256 `8d6ce675283e1bb3dfd684247c13efaf80f1230400b529032dea3467f9177cb4`
- Authoritative neutral assembly: `helios-clawcarrier-v2-neutral.png`, 460 x 330, SHA-256 `08fcc15404f57aecb70b35d9498b267bd4c2f313e84dc142becf190d7a9f7f57`
- Authoritative atlas: `helios-clawcarrier-v2-atlas.png`, 2048 x 1024, binary structural alpha, SHA-256 `a686d39293f096e21adee7e7c85b78d1e2f3eb10d644f47b16235362eb7e9c11`
- Asset-usage proof: `helios-clawcarrier-v2.asset-usage.json`; all 60 source cells are classified, all 40 runtime frames have consumers, and future/archived cells remain forbidden from runtime.
- Rendering: nearest-neighbor, aspect-preserved scaling; structural sprites stay opaque. Glow and warning presentation are separate effects.

### Authoritative anatomy

| Mechanism | Registered parts and sprite frames | Owned sockets | Runtime responsibility |
|---|---|---|---|
| Central carrier | `body.closed`, `body.open`, `body.damaged` | `reactor-core` on `body` | Phase silhouette, significant damage, recovery exposure, reactor origin |
| Port claw | `claw.port.mount`, `claw.port.shell`, `claw.port.attack`, `mandible.port` | `claw-joint-port`, `claw-tip-port` | Clawcarrier Crush articulation and moving melee hit region; no second active clamp sentence |
| Starboard claw | `claw.starboard.mount`, `claw.starboard.shell`, `claw.starboard.attack`, `mandible.starboard` | `claw-joint-starboard`, `claw-tip-starboard` | Clawcarrier Crush articulation and moving melee hit region; no second active clamp sentence |
| Mounted rotaries | `weapons.mount`, `rotary.port.0` through `.3`, `rotary.starboard.0` through `.3`, `muzzle.flash.2` | both heavy/rotary muzzle pairs | Rigidly inherit body motion; hold an exact neutral local pose outside firing; sample live sockets; synchronize every rapid round with its barrel frame, starburst, and local recoil |
| Stabilizer legs | `leg.outer-port`, `leg.inner-port`, `leg.inner-starboard`, `leg.outer-starboard` | none | Small body-owned secondary motion only; never a hitbox or projectile source |
| Reactor aperture | `reactor.closed`, `reactor.open` | `reactor-core` | Downward fan origin, visible mine deployment, recovery vulnerability |

The registered projectile sprite families are `boss-heavy-shell`, `boss-gatling-tracer`, `boss-reactor-pellet`, and `boss-helios-mine`, each backed by four equal-registration pixel frames. Helios uses the tracer, reactor-pellet, and mine vocabulary in the refined attacks; the heavy-shell family remains a classified runtime-ready Helios asset but is not a separate fifth attack. The tracer keeps the renderer's central `atan2(velocityY, velocityX) + textureForwardOffset` policy and rotates exactly 180 degrees from its prior runtime orientation through the registered texture-forward offset, never through per-shot correction. V0.24 records an explicit bore registration point for every port and starboard rotary frame, eliminating apparent side-to-side barrel drift while keeping the already symmetric mounts and gameplay sockets unchanged.

## Communication contract: anatomy, never instructions

- Helios must not spawn attack-name text, `SAFE GAP` text, generic gap guides, or generic side-barrage guides during its attack timeline.
- Standard HUD information is allowed; it is not part of the attack teaching language.
- Recognition must come from claw opening/closing, shoulder rotation, body/reactor frame changes, barrel spin, muzzle animation, physical movement, and exact origin-linked warnings.
- Debug socket, collision, landmark, and safe-route overlays are review tools only. They default off and may appear only in explicitly labeled proof captures.
- The canonical reference-comparison sprite is review-only, defaults off, and can never become gameplay art, collision, a projectile source, or a socket source.
- `director/tests/heliosSafeRouteProof.test.mjs` rejects `isBossGapGuide`, `isBossSideBarrageGuide`, and text-effect entities on every captured attack frame.

## Target attack sentences under validation

### 1. Rapid Machine-Gun Bursts — core

- Player skill: read rapid sequential pressure and make short targeted dodges.
- Anatomy: `rotary.port` and `rotary.starboard` under `weapons.mount`; every round uses the exact current live port/starboard rotary origin.
- Recognition cue: Helios enters a short firing stance, one rotary spools and fires, the other joins after a readable delay, and both finish together before spinning down.
- Beats: firing stance, first-side burst, delayed second-side burst, rapid paired finish, spin-down, exact mounted-neutral return, and recovery. Rounds remain sequential; each independently advances the barrel frame, flashes its live muzzle, and applies one small local recoil pulse.
- Safe rule: make short deliberate dodges through the targeted bursts; this attack teaches the same mounted weapon vocabulary later expanded by Attack 2 without becoming a corridor puzzle itself.
- Bounded aim mix: each one-sided burst mixes a deterministic subset aimed at the warning-locked player point with fixed authored lane shots. Siege Calibration aims one round per one-sided burst, Armor Shear aims one or two according to sequence and side, and Reactor Overdrive aims two. The paired finisher remains fixed so its corridor stays learnable.
- Phase density: the three beat counts are `5/5/6`, `5/5/6`, and `6/6/7` for Siege Calibration, Armor Shear, and Reactor Overdrive respectively, using sequence triplets `0/1/2`, `10/11/12`, and `20/21/22`.

### 2. Moving Machine-Gun Channel — signature

- Player skill: enter and continuously follow a moving safe corridor.
- Anatomy: both hull-mounted rotaries and their live `rotary-muzzle-port` / `rotary-muzzle-starboard` sockets plus the carrier's deterministic horizontal translation.
- Recognition cue: Helios settles near the upper middle, both mechanisms spool and glow, then five live-muzzle tracers per side occupy the exterior lanes while preserving the middle before the full connected rig travels to a mobile gutter and establishes two moving boundaries. During the moving sentence, recurring paired suppressors continue down the far-left and far-right gutters so the opening between the main streams remains the only intended route.
- Beats: settle, dual spool, 0.45-second warned exterior herd, first paired boundary rounds, four gapless firing segments with a paired exterior suppressor pulse every six simulation frames, edge-to-edge traversal, visible reversal and return traversal, firing taper, spin-down, exact mounted-neutral return, and recovery. Segment durations shorten from `1.7` to `1.5` to `1.3` seconds across the phases, for `6.8`, `6.0`, and `5.2` seconds of continuous fire.
- Safe rule: enter between the two main streams and follow their continuous center as Helios carries the corridor from gutter to gutter. The recurring suppressors target the structural exterior gutters from the same live rotary sockets, so neither screen edge is a stationary solution. The central opening remains intact; it may not teleport, cross, or close without a visible survivable transition, and no text, guide line, or safe-channel overlay communicates the solution.
- Bounded remix: the first complete use chooses its starting edge from the fixed gameplay seed; every later complete use alternates that edge. Every phase retains the taught edge-to-edge-and-back grammar, while the shorter segment duration and faster tracer travel make the low-health channel move more urgently. The recognizable interior-channel solution must remain intact.
- Ownership boundary: `machinegun-channel` is Helios-specific choreography built from reusable moving-socket, sequential-fire, movement, and safe-route primitives; it is not a default Boss Factory attack.
- Retirement: the former `claw-sweep-pincer` Attack 2 is absent from the active Helios timeline. Its code or notes may remain only as an explicitly unused prototype; the active claws belong to Attack 4.

### 3. Reactor Maze — core

- Player skill: cross sequential downward fan lanes while accounting for a separately staged secondary hazard.
- Anatomy: open body/reactor frames and the live `reactor-core` warning/fire origin.
- Recognition cue: the body braces and reactor opens before drawing a bounded fan downward one round at a time; the mine beat visibly deploys, arms, detects proximity, explodes, and cleans up.
- Beats: fan, reordered fan, bounded deterministic phase-scaled mine formation, final fan, vent and recovery. Siege Calibration emits `25` fan pellets plus `3` mines, Armor Shear emits `27` plus `4`, and Reactor Overdrive emits `31` plus `5`.
- Safe rule: cross between staggered fan lanes and route around armed mines before their visible explosion-active frames.
- Bounded remix: every fan remains within the 8-through-4-o'clock envelope and uses uniform angular spacing for its authored count; dense low-health fans no longer insert an artificial oversized center aperture. The sequence selects `staggered-diagonal`, `reverse-diagonal`, `zigzag`, `shallow-arc`, `offset-triangle`, or `asymmetric-cluster`, advances deterministically on later uses, and keeps explicit X/Y arm points, per-slot timing, minimum separation, player-spawn avoidance, and a readable route through concurrent reactor fire. Retained deterministic seeds must visibly differ. Deploying and armed mines do no damage.

### 4. Clawcarrier Crush — core physical attack

- Player skill: bait a tracker, recognize the lock, escape the committed continuous dive, and respect the closing claws and visible hull path.
- Anatomy: whole carrier translation plus both claw mounts, claw/mandible frame swaps, live claw-tip hit regions, and swept visible-silhouette collision during the damage-active Crush window.
- Recognition cue: the carrier rises, opens both claws, follows briefly, locks its target, then performs one uninterrupted crushing dive without an inter-stage pause.
- Four contiguous typed stages: `rise-open -> track-lock -> dive-close -> hold-release-return`, each `0.65` seconds (`39` frames at 60 Hz). Only the opening warning is presented; compiler continuation warnings do not interrupt the motion sentence.
- Safe rule: bait during tracking, leave the locked area before the continuous dive, remain outside the swept hull and operational claw tips, then punish the release/return recovery. Unprotected contact removes one life; Watch safely preserves lives while retaining ordinary hit feedback.
- Bounded remix: the phase sequence changes the deterministic stage offset without introducing unrestricted tracking or random target changes.
- The former temporary center exhaust/deployment sprite, mount, socket, and hitbox are archived and absent; Crush uses only the permanent hull, reactor, rotaries, claws, legs, and thrusters, then returns to the identical neutral rig.
- V0.22 correction boundary: preserve the authored tracking and lock solution, but do not restore the old continuation warning, pause, snap, or single-position collision behavior.

## Rotation contract

- The four numbered controls and authored loop keep the roles fixed: Attack 1 short gun pressure, Attack 2 signature channel, Attack 3 reactor plus mines, Attack 4 physical tracking clamp.
- Phase-one grammar teaches Attack 1 before the complete Attack 2 signature, with Attack 3 and/or Attack 4 between them where the loop permits. Do not repeatedly schedule Attacks 1 and 2 back-to-back merely because both use the rotaries.
- Phase two may remix the already taught channel only through bounded, visibly readable, route-proven changes. It may not replace the channel solution with unpredictable crossfire.

## Meaningful phase transformation

| Phase | Visible anatomy change | Rule remix |
|---|---|---|
| Siege Calibration | Closed body, concealed reactor, narrow neutral claws, rotaries fixed to their neutral mounts when not firing | `5/5/6` rapid bursts with one aimed round per one-sided beat; 160 px channel with four `1.7` s segments (`6.8` s total); `25` reactor pellets plus `3` mines; Crush sequence `0` |
| Armor Shear | Body opens, amber reactor becomes continuously visible, claws spread and roll outward, stabilizer legs brace, rotaries remain mounted | `5/5/6` rapid bursts with one or two aimed rounds; 160 px channel with four `1.5` s segments (`6.0` s total); `27` reactor pellets plus `4` mines; Crush sequence `4` |
| Reactor Overdrive | Damaged body persists, port claw droops while starboard braces, legs tuck asymmetrically, reactor reverses its ambient rotation | `6/6/7` faster bursts with two aimed rounds; 160 px channel with four `1.3` s segments (`5.2` s total) and faster tracer travel; `31` reactor pellets plus `5` mines; Crush sequence `8` |

Phase speed multipliers move only from `0.72` to `0.75` to `0.78`. Those small changes support the presentation; side order, anatomy, fan order, and signature staging are the actual escalation.

## Lifecycle

- Entrance: folded claw mounts unfold into the connected neutral pose.
- Idle: restrained whole-body hover and opposing claw motion while both machine guns remain fixed at their exact hull-relative neutral position and frame, with no independent rotation, recoil, vibration, or barrel cycling.
- Stabilizers and claws: four enlarged stabilizer legs sit on layer 7 behind the hull and rotaries but ahead of the large claw shells, with restrained mirrored articulation. Each white mandible is parented directly to its matching large claw and overlaps its opaque shell instead of floating beside it.
- Anticipation/recoil: each primitive drives its owning mechanism; Attacks 1 and 2 spool and recoil the mounted rotaries only while firing, Reactor Maze exposes the core, and Crush opens then closes both claws.
- Significant hit/stagger: short directional whole-rig reaction is reserved for meaningful impact; ordinary damage does not make the entire boss flinch.
- Persistent damage: `body.damaged`, asymmetric claw posture, exposed reactor, and leg bracing remain visible in Reactor Overdrive.
- Recovery: claws release, barrels spin down with muzzle flashes and vibration stopped, both guns settle to their exact neutral local transforms, body/reactor stay open, and the player receives a real punish window.
- Destruction: a deterministic 90-frame sequence detaches registered structural fragments, including the outer stabilizer legs. Sockets stop being combat sources once death begins.

## Evidence and proof gates

### Reopened programmatic evidence

- Fixed gameplay seed remains `helios-v2-safe-route-proof`; additional retained seeds or sequence branches must cover every 2D mine template.
- Gate 1's canonical reference board remains locked. V0.24 changes only the registration of the existing rotary frames, then deterministically rebuilds the atlas and neutral assembly at the hashes listed above; it does not introduce a redesigned boss or an unclassified runtime sprite.
- The accepted V0.20 24-case proof remains historical evidence for the prior mandatory-interior channel. It does not certify V0.22's mixed aim, phase-scaled timing/density, five-mine branch, or swept Crush collision.
- The refreshed V0.22 24-case proof separately passes every attack in all three phases at mobile `390x844` and desktop `1280x720`, with at least 6 px replayed clearance after 3 px geometry uncertainty and deterministic witness hashes.
- The V0.22 replacement proof must reconstruct the real compiled four-attack timeline through `GameEngine` for all three phases at mobile `390x844` and desktop `1280x720`, record configuration and route hashes, and retain at least 6 px replayed clearance after 3 px geometry uncertainty.
- Moving-channel proof must use the actual carrier movement, both live animated muzzle samples on every cadence slot, actual cadence and projectile velocity, recurring paired exterior suppressors, and one continuous constrained-player witness. Mobile proof must additionally show that the witness stays between the reconstructed live rails while stationary camps at both exterior gutters are threatened throughout the sentence. Attack 3 proof must use the uniformly spaced runtime fan, the runtime mine deployment path, and each retained template with the concurrent reactor hazards.
- Rig evidence must prove hull-relative gun attachment during idle, translation, phase and damage states; firing-only recoil/vibration and barrel animation; exact recovery to neutral; and stable tracer orientation for downward, down-left, and down-right travel.

### Required canonical visual artifacts

Store ignored review evidence under `director-data/prototype-assets/helios-clawcarrier-v2/review/`:

1. `neutral-mobile-clean.png` and `neutral-desktop-clean.png` — clean canonical stage, overlays off.
2. `neutral-reference-under.png` and `neutral-reference-over.png` — explicitly labeled review-only comparison at identical center/height.
3. Preparation, telegraph, first-beat, peak-danger, and recovery captures for Rapid Machine-Gun Bursts, plus one immediate post-fire mounted-neutral capture.
4. Preparation, telegraph/first boundary, first beat, mid-sweep peak danger, direction-change or ending, and recovery captures for Moving Machine-Gun Channel.
5. Preparation, telegraph, first-beat, peak-danger, and recovery captures for Reactor Maze.
6. Preparation/rise, target lock, first beat, committed dive, and recovery captures for Clawcarrier Crush.
7. At least three clean Attack 3 captures showing distinct named deterministic mine templates with visibly different X and Y placements.
8. One clean normal-idle capture proving both machine guns are mounted at their exact neutral hull-relative positions.
9. `armor-shear-transition.png`, `reactor-overdrive-damage.png`, `stagger-heavy-hit.png`, and the actual breakup/explosion frame `destruction-peak.png`.
10. `socket-overlay-crossfire.png`, `socket-overlay-channel.png`, `socket-overlay-reactor.png`, and `claw-hit-regions.png` — debug-labeled proof only, paired with clean captures.
11. `helios-clawcarrier-v2-key-pose-contact-sheet.png` and `visual-verification-result.md` rebuilt for the refined runtime.
12. V0.22 clean captures covering the mixed-aim Attack 1, Reactor Overdrive's accelerated channel, the five-mine/high-density Reactor Maze, and continuous Crush contact both unprotected and under Watch safely.

### Visual acceptance gate

- Both mobile and desktop clean captures show connected claws/mandibles and an aspect-preserved 460 x 330 rig.
- Both machine guns remain rigidly attached through idle and boss movement, animate/recoil only while firing, and settle exactly after recovery.
- Every emitted sprite visibly leaves its owning rotary/reactor mechanism; the tracer points along actual downward and diagonal velocity without post-fire flipping; active Crush contact follows the operational claw tips and swept visible boss silhouette without tunneling.
- Attack 2 communicates one continuous moving channel without text or guide lines, and Attack 3 visibly varies both X and Y across bounded mine templates.
- Anticipation, damage, recovery, Armor Shear transformation, Reactor Overdrive asymmetry, and destruction are recognizable without attack text or generic guides.
- Structural art is opaque and nearest-neighbor; no chopped frames, transient white texture, detached parts, or non-uniform breathing distortion appear.
- Review overlays never appear in the corresponding clean gameplay captures.
- Gates 2-5 were accepted for V0.20 after its local mobile review, deterministic runtime proof, shared Runner build, and live private Runner review. V0.24 separately passes the complete 24-case route matrix and the 18-check owner-only Runner release, but it remains a Sandbox-only amendment until its refreshed dynamic capture set is visually accepted. Neither release places Helios in a campaign Mission.

# Helios Clawcarrier V2 review

Status: **V0.22 behavior amendment implemented, deterministically certified, verified in the local and hosted runners, and privately published**. The clean visual-evidence refresh remains pending, so V0.20 remains the last fully accepted visual release. Gate 1 remains accepted against the unchanged art package, and Helios remains Test Mission content without campaign-Mission approval.

## Implemented contract

- [x] One authoritative 460 x 330 `modular-hierarchy-v1` assembly replaces the legacy `articulated-pincer-v1` presentation as gameplay truth.
- [x] Matching transparent source parts, binary structural alpha, nearest-neighbor registration, and aspect-preserved scaling are retained.
- [x] All 60 source cells are classified and all 40 runtime frames have registered consumers.
- [x] One connected modular hierarchy owns the body, two mounted claws, two mandibles, reactor, four stabilizer legs, two four-frame rotaries, and two muzzle presenters. The archived temporary center exhaust remains absent.
- [x] Nine hierarchy-resolved sockets cover the heavy/rotary muzzles, reactor core, claw joints, and moving claw tips.
- [x] Projectile presentation uses registered four-frame pixel families: `boss-heavy-shell`, `boss-gatling-tracer`, `boss-reactor-pellet`, and `boss-helios-mine`.
- [x] The two rotaries remain at their exact hull-relative neutral transforms outside firing, inherit every hull movement without drift, recoil/vibrate only while firing, and settle exactly after recovery.
- [x] `boss-gatling-tracer` uses the single central velocity-orientation calculation with a texture-forward offset rotated by exactly 180 degrees from the previous runtime value; downward and diagonal captures visibly point forward without flipping.
- [x] Entrance, restrained idle, anatomy-owned anticipation/recoil, significant-hit reaction, stagger, phase transition, persistent damage, recovery, and deterministic destruction are registered.
- [x] Ordinary damage does not flinch the entire rig; whole-body reaction is reserved for a meaningful impact or part/state change.
- [x] The 90-frame destruction sequence detaches nine registered fragments and disables combat sockets when death begins.
- [x] V0.22 durability is authored as `8,000` hull HP plus `2,000` HP for each claw component (`left-cannon` and `right-cannon`).

## Attack and phase review

- [x] Core Attack 1 is **Rapid Machine-Gun Bursts** (`rapid-machine-gun-bursts`): a short firing stance, first-gun burst, delayed second-gun join, rapid paired finish, spin-down, and exact neutral return. The phase beat counts are `5/5/6`, `5/5/6`, and `6/6/7` with sequence triplets `0/1/2`, `10/11/12`, and `20/21/22`. A bounded deterministic subset of each one-sided burst aims at the warning-locked player point (one aimed round in Siege Calibration, one or two in Armor Shear, and two in Reactor Overdrive), while the paired finisher stays fixed.
- [x] Signature Attack 2 is **Moving Machine-Gun Channel** (`machinegun-channel`): Helios settles upper-middle, spools both mounted rotaries, and sustains four gapless firing segments. Segment duration falls from `1.7` to `1.5` to `1.3` seconds across the phases, for `6.8`, `6.0`, and `5.2` seconds of continuous fire. Both live guns fire together every two frames around one 160 px opening while the connected rig travels gutter-to-gutter, reverses, and returns.
- [x] The first complete channel chooses its starting edge from the fixed gameplay seed. Each later complete use alternates the starting edge, so replay/loop does not repeat the same edge order. The four internal continuation segments count as one use.
- [x] Core Attack 3 remains **Reactor Maze** (`reactor-maze`) with `25/27/31` fan pellets and `3/4/5` mines across the phases. A bounded deterministic template advances per use among `staggered-diagonal`, `reverse-diagonal`, `zigzag`, `shallow-arc`, `offset-triangle`, and `asymmetric-cluster`; each varies X and Y, preserves minimum spacing, and avoids direct player spawn.
- [x] Core physical Attack 4 remains **Clawcarrier Crush** (`clawcarrier-crush`) as one uninterrupted four-stage sentence. Each stage lasts `0.65` seconds (`39` frames at 60 Hz); continuation warnings are suppressed, the return begins without a pause or snap, and damage-active contact uses operational claw-tip regions plus swept visible-silhouette collision. Unprotected contact removes one life, while Watch safely retains hit feedback without removing a life.
- [x] The former `claw-sweep-pincer` Attack 2 is absent from the active Helios rotation. It may remain only as an explicitly unused prototype; its removal does not archive claw art still consumed by Attack 4.
- [x] Attack 1 teaches the rotary cadence and anatomy used by Attack 2, while Attack 2 adds the distinct continuous-follow movement rule. The two attacks are not scheduled repeatedly back-to-back without an intentional teaching progression.
- [x] All attacks retain anticipation, connected damaging beats, a learnable safe rule, physical reaction, punishable recovery, and return to neutral across Siege Calibration, Armor Shear, and Reactor Overdrive.
- [x] Gameplay attack-name text, `SAFE GAP` text, `isBossGapGuide`, `isBossSideBarrageGuide`, and text-effect teaching entities remain forbidden.
- [x] Standard HUD remains available; socket, collision, safe-route, and reference-comparison overlays are review-only and default off.

## Deterministic safety evidence — V0.20 accepted; V0.22 certified

- [x] Historical V0.20: `director/tests/heliosSafeRouteProof.test.mjs` exercised the then-current attacks through `GameEngine` with configuration hash, fixed seed, viewport, route hash, duration, search bounds, and replayed minimum clearance recorded.
- [x] Historical V0.20: all four attacks passed every phase at mobile `390x844` and desktop `1280x720` with at least 6 px replayed clearance after 3 px geometry-uncertainty inflation.
- [x] Historical V0.20: Moving Machine-Gun Channel was modeled from the real boss sweep, both animated muzzle origins on every cadence slot, actual round cadence and velocity, and constrained player acceleration across one continuous witness. Every established portrait-mobile witness sample remained between the reconstructed live rails, both stationary exterior edge camps were threatened, and the opening never crossed, teleported, or closed without a survivable transition.
- [x] Historical V0.20: Reactor Maze proved every then-retained deterministic mine template or seed branch through the runtime deployment path and final armed coordinates together with overlapping reactor hazards.
- [x] Historical V0.20: repeated captures reproduced warning/fire evidence and route-witness hashes, and the proof rejected generic gap/side guides and gameplay text on every captured frame.
- [x] V0.22: the complete 24-case matrix replayed all four attacks through all three phases at mobile `390x844` and desktop `1280x720`. Every case retained at least 6 px clearance after 3 px geometry uncertainty, and every repeated run reproduced its route-witness hash.
- [x] V0.22: the proof consumes the current live muzzle/core/claw samples, the accelerated `6.8/6.0/5.2` second channel, `25/27/31` reactor pellets, `3/4/5` mines, and the swept visible core plus claw-tip Crush collision. Nine-or-more-round fans retain every sprite while redistributing rays around one deterministic aperture.

The accepted V0.20 results remain historical evidence. The new V0.22 matrix separately certifies the mixed aim, shortened low-health channel, denser reactor branch, varied mine counts, and swept Crush collision against the current validated campaign snapshot.

## Visual-proof manifest — V0.20 accepted locally; V0.22 refresh pending

Store ignored review evidence under `director-data/prototype-assets/helios-clawcarrier-v2/review/`.

- [x] Clean neutral proof: `v016-mobile-neutral-mounted-settled.png` shows both rotaries fixed to the hull with no firing state.
- [x] Rapid Machine-Gun Bursts: `v016-mobile-attack1-rapid-fire.png`, `v016-mobile-attack1-angled-fire-beat2.png`, and `v016-mobile-attack1-post-burst-neutral.png`.
- [x] Moving Machine-Gun Channel V0.20: actual local mobile review protected the hull and both claws while verifying simultaneous muzzle-owned rails, left and right structural gutters, interior opening, reversal, recovery, yellow active-attack state, and ordinary `HIT!` feedback outside the corridor. The live private Runner reproduced the paired corridor and exterior hit feedback.
- [x] Channel recovery remains covered by `v016-mobile-attack2-channel-recovery.png`.
- [x] Reactor Maze: `v016-mobile-attack3-mines-seed-a.png`, `v016-mobile-attack3-mines-seed-b.png`, and `v016-mobile-attack3-mines-seed-c.png` show visibly different X/Y formations.
- [x] Clawcarrier Crush: `v016-mobile-attack4-clamp-dive.png` proves the committed player-lane dive remains intact.
- [x] Desktop parity: `v016-desktop-attack2-channel-clean.png` shows the same mounted guns and readable channel at the desktop viewport.
- [x] Review summary: rebuilt `helios-clawcarrier-v2-key-pose-contact-sheet.png` and superseding `visual-verification-result.md`.
- [ ] V0.22: capture the mixed-aim Attack 1, Reactor Overdrive's accelerated channel, the five-mine/high-density Reactor Maze, continuous Crush contact, and Watch safely hit feedback before advancing visual acceptance.

## Historical V0.20 Factory-ready acceptance

- [x] Gate 2: the actual Sandbox neutral pose is accepted against the locked reference with both weapons rigidly mounted and no idle drift.
- [x] Gate 3: the refreshed contact sheet proves connected motion, firing-only weapon animation/recoil/vibration, and exact neutral restoration.
- [x] Gate 4: the V0.20 attack-to-sprite map and runtime proved four distinct roles, live socket ownership, stable velocity-aligned tracers, one continuous channel, bounded 2D mine templates, and the prior Clawcarrier Crush.
- [x] Gate 5: clean canonical mobile and desktop playthroughs and all required captures are inspected without gameplay debug presentation.
- [x] Spawn, reset, phase jump, replay, loop, pause/resume, and death clear every projectile, warning, effect, pose, movement override, camera effect, and collision override.
- [x] Focused channel/runtime/safety tests pass, and the full Director suite passes 238/238.
- [x] The shared Runner was rebuilt from 861 modules with 26 pinned assets, tested 18/18, committed at `39b2a83`, and privately published as V0.20 / Sites version 24.
- [x] Root and Director TypeScript checks pass.
- [x] For V0.20, roster classification, authoritative design, blueprint, ignored attack map, rig manifest, contact sheet, and visual-verification result described the same accepted runtime.

## V0.22 refresh gates — published; visual-evidence refresh pending

- [x] Focused Helios runtime, channel, mine, and continuous-crush coverage passes `47/47`; the complete deterministic route proof passes all `24/24` phase/viewport cases.
- [x] Root and Director TypeScript checks pass; the complete Director suite passes `245/245`.
- [ ] Complete clean mobile and desktop visual review against the new behavior branches and refresh ignored review evidence.
- [x] The shared Runner rebuilt from 862 modules with 26 pinned assets and passes `18/18` hosted-build tests at commit `623779e`.
- [x] The verified V0.22 Runner is privately published as Sites version 26.

The V0.22 behavior amendment changes no boss artwork, atlas frame, rig hierarchy, socket ownership, or asset hash. Gate 1 and the accepted V0.20 evidence therefore remain preserved. V0.22 is verified and privately published, but it should not replace V0.20 as the fully accepted visual baseline until the remaining clean capture set is reviewed.

# Helios Clawcarrier V2 review

Status: **V0.20 mandatory-interior channel refinement and private Runner release accepted**. Gate 1 remains accepted against the unchanged art package. Gates 2-5 pass against the paired mounted-gun runtime, gutter-to-gutter return traversal, deterministic safety proof, actual local and hosted reviews, and owner-only Runner deployment. Helios remains Test Mission content and is not approved for a campaign Mission.

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

## Attack and phase review

- [x] Core Attack 1 is **Rapid Machine-Gun Bursts** (`rapid-machine-gun-bursts`): a short firing stance, first-gun burst, delayed second-gun join, rapid paired finish, spin-down, and exact neutral return. Every round is sequential and owns one live muzzle sample, barrel-frame advance, brief flash, and local recoil pulse.
- [x] Signature Attack 2 is **Moving Machine-Gun Channel** (`machinegun-channel`): Helios settles upper-middle, spools both mounted rotaries, and sustains four connected 1.7-second firing segments for a 6.8-second channel. Both live guns fire together every two frames around one 160 px opening while the connected rig travels gutter-to-gutter, reverses, and returns.
- [x] The first complete channel chooses its starting edge from the fixed gameplay seed. Each later complete use alternates the starting edge, so replay/loop does not repeat the same edge order. The four internal continuation segments count as one use.
- [x] Core Attack 3 remains **Reactor Maze** (`reactor-maze`) with its downward reactor sequence plus a bounded deterministic mine template selected from `staggered-diagonal`, `reverse-diagonal`, `zigzag`, `shallow-arc`, `offset-triangle`, and `asymmetric-cluster`. Every retained template varies X and Y, preserves minimum spacing, avoids direct player spawn, and remains safe with reactor fire.
- [x] Core physical Attack 4 remains **Clawcarrier Crush** (`clawcarrier-crush`) with the existing `rise-open -> track-lock -> dive-close -> hold-release-return` behavior, live claw-tip damage, and bounded sequence variation.
- [x] The former `claw-sweep-pincer` Attack 2 is absent from the active Helios rotation. It may remain only as an explicitly unused prototype; its removal does not archive claw art still consumed by Attack 4.
- [x] Attack 1 teaches the rotary cadence and anatomy used by Attack 2, while Attack 2 adds the distinct continuous-follow movement rule. The two attacks are not scheduled repeatedly back-to-back without an intentional teaching progression.
- [x] All attacks retain anticipation, connected damaging beats, a learnable safe rule, physical reaction, punishable recovery, and return to neutral across Siege Calibration, Armor Shear, and Reactor Overdrive.
- [x] Gameplay attack-name text, `SAFE GAP` text, `isBossGapGuide`, `isBossSideBarrageGuide`, and text-effect teaching entities remain forbidden.
- [x] Standard HUD remains available; socket, collision, safe-route, and reference-comparison overlays are review-only and default off.

## Deterministic safety evidence — accepted

- [x] `director/tests/heliosSafeRouteProof.test.mjs` exercises the real refined attacks through `GameEngine` with configuration hash, fixed seed, viewport, route hash, duration, search bounds, and replayed minimum clearance recorded.
- [x] All four attacks pass every phase at mobile `390x844` and desktop `1280x720` with at least 6 px replayed clearance after 3 px geometry-uncertainty inflation.
- [x] Moving Machine-Gun Channel is modeled from the real boss sweep, both current animated muzzle origins on every cadence slot, actual round cadence and velocity, and constrained player acceleration across one continuous witness. Every established portrait-mobile witness sample remains between the reconstructed live rails, both stationary exterior edge camps are threatened, and the opening never crosses, teleports, or closes without a survivable transition.
- [x] Reactor Maze proves every retained deterministic mine template or seed branch through the same deployment path and final armed coordinates used by runtime, together with overlapping reactor hazards.
- [x] Repeated captures reproduce warning/fire evidence and route-witness hashes, and the proof rejects generic gap/side guides and gameplay text on every captured frame.

The refined V0.20 channel passes the complete four-attack route suite in every phase and retained viewport branch with at least 6 px replayed clearance after 3 px geometry uncertainty. Portrait-mobile channel witnesses additionally prove the intended inside-the-rails solution and reject both exterior edge camps.

## Visual-proof manifest — accepted locally

Store ignored review evidence under `director-data/prototype-assets/helios-clawcarrier-v2/review/`.

- [x] Clean neutral proof: `v016-mobile-neutral-mounted-settled.png` shows both rotaries fixed to the hull with no firing state.
- [x] Rapid Machine-Gun Bursts: `v016-mobile-attack1-rapid-fire.png`, `v016-mobile-attack1-angled-fire-beat2.png`, and `v016-mobile-attack1-post-burst-neutral.png`.
- [x] Moving Machine-Gun Channel V0.20: actual local mobile review protected the hull and both claws while verifying simultaneous muzzle-owned rails, left and right structural gutters, interior opening, reversal, recovery, yellow active-attack state, and ordinary `HIT!` feedback outside the corridor. The live private Runner reproduced the paired corridor and exterior hit feedback.
- [x] Channel recovery remains covered by `v016-mobile-attack2-channel-recovery.png`.
- [x] Reactor Maze: `v016-mobile-attack3-mines-seed-a.png`, `v016-mobile-attack3-mines-seed-b.png`, and `v016-mobile-attack3-mines-seed-c.png` show visibly different X/Y formations.
- [x] Clawcarrier Crush: `v016-mobile-attack4-clamp-dive.png` proves the committed player-lane dive remains intact.
- [x] Desktop parity: `v016-desktop-attack2-channel-clean.png` shows the same mounted guns and readable channel at the desktop viewport.
- [x] Review summary: rebuilt `helios-clawcarrier-v2-key-pose-contact-sheet.png` and superseding `visual-verification-result.md`.

## Factory-ready acceptance gate — local gates accepted

- [x] Gate 2: the actual Sandbox neutral pose is accepted against the locked reference with both weapons rigidly mounted and no idle drift.
- [x] Gate 3: the refreshed contact sheet proves connected motion, firing-only weapon animation/recoil/vibration, and exact neutral restoration.
- [x] Gate 4: the attack-to-sprite map and runtime prove four distinct roles, live socket ownership, stable velocity-aligned tracers, one continuous channel, bounded 2D mine templates, and unchanged Clawcarrier Crush.
- [x] Gate 5: clean canonical mobile and desktop playthroughs and all required captures are inspected without gameplay debug presentation.
- [x] Spawn, reset, phase jump, replay, loop, pause/resume, and death clear every projectile, warning, effect, pose, movement override, camera effect, and collision override.
- [x] Focused channel/runtime/safety tests pass, and the full Director suite passes 238/238.
- [x] The shared Runner was rebuilt from 861 modules with 26 pinned assets, tested 18/18, committed at `39b2a83`, and privately published as V0.20 / Sites version 24.
- [x] Root and Director TypeScript checks pass.
- [x] Roster classification, authoritative design, blueprint, ignored attack map, rig manifest, contact sheet, and visual-verification result all describe the same refined runtime.

The V0.20 mandatory-interior channel refinement is complete. Gate 1's locked art and asset accountability remain valid; no redesign or new boss artwork was part of this refinement.

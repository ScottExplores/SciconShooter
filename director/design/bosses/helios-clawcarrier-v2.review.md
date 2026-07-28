# Helios Clawcarrier V2 review

Status: **V0.24 gun-registration, reactor-fan, and channel-gutter polish is route-certified and privately published; refreshed dynamic visual acceptance remains pending**. V0.20 remains the last fully accepted clean visual release until the expanded capture set is reviewed. Helios remains Test Mission content without campaign-Mission approval.

## Implemented contract

- [x] One authoritative 460 x 330 `modular-hierarchy-v1` assembly replaces the legacy `articulated-pincer-v1` presentation as gameplay truth.
- [x] Matching transparent source parts, binary structural alpha, nearest-neighbor registration, and aspect-preserved scaling are retained.
- [x] All 60 source cells are classified and all 40 runtime frames have registered consumers.
- [x] One connected modular hierarchy owns the body, two mounted claws, two mandibles, reactor, four stabilizer legs, two four-frame rotaries, and two muzzle presenters. V0.23 parents each mandible directly to its matching claw and places enlarged stabilizers behind the hull/rotaries. The archived temporary center exhaust remains absent.
- [x] Nine hierarchy-resolved sockets cover the heavy/rotary muzzles, reactor core, claw joints, and moving claw tips.
- [x] Projectile presentation uses registered four-frame pixel families: `boss-heavy-shell`, `boss-gatling-tracer`, `boss-reactor-pellet`, and `boss-helios-mine`.
- [x] The two rotaries remain at their exact hull-relative neutral transforms outside firing, inherit every hull movement without drift, recoil/vibrate only while firing, and settle exactly after recovery. V0.24 registers the visible bore of all eight rotary frames so the four-frame spin no longer makes the port gun appear to slide toward the center.
- [x] `boss-gatling-tracer` uses the single central velocity-orientation calculation with a texture-forward offset rotated by exactly 180 degrees from the previous runtime value; downward and diagonal captures visibly point forward without flipping.
- [x] Entrance, restrained idle, anatomy-owned anticipation/recoil, significant-hit reaction, stagger, phase transition, persistent damage, recovery, and deterministic destruction are registered.
- [x] Ordinary damage does not flinch the entire rig; whole-body reaction is reserved for a meaningful impact or part/state change.
- [x] The 90-frame destruction sequence detaches nine registered fragments and disables combat sockets when death begins.
- [x] V0.22 durability is authored as `8,000` hull HP plus `2,000` HP for each claw component (`left-cannon` and `right-cannon`).

## Attack and phase review

- [x] Core Attack 1 is **Rapid Machine-Gun Bursts** (`rapid-machine-gun-bursts`): a short firing stance, first-gun burst, delayed second-gun join, rapid paired finish, spin-down, and exact neutral return. The phase beat counts are `5/5/6`, `5/5/6`, and `6/6/7` with sequence triplets `0/1/2`, `10/11/12`, and `20/21/22`. A bounded deterministic subset of each one-sided burst aims at the warning-locked player point (one aimed round in Siege Calibration, one or two in Armor Shear, and two in Reactor Overdrive), while the paired finisher stays fixed.
- [x] Signature Attack 2 is **Moving Machine-Gun Channel** (`machinegun-channel`): Helios settles upper-middle, spools both mounted rotaries, fires a warned five-round-per-side exterior herding burst from the live muzzles, then sustains four gapless firing segments. The entry burst occupies both exterior lanes while preserving the center. Segment duration falls from `1.7` to `1.5` to `1.3` seconds across the phases, for `6.8`, `6.0`, and `5.2` seconds of continuous fire. Both live guns fire together every two frames around one 160 px opening while the connected rig travels gutter-to-gutter, reverses, and returns. V0.24 adds paired exterior-gutter suppressors every six simulation frames from those same live sockets, preventing either outside edge from becoming a hiding place without filling the moving center channel.
- [x] The first complete channel chooses its starting edge from the fixed gameplay seed. Each later complete use alternates the starting edge, so replay/loop does not repeat the same edge order. The four internal continuation segments count as one use.
- [x] Core Attack 3 remains **Reactor Maze** (`reactor-maze`) with `25/27/31` fan pellets and `3/4/5` mines across the phases. V0.24 restores uniform angular fan spacing at every density instead of opening an oversized low-health center aperture. A bounded deterministic template advances per use among `staggered-diagonal`, `reverse-diagonal`, `zigzag`, `shallow-arc`, `offset-triangle`, and `asymmetric-cluster`; each varies X and Y, preserves minimum spacing, and avoids direct player spawn.
- [x] Core physical Attack 4 remains **Clawcarrier Crush** (`clawcarrier-crush`) as one uninterrupted four-stage sentence. Each stage lasts `0.65` seconds (`39` frames at 60 Hz); continuation warnings are suppressed, the return begins without a pause or snap, and damage-active contact uses operational claw-tip regions plus swept visible-silhouette collision. Unprotected contact removes one life, while Watch safely retains hit feedback without removing a life.
- [x] The former `claw-sweep-pincer` Attack 2 is absent from the active Helios rotation. It may remain only as an explicitly unused prototype; its removal does not archive claw art still consumed by Attack 4.
- [x] Attack 1 teaches the rotary cadence and anatomy used by Attack 2, while Attack 2 adds the distinct continuous-follow movement rule. The two attacks are not scheduled repeatedly back-to-back without an intentional teaching progression.
- [x] All attacks retain anticipation, connected damaging beats, a learnable safe rule, physical reaction, punishable recovery, and return to neutral across Siege Calibration, Armor Shear, and Reactor Overdrive.
- [x] Gameplay attack-name text, `SAFE GAP` text, `isBossGapGuide`, `isBossSideBarrageGuide`, and text-effect teaching entities remain forbidden.
- [x] Standard HUD remains available; socket, collision, safe-route, and reference-comparison overlays are review-only and default off.

## Deterministic safety evidence — V0.20 accepted; V0.22 through V0.24 certified

- [x] Historical V0.20: `director/tests/heliosSafeRouteProof.test.mjs` exercised the then-current attacks through `GameEngine` with configuration hash, fixed seed, viewport, route hash, duration, search bounds, and replayed minimum clearance recorded.
- [x] Historical V0.20: all four attacks passed every phase at mobile `390x844` and desktop `1280x720` with at least 6 px replayed clearance after 3 px geometry-uncertainty inflation.
- [x] Historical V0.20: Moving Machine-Gun Channel was modeled from the real boss sweep, both animated muzzle origins on every cadence slot, actual round cadence and velocity, and constrained player acceleration across one continuous witness. Every established portrait-mobile witness sample remained between the reconstructed live rails, both stationary exterior edge camps were threatened, and the opening never crossed, teleported, or closed without a survivable transition.
- [x] Historical V0.20: Reactor Maze proved every then-retained deterministic mine template or seed branch through the runtime deployment path and final armed coordinates together with overlapping reactor hazards.
- [x] Historical V0.20: repeated captures reproduced warning/fire evidence and route-witness hashes, and the proof rejected generic gap/side guides and gameplay text on every captured frame.
- [x] V0.22: the complete 24-case matrix replayed all four attacks through all three phases at mobile `390x844` and desktop `1280x720`. Every case retained at least 6 px clearance after 3 px geometry uncertainty, and every repeated run reproduced its route-witness hash.
- [x] V0.22: the proof consumes the current live muzzle/core/claw samples, the accelerated `6.8/6.0/5.2` second channel, `25/27/31` reactor pellets, `3/4/5` mines, and the swept visible core plus claw-tip Crush collision. Nine-or-more-round fans retain every sprite while redistributing rays around one deterministic aperture.
- [x] V0.23: the same complete matrix passes with the five-round-per-side exterior-herding entry reconstructed before the moving rails. Both exterior camps are threatened, the middle remains open during entry, and the subsequent moving channel retains its certified route.
- [x] V0.24: the complete 24-case matrix passes with uniform Reactor Maze fan spacing and recurring paired gutter suppressors reconstructed from both live rotary sockets. The two marginal dense-fan cases use a three-frame proof control interval; their exact replay still retains the required six-pixel post-uncertainty clearance.

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

## V0.23 refresh gates

- [x] The complete 24-case route matrix passes with the new exterior-herding entry. The complete Director run covered 243 checks; its single stale one-clip channel assertion was updated for the two-beat signature and then passed all three viewport-bound cases in isolation.
- [x] The rebuilt neutral and local mobile Sandbox verify attached claw mandibles, larger background stabilizers, subtle leg motion, and unbroken hull/rotary layering without chopped or floating anatomy.
- [x] The shared five-frame low-health pixel-damage cue is deterministic, bounded to one sprite cue per eligible frame, and replaces the recurring procedural line spark for every Pixi boss. Local Helios review at low health confirms the presentation path; a roster-wide clean capture set remains future visual evidence rather than a release blocker.
- [x] Root and Director TypeScript checks pass. The shared Runner rebuilt from 863 modules with 26 pinned assets and passes `18/18` hosted-build tests.
- [x] The verified owner-only V0.23 package is privately published as Sites version 27 from Runner commit `9aa7a3e`.

## V0.24 refresh gates

- [x] All eight existing rotary frames have explicit source-bore registration; deterministic rebuilds produce neutral hash `08fcc15404f57aecb70b35d9498b267bd4c2f313e84dc142becf190d7a9f7f57` and atlas hash `a686d39293f096e21adee7e7c85b78d1e2f3eb10d644f47b16235362eb7e9c11`.
- [x] Runtime and asset-usage unit coverage verifies the uniform dense fan, six-simulation-frame gutter cadence, fixed mobile gutter targets, and stable rotary-frame registration.
- [x] The complete 24-case route matrix passes with uniform low-health fan spacing and recurring exterior suppressors.
- [ ] Clean local mobile review confirms centered rotaries, no oversized Reactor Maze center gap, and an interior-only channel solution.
- [x] Root and Director typechecks pass in the isolated clean source snapshot; focused runtime/asset integration passes `24/24`; the shared Runner rebuild transforms 862 modules and passes `18/18`.
- [x] The verified owner-only V0.24 package is privately published as Sites version 28 from Runner commit `bc643bf`.

# Helios Clawcarrier V2 review

Status: **Factory-ready Sandbox boss**. The rebuilt rig, four-attack contract, canonical visual review, deterministic safety proof, and same-source release gates pass. It remains Test Mission content and is not approved for a campaign Mission.

## Implemented contract

- [x] One authoritative 460 x 330 `modular-hierarchy-v1` assembly replaces the legacy `articulated-pincer-v1` presentation as gameplay truth.
- [x] Matching transparent source parts, binary structural alpha, nearest-neighbor registration, and aspect-preserved scaling are retained.
- [x] All 60 source cells are classified and all 40 runtime frames have registered consumers.
- [x] One connected 14-part hierarchy owns the body, exhaust, two mounted claws, two mandibles, reactor, two four-frame rotaries, and two muzzle presenters.
- [x] Nine hierarchy-resolved sockets cover the heavy/rotary muzzles, reactor core, claw joints, and moving claw tips.
- [x] Projectile presentation uses registered four-frame pixel families: `boss-heavy-shell`, `boss-gatling-tracer`, `boss-reactor-pellet`, and `boss-helios-mine`.
- [x] Entrance, restrained idle, anatomy-owned anticipation/recoil, significant-hit reaction, stagger, phase transition, persistent damage, recovery, and deterministic destruction are registered.
- [x] Ordinary damage does not flinch the entire rig; whole-body reaction is reserved for a meaningful impact or part/state change.
- [x] The 90-frame destruction sequence detaches nine registered fragments and disables combat sockets when death begins.

## Attack and phase review

- [x] Core attack 1 is **Twin Rotary Crossfire**: three-shot first-side burst, delayed three-shot answer, then four shots from each rotary around a deliberately open center corridor.
- [x] Core attack 2 is **Claw Sweep Pincer**: first-side sweep, opposite-side sweep, then a two-claw pincer whose damage follows the visible moving tips.
- [x] Core attack 3 is **Reactor Maze**: four separately warned 20-projectile aperture pulses from `reactor-core`, with an eligible animated mine pair on the fourth sequence.
- [x] Signature attack is **Clawcarrier Crush**: four repeated `rise-open -> track-lock -> dive-close -> hold-release-return` cycles using actual target lock and moving claw hit regions.
- [x] Every attack has an anticipation, damaging action, learnable safe rule, and punishable recovery.
- [x] Every projectile warning and emission is owned by the relevant rotary or reactor socket; melee ownership remains on the articulated claws.
- [x] Siege Calibration, Armor Shear, and Reactor Overdrive each provide all three core attacks and the signature.
- [x] Armor Shear visibly opens the body/reactor and spreads the claws; Reactor Overdrive persists damaged armor, asymmetric claw posture, stronger exhaust, and reversed reactor motion.
- [x] Phase escalation changes cannon/sweep order, aperture direction and sequence, and signature staging. Speed changes remain minor (`0.72`, `0.75`, `0.78`) rather than being the primary difficulty rule.
- [x] Gameplay attack-name text, `SAFE GAP` text, `isBossGapGuide`, `isBossSideBarrageGuide`, and text-effect teaching entities are forbidden.
- [x] Standard HUD remains available; socket, collision, safe-route, and reference-comparison overlays are review-only and default off.

## Deterministic safety evidence - 2026-07-25

- [x] `director/tests/heliosSafeRouteProof.test.mjs` exercises the real compiled `helios-clawcarrier` attacks through `GameEngine` with seed `helios-v2-safe-route-proof`.
- [x] Four attacks x three phases x mobile `390x844` and desktop `1280x720` equals 24 passing route cases.
- [x] Every witness retains at least 6 px clearance after 3 px geometry-uncertainty inflation.
- [x] Repeated captures reproduce warning/fire evidence and route-witness hashes.
- [x] Crossfire projectiles match warning-owned rotary origins; Reactor Maze pellets and mines match the warning-owned core; Sweep and Crush use sampled moving claw-tip geometry.
- [x] The proof rejects generic gap/side guides and gameplay text on every captured attack frame.

## Required visual-proof manifest

Store ignored review evidence under `director-data/prototype-assets/helios-clawcarrier-v2/review/`.

- [x] Clean neutral proof: `neutral-mobile-clean.png` and `neutral-desktop-clean.png`.
- [x] Labeled review comparison: `neutral-reference-under.png` and `neutral-reference-over.png` at identical center and display height.
- [x] Twin Rotary Crossfire: preparation, telegraph, first-beat, peak-danger, and recovery captures.
- [x] Claw Sweep Pincer: preparation, telegraph, first-beat, peak-danger, and recovery captures.
- [x] Reactor Maze: preparation, telegraph, first-beat, peak-danger, and recovery captures.
- [x] Clawcarrier Crush: preparation/rise, target lock, first beat, committed dive, and recovery captures.
- [x] Transformation/lifecycle: `armor-shear-transition.png`, `reactor-overdrive-damage.png`, `stagger-heavy-hit.png`, and the actual fragment/explosion frame `destruction-peak.png`.
- [x] Debug-labeled proof: `socket-overlay-crossfire.png`, `socket-overlay-reactor.png`, and `claw-hit-regions.png`, each paired with a clean capture.
- [x] Review summary: `helios-clawcarrier-v2-key-pose-contact-sheet.png` and `visual-verification-result.md`.

## Factory-ready acceptance gate

- [x] At mobile and desktop game scale, the neutral assembly is visually accepted against the locked reference without chopped, swapped, detached, or translucent structural parts.
- [x] Full motion review shows connected joints through idle, every anticipation/peak/recovery, both transformations, persistent damage, and destruction.
- [x] Clean captures prove all emitted sprites leave relevant anatomy and all melee contact stays on visible claw tips without relying on debug overlays.
- [x] The attacks and phase changes are understandable without gameplay text or generic safe-route guides.
- [x] Spawn, reset, phase jump, replay, loop, pause/resume, and death clear every projectile, warning, effect, pose, camera, and collision override.
- [x] Canonical local mobile and desktop playthroughs are visually approved.
- [x] Director typecheck and 205 tests, root typecheck and 656 tests, root build/production exclusion, and the private Runner build plus 16 tests pass from the V0.11 source.
- [x] Roster classification and authoritative design/blueprint documentation describe the rebuilt attack set.

Factory-ready status certifies the reusable Sandbox workflow and implementation quality only. Helios remains isolated Test Mission content until it receives a separate campaign-placement and balance review.

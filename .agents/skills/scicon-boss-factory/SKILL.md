---
name: scicon-boss-factory
description: Create, rebuild, animate, tune, and prove cohesive modular pixel-art bosses for SciCon Shooter using the canonical mobile Boss Sandbox, deterministic attack timelines, anatomy-owned weapon sockets, and safe-route validation. Use for new test bosses, Boss Factory benchmark work, rebuilding weak existing bosses, authoring multi-beat maze attacks or signature moves, generating or processing matching boss art and components, rigging parts, validating mobile boss fights, or diagnosing boss art/attack quality.
---

# SciCon Boss Factory

Build and prove one complete boss at a time. Preserve the canonical `GameStage -> GameCanvas -> GameEngine -> PixiGameRenderer` path. Do not add a preview-only renderer or ship test content into campaign Missions.

## Hold the one-boss lock

Name one active benchmark boss before editing. Do not design, generate, rebuild, or tune another boss while the active boss has an incomplete critical gate. Release the lock only after all five visual-verification gates pass, every required package artifact exists, and remaining exceptions are explicitly accepted by the user.

## Start from repository evidence

1. Read [references/project-map.md](references/project-map.md).
2. Inspect the current boss registration, authored timeline, rig, tests, and roster classification before editing.
3. Read [references/boss-contract.md](references/boss-contract.md) before designing art or attacks.
4. Copy and complete the [boss design](assets/boss-design-template.md), [asset-usage inventory](assets/asset-usage-inventory-template.json), [rig/pivot manifest](assets/rig-template.json), [attack-to-sprite map](assets/attack-blueprint-template.json), [review checklist](assets/review-checklist.md), and [visual-verification result](assets/visual-verification-template.md) inside the boss-specific design/evidence folder. Do not silently omit a required artifact.
5. Keep the boss sandbox-only until every gate in [references/validation-gates.md](references/validation-gates.md) passes.

## Execute the factory workflow

1. **Define identity.** State the silhouette, anatomy, combat sentence, three player skills, signature puzzle, phase-two transformation, and recovery vulnerability. Reject concepts whose attacks could be emitted by any generic sprite.
2. **Pass Gate 1 — Reference Lock.** Lock one canonical complete reference pose and hash it. Derive or compare every accepted structural part against that design. Never generate a complete boss and unrelated modular parts independently.
3. **Derive and inventory authoritative assets.** Isolate or reference-edit matching parts from the locked design. Keep transparent source PNGs. Validate palette, alpha, dimensions, equal-canvas registration, outline, lighting, perspective, scale, native readability, and uniform structural scaling. Give every accepted frame one explicit status in the asset-usage inventory. Use `tools/quantize-boss-pixel-art.mjs` when generated art exceeds the palette contract.
4. **Assemble the neutral rig.** Register one hierarchical rig with explicit pivots, parent-child order, overlap caps, collision silhouettes, moving sockets, and supplemental atlases. Pack validated parts with `tools/build-modular-boss-assets.mjs`. Treat the modular rig as gameplay truth and the flattened reference only as a comparison overlay.
5. **Pass Gate 2 — Neutral-Pose Match.** Render the neutral modular boss inside the actual Boss Sandbox. Center and height-match it against the canonical reference with adjustable opacity. Correct silhouette, proportions, layering, pivots, scale, cannon/weapon size, and connected joints before authoring attacks.
6. **Animate purposefully.** Use transforms for rigid movement and equal-canvas pixel frames for shape changes. Provide entrance, idle, anticipation, recoil, large-hit, stagger, persistent damage, phase transition, and destruction. Ordinary low-damage hits must not jerk the whole boss. Every completed boss receives a non-attack animation pass. When suitable, at least one focal component uses registered frame animation during idle. Inspect rear and secondary appendages at mobile gameplay scale so the boss remains alive and mechanically connected between attacks.
7. **Pass Gate 3 — Motion-Range Review.** Capture one key-pose contact sheet containing neutral, fully open, fully closed, maximum left/right articulation, cannon firing, claw/weapon strike, charge, phase two, stagger, and death. Reject floating parts, gaps, bad layering, frame jumps, weapon scale drift, unintended stretch, or inconsistent pixel density.
8. **Author anatomy-first attacks.** Create exactly three initial core attack sentences plus one signature sentence before adding extras. Give each sentence preparation, telegraph, first beat, connected follow-ups, peak danger, recoil, recovery, and return. Route damaging emissions through named moving sockets and visible anatomy. Reject two attacks that ask the player to solve nearly the same combat role. A short core attack may deliberately teach the weapon vocabulary used by a later signature, but the signature must add a distinct movement rule, coordination problem, or route puzzle.

For wing, limb, pod, mouth, helmet, or other appendage attacks, require the corresponding live animated anatomy to perform the warning and own the emission. Boss locomotion and telegraph posture must reinforce that anatomy. A summoning attack must map visible creation or deployment, activation or hatch, active movement/collision, exit or destruction, and cleanup in addition to the ordinary attack stages.
9. **Pass Gate 4 — Attack-to-Sprite Review.** Complete the attack-to-sprite mapping. For every attack declare moving parts, sprite/frame animations, emitter sockets, telegraph, connected beats, player movement rule, recoil, recovery, and five required gameplay capture IDs. Reject attacks that could transfer unchanged to another boss.
10. **Prove the movement puzzle.** Fix the seed and replay the real compiled sentence in the canonical 390×844 mobile arena. Record the route hash and require at least 6 px of replayed clearance after the standard 3 px geometry uncertainty. Verify the same portrait arena when centered inside both phone-width and wide host shells; a wide shell must never create a wider gameplay arena. For a moving corridor, prove one continuous frame-to-frame route against the moving boss, live emitter sockets, and every emitted hazard; a positive route at isolated snapshots does not pass. For bounded formation variants, prove every retained template together with overlapping hazards. Correct the attack when proof fails; never lower collision radius, clearance, or search rigor to manufacture a pass.
11. **Pass Gate 5 — Actual Gameplay Review.** Run the boss in the real mobile-sized gameplay viewport. For every attack capture the actual preparation, telegraph, first beat, peak danger, and recovery. Inspect the images—not only tests—before passing the gate. Also capture one polished mobile gameplay screenshot with all debug presentation disabled.
12. **Teach, remix, and finish.** Phase one teaches rules separately. Phase two visibly changes anatomy, exposure, movement, or coordination and combines taught rules; never substitute only numeric increases. Verify lifecycle cleanup, focused tests, typechecks, the Director check, site build, and visual playthrough. Update the ignored/private Runner only after local parity passes and only when requested.

## Preserve runtime anatomy and animation invariants

1. Keep authored left/right limbs handed correctly in every neutral, attack, damage, and death frame. Never substitute an opposite-hand source frame.
2. Register every alternate frame for one part to the same canvas, structural pivot, and attachment point so animation cannot jump.
3. Choose either authored handed art or one intentional mirror. Keep scale signs stable across states and never combine an opposite-hand frame with another mirror.
4. Record each projectile sprite's native forward axis and apply one verified orientation offset from velocity. Validate the rendered sprite against actual straight and diagonal travel, including any direction used by a sustained attack. Do not guess rotation per attack.
5. Parent weapons, barrels, effects, and sockets to the hull or articulated mount that owns their motion; do not independently animate a child away from its mechanism. Mounted weapons must preserve their exact neutral local pose outside intentional aiming or firing, inherit all hull movement, and return exactly to neutral after recovery. Recoil and deterministic vibration are local firing-only effects and must stop when firing stops.
6. Sample emitter sockets from the live animated world transform at each emission. Warning-time positions may lock aim, but must not become stale firing origins.
7. Emit rapid-fire rounds sequentially across simulation frames. Synchronize each round with its own brief barrel frame, muzzle flash, and local recoil instead of flashing for the entire fire window. Keep the weapon's firing animation active for the complete continuous-fire duration, then visibly spin down and settle.
8. Resolve attacks against surviving anatomy. Destroyed parts must disable, shorten, remix, or trigger a deliberate fallback; hidden parts must never emit or retain damaging melee bounds.
9. Give mines a visible deploy, arm, trigger, explosion, and cleanup lifecycle. Enable damage only during the visible active explosion frames. Choose mine layouts from bounded deterministic templates that vary both X and Y, preserve minimum spacing and a readable route, avoid direct player spawns and complete walls, and remain safe when combined with the attack's other hazards.
10. Give summons a visible creation or deployment, activation or hatch, active movement/collision, exit or destruction, and cleanup lifecycle. Enable damaging collision only while the summon is visibly active. Spawn from the live anatomy that creates or commands it, cap ownership, and clean up on owner loss or action reconstruction. Choose formation routes from bounded deterministic templates with readable openings, and prove every retained template with concurrent hazards.
11. Account for every generated or extracted asset as an active runtime use, intentional future alternate, or archive/removal. Keep archived assets out of runtime manifests and registrations.
12. Inspect every attack in the actual canonical 390×844 runtime on both a phone-width host and a wide host shell. Both hosts must preserve the same portrait gameplay geometry. Automated tests, proofs, mock renders, and thumbnails do not replace this visual gate.
13. A launched body part must preserve a visible connection or return mechanism. Sample live attachment sockets at both the owner and launched part, keep repeated chain/cable/tether units at fixed native dimensions without stretching or large gaps, and clean up the launched part and tether on reseat, cancellation, reconstruction, owner loss, and death.

## Keep normal gameplay clean

Never place attack names, beat names, internal states, socket labels, debug markers, predicted trajectories, aiming lines, joint guides, part bounds, or hitbox outlines over normal gameplay. Debug overlays must require a specific developer toggle, default off, and be absent from the mobile gameplay and Gate 5 captures. Telegraph through anatomy, movement, sprite animation, effects, and supported sound-event hooks. A damaging beam may appear when it fires; a future-trajectory guide may not.

## Enforce stop conditions

- Do not release the one-boss lock while any required artifact or Gate 1–5 result is missing, or while the benchmark has an unproven critical attack, detached or incorrectly handed limb, unrelated or stale-socket emission, jumping frame, unreadable telegraph, dirty normal-gameplay overlay, or canonical mobile viewport failure.
- Do not count one volley, ring, beam, or radial burst as a complete attack sentence.
- Do not keep two active attacks whose preparation and survival decision serve nearly identical roles.
- Do not use unrestricted gameplay randomness. Seed every meaningful branch and restrict it to readable alternatives.
- Do not accept idle mounted-weapon drift, firing effects that continue after recovery, backward directional projectile art, a one-dimensional repeated mine line, an invisible or ownerless summon, missing summon cleanup, an unproved formation template, or a corridor whose continuous route has not been replayed.
- Do not preserve weak implementation merely because the concept art is attractive. Preserve identity or a useful mechanic, then rebuild through this workflow.
- Do not alter shared architecture for a one-off boss. Add a new runtime primitive only when it is typed, bounded, tested, and reusable.

Shared primitives may support moving emitters, sequential dual-stream fire, visible summon lifecycle, deterministic formations, and route proof, but a boss-specific signature choreography must remain owned by that boss. Reuse the lifecycle and safety contracts, not a benchmark's exact brood order, wing sequence, corridor shape, or other identity-defining choreography.

## Hand off

Report the boss identity, canonical reference, neutral-match result, asset decisions, final hierarchy/pivots, four attack-to-sprite mappings, deterministic seed, canonical-mobile route clearance, phone/wide-host portrait verification, five captures per attack, motion contact sheet, clean mobile screenshot, phase-two transformation, lifecycle evidence, validation commands, visual-verification verdict, remaining constraints, and one-boss-lock status. Update `docs/boss-factory/roster-classification.md` when an existing boss is rebuilt or reclassified.

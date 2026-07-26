---
name: scicon-boss-factory
description: Create, rebuild, animate, tune, and prove cohesive modular pixel-art bosses for SciCon Shooter using the canonical Boss Sandbox, deterministic attack timelines, anatomy-owned weapon sockets, and safe-route validation. Use for new test bosses, Boss Factory benchmark work, rebuilding weak existing bosses, authoring multi-beat maze attacks or signature moves, generating or processing matching boss art and components, rigging parts, validating mobile/desktop boss fights, or diagnosing boss art/attack quality.
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
6. **Animate purposefully.** Use transforms for rigid movement and equal-canvas pixel frames for shape changes. Provide entrance, idle, anticipation, recoil, large-hit, stagger, persistent damage, phase transition, and destruction. Ordinary low-damage hits must not jerk the whole boss.
7. **Pass Gate 3 — Motion-Range Review.** Capture one key-pose contact sheet containing neutral, fully open, fully closed, maximum left/right articulation, cannon firing, claw/weapon strike, charge, phase two, stagger, and death. Reject floating parts, gaps, bad layering, frame jumps, weapon scale drift, unintended stretch, or inconsistent pixel density.
8. **Author anatomy-first attacks.** Create exactly three initial core attack sentences plus one signature sentence before adding extras. Give each sentence preparation, telegraph, first beat, connected follow-ups, peak danger, recoil, recovery, and return. Route damaging emissions through named moving sockets and visible anatomy.
9. **Pass Gate 4 — Attack-to-Sprite Review.** Complete the attack-to-sprite mapping. For every attack declare moving parts, sprite/frame animations, emitter sockets, telegraph, connected beats, player movement rule, recoil, recovery, and five required gameplay capture IDs. Reject attacks that could transfer unchanged to another boss.
10. **Prove the movement puzzle.** Fix the seed and replay the real compiled sentence on mobile and desktop. Record the route hash and require at least 6 px of replayed clearance after the standard 3 px geometry uncertainty. Correct the attack when proof fails; never lower collision radius, clearance, or search rigor to manufacture a pass.
11. **Pass Gate 5 — Actual Gameplay Review.** Run the boss in the real mobile-sized gameplay viewport. For every attack capture the actual preparation, telegraph, first beat, peak danger, and recovery. Inspect the images—not only tests—before passing the gate. Also capture one polished mobile gameplay screenshot with all debug presentation disabled.
12. **Teach, remix, and finish.** Phase one teaches rules separately. Phase two visibly changes anatomy, exposure, movement, or coordination and combines taught rules; never substitute only numeric increases. Verify lifecycle cleanup, focused tests, typechecks, the Director check, site build, and visual playthrough. Update the ignored/private Runner only after local parity passes and only when requested.

## Preserve runtime anatomy and animation invariants

1. Keep authored left/right limbs handed correctly in every neutral, attack, damage, and death frame. Never substitute an opposite-hand source frame.
2. Register every alternate frame for one part to the same canvas, structural pivot, and attachment point so animation cannot jump.
3. Choose either authored handed art or one intentional mirror. Keep scale signs stable across states and never combine an opposite-hand frame with another mirror.
4. Record each projectile sprite's native forward axis and apply one verified orientation offset from velocity. Do not guess rotation per attack.
5. Parent weapons, barrels, effects, and sockets to the hull or articulated mount that owns their motion; do not independently animate a child away from its mechanism.
6. Sample emitter sockets from the live animated world transform at each emission. Warning-time positions may lock aim, but must not become stale firing origins.
7. Emit rapid-fire rounds sequentially across simulation frames. Synchronize each round with its own brief barrel frame, muzzle flash, and local recoil instead of flashing for the entire fire window.
8. Resolve attacks against surviving anatomy. Destroyed parts must disable, shorten, remix, or trigger a deliberate fallback; hidden parts must never emit or retain damaging melee bounds.
9. Give mines a visible deploy, arm, trigger, explosion, and cleanup lifecycle. Enable damage only during the visible active explosion frames.
10. Account for every generated or extracted asset as an active runtime use, intentional future alternate, or archive/removal. Keep archived assets out of runtime manifests and registrations.
11. Inspect every attack in the actual canonical runtime at both mobile and desktop viewport sizes. Automated tests, proofs, mock renders, and thumbnails do not replace this visual gate.

## Keep normal gameplay clean

Never place attack names, beat names, internal states, socket labels, debug markers, predicted trajectories, aiming lines, joint guides, part bounds, or hitbox outlines over normal gameplay. Debug overlays must require a specific developer toggle, default off, and be absent from the mobile gameplay and Gate 5 captures. Telegraph through anatomy, movement, sprite animation, effects, and supported sound-event hooks. A damaging beam may appear when it fires; a future-trajectory guide may not.

## Enforce stop conditions

- Do not release the one-boss lock while any required artifact or Gate 1–5 result is missing, or while the benchmark has an unproven critical attack, detached or incorrectly handed limb, unrelated or stale-socket emission, jumping frame, unreadable telegraph, dirty normal-gameplay overlay, or mobile/desktop viewport failure.
- Do not count one volley, ring, beam, or radial burst as a complete attack sentence.
- Do not use unrestricted gameplay randomness. Seed every meaningful branch and restrict it to readable alternatives.
- Do not preserve weak implementation merely because the concept art is attractive. Preserve identity or a useful mechanic, then rebuild through this workflow.
- Do not alter shared architecture for a one-off boss. Add a new runtime primitive only when it is typed, bounded, tested, and reusable.

## Hand off

Report the boss identity, canonical reference, neutral-match result, asset decisions, final hierarchy/pivots, four attack-to-sprite mappings, deterministic seed, mobile/desktop route clearance, five captures per attack, motion contact sheet, clean mobile screenshot, phase-two transformation, lifecycle evidence, validation commands, visual-verification verdict, remaining constraints, and one-boss-lock status. Update `docs/boss-factory/roster-classification.md` when an existing boss is rebuilt or reclassified.

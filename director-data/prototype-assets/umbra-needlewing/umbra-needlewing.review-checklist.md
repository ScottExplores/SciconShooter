# Umbra Needlewing Boss Factory review checklist

Status: compact modular art and runtime integration are complete, and all 12 attack-by-phase routes are proven in the canonical `390 x 844` arena. Human visual review, the complete capture package, and remaining Gate 1-5 verdicts are still pending. The one-boss lock stays on Umbra Needlewing.

## One-boss stop gate

- [x] `umbra-needlewing` is the one active benchmark boss named by this package.
- [x] Art-package writes are confined to `director-data/prototype-assets/umbra-needlewing/`.
- [ ] Do not release the Umbra lock until every Gate 1–5 requirement passes or the user accepts a documented exception.

## Gate 1 — Reference Lock

- [x] One canonical complete reference pose is path- and SHA-256-locked.
- [x] The cleaned component and VFX sheets plus their chroma ancestors are hash-inventoried.
- [x] Every accepted 4×4 source cell has an explicit disposition; the generated inventory reports complete coverage and zero silent-unused runtime frames.
- [x] Structural crops use explicit rectangles, authored left/right parts, binary alpha, and no negative scale/mirroring.
- [x] Core, needle, shard, and re-entry animation families use registered equal-canvas groups.
- [x] Needle `0–3`, shard `0–3`, re-entry `0–3`, reticle, dash trail, damage spark, and escape flame all exist as generated runtime frames.
- [ ] Human-review every generated component at high zoom for remaining chroma fringe, lost intended magenta effect pixels, palette coherence, and transparent-edge quality.
- [ ] Confirm runtime texture smoothing will be disabled before integration.
- [ ] Record an accepted Gate 1 verdict in `evidence/visual-verification.md`.

## Gate 2 — Neutral-Pose Match

- [x] Build `umbra-needlewing-neutral.png` from the actual modular hierarchy.
- [x] Preserve the locked short/wide ratio: sanitized reference `1.9053`, generated neutral `1.9220`.
- [x] Show four distinct authored wings per side with body/core drawn over connected wing roots.
- [x] Keep `scaleX === scaleY` for every structural part and use no mirrored/negative-scale anatomy.
- [ ] Render the modular neutral through the actual Boss Sandbox runtime.
- [ ] Center- and equal-height-match the live neutral against the reference at 25%, 50%, and 75% opacity.
- [ ] Decide during overlay review whether the approximately 10 px authored left-heavy envelope needs compensation while keeping joints connected.
- [ ] Record the accepted Gate 2 verdict and evidence.

## Gate 3 — Motion-Range Review

- [x] Integrate the registered 32-part compact rig and deterministic pose sampler before reviewing motion.
- [ ] Capture neutral, fully open, fully closed, maximum left/right, firing, strike/dash, charge, phase two, stagger, and death poses.
- [ ] Verify every wing remains connected through its required 8–10 px overlap and every named socket follows the moving part.
- [ ] Verify no frame jump, handedness change, weapon-size drift, unintended nonuniform stretch, or inconsistent pixel density.
- [ ] Inspect entrance, idle breathing, large hit, stagger, persistent damage, transition, escape, cleanup, and death.

## Gate 4 — Attack-to-Sprite Review

- [x] Map exactly three core attacks and one anatomy-specific signature in `umbra-needlewing.attack-sprite-map.json`.
- [x] Map each attack to moving parts, registered animations, named sockets, anatomy telegraph, connected beats, recoil, recovery, and five reserved capture paths.
- [x] Make Blackout Ambush depend on Umbra's eight-wing fold, re-entry frames, dash trail, and open core rather than a transferable generic bullet pattern.
- [ ] Verify every damaging beat leaves the named moving socket and follows visible sprite anatomy in actual runtime.
- [ ] Verify telegraphs lock before damage and no hidden part emits collision.
- [ ] Record the accepted Gate 4 verdict and captures.

## Gate 5 — Actual Gameplay Review

- [ ] Run all three core attacks and Blackout Ambush individually at mobile `390 × 844`.
- [ ] Repeat visual review in the desktop host without treating a different desktop arena geometry as acceptance proof.
- [ ] Capture preparation, telegraph, first beat, peak danger, and recovery for every attack.
- [ ] Capture a clean mobile gameplay frame with all developer overlays disabled.
- [ ] Confirm attack/beat/state text, prediction lines, socket markers, bounds, hitboxes, and debug guides are absent.
- [ ] Record lifecycle, cleanup, and destruction quality in actual gameplay.

## Deterministic safety and release

- [x] Replay fixed seed `0x0b1ac0de` against all 12 attack-by-phase configuration hashes recorded in `evidence/umbra-needlewing-safe-route-evidence.json`.
- [x] Prove every core/signature phase route keeps at least 6 px clearance after 3 px geometry uncertainty; the current minimum is `21.261279178038116 px` after uncertainty.
- [ ] Verify spawn/reset/replay/loop/state controls remove every Umbra-owned projectile, warning, trail, collision, and VFX object.
- [ ] Re-run focused checks, Director/root typechecks, production build/exclusion, Runner parity, and any requested private deployment only after integration is authorized.
- [ ] Release the one-boss lock only after all five gates pass or the user explicitly accepts documented exceptions.

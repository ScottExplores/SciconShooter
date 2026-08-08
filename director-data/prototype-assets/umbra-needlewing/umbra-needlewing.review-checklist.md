# Umbra Needlewing Boss Factory review checklist

Status: Factory-ready. The compact M50 boss, four corrected attacks, deterministic safety matrix, actual gameplay captures, phone/wide host review, and lifecycle cleanup passed on 2026-08-07. The Umbra one-boss lock is released.

## One-boss stop gate

- [x] `umbra-needlewing` was the only active benchmark boss during this pass.
- [x] Boss-package art writes stayed inside `director-data/prototype-assets/umbra-needlewing/`.
- [x] Gates 1–5 passed before the Umbra lock was released.

## Gate 1 — Reference Lock

- [x] One complete canonical pose is path- and SHA-256-locked.
- [x] Clean component/VFX sheets and their chroma ancestors are hash-inventoried.
- [x] Every accepted source cell has an explicit disposition; 33/33 runtime frames have consumers and no asset is silently unused.
- [x] Structural crops use explicit rectangles, authored left/right parts, binary alpha, and no mirrored or negative-scale anatomy.
- [x] Core, needle, shard, and re-entry families use registered equal-canvas groups.
- [x] Needle `0–3`, shard `0–3`, re-entry `0–3`, reticle, dash trail, damage spark, and escape flame exist as generated runtime frames.
- [x] High-zoom component, VFX, atlas, neutral, and live-Sandbox review found no damaging chroma fringe or transparent-edge defect. The dark-purple contour is accepted authored shadow color.
- [x] Live-game and Director textures use nearest-neighbor sampling.
- [x] Gate 1 verdict is recorded in `evidence/visual-verification.md`.

## Gate 2 — Neutral-Pose Match

- [x] The generated neutral is built from the actual modular hierarchy.
- [x] The reference ratio `1.9053` and generated ratio `1.9220` preserve the short/wide identity.
- [x] Four authored wings per side remain distinct and connected behind the body/core.
- [x] All structural parts use uniform positive scale.
- [x] The live neutral was captured through the canonical Boss Sandbox runtime.
- [x] 25%, 50%, and 75% equal-height overlays confirm center, silhouette, core, wing order, and root alignment.
- [x] The slight authored left-heavy envelope is accepted because it remains visually centered and keeps joints connected.
- [x] Gate 2 verdict and evidence are recorded.

## Gate 3 — Motion-Range Review

- [x] The registered 32-part hierarchy and deterministic pose sampler drive the live boss.
- [x] All eight articulation joints define validated conservative motion ranges and required 8–10 px overlap.
- [x] The 11-pose sheet covers neutral, fully open, fully closed, left/right extremes, firing, dash, charge, phase two, stagger, and escape.
- [x] Wings remain connected and every named socket follows its moving parent.
- [x] No frame jump, handedness change, weapon-size drift, nonuniform stretch, or inconsistent pixel density was observed.
- [x] Entrance, idle, large-hit response, stagger, low-health effects, phase transition, cleanup, and terminal escape were reviewed.

## Gate 4 — Attack-to-Sprite Review

- [x] Exactly three core attacks and one anatomy-specific signature are mapped.
- [x] Each attack declares moving parts, registered animations, sockets, anatomy telegraph, connected beats, recoil, recovery, and five capture paths.
- [x] Blackout Hunt depends on the eight-wing fold, re-entry frames, dash trail, and authored two/four/six physical-ram sequence.
- [x] Every damaging projectile, beam, and physical pass follows a visible or deliberately telegraphed anatomy-owned origin.
- [x] Telegraphs lock before damage; no hidden part emits collision and no stale effect damages after cleanup.
- [x] All 20 actual gameplay captures were inspected and approved.

## Gate 5 — Actual Gameplay Review

- [x] Wing Shear Crossfire, Broken Clockwise Opening, Blackout Laser, and Blackout Hunt ran individually at `390 × 844`.
- [x] The wide letterboxed host preserves the same canonical portrait arena.
- [x] Preparation, telegraph, first beat, peak danger, and recovery are captured for all four attacks.
- [x] A clean phone gameplay frame exists with all developer overlays disabled.
- [x] Attack/state labels, predicted routes, socket markers, bounds, hitboxes, and debug guides are absent from the arena.
- [x] Attack 2 uses sequential downward rotating salvos without production safe-path lines, labels, or endpoint circles.
- [x] Attack 3 keeps the boss/background hidden while player, eye/line cues, and the active laser remain readable.
- [x] Attack 4 uses multiple corner locks and physical passes, then rematerializes in stages at the canonical upper anchor.
- [x] Low-health, stagger, false finish, escape charge, upward escape, and escaped outcome are captured and reviewed.

## Deterministic safety and release

- [x] Fixed seed `0x0b1ac0de` passes all 12 attack-by-phase configuration hashes.
- [x] Every route retains at least 6 px after 3 px uncertainty; minimum observed clearance is `6.075921547 px`.
- [x] Spawn, restart, replay, loop, clear-hazards, manual attack, phase jump, life loss, and terminal cleanup remove Umbra-owned projectiles, warnings, trails, collision locks, blackout layers, and transient transforms.
- [x] The modular builder deterministically preserves and validates the full Boss Factory rig contract; two consecutive Umbra builds were byte-identical.
- [x] Focused checks, root/Director typechecks, builds, production exclusion, and Runner parity were rerun; any unrelated repository failures are reported separately rather than attributed to Umbra.
- [x] Gates 1–5 passed and the one-boss lock is released.

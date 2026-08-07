# Visual verification: Umbra Needlewing

## Review identity

- Boss ID: `umbra-needlewing`
- Reviewer: Codex Boss Factory visual and runtime review
- Review date: 2026-08-07
- Generated asset-manifest SHA-256: `6660fa585e355e7e8463e6087d1f37509fc3112b9d8fad4ad6a5c9e9f6dee506`
- Route-evidence SHA-256: `a6d3c97303e7b444c01fe9160e8bd8d0c1f4a40626c8cc6273b4557608c1f427`
- Fixed safety seed: `0x0b1ac0de` (`186302686`)
- Canonical arena: `390 x 844`
- Host shells reviewed: phone-width and wide letterboxed Director host
- One-boss lock: released after Gates 1-5 passed

## Required artifacts

- Canonical reference: `../umbra-needlewing-reference.png`
- Generated neutral: `../umbra-needlewing-neutral.png`
- Live modular neutral: `modular-neutral.png`
- Reference overlays: `reference-overlays/25-percent.png`, `50-percent.png`, and `75-percent.png`
- Asset inventory: `../umbra-needlewing.asset-usage.json` and `../umbra-needlewing.asset-usage-inventory.json`
- Rig contract: `../rig.source.json`, `../umbra-needlewing.rig.json`, and `../umbra-needlewing-atlas.json`
- Attack map: `../umbra-needlewing.attack-sprite-map.json`
- Motion sheet: `key-pose-contact-sheet.png`
- Attack sheet: `attack-stage-contact-sheet.png`
- Clean arena capture: `mobile-gameplay.png`
- Phone shell: `phone-gameplay-shell.png`
- Wide host: `wide-host.png`
- Terminal lifecycle: `poses/stagger.png`, `poses/false-finish.png`, `poses/escape-charge.png`, and `poses/escaping.png`
- Five actual captures for each attack: `attacks/<attack-id>/{preparation,telegraph,first-beat,peak-danger,recovery}.png`

## Gate results

| Gate | Verdict | Evidence and decision |
|---|---|---|
| 1 - Reference Lock | pass | Reference/source hashes are locked; all 33 runtime frames have explicit consumers; alpha is binary; bright chroma and guide pixels are absent from runtime crops; nearest-neighbor sampling is active. High-zoom review accepted the restrained dark-purple outer contour as authored shadow color, not chroma fringe. |
| 2 - Neutral-Pose Match | pass | Actual Sandbox overlays at 25%, 50%, and 75% confirm the same center, height, short/wide silhouette, core diameter, eight-wing ordering, and connected roots. The `0.87%` envelope-ratio difference and roughly 10 px authored left-heavy envelope do not impair centering or readability and are accepted. |
| 3 - Motion-Range Review | pass | The 11-pose contact sheet covers neutral, open, closed, left/right extremes, firing, dash, charge, phase two, stagger, and escape. All eight joints have validated motion ranges and preserve required 8-10 px root overlap; sockets, handedness, scale, and pixel density remain stable. |
| 4 - Attack-to-Sprite Review | pass | All 20 gameplay captures were inspected. Wing projectiles follow moving wing/needle sockets, Blackout Laser keeps the body hidden and separates warning from damage, and Blackout Hunt shows dissolve, corner silhouette, locked lane, physical pass, and full materialization. No hidden part emits collision. |
| 5 - Actual Gameplay Review | pass | All four attacks ran individually in the canonical portrait arena. Clean phone and wide-host captures preserve the same `390 x 844` geometry. Restart, manual phase/attack changes, clear-hazards, life loss, recovery, low-health effects, and terminal escape restore visibility, transforms, collision, blackout layers, and owned hazards. |

## Neutral and pixel-art review

- Locked reference bounds: `1328 x 697`, ratio `1.9053`.
- Generated neutral bounds: `419 x 218`, ratio `1.9220`.
- Live gameplay is compact and short/wide rather than vertically stretched.
- The body, red spine, core, and four authored wings per side remain legible at phone scale.
- No mirrored anatomy, negative scale, double root scaling, smoothing blur, or frame-size pumping was observed.
- The full generated set is pixel-styled rather than restricted to a tiny fixed palette; the hard clusters, binary alpha, nearest sampling, and consistent sprite density satisfy this boss's accepted visual contract.

## Motion and lifecycle review

- Neutral recovery restores the canonical upper anchor without accumulated transform error.
- Fully open and folded poses keep every wing attached at its named joint.
- Attack recoil and banking return to the canonical pose after replay and loop transitions.
- Phase two visibly broadens the wing fan and opens the core rather than relying only on numeric scaling.
- Low-health damage sparks are sprite-based and remain subordinate to the silhouette.
- The terminal sequence uses a damaged stagger, false-finish hold, escape charge, and visible upward escape. It clears damaging hazards and awards the escaped outcome without a conventional explosion.
- Restarting or interrupting a blackout restores the arena and targetability; Blackout Hunt's final materialization restores the exact upper anchor.

## Per-attack gameplay captures

| Attack ID | Preparation | Telegraph | First beat | Peak danger | Recovery | Verdict |
|---|---|---|---|---|---|---|
| `wing-shear-crossfire` | pass | pass | pass | pass | pass | Sequential wing-root fire is readable, socket-owned, and returns to the upper anchor. |
| `orbit-gap-thread` | pass | pass | pass | pass | pass | Five, six, or eight downward-only rotating salvos communicate the moving opening through projectile arrangement; no production safe-path line, label, or endpoint circle is drawn. |
| `corner-needle-lock` | pass | pass | pass | pass | pass | Pure blackout preserves the player/HUD, shows detached eye/line cues, locks before damage, fires a materially thicker beam, and restores the arena. |
| `blackout-ambush` | pass | pass | pass | pass | pass | Dissolve, dim corner silhouette, locked physical lane, dash trail, clean exit, and staged materialization are visually distinct from the laser attack. |

## Deterministic route proof

The serialized proof replays all 12 attack-by-phase combinations in the exact portrait geometry with 3 px geometry uncertainty. The required post-uncertainty floor is 6 px; the observed minimum is `6.075921547 px`.

| Phase | Attack | Frames | Configuration | Route | Post-uncertainty clearance |
|---|---|---:|---|---|---:|
| Wing Survey | `wing-shear-crossfire` | 261 | `2a6f1846` | `9e94ab4f` | `6.208027383 px` |
| Wing Survey | `orbit-gap-thread` | 387 | `d4b4b7ea` | `a1d5ace5` | `105.703212146 px` |
| Wing Survey | `corner-needle-lock` | 228 | `58b88d0b` | `cf4e0812` | `69.139672701 px` |
| Wing Survey | `blackout-ambush` | 378 | `3e69cd38` | `210707a7` | `41.241684079 px` |
| Blackout Hunt | `wing-shear-crossfire` | 231 | `f50f0490` | `e744e313` | `6.386875919 px` |
| Blackout Hunt | `orbit-gap-thread` | 348 | `f93661d6` | `65d55e88` | `111.894444158 px` |
| Blackout Hunt | `corner-needle-lock` | 202 | `61f79654` | `897620dc` | `66.865133817 px` |
| Blackout Hunt | `blackout-ambush` | 547 | `1221bda0` | `083e3bb6` | `37.406662522 px` |
| Broken Compass | `wing-shear-crossfire` | 204 | `3d82164c` | `d7cef2ba` | `6.075921547 px` |
| Broken Compass | `orbit-gap-thread` | 310 | `cd4d9984` | `3c82bea7` | `20.340185173 px` |
| Broken Compass | `corner-needle-lock` | 177 | `abe8c6d9` | `6eda59b5` | `64.613187094 px` |
| Broken Compass | `blackout-ambush` | 664 | `222228c3` | `f47d0ae3` | `34.161974733 px` |

## Clean gameplay presentation

- Developer attack/state text is outside the arena and absent from player-facing captures.
- Joint, socket, part-bound, collision, and safe-route overlays default off.
- Production does not draw `SAFE GAP`, `PORTAL TRACK`, predicted trajectories, or debug timing circles.
- Blackout Laser and Blackout Hunt deliberately preserve only the player, essential HUD, eye/lock cues, damaging beam or dash silhouette, and immediate feedback above the black layer.
- Player-facing warnings are non-damaging and visually distinct from active damage.

## Release verification

- Root TypeScript check: pass.
- Umbra artwork, modular pipeline, prototype-asset, route-proof, and GameEngine integration tests: 32/32 pass.
- Umbra manifest integrity: 43/43 referenced files match SHA-256.
- Director TypeScript check: pass.
- Director suite: 391/392 pass; the only failure is an unrelated stale Aurora Storm Engine phase reference.
- Root suite: 1,485/1,486 pass; the only failure is an unrelated stale non-boss balance-artifact digest.
- Root production build: pass, with Director exclusion verified.
- Director production guard: pass by intentionally refusing a deployable Director build.
- Private Runner: build pass and 22/22 tests pass with 38 pinned assets verified.

## Final verdict

- Overall visual verdict: pass.
- Phase-two transformation: pass.
- Lifecycle and cleanup: pass.
- Phone-width and wide-host portrait parity: pass.
- Route proof: 12/12 pass.
- Remaining visual blockers: none.
- User-accepted exceptions: the authored dark-purple contour and slight left-heavy envelope are retained because they are coherent at gameplay scale and preserve the locked art.
- One-boss lock released: yes.

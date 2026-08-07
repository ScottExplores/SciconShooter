# Boss design: Umbra Needlewing

## One-boss lock

- Active benchmark boss ID: `umbra-needlewing`
- Lock acquired: 2026-08-06 by explicit user transfer
- Previous/parallel Boss Factory art work stopped: yes; this package is the only authorized Factory editing surface for this task
- Lock release requires Gate 1–5 pass: yes

## Identity

- Sandbox ID: `sandbox-umbra-needlewing`
- Fantasy and character: a compact blackout hunter that folds a crown of needle wings around a predatory central hull
- Combat role: mobile corner hunter and route-reading gatekeeper
- Readable silhouette: short, wide, bilateral eight-wing fan around a tall navy body and red core
- Unique anatomy/mechanism: four independently rooted authored wings per side, a moving core aperture, deployable needle mounts, and a rear escape module
- Runtime placement: Campaign M50 and Boss Sandbox use the same rebuilt Umbra definition; the Sandbox remains the editable and repeatable test surface

## Player learning arc

- Skill A: alternate across visibly committed port/starboard wing fire in Wing Shear Crossfire
- Skill B: track the missing wedge through five, six, or eight sequential downward rotating salvos in Broken Clockwise Opening
- Skill C: read detached red eyes and leave each warning-locked lane before the stationary Blackout Laser fires
- Signature puzzle: read the pure-black re-entry corners and vacate two, four, or six committed physical ram lanes in Blackout Hunt
- Phase-two visual/behavioral remix: core aperture opens, eye overlays flare, wings spread/fold more aggressively, and the registered re-entry family makes disappearance/reappearance physical
- Recovery/vulnerability reward: open core and drooped wings expose a clear central punish window

## Locked art contract

- Canonical reference path/hash: `umbra-needlewing-reference.png` / `2db71f4a183415e9851be2363b2224b8d7912e272922b55c7cfb8c1043e0ac21`
- Neutral/charged/damaged reference roles: neutral is the complete locked pose; charged uses `core.open`, eye overlays, and anatomy motion; damaged uses the integrated `damage.spark` and rooted component reactions, pending human visual acceptance
- Logical canvas and gameplay display size: `512 × 320` authoring canvas; the live modular runtime preserves this package's uniform scale and short/wide aspect, with final Sandbox overlay acceptance still pending
- Palette limit: source palette retained; packer removes magenta chroma and forces binary alpha; final palette-count review is pending
- Structural outline: dark near-black outline, navy armor, silver edges, cyan wing-edge light, red eyes/spine/core
- Lighting/material: hard pixel clusters with cool metallic highlights and emissive red/cyan accents
- Required authoritative parts: `body.shell`, `core.closed`, `core.open`, eight authored `wing.*` frames, two authored needle mounts, `needle.launcher`, and `escape.module`
- Frame-animation parts: `core-cycle`, `needle-cycle`, `shard-cycle`, and `reentry-cycle`
- Transform-animation parts: root, eight named wing mounts, body, core, needle mounts/launcher, and escape module
- Uniform-scaling rule or documented exception: every structural transform uses equal `scaleX` and `scaleY`; no negative scale or mirrored reuse is allowed. The smaller fourth-wing source pair uses the same `0.62` uniform scale on both authored hands; the other six wings use `0.46`.

## Required package artifacts

- Canonical complete reference pose: `umbra-needlewing-reference.png`
- Modular neutral-pose screenshot: `umbra-needlewing-neutral.png` (packer preview complete; actual Sandbox capture pending)
- Asset-usage inventory: `umbra-needlewing.asset-usage.json` plus the template audit bridge `umbra-needlewing.asset-usage-inventory.json`
- Rig and pivot manifest: `rig.source.json`, generated `umbra-needlewing.rig.json`, and `umbra-needlewing-atlas.json`
- Attack-to-sprite mapping: `umbra-needlewing.attack-sprite-map.json`
- Key-pose review contact sheet: rig is integrated; required contact-sheet capture remains pending
- Mobile gameplay screenshot with debug presentation off: runtime is integrated; clean capture remains pending
- Visual-verification result: `evidence/visual-verification.md` (starter; gates pending)
- Per-attack five-capture folder: paths reserved by the attack map; captures pending

## Lifecycle

- Entrance: `reentry.0–3` resolves from sparse blackout fragments into the complete body while attack sockets remain disabled
- Idle: restrained root drift and low-amplitude transform-driven breathing across all eight wing mounts; no frame or scale drift
- Large hit: local `damage.spark`, brief core recoil, and delayed wing catch-up without whole-body flash spam
- Stagger: whole hierarchy recoils; outer wings flare while inner wings droop and the core remains readable
- Persistent damage: late damage stages use the registered `damage.spark` and rooted component reactions; final visual acceptance remains pending
- Phase transition: core opens, eye overlays engage, re-entry animation flashes, and wing mounts take a visibly broader pose
- Destruction: attack sockets disable, wings collapse in rooted order, escape module exposes, and `escape.flame` follows its named thrust sockets

## Neutral reference assessment

- Sanitized reference visible bounds: `1328 × 697`, ratio `1.9053`
- Generated neutral visible bounds: `419 × 218`, ratio `1.9220`
- Ratio delta: approximately `0.87%`; the package preserves the locked short/wide silhouette
- Readability: four distinct wings are visible on each side; body, segmented red spine, and core remain centered and in front of the wing roots
- Remaining visual note: the authored left wing crops produce a roughly 10 px left-heavy total envelope on the `512 × 320` preview even though body and bilateral joints are centered. Gate 2 overlay review must decide whether to preserve that authored asymmetry or compensate in runtime presentation.

## Verification evidence

- Gate 1 — Reference Lock result: pending human edge/palette review; reference path/hash, source coverage, binary-alpha build, and zero silent-unused-frame checks are complete
- Gate 2 — Neutral-Pose Match result: packer preview visually tuned; actual Boss Sandbox centered/equal-height opacity comparison pending
- Gate 3 — Motion-Range Review result: modular rig and deterministic pose runtime are integrated; required contact sheet and human motion review remain pending
- Gate 4 — Attack-to-Sprite Review result: current moving-socket attack mapping is recorded; actual five-stage capture review remains pending
- Gate 5 — Actual Gameplay Review result: canonical runtime integration and route replay are complete; clean mobile, phone-width, and wide-host visual captures remain pending
- Fixed seed and configuration hash: `umbra-needlewing-boss-factory-v1`; generated asset-manifest SHA-256 `3f9ae7b808f0bd1b42934b2fc815bb39a0049a7009a431d22d12660f6b201104`
- Canonical mobile route proof: all 12 attack-by-phase witnesses pass at `390 x 844` with fixed seed `0x0b1ac0de`; the minimum is `6.075921547 px` after the standard 3 px uncertainty. The current evidence SHA-256 is `a6d3c97303e7b444c01fe9160e8bd8d0c1f4a40626c8cc6273b4557608c1f427`; full configuration and route hashes are recorded in `evidence/umbra-needlewing-safe-route-evidence.json` and the attack map.
- Wide-host route geometry: the gameplay arena must remain the same letterboxed `390 x 844` logical viewport; phone-width and wide-host visual confirmation remain pending.
- Normal gameplay attack text/guide lines absent: runtime presentation policy keeps attack/state text and guides debug-only and off by default; clean capture confirmation remains pending
- Remaining constraints/blockers: human reference/pixel review, actual Sandbox reference-overlay review, motion contact sheet, five gameplay captures per attack, clean mobile capture, and phone-width/wide-host visual confirmation
- One-boss lock released: no

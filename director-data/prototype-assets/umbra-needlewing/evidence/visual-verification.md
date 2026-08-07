# Visual verification: Umbra Needlewing

## Review identity

- Boss ID: `umbra-needlewing`
- Reviewer: Codex package-build inspection; human gameplay reviewer pending
- Review date: 2026-08-06
- Configuration/content hash: generated asset manifest SHA-256 `e7057cce093e5584fbcd54040e0e8608bebbb5a81cab65f927cef8ca17bab3f7`
- Fixed safety-proof seed: `0x0b1ac0de` (`186302686`)
- Mobile viewport: canonical `390 x 844` logical arena route proof complete; actual gameplay review pending
- Wide host: must letterbox the same `390 x 844` logical arena; actual host-shell review pending
- One-boss lock status: active on Umbra Needlewing; not released

## Required package artifacts

- Canonical reference: `../umbra-needlewing-reference.png` (`2db71f4a183415e9851be2363b2224b8d7912e272922b55c7cfb8c1043e0ac21`)
- Modular neutral screenshot: `../umbra-needlewing-neutral.png` (`a1635e616add1b99336c366bc51499311f130ce62fbecd8d4a8956e1c9b2aba2`)
- Asset-usage inventory: `../umbra-needlewing.asset-usage.json` and `../umbra-needlewing.asset-usage-inventory.json`
- Rig/pivot manifest: `../rig.source.json`, `../umbra-needlewing.rig.json`, and `../umbra-needlewing-atlas.json`
- Attack-to-sprite mapping: `../umbra-needlewing.attack-sprite-map.json`
- Deterministic route evidence: `umbra-needlewing-safe-route-evidence.json`
- Key-pose contact sheet: pending runtime integration
- Mobile gameplay screenshot: pending runtime integration
- Per-attack capture root: `attacks/` paths reserved; captures not yet created

## Gate results

| Gate | Verdict | Evidence | Remaining correction |
|---|---|---|---|
| 1 — Reference Lock | blocked | Reference/source hashes, 33 runtime frames, complete 33-cell source coverage, binary-alpha atlas/neutral, and zero silent-unused runtime frames | Human zoom/palette/edge review and runtime smoothing proof |
| 2 — Neutral-Pose Match | blocked | Packer neutral inspected; eight wings readable; neutral ratio `1.9220` versus sanitized reference `1.9053` | Actual Sandbox equal-height opacity comparison and decision on 10 px authored envelope bias |
| 3 — Motion-Range Review | blocked | Registered 32-part hierarchy, deterministic pose sampler, named joints, overlaps, and 22 moving sockets | Complete actual-Sandbox motion contact sheet |
| 4 — Attack-to-Sprite Review | blocked | Three core attacks plus Blackout Ambush mapped to anatomy, frames, sockets, and 12 deterministic attack-by-phase route witnesses | Actual moving-socket/damage alignment review and five captures per attack |
| 5 — Actual Gameplay Review | blocked | Canonical mobile route proof passes; no visual gameplay acceptance claim is made | Phone-width/wide-host gameplay, lifecycle, presentation, cleanup, destruction, and required captures |

## Neutral comparison

- Same center and overall height: not yet proven in the actual Boss Sandbox; packer preview body/root is centered on the logical canvas
- Reference opacity levels inspected: direct side-by-side visual inspection only; 25%, 50%, and 75% live overlays remain pending
- Silhouette/proportion result: sanitized reference bounds are `1328 × 697` (`1.9053`); generated neutral bounds are `419 × 218` (`1.9220`), a ratio difference of roughly `0.87%`
- Joint/weapon/reactor/layer result: all eight wing roots overlap behind the body, core sits over the lower aperture, authored hands are not mirrored, and attack/escape mechanisms stay hidden in neutral
- Corrections made: reversed lower-wing fan rotations, spread the third and fourth banks downward, enlarged the smaller fourth-wing pair uniformly from `0.46` to `0.62`, shifted its roots outward, and aligned rig anchors to generated atlas registration
- Remaining visual note: the authored port crops make the complete envelope about 10 px left-heavy; body and paired joints remain centered and connected

## Motion contact sheet

The required neutral, fully open, fully closed, maximum left/right articulation, firing, strike/dash, charge, phase two, stagger, and death contact sheet remains pending actual-Sandbox capture.

- Disconnected or floating parts: none observed in the canonical neutral preview; motion range not yet reviewed
- Layering or frame jumps: neutral layer order passes visual inspection; animation transitions not yet reviewed live
- Scaling or pixel-density issues: every structural transform is uniform per part and no negative scales exist; runtime texture sampling remains unverified
- Collision-to-visible-pixel result: generated compact collision mask exists; actual visual alignment review remains pending

## Per-attack actual gameplay captures

| Attack ID | Preparation | Telegraph | First beat | Peak danger | Recovery | Visually approved |
|---|---|---|---|---|---|---|
| `wing-shear-crossfire` | pending | pending | pending | pending | pending | no |
| `orbit-gap-thread` | pending | pending | pending | pending | pending | no |
| `corner-needle-lock` | pending | pending | pending | pending | pending | no |
| `blackout-ambush` | pending | pending | pending | pending | pending | no |

## Deterministic route proof

Proof source: `../../../../services/gameplay/bosses/UmbraNeedlewingSafeRouteProof.ts`
Serialized evidence: `umbra-needlewing-safe-route-evidence.json`
Fixed seed: `0x0b1ac0de`; standard geometry uncertainty: `3 px`; required post-uncertainty clearance: `6 px`.

| Phase | Attack | Frames | Route hash | Configuration hash | Raw clearance | After uncertainty | Verdict |
|---|---|---:|---|---|---:|---:|---|
| Wing Survey | `wing-shear-crossfire` | 315 | `58e14cd4` | `3936d16d` | `37.3452 px` | `34.3452 px` | Pass |
| Wing Survey | `orbit-gap-thread` | 399 | `40a771ee` | `ce25e4c4` | `84.6423 px` | `81.6423 px` | Pass |
| Wing Survey | `corner-needle-lock` | 240 | `6e550432` | `8425677d` | `72.1397 px` | `69.1397 px` | Pass |
| Wing Survey | `blackout-ambush` | 621 | `c3f52b42` | `ecb23c0a` | `51.8819 px` | `48.8819 px` | Pass |
| Blackout Hunt | `wing-shear-crossfire` | 303 | `390e591a` | `fc79a9a7` | `31.0972 px` | `28.0972 px` | Pass |
| Blackout Hunt | `orbit-gap-thread` | 387 | `2976cfd1` | `503e17c2` | `143.7857 px` | `140.7857 px` | Pass |
| Blackout Hunt | `corner-needle-lock` | 226 | `26ff88d3` | `d4abf9e0` | `69.8651 px` | `66.8651 px` | Pass |
| Blackout Hunt | `blackout-ambush` | 763 | `7c0e229a` | `edad0882` | `50.7492 px` | `47.7492 px` | Pass |
| Broken Compass | `wing-shear-crossfire` | 290 | `119f9baa` | `e1f7856b` | `24.2613 px` | `21.2613 px` | Pass |
| Broken Compass | `orbit-gap-thread` | 374 | `4fc4b0ca` | `aa293801` | `143.4827 px` | `140.4827 px` | Pass |
| Broken Compass | `corner-needle-lock` | 207 | `79eb13e3` | `5fce6ee1` | `67.6132 px` | `64.6132 px` | Pass |
| Broken Compass | `blackout-ambush` | 894 | `96baac09` | `bdb0dc6f` | `39.5549 px` | `36.5549 px` | Pass |

All 12 continuous witnesses cover their full attack duration. The narrowest route is Broken Compass Wing Shear at `21.261279178038116 px` after uncertainty, comfortably above the `6 px` floor. The replay consumes the shared gap-route, corner-beam, and corner-ram locks/path samplers; the wing fan uses Umbra's normalized authored origins. Actual phone-width and wide-host visual review must still confirm that both shells preserve the same portrait geometry and visible socket alignment.

## Clean gameplay presentation

- Attack/beat/state text absent: pending actual gameplay review
- Aiming and predicted-trajectory lines absent: pending actual gameplay review
- Joint/socket/part/hitbox guides absent: pending actual gameplay review
- All developer overlay toggles default off: pending actual gameplay review
- Actual damaging beams/projectiles visible only during fire: pending actual gameplay review

## Final verdict

- Overall verdict: blocked pending human Gate 1–5 visual review and the complete capture package
- Phase-two visual and behavioral transformation: runtime integration provides the open core, eye overlays, eight moving wing joints, and registered re-entry frames; actual gameplay presentation remains unverified
- Remaining blockers: human edge/palette review, actual Sandbox reference overlay, motion sheet, attack captures, clean phone-width/wide-host gameplay review, lifecycle/cleanup, and destruction review
- User-accepted exceptions: none
- One-boss lock released: no

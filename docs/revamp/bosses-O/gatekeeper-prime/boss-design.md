# Gatekeeper Prime — Job O benchmark

Gatekeeper's existing turquoise armored hull now presents a readable sequence: break the outer cannon and generator, break the revealed inner battery and armor, then exploit the opening core. Every major receives this state-driven interaction over its preserved artwork; mini encounters use two-stage support hardware while retaining their existing authored choreography.

The active reference boss is `gatekeeper-prime`. The user explicitly requested the whole campaign roster, so the skill's one-boss lock and sandbox-only sequence do not govern rollout. This package does not declare the skill's five-gate lock released.

## Identity and learning

Gatekeeper remains the custodian of the Launch Bay: broad armored shoulders, a turquoise central body, symmetric handed weapon art and a small central cockpit. The new outer cannon, generator, inner battery, armor projector, sliding core and upper hangar are bounded procedural fittings attached to that silhouette.

The player learns three skills: break visible attack owners to simplify the encounter, move after a telegraph locks, and use the quiet recovery window when the core opens. Phase two sheds the small shell leaves, leaves destroyed sockets in place and reveals the inner fittings. Warned side-wall sentences and capped hangar escorts change the arena. Phase three exposes the core and alternates outward beam sweeps with chevron fields that retain a central route. The physical shutter marks a timed hull-exposure window: unshielded hull damage is multiplied by 1.85 while open and 0.8 while closed. This bonus does not require hitting a separate small core circle. Shielded layers never advertise an open damage window.

These are refinements to C's four existing attack families, plus shared arena/summon sentences. They are not four newly painted, anatomy-exclusive attack animations. The complete [attack map](attack-to-sprite-map.json) calls out projected fields whose bullets appear at the warned columns rather than travelling from the barrel to every field position.

Later phases introduce their new mechanics first. Phase two opens with the fully warned side walls, then hangar deployment, then the surviving inner weapons. Phase three opens with the fully warned rotating sweep, then the hangar, then core attacks. The next phase-three arena sentence is the chevron variation. Phase one keeps its original weapon opener. `beginInteractiveWarning` offsets the local sequence by two only in phases above one; it does not shorten warnings or alter plan geometry.

## Reference and art contract

Canonical before gameplay: [Gatekeeper before](</workspace/scicon-revamp/qa/O-bosses/before/no-video-control/gatekeeper-prime-god/002-combat-9-2s.png>), 780×1688, SHA256 `2e3fe1de05db00f479ae1e363468044fc14b956de016b602a41ea93e32f51b00`. This shows the original art with C's single marked part; it is not a clean neutral comparison.

Original neutral frame: [open-orbit/frame-1.png](/workspace/scicon-revamp/w4-O/public/game-art/pixi/bosses/open-orbit/frame-1.png), 512×640, SHA256 `41280945a0d3147b39514d8c6df05aa84bf6411e9690666882e37045c8653f86`. All five original frames and handed arm images remain byte-for-byte intact. Their explicit inventory statuses and hashes are in [asset-usage.json](asset-usage.json).

The logical world remains 390×844. New fittings use dark outlines, stepped metal plates, silver edge highlights, small bolts/ribs and the source boss's limited color family. Structural fills are opaque; only smoke/charge effects use translucency. Original alpha, canvases, frame registration and nearest-neighbor rendering are unchanged. New surfaces are retained Pixi graphics; no new raster frame animation or texture generation is introduced. Whole-game pixel density remains the existing renderer's responsibility.

The original hull and rig own their existing animation. Added world-layer containers sample the simulation's current sockets, and use fixed-size local geometry for recoil, smoke, shutter separation and shell-leaf transforms. The [rig manifest](rig-pivot-manifest.json) records the parent relationship, local pivots, armament collision radii and display dimensions. Its 22 px `coreRadius` is unused metadata, not a core hitbox. Crownclaw and its variant use outer/inner Y anchors `.66/.70`, core `.50`; Oculus and its variant use `.68/.72`, core `.52`; Hammerhead uses `.68/.72`, core `.62`. All retain the `.35` hangar. These shallower anchors avoid transparent canvas below the painted anatomy. Mini supports use Y `.68` for Bottleneck, Railspine and Gridline, `.74` for Convoy and `.90` otherwise; their X ratios and `.68` core anchor are unchanged. The corrected production opening images are linked in the [roster review](../final-visual-review.md).

## Lifecycle and retention

- Entrance: existing C warning/name card, slow entrance and sound/camera events.
- Idle: original hull animation; quiet fittings return to their neutral socket pose.
- Large hit/stagger: existing response plus a quiet part-break interval; small hits do not jerk every fitted part.
- Persistent damage: intact → cracked → smoking → attached dark wreck, with its own HP strip.
- Transition: shell leaves separate over 60 simulation frames; new inner hardware emerges and perimeter machinery appears.
- Recovery: the core's two slatted doors open over 18 frames only after shield removal; the upper hangar has independent shutters.
- Destruction: actual part coins and bounded break effects. The existing A common major-defeat presenter supplies chain explosions, debris, flash and slow motion; the established final reward path supplies coin rain. O adds brief collection invulnerability. C lifecycle event payloads are QA receipts, not production effect settings.

No new per-frame textures are created. The presentation regression replays 120 translation/pulse/opening frames and checks no additional display objects or `Graphics.clear` calls for unchanged anatomy. State transitions can redraw retained paths.

## Evidence scope

The package contains the reference, inventory, rig manifest, attack mapping, representative route witnesses, review checklist and visual result. Corrected production screenshots have been inspected for Prism, Crownclaw and Oculus attachment and damage states. The formal equal-height opacity comparison, complete motion contact sheet, and five exact gameplay capture stages for each attack are not claimed. All unassigned attack capture paths remain `null` deliberately.

Seed `12345`, source digests and seven representative route hashes are recorded in [proof-samples.json](proof-samples.json). The lowest representative clearance is 20.38 px after the 3 px geometry allowance, above the required 6 px. This sample set does not replace the 42,000-case weapon matrix, 120 arena cases, sweep-containment tests, or actual collision/lifecycle regressions. It also does not establish human fairness, visual quality or GPU performance.

Final roster QA, full suites, build/typecheck and phone/wide shell results belong to [REVAMP_NOTES_O.md](/workspace/scicon-revamp/w4-O/REVAMP_NOTES_O.md). Screenshots captured before the later-phase ordering correction establish art/attachment diagnostics only. See [visual-verification.md](visual-verification.md) for exactly which images were opened and the remaining gate limits.

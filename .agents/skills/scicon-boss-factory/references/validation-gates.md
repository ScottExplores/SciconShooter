# Boss Factory validation gates

Keep one active benchmark boss. Do not begin another boss until every artifact and Gate 1–5 result below passes. Building tests, typechecks, or deterministic proofs does not replace visual inspection.

## Required boss package

Store these ignored/local artifacts with the boss package:

1. one canonical complete reference pose;
2. one modular neutral-pose screenshot from the actual Boss Sandbox;
3. one asset-usage inventory covering every accepted sprite/frame;
4. one rig and pivot manifest covering hierarchy, anchors, pivots, transforms, sockets, layers, and source hashes;
5. one attack-to-sprite mapping covering every attack;
6. one key-pose review contact sheet;
7. one polished mobile gameplay screenshot with debug presentation off;
8. one visual-verification result with Gate 1–5 verdicts, blockers, evidence paths, and reviewer/date;
9. five actual gameplay captures per attack: preparation, telegraph, first beat, peak danger, and recovery.

## Gate 1 — Reference Lock

- Lock and hash one canonical complete visual design.
- Derive or compare every accepted structural part against that design.
- Record the intended neutral, charged/phase-two, and damaged reference roles when present.
- Reject independently invented complete art and unrelated modular parts.
- Remove magenta, guide-grid pixels, edge halos, redundant parts, and inconsistent variants before acceptance.

Pass only when the canonical reference and asset-usage inventory are complete and every retained part has a deliberate status.

## Gate 2 — Neutral-Pose Match

- Render the modular boss in the actual Boss Sandbox, not a mock renderer.
- Center the reference and modular rig together, match their overall height, and inspect at adjustable reference opacity.
- Compare silhouette, main-body size, shoulder/joint placement, arm angles, weapon/claw size, cannon mounting, reactor position, front/back layering, pixel density, and visual balance.
- Correct cropping, pivots, registration, scale, hierarchy, and overlap. Do not hide a mismatch by independently shrinking important weapons.
- Verify left/right parts retain their authored handedness, alternate frames share one structural pivot/registration, and scale signs never flip between states. Reject double-mirrored or opposite-hand substitutions.
- Keep the flattened reference comparison-only; never substitute it for the gameplay rig.

Pass only when the neutral screenshot visibly matches the locked reference at gameplay scale and the rig/pivot manifest is current.

## Gate 3 — Motion-Range Review

Capture one contact sheet containing:

- neutral;
- arms or major appendages fully open;
- arms or major appendages fully closed;
- maximum left articulation;
- maximum right articulation;
- cannon/primary weapon firing pose;
- claw/secondary weapon strike pose;
- reactor/core charge pose;
- phase-two pose;
- stagger pose;
- death pose.

Inspect for floating parts, disconnected joints, incorrect overlap/layering, tiny or oversized weapons, frame-registration jumps, nonuniform structural stretch, inconsistent pixel density, and collision shapes detached from visible pixels. Exercise the complete validated movement range, not only convenient poses.

Confirm weapons, barrels, effects, and sockets inherit the current transform of their owning hull or articulated mount. Inspect mounted weapons during idle, horizontal and vertical translation, phase changes, damage states, firing, and recovery. They must remain fixed to their owning mount outside intentional aiming, show recoil or bounded vibration only while firing, and return to the exact neutral local pose afterward. During firing, inspect sequential rapid-fire frames and require every emitted round to align with its own brief barrel animation, muzzle flash, and local recoil. For continuous fire, the barrel animation must remain active throughout the firing interval and visibly stop during recovery.

For a launched body part, inspect seated, release, extension, peak, retraction, and reseat. Require the owner and launched endpoint to come from current live sockets. Repeated chain, cable, or tether units must retain fixed native dimensions without stretch or large gaps. The seated copy must not remain visible during launch, and cancellation, reconstruction, owner loss, reseat, and death must leave no duplicate launched part or connector residue.

For anatomy that creates or commands summons, include its closed/neutral, deploy or hatch, active command, and recovery poses. Confirm each summon visibly leaves the current live source anatomy and the source does not keep emitting after it is destroyed or hidden.

Pass only when every joint remains visually connected and every shape-changing frame remains registered throughout motion.

## Gate 4 — Attack-to-Sprite Review

For every attack, declare and visually verify:

- moving body parts;
- sprite/frame animations;
- projectile or melee-owner sockets;
- preparation and telegraph;
- first beat and connected follow-up beats;
- peak danger;
- player movement/survival rule;
- recoil or physical reaction;
- recovery/vulnerability and return;
- paths for all five required gameplay captures.

Also verify each directional projectile uses one documented native-forward orientation offset, every emission samples the current animated socket transform, and every destroyed-part state has an explicit disable/remix/fallback outcome with no hidden emission or damaging melee bound. For mines, capture deploy, armed, trigger, visible damaging explosion, and cleanup states; reject invisible damage or damage outside the active explosion frames.

For summons, capture and map visible creation or deployment, activation or hatch, active movement/collision, exit or destruction, and cleanup. Reject invisible creation, damaging inactive art, ownerless entities, missing owner/action cleanup, or a formation that is not visibly commanded by the boss anatomy that owns it.

Reject two active attacks that serve nearly identical player-facing roles. A short attack may teach the weapon used by a later signature only when the signature adds a distinct movement or route rule. Inspect directional projectile art along every authored straight and diagonal velocity and reject visibly backward or unstable orientation. For a moving corridor, verify both streams remain synchronized with the boss and their current muzzle sockets, preserve an understandable continuous opening, and never cross, teleport, or close without a survivable transition. For mine variants, verify bounded deterministic template selection, deliberate X and Y variation, minimum spacing, direct-player-spawn avoidance, and a readable route through the mines plus concurrent hazards.

For formation variants, verify bounded deterministic template selection, player-spawn protection, explicit ownership/count limits, a readable continuous opening, and a proof for every retained template together with concurrent hazards. The proof path must match the visible deployed positions and movement.

Reject a one-shot volley/ring/beam as a complete sentence. Reject an attack that could move unchanged to another boss without meaningful visual and mechanical changes. Confirm damaging areas and projectiles follow the current visible pose and named moving sockets.

Pass only when the attack-to-sprite map is complete and each core/signature attack visibly uses the boss’s anatomy.

## Gate 5 — Actual Gameplay Review

- Run and visually inspect the real compiled boss at both canonical mobile and desktop viewport sizes; do not substitute catalog thumbnails, mock renders, or deterministic proofs.
- Trigger every attack individually and through the normal loop.
- Capture each attack’s actual preparation, telegraph, first beat, peak danger, and recovery.
- Capture phase transition, persistent damage, stagger, and death in context.
- When the boss summons or commands entities, capture deployment, activation or hatch, visible damaging motion, exit or destruction, and cleanup in context. Confirm normal gameplay communicates these stages through art and animation rather than playfield text.
- Visually inspect the captures before reporting completion; passing builds and tests alone is insufficient.
- Include clean runtime evidence for mounted-weapon attachment during idle and boss movement, rapid fire, immediate post-fire neutral restoration, directional projectile orientation, the beginning/middle/end or direction change of every moving corridor, and at least three visibly distinct deterministic two-dimensional mine formations where those mechanics exist.
- Capture the polished mobile screenshot with attack names, beat/state text, aiming/prediction lines, socket/joint guides, part bounds, hitboxes, and all other debug markers disabled.
- Require every developer overlay to have a specific toggle that defaults off. An actual damaging beam may appear only when firing; a future-trajectory guide may not appear in normal play.

Pass only when the gameplay evidence looks intentional, readable, anatomically coherent, and clean at mobile scale.

## Deterministic safety proof

- Prove every critical attack, not only the signature, using the real compiled attack on mobile and desktop.
- Record configuration hash, fixed seed, viewport, route hash, duration, search bounds, and minimum replayed clearance.
- Require at least 6 px of replayed clearance after the standard 3 px geometry uncertainty is applied. A merely positive witness does not pass.
- Model moving-corridor boss motion, live per-round emitter sockets, projectile cadence and velocity, direction changes, and player acceleration across one continuous replay. Isolated safe snapshots do not prove a corridor.
- Prove every retained deterministic formation template or seed branch together with the rest of its attack. The proof must use the runtime deployment path and final armed positions, not an approximation that diverges from gameplay.
- Include the summon lifecycle timing in formation replay: collision must remain disabled before visible activation and after visible exit/destruction, and owner/action cleanup must leave no hostile residue.
- Reject unavoidable damage, direct player spawns, unreadable rules, excessive obstruction, and mobile-only failures.
- Never reduce collision radius, required clearance, or search rigor merely to pass.

## Functional and release checks

- Verify every numbered attack button, fixed-seed replay, selected-attack loop, pause, frame step, slow motion, phase/state jump, spawn/restart, and lifecycle cleanup.
- Watch sockets during animated movement and confirm emitted sprites leave the visible mechanism.
- Verify the asset-usage inventory gives every generated or extracted asset an active runtime consumer, intentional-future status, or archive/removal status, and confirm archived assets are absent from runtime manifests and registrations.
- Run the boss-specific art/rig/reference tests, attack/timeline/origin-lock/socket/lifecycle/replay tests, pixel-art and modular-pipeline tests, then:

```text
npm run typecheck
npm test
npm run director:check
npm run build
npm --prefix sites/boss-test-runner run test
npm --prefix sites/boss-test-runner run build
```

Confirm local-only tools and prototype assets remain excluded from production. Publish the private Runner only after local/source parity is proven and only when requested.

## One-boss stop gate

Invisible creation, damaging inactive summon art, ownerless entities, missing owner/action cleanup, an unproved retained formation template, an appendage attack emitted by unrelated anatomy, a duplicated launched body part, a stretched or gapped connector, or launched-part residue after reseat/cancellation/reconstruction/owner loss/death are also stop-gate failures.

Keep the active boss lock when any required artifact is missing, any Gate 1–5 verdict is blocked or failed, route clearance is below 6 px, normal gameplay contains debug text/lines, a joint or mounted weapon detaches or drifts, firing effects persist into idle, directional projectile art points backward, an attack lacks anatomy ownership, a moving corridor lacks a continuous witness, deterministic mines collapse into an unproven repeated line, or the mobile evidence is unreviewed. Do not design or generate another boss until the lock is released.

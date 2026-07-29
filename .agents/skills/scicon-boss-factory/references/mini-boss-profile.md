# Mini-Boss profile

Use this profile for a short encounter between an ordinary enemy and a full Boss Factory boss. It is a scoped exception to the full-boss requirements for three core attacks, one signature attack, and a phase-two transformation. Preserve the factory's canonical preview, asset, socket, collision, route-proof, visual-review, and cleanup rules.

## Hold one encounter lock

Finish and validate one encounter before beginning the next. For a batch, prove the first encounter and then complete the remaining encounters serially. Keep every new encounter sandbox-only with a stable encounter ID, `sandboxReady` status, and `campaignAssigned: false` until the user separately requests placement.

## Keep the combat sentence small

A mini-boss should usually have one memorable signature maneuver and one supporting behavior executed well, rather than several mediocre attacks.

- Target roughly 15–35 seconds with a reasonable test loadout.
- Give the signature a clear preparation, telegraph, connected beats, player solution, recovery, and one bounded low-health remix only when it improves the idea.
- Use the supporting behavior for movement, defense, formation change, or brief pressure. Do not disguise a second generic attack as support.
- Require readable entrance, purposeful idle, compact health presentation, hit response, damage state when appropriate, and short staged death.
- Reject reskins, generic fans, unrestricted rain, complete radial walls, or numeric-only escalation.

## Prove assets are real runtime inputs

Audit the Sprite Gallery, stable catalogs, existing atlases, and gameplay-size renders before generating art. Record every accepted sprite by stable asset ID or exact texture name and assign one or more explicit statuses: neutral assembly, idle, charge, signature, support, hit, damage, death, projectile/effect, escort/satellite, intentional alternate, or archived.

Do not count an atlas entry as runtime use. Capture the actual encounter using it. If a single-frame asset is animated only through articulated assembly transforms, recoil, tint, or effects, call it an **assembly-motion limitation**; never claim that new frame animation was generated. Archive nothing without confirming that no runtime, gallery, evidence, or historical reader still references it.

## Use encounter-specific lifecycle rules

### Paired encounters

- Give each live unit its own identity, health, compact bar, sockets, and owned hazards.
- Author coordinated choreography rather than two independent copies of one attack.
- When one unit dies, stop all emissions from it, remove its bar and owned hazards, and switch the survivor to a slower readable solo fallback. Do not merely double cadence.
- Prove both alive, left-only, right-only, and both-dead states.

### Guardian formations

- Give the protected unit the primary compact bar and make shield state visually unambiguous.
- Track guardians as owned, destructible members with a bounded formation.
- Define exactly how partial or total guardian loss weakens protection and opens a vulnerability window. Never use unexplained indefinite invulnerability.
- Prove full guard, partial guard, exposed core, and all-guardians-destroyed states.

### Wall encounters

- Keep the unit visibly attached to its authored edge with wall-facing grips, handed art, or one intentional mirror.
- Keep its bar on-screen and align damaging beam collision to the rendered beam.
- Prove left and right edges, highest and lowest positions, active/dissipating beam, wall switch if allowed, and destruction cleanup.
- Do not render future-trajectory guides during normal play.

### Reinforcements and satellites

- Set a hard per-action count and a hard encounter-owned live cap. Never spawn indefinitely.
- Spawn from a live visible socket, use deterministic bounded formations, and record owner and encounter IDs.
- Give summons deployment, activation, movement/collision, exit or destruction, and cleanup. Remove them on owner death, restart, reconstruction, and encounter completion.

## Present compact health correctly

- Use one compact local bar for a solo mini-boss, separate attributable bars for a true pair, and the central protected unit's bar for a guardian formation.
- Keep bars readable, in-bounds, and attached to their intended entities; remove them immediately with their owners.
- Expose a sandbox-only toggle for compact bars without replacing normal-game HUD behavior.

## Prove a deterministic solution

Fix and record the seed. Replay the compiled encounter in the canonical 390×844 arena and apply the factory clearance requirement to every retained branch.

- For alternating or paired attacks, prove the full connected sequence, including the survivor fallback.
- For incomplete rings, prove the opening remains reachable across launches.
- For moving beams, walls, and safe quadrants, prove one continuous frame-to-frame route against the live emitter positions and collision geometry.
- For guardians and reinforcements, prove every retained formation variant together with concurrent hazards.
- Validate the same portrait arena in phone-width and wide host shells; the host shell must not change gameplay geometry.

## Validate in the Boss Sandbox

Provide relevant controls for spawn/restart, pause/resume, signature loop, supporting behavior, health/low-health, hit, death, linked-unit or guardian destruction, shield, wall side, compact bars, viewport host, and explicit debug overlays. Do not show move names, state labels, pivots, sockets, hitboxes, or aiming guides over normal gameplay.

Inspect idle, entrance, signature preparation through recovery, supporting behavior, hit, damage, death, deterministic replay, phone host, and wide host. Verify socket ownership, health-bar cleanup, reinforcement limits, beam/visual collision parity, sprite orientation, and completion exactly once. Keep campaign Missions, routes, rewards, progression, Weekly Streak, main-game waves, and deployment untouched during a sandbox-only Mini-Boss Lab workflow.

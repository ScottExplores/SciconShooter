# Boss Factory roster classification

This classification is an implementation audit, not a ranking of the boss
concepts. It records how much of the reusable Boss Factory contract each Test
Mission boss currently satisfies.

## Classification contract

### Factory-ready

A Factory-ready boss must have all of the following:

- one authoritative `modular-hierarchy-v1` rig assembled from matching parts;
- deterministic pose sampling for idle, anticipation, attack, recoil, recovery,
  phase transition, hit/stagger, damage, and destruction;
- opaque physical sprite parts and separately identified translucent effects;
- hierarchy-resolved weapon sockets that follow animated anatomy and are also
  used by gameplay emission;
- exactly three multi-beat core attacks and one multi-beat signature attack,
  with a variant for every phase;
- deterministic replay and a verified desktop and mobile safe route;
- objective native pixel-art, atlas, pivot, nearest-neighbor, and animation
  registration checks.

### Factory-compatible

The boss has reusable cohesive art, an articulated presenter, or a modular rig,
but one or more Factory-ready gates are still missing. It can be migrated
without discarding its entire identity, but its current implementation is not
the workflow template.

### Legacy

The current runtime visual is a campaign rig, a flattened assembled fallback,
or a specialized prototype without an authoritative modular hierarchy. Preserve
worthwhile concepts and attack lessons, but rebuild the gameplay boss through
the Factory instead of extending the current representation.

## Current roster

Nullwake Revenant and Prism Moth Broodkeeper are the current Factory-ready
Sandbox co-benchmarks under the strict contract above. Nullwake remains the
reference for revival, moving-socket combat sentences, and deterministic maze
proof. Prism is the reference for living appendage animation, visible summon
lifecycle, bounded formation puzzles, and anatomy-specific fallbacks. Helios
Clawcarrier retains its accepted heavy modular art and rig identity, but its
active refinement reopens Gates 2-5 and keeps its own one-boss lock until the
mounted weapons, revised attack roles, deterministic safety proof, and
mobile/desktop captures pass. Every other current boss remains
Factory-compatible or Legacy until it independently passes the same gates.

| Boss | Classification | Evidence | Disposition |
|---|---|---|---|
| Nullwake Revenant | **Factory-ready; Sandbox benchmark** | Exact five-sprite 370x311 reassembly; content-addressed 32-color binary-alpha V3 atlas; one connected 16-node hierarchy; four moving limb muzzles plus one moving core socket consumed by the live simulation and exact warning-origin locks; registered entrance, idle, anticipation/recoil, large-hit, stagger, persistent-damage, false-death/reboot, and 72-frame five-fragment destruction states; exactly three core sentences plus one signature in all three phases; and 24 pinned deterministic route witnesses. Every mobile/desktop witness retains at least 6 px clearance after 3 px uncertainty inflation, with a measured minimum of 7.136829 px. | Use as the Boss Factory workflow/template benchmark. Keep it Sandbox-only. Its aspect-preserved 290x244 gameplay display and 370x311 source are an explicit large-boss exception, not the native-size target for future bosses. Re-run the pinned evidence whenever timeline, socket, collision, viewport, or art geometry changes. |
| Gloamforge Mantis | Factory-compatible | Full 22-part `modular-hierarchy-v1` registration, 29 atlas frames, six fixed-frame animations, eight authored sockets, deterministic pose sampling, phase-two attachments, cannon frames, pods, exhaust, and muzzle effects. Its current timeline is still the legacy serial clip model and its 720x620 art package exceeds the intended native scale. | Retain the component-first source package and foundry identity. It is the next-best migration candidate after Nullwake. |
| Meridian Harrower | Factory-compatible | Registered 17-frame `segmented-crescent-v1` atlas and a specialized articulated presenter, but no generic hierarchy, modular pose sampler, or anatomy-owned socket profile. | Retain the crescent/aperture concept and useful safe-channel ideas; re-rig through the Factory. |
| Helios Clawcarrier | **Factory-compatible; Sandbox-only refinement lock** | Gate 1 remains locked to the unchanged 460x330 `modular-hierarchy-v1` art package, 40 consumed runtime frames, connected hull/claw/reactor/rotary hierarchy, nine anatomy-owned sockets, four registered pixel-projectile families, and 90-frame destruction identity. Gates 2-5 are reopened for rigid hull-mounted rotaries, the central 180-degree tracer-forward correction, Rapid Machine-Gun Bursts, the Helios-specific Moving Machine-Gun Channel signature, Reactor Maze with bounded deterministic X/Y mine templates, and unchanged Clawcarrier Crush. The prior 24 route witnesses and V0.14 captures describe the retired attack set and are historical only. | Hold the Helios one-boss lock. Keep its art, silhouette, hierarchy, and physical Attack 4; retire `claw-sweep-pincer` from the active rotation without archiving claw art. Restore Factory-ready status only after refreshed rig/motion evidence, all mobile/desktop continuous-route and mine-template proofs, five clean captures per attack, lifecycle evidence, full local gates, and same-source private Runner test/build pass. Do not publish unless separately requested. |
| Aurora Storm Engine | Factory-compatible | Registered 33-frame `rotating-emitter-core-v1` atlas and a strong shared-angle rotor/beam runtime, but it remains a specialized presenter rather than a general Factory hierarchy. | Extract the deterministic rotor, reversible direction, gap-ring, and radial-beam lessons. Preserve the eye-boss identity as reference. |
| Cinderjaw Siege Beetle | Factory-compatible | Registered 20-frame `articulated-pincer-v1` atlas with cannon and pod vocabulary, but no generic hierarchy or hierarchy-resolved gameplay sockets. | Preserve the siege-cannon-to-gatling phase idea; regenerate/re-rig cohesive parts before further tuning. |
| Vesperglass Mothmother | Factory-compatible | Registered 17-frame `segmented-crescent-v1` atlas, but no Factory hierarchy, pose sampler, or socket contract. | Preserve the wing-call, cocoon, and tail-route ideas; rebuild the current art and rig. |
| Riftcoil Wyrm | Factory-compatible | Registered 17-frame `segmented-crescent-v1` atlas, but its fangs, tail, and core are not represented by one reusable hierarchical/socket contract. | Preserve the helix corridor and cross-to-tail combination; rebuild as a connected serpent rig. |
| Umbra Needlewing | Legacy | An atlas is registered, but runtime deliberately uses `renderMode: 'assembled'` with `wingbeat-hover`. The parts sheet is not the authoritative gameplay assembly and there is no modular rig or socket profile. | Keep the blackout corner-hunter concept and exact warned ambush. Discard the current rig implementation when rebuilt. |
| Twin Halo Wardens | Legacy | An atlas is registered, but runtime deliberately uses the flattened `assembled` mode with `paired-resonance`; there is no shared hierarchy or anatomy-owned socket profile. | Keep the call-and-answer identity and conjunction puzzle. Rebuild the paired bodies as one validated hierarchy. |
| Sweep / Bank / Re-entry | Legacy | No fixed Sandbox artwork registration; it uses the campaign placeholder rig and timeline prototype only. | Extract the movement/re-entry lesson, then archive the prototype. |
| Prism Moth Broodkeeper | **Factory-ready; Sandbox co-benchmark** | Locked 384x384 canonical reference; deterministic 2048x2048, 24-frame, binary-alpha, 96-color atlas; one connected 17-node hierarchy with 16 visible structural parts and seven anatomy-owned sockets; purposeful wing, pod, core, entrance, idle, phase, damage, stagger, and five-stage death motion; exactly three core sentences plus Kaleidoscope Brood; visible cocoon and broodling lifecycle; explicit one-wing and no-wing fallbacks; six bounded formation templates; and fixed-seed mobile/desktop route witnesses. All eight critical viewport/attack witnesses retain at least 6 px clearance after 3 px uncertainty, with a measured minimum of 35.7 px. | Use as the co-benchmark for living appendages, visible summons, deterministic formations, and anatomy-owned fallback design. Keep it Sandbox-only. Its exact brood choreography remains Prism-specific and must not become a generic default attack. Re-run the evidence whenever timeline, formation, socket, collision, viewport, or art geometry changes. |
| Tribunal Laser Core | Legacy | No fixed Sandbox artwork registration; it demonstrates shields, beams, and weak points on a campaign rig. | Extract the exact-lane and weak-point logic, then archive the prototype representation. |

## Nullwake benchmark gates

The complete evidence record is
[benchmark-nullwake-revenant.md](benchmark-nullwake-revenant.md). In summary:

- **Art:** the neutral modular assembly exactly reproduces the locked 370x311
  source pixels. The V3 animation/destruction atlas has SHA-256
  `a0d29566c3e925c764267f48202ce1a18247f28007b43ad7fdcba7c8573da2cd`,
  exactly 32 opaque colors, binary structural alpha, 15 visible registered
  frames, and no out-of-bounds cells.
- **Rig and sockets:** all 16 registered parts reach one root. The actual
  warning pose moves the selected limb sockets through the hierarchy, the live
  simulation samples that pose, and fire consumes the exact warning-time
  origins after the boss moves.
- **Lifecycle:** deterministic entrance, breathing idle, side-specific
  anticipation/recoil, significant-impact, stagger, persistent-damage,
  132-frame shutdown, 156-frame full-health reboot, and 72-frame authored
  five-fragment destruction states are registered and exercised.
- **Attack contract:** Claw Corridor, Dead-Signal Gates, and Memory Lattice are
  the three multi-beat core sentences. Revenant Maze is the six-beat signature.
  Each has one variant per phase, linked telegraphs, anatomy ownership, a
  learnable safe rule, and an authored recovery.
- **Safety and determinism:** the real compiled timeline is reconstructed with
  fixed seed `nullwake-safe-route-proof` for all four attacks, all three phases,
  and mobile 390x844 plus desktop 1280x720. The 24 witnesses replay identically,
  match the pinned fixture, and clear the 6 px robustness floor after 3 px
  geometry uncertainty; the narrowest is 7.136829 px.
- **Scale and scope:** the selected preview preserves the source aspect at
  290x244 with less than 0.2% rounding mismatch. The larger-than-preferred
  source is documented as a one-boss exception. Factory-ready status identifies
  the reusable Sandbox workflow benchmark; Nullwake remains test-only and is
  not thereby approved for a campaign Mission.

## Prism Moth Broodkeeper benchmark gates

The complete evidence record is
[benchmark-prism-moth-broodkeeper.md](benchmark-prism-moth-broodkeeper.md). In
summary:

- **Art:** one locked 384x384 canonical reference anchors 16 source-bounded
  structural components. The deterministic runtime atlas has SHA-256
  `5ef8ca7e395c94b3777d4f85808b5701f8bc952d96a335438e8353dcc82b6292`,
  24 registered frames, binary structural alpha, and a 96-color opaque palette.
- **Rig and sockets:** all 17 hierarchy nodes reach one root, 16 are visible,
  and seven sockets remain attached to the corresponding live wings, brood
  pods, and prism core. Destroyed wings remove their own emitters and select
  explicit surviving-wing or core/brood fallbacks.
- **Lifecycle:** the accepted runtime-v0.19 evidence covers entrance, restrained
  idle breathing and wing motion, attack poses, Prism Metamorphosis, persistent
  damage, three-stage stagger/recovery, and five-stage deterministic death.
- **Attack contract:** Prism Wingbeat Weave, Brood Procession, and Lunar Prism
  Swoop are the three core sentences. Kaleidoscope Brood is the signature. Each
  visibly uses Prism anatomy, has a distinct player decision, and ends in an
  authored recovery.
- **Summons and formations:** cocoons visibly deploy, arm, crack, and hatch;
  broodlings visibly flutter while active and clean up on owner/action loss.
  Six bounded templates preserve a readable opening and are covered by the
  deterministic formation suite.
- **Safety and determinism:** fixed seed `scicon-simple-boss-sandbox` proves all
  four attacks on mobile 390x844 and desktop 1280x720. The eight witnesses
  replay with pinned hashes and remain above the 6 px floor after 3 px geometry
  uncertainty; the narrowest is 35.7 px.
- **Scale and scope:** Factory-ready status identifies Prism as a reusable
  Sandbox workflow benchmark. It remains test-only and is not approved for a
  campaign Mission or production release by this classification.

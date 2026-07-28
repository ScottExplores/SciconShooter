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

Nullwake Revenant, Prism Moth Broodkeeper, and Helios Clawcarrier are the current
Factory-ready Sandbox benchmarks under the strict contract above. Nullwake remains the
reference for revival, moving-socket combat sentences, and deterministic maze
proof. Prism is the reference for permanent living-appendage animation,
hull-only durability, destructible summon lifecycle, and bounded formation
puzzles. Helios is
the reference for heavy modular anatomy, rigid mounted weapons, part health,
and a mandatory-interior moving corridor whose mobile exterior camps are
explicitly rejected. Every other current boss remains
Factory-compatible or Legacy until it independently passes the same gates.

| Boss | Classification | Evidence | Disposition |
|---|---|---|---|
| Nullwake Revenant | **Factory-ready; Sandbox benchmark** | Exact five-sprite 370x311 reassembly; content-addressed 32-color binary-alpha V3 atlas; one connected 16-node hierarchy; four moving limb muzzles plus one moving core socket consumed by the live simulation and exact warning-origin locks; registered entrance, idle, anticipation/recoil, large-hit, stagger, persistent-damage, false-death/reboot, and 72-frame five-fragment destruction states; exactly three core sentences plus one signature in all three phases; and 24 pinned deterministic route witnesses. Every mobile/desktop witness retains at least 6 px clearance after 3 px uncertainty inflation, with a measured minimum of 7.136829 px. | Use as the Boss Factory workflow/template benchmark. Keep it Sandbox-only. Its aspect-preserved 290x244 gameplay display and 370x311 source are an explicit large-boss exception, not the native-size target for future bosses. Re-run the pinned evidence whenever timeline, socket, collision, viewport, or art geometry changes. |
| Gloamforge Mantis | Factory-compatible | Full 22-part `modular-hierarchy-v1` registration, 29 atlas frames, six fixed-frame animations, eight authored sockets, deterministic pose sampling, phase-two attachments, cannon frames, pods, exhaust, and muzzle effects. Its current timeline is still the legacy serial clip model and its 720x620 art package exceeds the intended native scale. | Retain the component-first source package and foundry identity. It is the next-best migration candidate after Nullwake. |
| Meridian Harrower | Factory-compatible | Registered 17-frame `segmented-crescent-v1` atlas and a specialized articulated presenter, but no generic hierarchy, modular pose sampler, or anatomy-owned socket profile. | Retain the crescent/aperture concept and useful safe-channel ideas; re-rig through the Factory. |
| Helios Clawcarrier | **Factory-ready; Sandbox benchmark with V0.23 channel/rig amendment** | Locked 460x330 `modular-hierarchy-v1` art package; 40 consumed runtime frames; connected hull/claw/reactor/rotary hierarchy; nine anatomy-owned sockets; four registered pixel-projectile families; significant-hit, phase, damage, recovery, and 90-frame destruction states; three core attacks plus the Moving Machine-Gun Channel signature in every phase. V0.22 authors `8,000` hull HP and `2,000` HP per claw, warning-locked aim, the accelerated `6.8/6.0/5.2` second channel, `25/27/31` reactor pellets plus `3/4/5` mines, and continuous swept Crush collision. V0.23 adds a five-round-per-side sprite volley that rejects both exterior camps before the moving corridor, directly attaches both claw mandibles, enlarges and layers subtly animated stabilizers behind the hull/rotaries, and uses the shared five-frame low-health pixel-damage cue instead of procedural line sparks. The complete `24/24` attack/phase/viewport route matrix passes; Root/Director typechecks pass; the complete Director coverage is green across 243 checks; and the 863-module, 26-asset Runner build passes `18/18`. V0.20 remains the last fully accepted clean visual baseline until the expanded capture set is reviewed. | Use as the benchmark for heavy modular anatomy, rigid mounted weapons, preview part-health controls, and mandatory-interior moving-corridor design. Keep it Sandbox-only. Re-run route, aim-mix, density, exterior-camp, and continuous-collision proofs whenever viewport, socket, cadence, projectile, collision, or movement geometry changes. |
| Aurora Storm Engine | Factory-compatible | Registered 33-frame `rotating-emitter-core-v1` atlas and a strong shared-angle rotor/beam runtime, but it remains a specialized presenter rather than a general Factory hierarchy. | Extract the deterministic rotor, reversible direction, gap-ring, and radial-beam lessons. Preserve the eye-boss identity as reference. |
| Cinderjaw Siege Beetle | Factory-compatible | Registered 20-frame `articulated-pincer-v1` atlas with cannon and pod vocabulary, but no generic hierarchy or hierarchy-resolved gameplay sockets. | Preserve the siege-cannon-to-gatling phase idea; regenerate/re-rig cohesive parts before further tuning. |
| Vesperglass Mothmother | Factory-compatible | Registered 17-frame `segmented-crescent-v1` atlas, but no Factory hierarchy, pose sampler, or socket contract. | Preserve the wing-call, cocoon, and tail-route ideas; rebuild the current art and rig. |
| Riftcoil Wyrm | Factory-compatible | Registered 17-frame `segmented-crescent-v1` atlas, but its fangs, tail, and core are not represented by one reusable hierarchical/socket contract. | Preserve the helix corridor and cross-to-tail combination; rebuild as a connected serpent rig. |
| Umbra Needlewing | Legacy | An atlas is registered, but runtime deliberately uses `renderMode: 'assembled'` with `wingbeat-hover`. The parts sheet is not the authoritative gameplay assembly and there is no modular rig or socket profile. | Keep the blackout corner-hunter concept and exact warned ambush. Discard the current rig implementation when rebuilt. |
| Twin Halo Wardens | Legacy | An atlas is registered, but runtime deliberately uses the flattened `assembled` mode with `paired-resonance`; there is no shared hierarchy or anatomy-owned socket profile. | Keep the call-and-answer identity and conjunction puzzle. Rebuild the paired bodies as one validated hierarchy. |
| Sweep / Bank / Re-entry | Legacy | No fixed Sandbox artwork registration; it uses the campaign placeholder rig and timeline prototype only. | Extract the movement/re-entry lesson, then archive the prototype. |
| Prism Moth Broodkeeper | **Factory-ready; Sandbox co-benchmark with V0.21 behavior amendment** | Locked 384x384 canonical reference; deterministic 2048x2048, 24-frame, binary-alpha, 96-color atlas; one connected 17-node hierarchy with 16 visible structural parts and seven anatomy-owned sockets; purposeful wing, pod, core, entrance, idle, phase, damage, stagger, and five-stage death motion; hull-only 1,150 HP with permanent animated wings; 35 sequential Attack 1 feathers; 2-HP, reward-free, player-directed Attack 2 brood; 28/42 Attack 3 trails at four-frame cadence; and four deterministic Attack 4 route families below 50%. The retained runtime-v0.19 route witnesses remain the historical art/safety baseline and the V0.21 runtime tests cover the new behavior branches. | Use as the co-benchmark for permanent living appendages, destructible visible summons, deterministic player-directed formations, and non-numeric low-health route remixes. Keep it Sandbox-only. Its exact brood choreography remains Prism-specific and must not become a generic default attack. Refresh content-addressed route and visual evidence whenever timeline, formation, socket, collision, viewport, or art geometry changes. |
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
  pods, and prism core. The fight uses hull-only durability, so both wings stay
  attached, animated, and operational until the 1,150-HP hull is defeated.
- **Lifecycle:** the accepted runtime-v0.19 evidence covers entrance, restrained
  idle breathing and wing motion, attack poses, Prism Metamorphosis, persistent
  damage, three-stage stagger/recovery, and five-stage deterministic death.
- **Attack contract:** Prism Wingbeat Weave, Brood Procession, and Lunar Prism
  Swoop are the three core sentences. Kaleidoscope Brood is the signature. Each
  visibly uses Prism anatomy, has a distinct player decision, and ends in an
  authored recovery. V0.21 fixes Wingbeat at 35 sequential feathers, Swoop at
  two/three passes with 28/42 trails on a four-frame cadence, and Kaleidoscope
  at four deterministic route families below 50% health.
- **Summons and formations:** cocoons visibly deploy, arm, crack, and hatch;
  armed/hatching/flying brood are 2-HP player-shot targets, move toward the
  player lane locked for their command, grant no farmable reward, visibly
  flutter while active, and clean up on owner/action loss. Six bounded
  templates preserve a readable opening and are covered by the deterministic
  formation suite.
- **Safety and determinism:** fixed seed `scicon-simple-boss-sandbox` proves all
  four attacks on mobile 390x844 and desktop 1280x720. The eight witnesses
  replay with pinned hashes and remain above the 6 px floor after 3 px geometry
  uncertainty; the narrowest is 35.7 px.
- **Scale and scope:** Factory-ready status identifies Prism as a reusable
  Sandbox workflow benchmark. It remains test-only and is not approved for a
  campaign Mission or production release by this classification.

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
- deterministic replay and a verified safe route in the canonical `390 x 844` mobile arena, with identical portrait geometry inside phone-width and wide host shells;
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

These are internal implementation-quality classifications, not Boss Sandbox picker categories. The picker exposes only **Main Game** for campaign-referenced bosses and **Test Bosses** for every other boss, including prototypes internally classified as Factory-compatible or Legacy. There is no user-facing Removed/Legacy group.

## Current roster

Nullwake Revenant, Prism Moth Broodkeeper, and Helios Clawcarrier are the current
Factory-ready authoring benchmarks under the strict contract above. On
2026-07-29, the user explicitly approved Paywall Decimator for Campaign M10,
Prism Moth Broodkeeper for M15, Frontier Crownclaw for M20, and Helios
Clawcarrier for M25. Their Boss Sandbox definitions remain the editable testing
benchmarks; Campaign promotion does not retire those entries. Frontier
Crownclaw's V0.27 beam correction is Factory-compatible and held under the
one-boss lock: it preserves the original wide Critical Cross-Link sweep, removes
only its middle beam, and passes the regenerated intact/fallback matrices plus
exact mobile `GameEngine` playback. Phone-width hosted review and the complete
capture-set gates remain open. Nullwake remains the
reference for revival, moving-socket combat sentences, and deterministic maze
proof. Prism is the reference for permanent living-appendage animation,
hull-only durability, destructible summon lifecycle, and bounded formation
puzzles. Helios is
the reference for heavy modular anatomy, rigid mounted weapons, part health,
and a mandatory-interior moving corridor whose mobile exterior camps are
explicitly rejected. Frontier is the reference for visibly connected launched
anatomy, fixed-size live-socket tethers, restrained non-attack pixel animation,
deliberate crabwalk, and reactor-owned recovery. Every other current boss remains
Factory-compatible or Legacy until it independently passes the same gates.

| Boss | Classification | Evidence | Disposition |
|---|---|---|---|
| Nullwake Revenant | **Factory-ready; Sandbox benchmark** | Exact five-sprite 370x311 reassembly; content-addressed 32-color binary-alpha V3 atlas; one connected 16-node hierarchy; four moving limb muzzles plus one moving core socket consumed by the live simulation and exact warning-origin locks; registered entrance, idle, anticipation/recoil, large-hit, stagger, persistent-damage, false-death/reboot, and 72-frame five-fragment destruction states; exactly three core sentences plus one signature in all three phases; and 24 pinned deterministic route witnesses. Every mobile/desktop witness retains at least 6 px clearance after 3 px uncertainty inflation, with a measured minimum of 7.136829 px. | Use as the Boss Factory workflow/template benchmark. Keep it Sandbox-only. Its aspect-preserved 290x244 gameplay display and 370x311 source are an explicit large-boss exception, not the native-size target for future bosses. Re-run the pinned evidence whenever timeline, socket, collision, viewport, or art geometry changes. |
| Gloamforge Mantis | Factory-compatible | Full 22-part `modular-hierarchy-v1` registration, 29 atlas frames, six fixed-frame animations, eight authored sockets, deterministic pose sampling, phase-two attachments, cannon frames, pods, exhaust, and muzzle effects. Its current timeline is still the legacy serial clip model and its 720x620 art package exceeds the intended native scale. | Retain the component-first source package and foundry identity. It is the next-best migration candidate after Nullwake. |
| Gatekeeper Prime | **Factory-compatible; production Mission 5 safety benchmark** | Canonical `gatekeeper-prime` dispatch owns a bounded upper-arena patrol and restores the historical three aimed volleys at frames 77, 154, and 231, followed by a 70-frame warned core laser. M05 now has 500 hull HP and two 165-HP cannons. Its three attacks are proven in the canonical `390 x 844` portrait arena both directly and inside a wide host shell; the measured minimum is 7.328967 px after 3 px uncertainty. The complete reference and seven production assets are hash/inventory locked. Strict Factory art and visual gates remain blocked: the assembled antialiased hull plus independently fitted rail overlays are not an authoritative binary-alpha modular hierarchy, there is no fourth signature or structural phase sprite, and actual Sandbox/mobile capture timed out. | Keep the production runtime and deterministic portrait-route proof. Do not promote it to Factory-ready or release its one-boss lock until authoritative modular art, the complete pose/signature contract, and actual five-stage gameplay captures pass. Evidence is under `director-data/prototype-assets/gatekeeper-prime/`. |
| Meridian Harrower | Factory-compatible | Registered 17-frame `segmented-crescent-v1` atlas and a specialized articulated presenter, but no generic hierarchy, modular pose sampler, or anatomy-owned socket profile. | Retain the crescent/aperture concept and useful safe-channel ideas; re-rig through the Factory. |
| Helios Clawcarrier | **Factory-ready; Campaign M25 and Sandbox benchmark with V0.24 gun/channel amendment** | Locked 460x330 `modular-hierarchy-v1` art package; 40 consumed runtime frames; connected hull/claw/reactor/rotary hierarchy; nine anatomy-owned sockets; four registered pixel-projectile families; significant-hit, phase, damage, recovery, and 90-frame destruction states; three core attacks plus the Moving Machine-Gun Channel signature in every phase. V0.22 authors `8,000` hull HP and `2,000` HP per claw, warning-locked aim, the accelerated `6.8/6.0/5.2` second channel, `25/27/31` reactor pellets plus `3/4/5` mines, and continuous swept Crush collision. V0.23 adds the exterior-herding entry volley, connected mandibles, enlarged background stabilizers, and shared pixel-damage cue. V0.24 registers all eight rotary bores so the machine guns remain visually centered through their spin frames, removes the artificial low-health Reactor Maze aperture while retaining uniform dense fans, and emits paired live-socket gutter suppressors every six simulation frames so the moving center corridor is the intended solution. The complete `24/24` route matrix passes; isolated Root/Director typechecks and `24/24` focused runtime/asset checks pass; and the 862-module, 26-asset Runner passes `18/18` and is owner-only on Sites version 28. V0.20 remains the last fully accepted clean visual baseline until the expanded capture set is reviewed. | Use as the benchmark for heavy modular anatomy, rigid mounted weapons, preview part-health controls, and mandatory-interior moving-corridor design. M25 uses a campaign-balanced 1,800-HP hull and 450 HP per claw while the Sandbox retains the full 8,000/2,000 authoring budget. Re-run route, aim-mix, density, exterior-camp, and continuous-collision proofs whenever viewport, socket, cadence, projectile, collision, or movement geometry changes. |
| Frontier Crownclaw | **Factory-compatible; Campaign M20 and V0.27 beam correction under one-boss lock** | The locked reference, 224x192 native neutral, 260x210 binary-alpha runtime neutral, 32-frame atlas, connected 51-part hierarchy, 11 live sockets, eight animations, three core attacks, and Crown Cross-Link remain accepted. V0.26 supplied full-size `claw.open` launched anatomy, repeated damaging `chain.segment` tethers, animated `beam.0`-`beam.3` presentation, and deep warning-locked targeting. V0.27 restores Critical Attack 2's original `0.11π` relay spacing and `0.21π` sweep, removing only the middle beam: two live beams, two warning rails aligned to their starting paths, and no center beam. Regenerated matrices pass 28/28 intact plus 48/48 fallback witnesses with `3 px` uncertainty and minimum `6.012001051 px` clearance; exact mobile `GameEngine` playback measures a `61.87 px` conservative lane. | M20 uses a campaign-balanced 1,600-HP hull and 400 HP per claw; the Sandbox remains the authoritative tuning workspace. The older M50 compatibility placement remains until the user separately changes that slot. Hosted phone-width review and the complete current five-stage capture set remain required before restoring Factory-ready status. Historical desktop evidence is archival/internal only, not a product mode. Its chain choreography remains Frontier-specific and must not become a generic default attack. |
| Aurora Storm Engine | Factory-compatible | Registered 33-frame `rotating-emitter-core-v1` atlas and a strong shared-angle rotor/beam runtime, but it remains a specialized presenter rather than a general Factory hierarchy. | Extract the deterministic rotor, reversible direction, gap-ring, and radial-beam lessons. Preserve the eye-boss identity as reference. |
| Abyssal Octarch | **Factory-compatible; Sandbox-only Test Boss under one-boss lock** | One locked `720x480` reference drives a content-addressed assembled preview, `2048x512` atlas, 32 accepted structural/VFX frames, one aspect-preserving `modular-hierarchy-v1` rig, eight independently animated tentacles, anatomy-owned sockets, eight deterministic motion cues, a colossal encounter-camera profile, and explicit grab/throw/defeat diagnostics. The deterministic asset pipeline passes extraction, alpha, gutter, palette, hash, and usage-inventory checks. Gates 1–5 passed against the final content-addressed neutral asset: the evidence set includes the approved neutral overlay, 11-pose motion sheet, 40/40 attack captures, 44/44 deterministic route cases with 6.224172574 px minimum clearance after uncertainty, and canonical phone/wide-host lifecycle review. | Keep it exclusively under **Test Bosses** in Boss Sandbox; do not add it to Campaign, Weekly, progression, or production rosters. The Sprite Gallery may expose only its accepted structural, animation, VFX, atlas, assembled, and runtime-reference assets under **Test Bosses & Prototypes**, **Bosses**, and **Sprite Sheets** where applicable. Keep `evidence/` and review captures out of runtime-art inventory. |
| Bottleneck Drone | **Factory-compatible; Campaign M03 elite visual benchmark** | The V3 replacement is a deliberately simple science-space checkpoint regulator with five distinct `140 x 160` equal-canvas state frames—neutral, sensor scan, jointed clamp charge, emitter fire, and vent recovery—built from one shared 32-color opaque palette with binary alpha and nearest-neighbor presentation. The existing M03 health, movement, cadence, projectile, phase, reward, and count remain locked. A deterministic presenter selects the images from the unchanged attack timer, the neutral owns a regenerated alpha collision mask, and source-gutter/component/margin checks prevent cross-frame fragments. It remains a flattened state-frame package rather than an authoritative modular hierarchy. | Use as the baseline for readable elite-enemy image remakes and purposeful light state animation that does not replace encounter behavior. Keep the visible bottom-center emitter aligned to the legacy projectile origin. Do not promote it to Factory-ready until an actual modular hierarchy, moving socket, fuller attack contract, and mobile capture gates are intentionally authored. |
| Paywall Wall | **Factory-compatible; Campaign M04 elite wall benchmark** | The V2 Access-Lattice Gate Segment uses five distinct equal-canvas `84 x 100` source frames designed for the real `42 x 50` mobile segment box, one shared 32-color palette, binary alpha, nearest-neighbor presentation, a connected structural silhouette, and a visible bottom-center bolt shutter. Six mobile segments remain rigid while a deterministic stepped formation offset travels left/right and reverses at safe arena margins during the unchanged descent. Aggregate HP, contact damage, bolt cadence/speed, reward, Campaign placement, and Weekly derivation remain locked. | Keep `paywall-wall` distinct from the full Paywall Decimator boss. Preserve the five-state index order and exact pivot. Use this as the baseline for repeated elite formations whose identity must remain readable at true per-member gameplay size. |
| Fracture Engine Elite | **Factory-compatible; V3 readable elite benchmark** | Seven equal-canvas `192 x 192` states rebuild the paired engine in a hard-edged 32-color pixel language. Charge, alternating crossfire, damage, and critical states preserve one centered structural body without detached effects. The generic circular guard ring has been removed; protection is communicated through mechanical pose and tint while the existing linked-satellite rules remain authoritative. | Keep the paired crossfire, survivor fallback, health, cadence, and route proof unchanged. Use as the baseline for elite protection states that do not rely on a floating circular shield. |
| Aegis Brood Core | **Factory-compatible; V3 readable elite** | Seven binary-alpha, single-component `192 x 192` states simplify the core and guardian silhouette while retaining the incomplete-ring attack and guardian-owned protection threshold. | Preserve the authored ring gap and guardian count. Protection must remain readable from the formation and body response rather than a generic circle overlay. |
| Railspine Wallcrawler | **Factory-compatible; V3 readable edge elite** | Seven simplified `192 x 192` pixel states share a stable pivot and one connected wall-mounted body. The signature rail remains warned and predictable; Wall-Burst Stitch now fires a single aimed needle from the live edge weapon toward the player, capped above the bottom gutter so the opposite lane remains provably escapable. | Keep edge attachment and authored left/right variants. Never let the active rail continuously track the player or let support needles fire harmlessly out of the arena. |
| Maw Carrier | **Factory-compatible; V3 readable carrier elite** | Seven simplified pixel states give the jaw an explicit idle, close, charge, release, damage, and critical story without scale-squash animation. Existing seeded reinforcements and bounded mouth volleys remain encounter-owned. | Preserve the carrier/reinforcement identity and mobile route proof; attack motion must read as jaw articulation, not whole-body squishing. |
| Twin Meridian Sentinels | **Factory-compatible; V3 readable paired elite** | Seven shared `192 x 192` states give both sentinels the same hard-edged material language and stable pivot while the live runtime continues to mirror, exchange attacker/guard roles, and fall back cleanly when one twin dies. | Preserve the two-owner health and cleanup contract. Mirroring is presentation-only; projectile origins remain on the selected live twin. |
| Prism Bloom | **Factory-compatible; V3 readable ring elite** | Seven compact pixel states simplify the bloom into large readable petals, core, charge, fire, damage, and critical shapes. Its radial attack still omits a deterministic passable arc. | Keep the visible gap and route proof. Do not add a decorative circle shield around the hull or fill the safe arc with effects. |
| Aegis Convoy Captain | **Factory-compatible; V3 readable formation elite** | Seven compact captain states share the V3 palette/alpha/pivot contract while escorts continue to form the protection state and the live broadside remains bounded. | Keep escort ownership and protection thresholds explicit. The captain should never inherit the removed generic circular shield treatment. |
| Gridline Sentries | **Factory-compatible; V3 readable boundary elite** | Seven simplified sentry states replace the old linked wall-sniper body on both sides. The starboard unit mirrors the same canonical art while each live owner still controls exactly one warned boundary and removes only its own hazards on death. | Preserve the named safe quadrant and two-owner cleanup contract. Boundaries should pressure player space while retaining the proven quadrant route. |
| Paywall Decimator | **Legacy; Campaign M10 and archived Test boss** | The preserved Paywall Core remains playable from its five-frame red twin-cannon sprite, `paywall-siege` rig, original burst/beam cadence, and two health phases. It has no authoritative Factory hierarchy, moving-socket contract, or modern four-sentence attack package. | The user explicitly restored it to Campaign M10 with a campaign-balanced 650-HP hull. Keep the exact encounter under **Test Bosses** as well for comparison and rebuilding; do not move it to another Campaign slot implicitly. |
| Cinderjaw Siege Beetle | Factory-compatible | Registered 20-frame `articulated-pincer-v1` atlas with cannon and pod vocabulary, but no generic hierarchy or hierarchy-resolved gameplay sockets. | Preserve the siege-cannon-to-gatling phase idea; regenerate/re-rig cohesive parts before further tuning. |
| Vesperglass Mothmother | Factory-compatible | Registered 17-frame `segmented-crescent-v1` atlas, but no Factory hierarchy, pose sampler, or socket contract. | Preserve the wing-call, cocoon, and tail-route ideas; rebuild the current art and rig. |
| Riftcoil Wyrm | Factory-compatible | Registered 17-frame `segmented-crescent-v1` atlas, but its fangs, tail, and core are not represented by one reusable hierarchical/socket contract. | Preserve the helix corridor and cross-to-tail combination; rebuild as a connected serpent rig. |
| Umbra Needlewing | **Factory-ready; Campaign M50 compact blackout final boss** | The rebuilt compact package uses an articulated `modular-hierarchy-v1` rig on a `512x320` logical canvas: 32 registered parts, 22 hierarchy-resolved sockets, four fixed-frame animation families, eight joints with validated motion ranges, deterministic idle/attack/phase/re-entry/escape sampling, animated needle and wing-shard projectiles, and collision derived from the visible neutral. Its stable attacks are Wing Shear Crossfire; Broken Clockwise Opening with five, six, or eight sequential downward rotating salvos; Blackout Laser with warning-locked stationary beam strikes; and Blackout Hunt with two, four, or six corner-telegraphed physical rams. The canonical `390x844` matrix passes all `12/12` attack-by-phase witnesses at fixed seed `0x0b1ac0de`; the narrowest route retains `6.075921547 px` after 3 px uncertainty, with evidence SHA-256 `a6d3c97303e7b444c01fe9160e8bd8d0c1f4a40626c8cc6273b4557608c1f427`. Gates 1–5 passed after high-zoom reference review, 25/50/75% live overlays, an 11-pose motion sheet, 20 attack captures, clean phone/wide-host review, interruption cleanup, and the stagger/false-finish/escape lifecycle. | Retain the compact short/wide pixel identity and M50 placement. Use the Sandbox definition as the editable source and the serialized route evidence as its deterministic safety baseline. Re-run the 12-route matrix and the actual mobile capture review whenever timing, sockets, collision, projectile geometry, ram paths, blackout layering, or viewport geometry changes. |
| Twin Halo Wardens | Legacy | An atlas is registered, but runtime deliberately uses the flattened `assembled` mode with `paired-resonance`; there is no shared hierarchy or anatomy-owned socket profile. | Keep the call-and-answer identity and conjunction puzzle. Rebuild the paired bodies as one validated hierarchy. |
| Sweep / Bank / Re-entry | Legacy | No fixed Sandbox artwork registration; it uses the campaign placeholder rig and timeline prototype only. | Extract the movement/re-entry lesson, then archive the prototype. |
| Prism Moth Broodkeeper | **Factory-ready; Campaign M15 and Sandbox co-benchmark with V0.21 behavior amendment** | Locked 384x384 canonical reference; deterministic 2048x2048, 24-frame, binary-alpha, 96-color atlas; one connected 17-node hierarchy with 16 visible structural parts and seven anatomy-owned sockets; purposeful wing, pod, core, entrance, idle, phase, damage, stagger, and five-stage death motion; hull-only 1,150 HP with permanent animated wings; 35 sequential Attack 1 feathers; 2-HP, reward-free, player-directed Attack 2 brood; 28/42 Attack 3 trails at four-frame cadence; and four deterministic Attack 4 route families below 50%. The retained runtime-v0.19 route witnesses remain the historical art/safety baseline and the V0.21 runtime tests cover the new behavior branches. | Use as the co-benchmark for permanent living appendages, destructible visible summons, deterministic player-directed formations, and non-numeric low-health route remixes. Its 1,150-HP hull-only definition is approved for Campaign M15 and remains editable/testable in the Sandbox. Its exact brood choreography remains Prism-specific and must not become a generic default attack. Refresh content-addressed route and visual evidence whenever timeline, formation, socket, collision, viewport, or art geometry changes. |
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
  Sandbox workflow benchmark. Its approved Campaign M15 placement reuses the
  same validated behavior at the 1,150-HP hull-only budget.

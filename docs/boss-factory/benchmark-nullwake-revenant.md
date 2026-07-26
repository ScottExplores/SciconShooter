# Nullwake Revenant Boss Factory benchmark

> **Benchmark status:** Factory-ready inside the canonical Sandbox. The locked
> 24-case fixture proves every critical attack in every phase on mobile and
> desktop with at least 6 px clearance after conservative geometry inflation.

## Identity

- **Sandbox prototype:** `nullwake-revenant`
- **Runtime event:** `sandbox-nullwake-revenant`
- **Source boundary:** `director-sandbox-prototype`; it is not placed in a
  campaign Mission.
- **Fantasy:** a mechanical revenant that truthfully powers down at zero health,
  hangs limp, then reboots into a larger backplane-crowned second life.
- **Combat role:** a learnable route-puzzle boss. Its claws teach side pressure,
  its core teaches moving gaps, and the signature combines those rules into one
  six-beat maze.
- **Silhouette and mechanism:** one central shell, four independently articulated
  claw limbs, four limb muzzles, and one core emitter. The false death restores a
  full health bar once, changes the movement/route grammar, and never repeats.
- **Player learning:** rhythm-dodge the firing claw, track rotating gaps, follow
  shifting channels, then combine all three skills in the Revenant Maze.
- **Recovery reward:** every sentence ends in an authored `effect-cue` recovery
  window while the boss remains a valid damage target.

## Locked pixel art and gameplay scale

The gameplay structural source is the registered five-part modular reassembly of
`nullwake-revenant-assembled.png`, not an independently redrawn preview. Its
370x311 source pixels have SHA-256
`5ee76a64cc5207e85be611744ada5784dd5c95776cc0e3262d3fbf888d3f5407`.
The four arm crops plus the center body recompose that source byte-for-byte, and
the structural alpha is binary.

The supplemental V3 animation/destruction atlas is
`nullwake-revenant-factory-atlas-v3.png`:

- SHA-256:
  `a0d29566c3e925c764267f48202ce1a18247f28007b43ad7fdcba7c8573da2cd`
- size: 1536x1024;
- 15 registered, non-empty, in-bounds frames;
- 239,170 opaque pixels, 1,333,694 transparent pixels, and zero
  semitransparent structural pixels;
- exactly 32 opaque colors;
- four equal-canvas core frames, three equal-canvas persistent-damage frames,
  three registered core-muzzle frames, and five destruction fragments.

### Explicit large-boss exception

Nullwake's locked 370x311 source is larger than the Factory's preferred
128-192 px logical canvas. It is retained because it is the approved cohesive
design and its exact-pixel decomposition is already authoritative. The selected
Sandbox preview displays it at 290x244 instead of the legacy 290x264 box. The
registered 370:311 aspect is therefore preserved with less than 0.2% X/Y scale
rounding mismatch and no stretch. Pixi uses nearest-neighbor sampling with
antialiasing disabled; the unavoidable presentation scale is fractional and is
documented as a benchmark-specific large-boss exception, not a new default for
future bosses.

## Rig, sockets, and lifecycle

The `nullwake-revenant-articulated` registration is one connected 16-node
`modular-hierarchy-v1` tree with a single root:

- four invisible anatomical mounts;
- four opaque arm sprites and one opaque body sprite;
- one hidden core-muzzle effect part;
- five hidden destruction-fragment parts.

Its hierarchy owns five live sockets:

| Socket | Owning anatomy | Runtime role |
|---|---|---|
| `muzzle-upper-port` | `arm.upper-port` | projectile muzzle |
| `muzzle-lower-port` | `arm.lower-port` | projectile muzzle |
| `muzzle-upper-starboard` | `arm.upper-starboard` | projectile muzzle |
| `muzzle-lower-starboard` | `arm.lower-starboard` | projectile muzzle |
| `revenant-core` | `body` | core origin |

The engine receives the hierarchy-resolved pose sampler and prefers it over the
static normalized compatibility profile. Warning-time socket/core positions are
captured under the exact compiled clip/execution key; the later damaging fire
consumes those same locked origins even after the boss and limbs move. Port-only
anticipation moves only the port muzzle pair relative to the core, and the same
rule holds for starboard.

| Lifecycle state | Evidence-backed behavior |
|---|---|
| Entrance | Limbs begin folded and deterministically settle into the registered neutral assembly. |
| Idle | Simulation-frame breathing, bob, sway, roll, and independent limb flex; no ambient clock or randomness dependency. |
| Anticipation / recoil | The warned side braces, the firing side recoils, and core attacks bloom all four limbs through registered body frames. |
| Large hit | A bounded local `impact` pose is driven only by significant damage. Ordinary hits do not jerk the whole boss. |
| Stagger | Component/significant impact uses a distinct, stronger `stagger` pose. |
| Persistent damage | Five damage stages select three registered body-damage frames and add deterministic limb droop. |
| False death / phase transition | Exactly 132 shutdown frames leave the boss limp at zero health, followed by 156 reboot frames that restore 4,200 HP, unfold the body frames, and grow the awakened form by 1.22x within the mobile cap. |
| Final destruction | A deterministic 72-frame sequence launches five authored fragments with bounded delays, travel, and rotation; the one-use revival cannot intercept the second lethal hit. |

## Exactly three core sentences and one signature

| Role | Sentence | Anatomy and cue | Connected damaging beats | Survival rule and recovery |
|---|---|---|---|---|
| Core 1 | **Claw Corridor** (`claw-corridor`) | One claw bank opens while the opposite bank folds; fire leaves the two moving sockets on the named side. | Three separately warned `side-barrage` wakes. | Move away from the warned bank and read repeated-side feints; 0.8 s recovery. |
| Core 2 | **Dead-Signal Gates** (`dead-signal-gates`) | The body/core draws three ordered aperture guides and advances through its registered core frames. | Three separately warned 14-projectile `gap-ring` gates. | Follow each shown gap waypoint one reachable step at a time; 0.8 s recovery. |
| Core 3 | **Memory Lattice** (`memory-lattice`) | All four claws flatten while cyan rails frame the next channel. | Three separately warned `weave-wall` rows. | Enter the two-lane channel and follow its one-step shifts; 0.85 s recovery. |
| Signature | **Revenant Maze** (`revenant-maze`) | All limbs lock inward and the core changes frame/color around the route guide; limb and core emissions retain their anatomy-owned origins. | Six beats: `weave-wall` -> `gap-ring` -> `cross-beam` -> `side-barrage` -> `gap-ring` -> `weave-wall`. | Follow channel, core gap, safe cross quadrant, lit claw, return gate, then exit channel; 1.0 s recovery. |

Every damaging beat has its own 0.75-0.95 s linked telegraph, and every phase
compiles a recovery clip after its final beat. There are no unbounded repeats or
ambient gameplay-random branches in these sentences.

## Taught-rule phase remixes

| Phase | Presentation and movement | Route remix |
|---|---|---|
| **Borrowed Charge** | Cyan identity, restrained `arena-roam`, first health bar. | Claws port/starboard/port; clockwise gates 0/1/2; lattice 0/1/2; maze enters at sequence 4 and pressures port. |
| **Backplane Crown** | Orange identity, full-health reboot, enlarged silhouette, `sine-drift`. | Claws starboard/port/starboard; gates reverse counterclockwise; lattice reverses 2/1/0; maze changes its entry/exit and pressures starboard. |
| **Terminal Overclock** | Violet low-health state at 28%, returns to `arena-roam`. | Claws port/port/starboard; gates and lattice use the learned 1/2/1 route; maze changes entry, return gate, and exit while retaining the same readable grammar. |

These are bounded direction, lane, socket-side, movement, and presentation
changes. Health, speed, camera strength, and density are not used as substitutes
for a behavioral phase remix.

## Deterministic safe-route evidence

`director/tests/fixtures/nullwake-safe-route-evidence.json` pins all 24
combinations of four attacks, three phases, and both benchmark viewports. Each
row reconstructs the real compiled attack in `GameEngine`, captures every
warning origin from the live modular pose, performs a bounded constructive
search, and then replays the witness exactly. The evidence suite produced the
same fixture in two consecutive runs.

Every row clears the professional 6 px acceptance floor after hostile geometry
has already been inflated by the 3 px pose/socket uncertainty. The narrowest
case is Terminal Overclock Claw Corridor on mobile at 7.136829 px. No attack
data was weakened or retuned to obtain the robust witnesses.

Table cells are `minimum clearance / witness hash / checked frames /
search breadth x control frames`.

| Attack | Phase | Mobile 390x844 | Desktop 1280x720 |
|---|---|---|---|
| `claw-corridor` | Borrowed Charge | 7.260873 px / `657c788a` / 336f / 56x8 | 78.260311 px / `809e8e20` / 329f / 63x7 |
| `claw-corridor` | Backplane Crown | 8.85943 px / `0b5cbd18` / 342f / 77x6 | 77.576508 px / `59603cbd` / 315f / 63x7 |
| `claw-corridor` | Terminal Overclock | 7.136829 px / `aaee60d6` / 344f / 153x8 | 41.378422 px / `caa2fe31` / 315f / 63x7 |
| `dead-signal-gates` | Borrowed Charge | 134.77519 px / `ffa5bff3` / 312f / 16x6 | 79.674923 px / `2e5b15e8` / 456f / 16x6 |
| `dead-signal-gates` | Backplane Crown | 113.487423 px / `572b9ef6` / 312f / 16x6 | 93.895849 px / `e408da98` / 444f / 16x6 |
| `dead-signal-gates` | Terminal Overclock | 148.63306 px / `e415857b` / 312f / 16x6 | 44.315849 px / `74bae0b3` / 444f / 16x6 |
| `memory-lattice` | Borrowed Charge | 37.890595 px / `40297eea` / 384f / 16x8 | 52.318835 px / `51602c1d` / 384f / 16x8 |
| `memory-lattice` | Backplane Crown | 23.081657 px / `7c653174` / 384f / 16x8 | 88.924856 px / `30b8fd2a` / 376f / 16x8 |
| `memory-lattice` | Terminal Overclock | 14.183467 px / `19dc3582` / 380f / 16x5 | 54.183691 px / `cf961a67` / 376f / 16x8 |
| `revenant-maze` | Borrowed Charge | 15.123719 px / `7590a864` / 650f / 17x5 | 25.992 px / `0958dbf2` / 666f / 16x6 |
| `revenant-maze` | Backplane Crown | 20.117832 px / `36a80a75` / 656f / 16x2 | 7.953221 px / `f10237e9` / 648f / 16x6 |
| `revenant-maze` | Terminal Overclock | 16.661526 px / `c58abc9d` / 651f / 17x3 | 28.36883 px / `e56cf62b` / 648f / 16x6 |

## Proof settings

- fixed gameplay seed: `nullwake-safe-route-proof`;
- simulation: 60 Hz;
- viewports: mobile 390x844 and desktop 1280x720;
- conservative player collision: 51.24x63.44 px;
- baseline maximum speed: 2.5 px/frame;
- baseline acceleration: 0.38 px/frame;
- pose/socket geometry uncertainty: 3 px, applied by inflating hostile shapes;
- exact per-beat warning origins from the live `GameEngine` and modular pose
  sampler;
- bounded search settings are pinned per row in the evidence table. The larger
  mobile Claw Corridor breadths and finer phase-specific control granularity
  improve witness discovery only; every candidate still passes exact replay;
- each discovered witness is replayed exactly and compared with the pinned
  evidence fixture.

## Automated evidence surfaces

| Evidence | Focused test |
|---|---|
| Exact reassembly, binary alpha, 32-color V3 atlas, frame bounds | `director/tests/bossSandboxModel.test.mjs`, `director/tests/bossPixelArtQuantizer.test.mjs` |
| Connected hierarchy, moving sockets, lifecycle states, registered frames/fragments | `director/tests/nullwakeFactoryRig.test.mjs`, `tests/nullwakeRevenantModularRig.test.cjs`, `tests/modularHierarchyRig.test.cjs` |
| Exact warning/fire origin ownership and cleanup | `tests/bossAttackOriginLockRuntime.test.cjs`, `tests/bossWeaponSocketRuntime.test.cjs` |
| False-death timing, full restore, growth cap, second lethal hit | `tests/bossRevivalRuntime.test.cjs` |
| Three-core/one-signature contract, per-phase variants, telegraphs, recoveries | `director/tests/sandboxBossPrototypes.test.mjs`, `director/tests/bossAttackSentences.test.mjs` |
| Aspect-preserved 290x244 gameplay display | `tests/bossPreviewArtworkGeometry.test.cjs` |
| Real compiled route reconstruction and deterministic witness replay | `director/tests/nullwakeSafeRouteProof.test.mjs` |

The final focused benchmark re-run passed 14/14 tests:

```text
node --test director/tests/nullwakeSafeRouteProof.test.mjs director/tests/nullwakeFactoryRig.test.mjs tests/nullwakeRevenantModularRig.test.cjs tests/bossPreviewArtworkGeometry.test.cjs
```

## Constraints and disposition

- Safe-route proofs isolate the selected authored sentence; they do not assert
  survivability when unrelated hazards are layered on top.
- Route evidence is content-addressed by the current timeline, phase routes,
  moving pose origins, player collision profile, and viewport. Any change to
  those inputs requires regenerating and reviewing the fixture.
- The 370x311 art size and fractional presentation scale are an explicit
  Nullwake exception. Future Boss Factory work should return to the preferred
  native logical scale unless a similarly evidenced exception is approved.
- Nullwake remains Sandbox-only. Its Factory-ready status identifies it as the
  reusable authoring benchmark; it does not authorize campaign placement or
  production content shipping.

**Current disposition:** Factory-ready Sandbox benchmark and reusable Boss
Factory reference. Keep it test-only. Campaign placement remains a separate
content decision and is not authorized by this classification.

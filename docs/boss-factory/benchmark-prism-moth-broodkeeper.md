# Prism Moth Broodkeeper Boss Factory benchmark

> **Benchmark status:** Factory-ready inside the canonical Boss Sandbox and a
> current co-benchmark with Nullwake Revenant. Prism proves the reusable
> workflow for living appendages, visible summon lifecycle, deterministic
> formation puzzles, and anatomy-aware fallbacks. It remains Sandbox-only.

## Identity

- **Sandbox prototype:** `prism-moth-brood`
- **Runtime event:** `sandbox-prism-moth-brood`
- **Source boundary:** `director-sandbox-prototype`; it is not placed in a
  campaign Mission.
- **Fantasy:** an elegant crystalline moth commander and keeper of smaller moth
  creatures.
- **Combat role:** a formation-puzzle boss whose wings teach rhythmic side
  reads, whose brood teaches moving openings, and whose signature combines
  living anatomy and coordinated summons into one traversable corridor.
- **Silhouette and mechanism:** a prism core and abdomen between four-part
  crystalline wings, paired brood pods, and a crest. Wings and pods are not
  decoration: their live transforms own the attacks they visibly perform.
- **Player learning:** read the firing wing, read cocoon order, pre-position for
  curved body swoops, then follow the ordered Kaleidoscope corridor.
- **Recovery reward:** every sentence visibly settles or reopens the wings and
  leaves an authored damage window before returning to neutral.

## Locked pixel art and source package

The comparison-only canonical reference is
`source/prism-moth-canonical-reference.png`, a 384x384 image with SHA-256
`b006c73ab1b027d5dce5ac2dc5cf841a2b2e30a202da264b91c00f8f93b77ade`.
The authoritative anatomy source is
`source/prism-moth-component-source-atlas.png`, SHA-256
`6274fcfb7e8bcab84477d9755578eeaf7744152c7793311bbacac485f7458b82`.
Its 16 audited connected components replace the former corrupt vertical crops.

The deterministic runtime atlas is
`prism-moth-broodkeeper-atlas.png`:

- SHA-256:
  `5ef8ca7e395c94b3777d4f85808b5701f8bc952d96a335438e8353dcc82b6292`;
- size: 2048x2048;
- 24 registered frames;
- binary structural alpha and a 96-color opaque palette;
- 16 source-bounded boss components;
- four equal-canvas broodling flutter frames;
- four equal-canvas cocoon lifecycle frames.

The lifecycle source has SHA-256
`49eb0f350d50dd40823780b4c2bae8702167307364f3aa5286334a83d99eb50d`.
The retained external `prism-feather` projectile sheet has SHA-256
`87b88c95cdc29dfee7df974f9e7aa4ff359aeda50aa9630e7012d7427f64ba56`.
The neutral modular preview has SHA-256
`cd0381398cbfb5003822f126192dc0d18af3fe874eff11defec9d57202109f39`,
and the measured reference-silhouette intersection-over-union is 0.712966.

## Rig, sockets, and ownership

The `modular-hierarchy-v1` rig has SHA-256
`f42154a2d88d569c293f9f84f8fbe070716ea761f8949a30a3069a98071fb838`.
It contains one invisible root plus 16 visible parts. Every node reaches the
same root, all structural transforms use uniform scale, and no handed part uses
negative scale.

`root -> body -> core, abdomen, crest, shoulder.left, shoulder.right`

Each shoulder owns its matching upper, mid, lower-inner, and lower-outer wing
segments plus its brood pod. This ownership makes a wingbeat, swoop trail, or
brood release follow the anatomy that visibly performs it.

| Socket | Owning anatomy | Runtime role |
|---|---|---|
| `wing-edge-left` | left wing chain | left feather fan |
| `wing-edge-right` | right wing chain | right feather fan |
| `wing-tip-left` | left wing tip | left swoop trail |
| `wing-tip-right` | right wing tip | right swoop trail |
| `brood-release-left` | left brood pod | cocoon and brood release |
| `brood-release-right` | right brood pod | cocoon and brood release |
| `prism-core` | body/core | final pulse and no-wing fallback |

## Lifecycle and living motion

| State | Accepted behavior |
|---|---|
| Entrance | Brood fragments lead a graceful descent; wings unfold and the prism core illuminates. |
| Idle | Restrained hover, breathing, asymmetric wingbeats, body tilt, and core pulse preserve life without random jitter. |
| Anticipation / recoil | The corresponding wing folds or opens, pods cradle the abdomen, and the core charge follows the authored sentence. |
| Ordinary hit | Feedback remains local: a small crystal/core response without a whole-body flinch. |
| Stagger | Lift fails, the body drops, and the core becomes visibly exposed before a registered recovery. |
| Persistent damage | Cracked/asymmetric wing and core presentation communicates accumulated damage. |
| Phase transition | Four-stage Prism Metamorphosis closes the wings, gathers the brood, brightens and fractures the core shell, then reopens with altered posture and exposure. |
| Destruction | Critical state, structural fracture, wing break, core overload, and final clear form a deterministic five-stage death. |

## Exactly three core sentences and one signature

| Role | Sentence | Anatomy and cue | Connected beats | Player rule and fallback |
|---|---|---|---|---|
| Core 1 | **Prism Wingbeat Weave** (`wingbeat-weave`) | The firing wing folds and lights while the core pulses and body drifts. Feathers leave the live `wing-edge-*` socket. | Left/right/left/right/both wingbeats, with a seeded reversible alternative and sequential feathers rather than one instantaneous ring. | Move away from the lit wing and follow the final opening. A destroyed wing is removed from the sequence; no-wing state selects a core/brood fallback with no hidden wing emission. |
| Core 2 | **Brood Procession** (`brood-procession`) | Wings cradle the abdomen; live brood pods deploy cocoons that visibly arm, crack, and hatch. | One or two bounded procession waves select from six deterministic formation templates. Phase two reverses the second wave. | Read cocoon order and follow the opening carried by the formation. Missing pods fall back to surviving pod or core release; action cancel and owner loss clean up all owned artifacts. |
| Core 3 | **Lunar Prism Swoop** (`lunar-prism-swoop`) | Wings fold, the entering edge glints, and the entire visible boss commits to two or three curved passes. Trails leave the matching live `wing-tip-*` socket. | Alternating edge entry, curved midpoint, opposite return, then recovery; phase two adds a third pass and final cocoon. | Stay below the visible curve, then switch sides. One surviving wing supplies its own trail; loss of both wings disables swoop and selects brood/core fallback. |
| Signature | **Kaleidoscope Brood** (`kaleidoscope-brood`) | Wings cocoon around the charging core, reopen widest, and illuminate in order while visible cocoons hatch. | Cocoon charge, full core charge, first wing command, second corridor command, and final core escape pulse. | Follow the continuous moving corridor indicated by the active wing/brood sequence. Phase two changes corridor direction once. The exact choreography remains Prism-specific. |

Every damaging stage has a visible warning relationship, distinct anatomy,
bounded execution, physical reaction, cleanup, and recovery. Normal gameplay
uses wing posture, cocoon state, crystal effects, and core light rather than
attack names, safe-route text, predicted lines, or debug guides.

## Visible summon and formation contract

Prism is the Factory reference for summons that exist as readable creatures,
not invisible collision primitives:

1. a cocoon visibly deploys from a live brood socket;
2. it progresses through `closed -> armed -> cracked -> hatched`;
3. the resulting broodling uses the four-frame flutter animation;
4. damaging collision exists only while the visible broodling is active;
5. it visibly exits or is destroyed, then the runtime removes it;
6. owner loss or attack reconstruction removes all owned artifacts.

The retained formation templates are `mirrored-arcs`,
`alternating-diagonals`, `v-opening`, `split-corridor`, `staggered-wave`, and
`center-bloom`. Each template is bounded, protects the player spawn, and keeps
a continuous readable opening on mobile and desktop. Runtime limits cap a wave
at six brood nodes, a sentence at two waves, and the owner at ten broodlings.

## Prism Metamorphosis remix

The health threshold is 0.48. Phase two does more than increase numbers:

- the boss pauses and performs the accepted four-stage transformation;
- wing posture, core exposure, body movement, and brood command presentation
  visibly change;
- Wingbeat Weave adds a delayed brood echo;
- Brood Procession reverses its second wave;
- Lunar Prism Swoop alternates its entry edge and leaves a final cocoon;
- Kaleidoscope Brood changes its corridor direction once.

The base Sandbox health is 1,150. Each wing component is approximately 22% of
the hull, or 253 HP at the default. Component-health and invincibility controls
are preview tools only; they do not change this authored starting contract.

## Deterministic route evidence

The compiled preview is content-addressed by SHA-256
`3c581d57b56447c9fa845754b2e3b80666413e5d45f0492536415b8eb0b0e560`.
The evidence uses fixed seed `scicon-simple-boss-sandbox`, mobile 390x844 and
desktop 1280x720, a 6 px required floor, and 3 px geometry uncertainty. Hashes
below are SHA-256 of the deterministic witness arrays used by the accepted
runtime-v0.19 proof pass.

| Attack | Mobile minimum / route hash | Desktop minimum / route hash |
|---|---|---|
| `wingbeat-weave` | 43.5 px / `46266ae08385c1ffc7a1c38ef167bf9b1dc826dd3d91f01b4fd7e8d917facfaa` | 177 px / `52390ae5c5c7a9592eff00f0fa8c3d37e571585efede48fe8853f6099c904ae4` |
| `brood-procession` | 43.5 px / `3ce975ce6c924aa8cb0938725a312002251d22c782238704a2a6e90738f05d51` | 177 px / `40aabab47f56268764a254074dbe43ce756a37cdd6f887af77ea7929d7921be3` |
| `lunar-prism-swoop` | 205.18936327403037 px / `2f165f7ecb5ba792e02371abdede6820eabda11b511de06452c6cde6945a6539` | 91.1141487645757 px / `def202bab14273e674d642ce7e96f35e13eac08feeef94a7fa8d57f199f927a1` |
| `kaleidoscope-brood` | 35.7 px / `31a82e5bbbd61b96d580385c0ed035d687766bceb24d5cc6982a625ed38dccdb` | 151.4 px / `f5bcf011c516507972a66f7dd14b21580e2a75d16c80cc78d06cb42c7d6b08b4` |

All eight witnesses exceed the acceptance floor after uncertainty. The
narrowest is the mobile Kaleidoscope corridor at 35.7 px. The formation suite
also samples all six templates at 81 progress steps on both viewports, and the
signature suite checks continuous beat-to-beat route movement rather than
isolated safe snapshots.

## Accepted runtime-v0.19 visual evidence

All paths below are relative to
`director-data/prototype-assets/prism-moth-broodkeeper/review/runtime-v0.19/`.
They are real canonical-runtime captures with debug presentation disabled.

| Evidence | Files |
|---|---|
| Wingbeat Weave | `attack1-01-telegraph.png`, `attack1-02-left-wingbeat.png`, `attack1-03-right-wingbeat.png`, `attack1-04-weave.png`, `attack1-05-recovery.png` |
| Brood Procession | `attack2-01-fold-charge.png`, `attack2-02-cocoon-deploy.png`, `attack2-03-hatching.png`, `attack2-04-formation.png`, `attack2-05-second-procession.png` |
| Lunar Prism Swoop | `attack3-01.png`, `attack3-02.png`, `attack3-03.png`, `attack3-04.png`, `attack3-05.png` |
| Kaleidoscope Brood | `attack4-01-cocoon-charge.png`, `attack4-02-core-full-charge.png`, `attack4-03-first-command.png`, `attack4-04-second-corridor.png`, `attack4-05-core-escape.png` |
| Neutral / desktop | `desktop-neutral.png`, `desktop-kaleidoscope-brood.png` |
| Metamorphosis | `pose-metamorphosis-01.png` through `pose-metamorphosis-04.png`, then `pose-phase2-neutral.png` |
| Damage / stagger | `pose-persistent-damage.png`, `pose-stagger-01.png`, `pose-stagger-02.png`, `pose-stagger-03-recovery.png` |
| Destruction | `pose-death-00-critical.png` through `pose-death-04-clear.png` |

Together with the neutral/reference comparison, these named captures provide
the accepted neutral, open/folded motion range, live attack range, phase-two,
damage, stagger, and death review record. Capture files remain ignored local
Factory evidence and are not production assets.

## Automated evidence surfaces

| Evidence | Focused test |
|---|---|
| Source hashes, deterministic extraction, atlas, binary alpha, rig, reference comparison | `director/tests/prismMothFactoryAssets.test.mjs`, `director/tests/bossPrototypeAssets.test.mjs` |
| Connected hierarchy, poses, handed wings, registered lifecycle frames | `tests/prismMothModularPose.test.cjs`, `tests/prismMothModularRenderer.test.cjs`, `tests/modularHierarchyRig.test.cjs` |
| Bounded parameters, six templates, visible lifecycle, route continuity, phase remixes, wing fallbacks | `tests/prismMothBroodkeeperRuntime.test.cjs` |
| Live GameEngine socket origins, sequential wingbeats, summon cleanup, phone/desktop swoops, clean presentation | `director/tests/prismMothRuntimeIntegration.test.mjs` |
| Test-only prototype, two phases, three core attacks and signature | `director/tests/sandboxBossPrototypes.test.mjs` |
| Bounded tuning controls | `director/tests/prismMothAttackTuning.test.mjs` |

## Constraints and disposition

- Route hashes and clearances are tied to the recorded configuration, seed,
  viewport, pose/socket geometry, formation rules, and collision model. Any
  change to those inputs requires a fresh deterministic proof and visual pass.
- The source package and runtime-v0.19 captures are ignored local Boss Factory
  evidence. Production `Prism Warden` campaign content remains unchanged.
- The reusable lessons are visible summon lifecycle, anatomy-owned attacks,
  deterministic bounded formations, readable continuous openings, and explicit
  destroyed-anatomy fallbacks. Prism's brood sequence, wing order, and
  Kaleidoscope choreography are not generic defaults for future bosses.
- Factory-ready status does not authorize campaign placement, public release,
  or private Runner publication.

**Current disposition:** Factory-ready Sandbox co-benchmark. Keep it test-only
and use it alongside Nullwake, not instead of Nullwake, when evaluating future
Boss Factory work.

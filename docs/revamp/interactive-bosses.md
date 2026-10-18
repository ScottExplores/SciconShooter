# Interactive encounter layer (O)

Scott's existing campaign artwork, rig registrations, handed parts and assets are retained. This is a procedural hardware and encounter pass over the fifteen C profiles and ten campaign mini-boss identities, not a new raster-art roster. The original first-minute Peer Reviewer keeps B's simpler teaching shield.

## Major encounter grammar

The first two armaments protect the hull. Each has independent HP, an attached health strip, an intact/cracked/smoking/wreck state and its own attack selection. Destroying one cancels its committed attack, drops two real coins, produces a small explosion and hit-stop, and leaves a persistent wreck. Centered hull shots chip the nearest surviving armament, preventing an autofire deadlock. Destroying both removes that layer, lowers hull integrity to the next milestone and grants a quiet transition. Two inner mechanisms emerge; destroying them reveals the core.

The core's sliding shutters open during recovery. The opening marks a hull-exposure window: hull damage is 1.85× while open and 0.8× while closed. There is no additional small core aiming hitbox. Shielded layers cannot show a false bonus-damage opening. Phases retain the existing 66% and 33% health milestones. Core, armaments, hangar and renderer all consume the same fixed-step encounter state.

| Physical source | Preparation and attack | Player response | Destruction / recovery |
| --- | --- | --- | --- |
| Outer cannon | Charge plus committed aimed-fan lines; fire from the attached socket | Move after aim locks | Breaking cannon removes its fan; 72-frame stagger |
| Outer generator | Charge plus incomplete ring | Follow the omitted sector | Breaking generator removes its ring; layer opens when both outer mechanisms are destroyed |
| Inner battery | Warned weave lanes with two-column opening | Stay in or move into the opening | Breaking battery removes its weave; inner shell remains attributable |
| Inner armor relay | Two committed laser lanes | Leave the warning columns | Breaking relay removes its salvo; core emerges after both inner parts are destroyed |
| Core / arena machinery | Quietly replace the prior sentence with warned phase-two edge walls, then phase-three outward beam sweeps or chevrons | Use the wide central passage | No overlap with other boss sentences; cancel at the common lifetime boundary |
| Hangar | Doors slide open over a full one-second warning; two existing drone sprites deploy | Lower arena remains clear; shoot the departing escorts if desired | No deploy/exit ram damage, bounded ownership, no independent firing, cleanup on break/phase/death |

Every warning is at least 36 simulation frames. Warnings from lower side-mounted sockets use 108 frames. Arena warnings use 84 frames. All patterns share the canonical 390×844 world. Damage geometry, difficulty, timings and RNG never depend on the host viewport or visual quality tier.

The phase transformation is structural overlay motion: shell leaves separate, outer fittings remain wrecked and the inner pair becomes visible. Phases two and three open with their warned arena change and then the hangar, before the weapon/core pair, making the changed combat visible early in the phase. Prism, claw, reactor and plate profiles have distinct shell silhouettes and palettes. Scott's source hull is preserved beneath these fittings; no new second-form raster sprites are claimed.

## Mini-bosses

`bottleneck-drone`, `paywall-wall`, `fracture-engine-elite`, `aegis-brood-core`, `railspine-wallcrawler`, `maw-carrier`, `twin-meridian-sentinels`, `prism-bloom`, `aegis-convoy-captain`, and `gridline-sentries` are reachable through the same lab roster.

The original eight authored mini encounter choreographies retain their guardians, partners, handed wall art, own member HP, reinforcement budgets and signature behaviors. Primary members receive a support relay and generator. The relay powers the original authored weapon and disables its supporting attack when broken; original firing sockets and choreography remain authoritative. Breaking both creates a quiet shell opening and exposes the second-stage hull. Individual guardians remain the original destructible entities. Queued shots carry their weapon role and cancellation generation. A resumed attack requires a new accepted warning of at least 36 frames, so a break cannot resume an unwarned beam.

The Bottleneck Drone teaches a locked fan and incomplete core ring. Paywall Wall retains its individually destructible marching segments and their original damage art. Surviving vents charge for 48 frames before firing; after half the wall is destroyed they use a narrow pair instead of a single shot. Destroyed or previous-run segments cannot fire.

## Presentation and safety limits

Retained Pixi objects draw stepped metal fittings, small health strips, smoke, moving shutters and phase perimeter machinery. Structural geometry is rebuilt only when appearance changes; normal animation uses transforms, alpha and tint. The current arena warning is functional gameplay geometry, not a debug hitbox. Normal gameplay does not show socket IDs or attack internals.

Source-specific sockets fit the painted silhouette rather than the transparent canvas. Crownclaw outer/inner supports use Y `.66/.70` with core `.50`; Oculus uses `.68/.72` with core `.52`; Hammerhead uses `.68/.72` with core `.62`. Other major supports retain `.94/.98`, core `.62`, and all major hangars use `.35`. Mini support Y is `.68` for Bottleneck/Railspine/Gridline, `.74` for Convoy and `.90` otherwise, with core `.68`. Original handedness, bank rotation and unchanged X ratios are preserved. Exact-ID palette overrides match the reviewed source armor without recoloring unrelated bosses.

The existing A major-defeat presenter supplies the chain explosions, debris, flash and fixed-step slow motion through the common kill path. Mini encounters keep their authored death animation and elite blast/hit-stop. O adds a 120-frame major / 72-frame mini invulnerability window (18 for a wall segment), while the established final reward path remains responsible for the death coin rain. Part-break coins are separate explicit rewards, never cosmetic event duplicates. C lifecycle events remain useful QA receipts; their numeric explosion/slow-motion fields are not claimed as production visual settings.

Proofs cover continuous player routes, conservative player acceleration/collision and actual side-mounted origins, including rage and every retained finite pattern variant. Sweeps use conservative bounding envelopes containing every sampled beam frame. These certificates apply to the lower combat arena and this encounter's own hazards; they do not certify surviving a deliberate hull collision or unrelated concurrent hazards. The authored mini sequences retain their existing geometry proofs; new drone sockets and escort lifecycle use additional real-engine regressions.

## Authoring and evidence

Tuning is in `services/revamp/bosses/interactive.ts`, `interactiveArena.ts`, `interactiveEscorts.ts`, `miniInteractive.ts` and `miniWall.ts`. Presentation is in the corresponding `InteractiveBossPresentation` and `MiniInteractivePresentation` classes. Changes to geometry, warnings, speed or lifetime require rerunning O and C route tests.

The QA roster is production `GameCanvas`, including the existing compiled artwork. Explicit `revamp:` event IDs opt into campaign combat even when preview artwork metadata is present; standalone sandbox IDs keep their own authored combat. `?qa=1&bosslab=<id>&autoplay=1&skipIntro=1` uses power level 4 with no wings for readable observation; add `god=1` only for invincible coverage. Manual practice still defaults to maximum power. `bosswatch=1` steers without firing and is used only by explicitly labelled forced lifecycle captures.

`window.__sciconQA.state()` includes the actual anatomy and bounded boss-event receipts. Lab-only `bossCommand` applies damage through real gates; it cannot bypass armor or intro immunity. Reports distinguish natural autoplay, watch fixtures, forced damage, god mode and normal damage. These are local offline tools; no remote API writes or rewards are performed.

Before/after screenshots, clips, exact build hashes, test logs and visual review are under `/workspace/scicon-revamp/qa/O-bosses/`. See `REVAMP_NOTES_O.md` for the final evidence verdict and remaining limitations.

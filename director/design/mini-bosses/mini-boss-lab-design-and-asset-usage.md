# Mini-Boss Lab design and asset-usage ledger

Status: implemented in Campaign checkpoints and the local Boss Sandbox; runtime, asset, lifecycle, and visual verification recorded below

Scope: Campaign runtime with isolated Boss Sandbox previews

Campaign assignment: all eight registry encounters are assigned (`campaignAssigned: true`)

Generation in this work: no new sprites generated

Archival in this work: no assets archived or removed

## Truth rules

- A row marked **verified active** has been inspected at gameplay size in the running 390×844 encounter and is backed by stable-binding/runtime tests. Lifecycle claims also require the exact engine cleanup proof.
- Stage-20 enemy assets are single-frame sprites. Their intended idle, charge, recoil, hit, and death presentation uses deterministic assembly transforms and existing effects. This is an **assembly-motion limitation**, not generated frame animation.
- The Bottleneck Harvester five-state pack is the only audited multi-state raster set in this roster. Its states are not a smooth limb-animation sequence; transitions still require careful runtime timing.
- Stable `CAMPAIGN_ENEMY_*` keys are authoritative for Stage-20 sprites. The Harvester five-state set is registered through the stable Mini-Boss Lab asset ID `fracture-core-body` rather than gallery order or sheet position.
- No asset is considered used until a gameplay-size capture proves the stable binding. No asset is considered safe to archive until repository references and historical evidence readers are checked.

## Encounter design contract

| Encounter ID | Category | Seed | Expected duration | Linked units | Signature maneuver | Supporting behavior | Player solution |
|---|---|---:|---:|---:|---|---|---|
| `fracture-engine-elite` | Paired Encounter | `fracture-engine-elite-gold-v1` | 28 s | 2 engines plus 4 satellites | Alternating Fracture Crossfire | Satellite Shear and slower survivor fallback | Read alternating left/right charge and cross through the authored opening |
| `aegis-brood-core` | Guardian Formation | `aegis-brood-core-v1` | 27 s | 1 core plus 6 guardians | Guardian Halo | Aegis Pulse and readable ring re-formation | Break key guardians, follow the gap, punish exposed recovery |
| `railspine-wallcrawler` | Wall Encounter | `railspine-wallcrawler-v1` | 23 s | 1 wall unit | Railspine Traverse | Wall-Burst Stitch and one bounded edge change | Ride the moving safe region beside the exact visible beam |
| `maw-carrier` | Mini-Boss | `maw-carrier-v1` | 30 s | 1 carrier plus 6 live reinforcements maximum | Maw Release | Hatchline Volley and bounded repositioning | Read the hatch cycle, clear the bounded formation, punish the open core |
| `twin-meridian-sentinels` | Paired Encounter | `twin-meridian-sentinels-v1` | 26 s | 2 sentinels | Meridian Role Exchange | Sentinel Relay and guarded-state alternation | Attack the active unit, anticipate the mirrored role exchange |
| `prism-bloom` | Mini-Boss | `prism-bloom-v1` | 24 s | 1 bloom | Prism Bloom Gap Ring | Petal Reversal | Track the incomplete ring opening as it shifts once |
| `aegis-convoy-captain` | Guardian Formation | `aegis-convoy-captain-v1` | 29 s | 1 captain plus 4 escorts | Convoy Shield Transform | Captain Command Burst | Reduce escort protection, pass the temporary barrier, punish the opening |
| `gridline-sentries` | Wall Encounter | `gridline-sentries-v1` | 25 s | 2 edge units | Safe-Quadrant Grid | Sentry Boundary Shift | Enter the valid quadrant and move with its single bounded shift |

All eight use one compact signature and one support behavior. Any low-health change must remix route, role, or timing without adding an unrelated third attack.

## Asset role ledger

### Fracture Engine Elite

| Stable reference | Explicit role/status | Animation truth | Verification status |
|---|---|---|---|
| `/game-art/generated/scicon-flight-motion-pack-v1/bosses/bottleneck-harvester/frames/bottleneck-harvester-02-neutral.png` | Neutral assembly for both engines; right engine receives a deterministic red-energy presentation treatment | Authored neutral state; no limb sequence | Verified active through stable `fracture-core-body` binding and live gameplay inspection |
| `/game-art/generated/scicon-flight-motion-pack-v1/bosses/bottleneck-harvester/frames/bottleneck-harvester-01-idle.png` | Idle animation state | Authored idle state, sequenced with neutral | Verified active in the running idle sequence |
| `/game-art/generated/scicon-flight-motion-pack-v1/bosses/bottleneck-harvester/frames/bottleneck-harvester-03-attack.png` | Charge and Fracture Crossfire state | Authored attack pose, not a multi-frame charge | Verified active during the live signature loop |
| `/game-art/generated/scicon-flight-motion-pack-v1/bosses/bottleneck-harvester/frames/bottleneck-harvester-04-damage-50.png` | Hit and damage state | Authored 50% damage pose | Verified active through the health/hit controls and exact frame-to-mask test |
| `/game-art/generated/scicon-flight-motion-pack-v1/bosses/bottleneck-harvester/frames/bottleneck-harvester-05-critical-15.png` | Low-health damage state and staged-death lead-in | Authored critical pose; final fracture uses existing effects | Verified active through low-health/death controls and staged cleanup proof |
| `CAMPAIGN_ENEMY_ORBIT_DISC` | Escort/satellite for each engine | Single frame; orbit and collapse are assembly motion | Verified active; per-core ownership, survivor retention, and cleanup are engine-proven |

### Aegis Brood Core

| Stable reference | Explicit role/status | Animation truth | Verification status |
|---|---|---|---|
| `CAMPAIGN_ENEMY_SHIELD_RAMMER` | Neutral assembly, idle core pulse, signature core emission, hit and death owner | Single frame; blink/pulse and recoil are assembly/effect motion | Verified active in the running core, shield, and signature presentation |
| `CAMPAIGN_ENEMY_RING_SENTINEL` | Six bounded escort/guardian units | Single frame; orbit, mirrored pass, and return are assembly motion | Verified active; full/partial/exposed guard states and cleanup are engine-proven |

The sentinel image contains small decorative nodes, but only separately spawned, owned guardian entities count toward protection health or vulnerability rules.

### Railspine Wallcrawler

| Stable reference | Explicit role/status | Animation truth | Verification status |
|---|---|---|---|
| `CAMPAIGN_ENEMY_WALL_SNIPER_LEFT` | Left-wall neutral assembly, idle, charge, Rail Sweep emitter, support burst, hit, damage, and death owner | Single frame; grips, aperture, brace, crawl, recoil, and failure are assembly/effect motion | Verified active on the authored left wall with aligned live beam geometry |
| `CAMPAIGN_ENEMY_WALL_SNIPER_RIGHT` | Right-wall authored alternate for the same roles; do not derive it by unstable runtime flipping | Single frame; same assembly-motion limitation | Verified active on the authored right wall; wall pose and hazard geometry mirror together |

### Maw Carrier

| Stable reference | Explicit role/status | Animation truth | Verification status |
|---|---|---|---|
| `CAMPAIGN_ENEMY_DNA_CONDUCTOR` | Neutral carrier assembly, idle interior pulse, charge/deployment chamber, support owner, hit, damage, and death | Single frame; mouth/hatch opening is assembled from controlled scale/occlusion and effects, not claimed as authored frames | Verified active in the running carrier and signature presentation |
| `CAMPAIGN_ENEMY_CRESCENT_MINELAYER` | Bounded reinforcement formation | Single frame; deployment and travel are assembly motion | Verified active; deploy, activation, active collision, cap, and cleanup are engine-proven |

### Twin Meridian Sentinels

| Stable reference | Explicit role/status | Animation truth | Verification status |
|---|---|---|---|
| `CAMPAIGN_ENEMY_LASER_HUNTER` | Neutral assembly for both sentinels, idle eye/antenna motion, Sentinel Exchange emitter, support swap, hit, damage, and death | Single frame; one intentional horizontal mirror establishes handedness, while hover, blink, recoil, and failure are assembly/effect motion | Verified active; both-alive choreography and both survivor orientations are engine-proven |

### Prism Bloom

| Stable reference | Explicit role/status | Animation truth | Verification status |
|---|---|---|---|
| `CAMPAIGN_ENEMY_BULLET_RING_EMITTER` | Neutral bloom assembly, idle petal illumination, Bloom Ring emitter, support pulse, hit, damage, and death | Single frame; petal breathing/opening is an assembly-motion limitation | Verified active with the incomplete live ring and deterministic opening |
| `CAMPAIGN_ENEMY_PRISM_ARTILLERY` | Intentional alternate only; preserve for a future authored prism-core variant | Single frame and not an active part of this encounter | Audited, intentionally inactive; no utilization claim |

### Aegis Convoy Captain

| Stable reference | Explicit role/status | Animation truth | Verification status |
|---|---|---|---|
| `CAMPAIGN_ENEMY_SHIELD_RAMMER` | Captain neutral assembly, idle shield rotation, Command Formation signal, command burst, hit, damage, and death | Single frame; scan, shield rotation, recoil, and failure are assembly/effect motion | Verified active in the running captain, shield, and signature presentation |
| `CAMPAIGN_ENEMY_ORBIT_DISC` | Four bounded escort units in authored formations | Single frame; formation travel, passes, barrier, and loss of command are assembly motion | Verified active; escort threshold exposure and owner cleanup are engine-proven |

### Gridline Sentries

| Stable reference | Explicit role/status | Animation truth | Verification status |
|---|---|---|---|
| `CAMPAIGN_ENEMY_WALL_SNIPER_LEFT` | Vertical-axis sentry neutral assembly, idle grips/emitter, Grid Lock boundary, support travel, hit, damage, and death | Single frame; grip movement, emitter rotation, crawl, recoil, and failure are assembly/effect motion | Verified active with continuous owned boundary geometry |
| `CAMPAIGN_ENEMY_WALL_SNIPER_RIGHT` | Horizontal-axis sentry authored counterpart for the same roles | Single frame; same assembly-motion limitation | Verified active; safe-quadrant and either-owner survivor cleanup are engine-proven |

## Accepted shared presentation assets

Existing beam, projectile, spark, small-explosion, and electrical-effect textures remain shared presentation vocabulary. They must be referenced by their registered texture names in the runtime definition and captured in use; this document does not rename them or claim new generation. Directional projectile orientation, visible beam geometry, collision, and owner cleanup remain encounter validation gates.

| Encounter | Stable projectile binding | Stable telegraph binding | Explicit role/status |
|---|---|---|---|
| Fracture Engine Elite | `fracture-shard` → `prism-shard/violet` four-frame set | `fracture-warning` → `warning-ring-violet` | Ordered crossfire projectile and charge warning; approved existing runtime art |
| Aegis Brood Core | `aegis-pulse` → `ring-bomb/cyan` four-frame set | `aegis-warning` → `warning-ring-amber` | Guardian halo pulse and protection-state warning; approved existing runtime art |
| Railspine Wallcrawler | `railspine-needle` → `needle-bolt/red` four-frame set | `railspine-scan` → `rail-scan-red` | Support burst and rail warning; approved existing runtime art |
| Maw Carrier | `maw-seed` → `plasma-seed/lime` four-frame set | `maw-warning` → `warning-ring-amber` | Hatchline defense and deployment warning; approved existing runtime art |
| Twin Meridian Sentinels | `meridian-bolt` → `needle-bolt/cyan` four-frame set | `meridian-scan` → `rail-scan-cyan` | Role-exchange fire and relay warning; approved existing runtime art |
| Prism Bloom | `prism-petal` → `prism-shard/cyan` four-frame set | `prism-warning` → `warning-ring-violet` | Incomplete-ring petals and bloom warning; approved existing runtime art |
| Aegis Convoy Captain | `convoy-command-bolt` → `needle-bolt/gold` four-frame set | `convoy-warning` → `warning-ring-amber` | Command burst and formation warning; approved existing runtime art |
| Gridline Sentries | `gridline-bolt` → `needle-bolt/cyan` four-frame set | `gridline-scan` → `rail-scan-cyan` | Boundary support bolt and grid warning; approved existing runtime art |
| All eight | `shared-mini-boss-death` → existing seven-frame Pixi explosion set | — | Staged-death VFX; approved existing runtime art |

## Required proof before changing an asset row to verified

1. Inspect the exact stable texture at native size and inside the canonical 390×844 game arena.
2. Capture neutral/idle, signature charge, peak signature, support, hit, low health when used, and death/cleanup.
3. For a pair, capture both survivor outcomes; for guardians, capture full/partial/exposed; for walls, capture both authored sides and beam disappearance.
4. Verify accepted assets are bound by stable key or named texture, not gallery order, sheet position, or numeric index.
5. Confirm no invisible owned projectile, beam, guardian, reinforcement, socket, collision body, or compact bar remains after death or reconstruction.
6. Record deterministic route proof for every encounter seed without widening the portrait arena in a desktop host.

## Verification record

- All eight encounters were inspected live in the canonical 390×844 arena with their stable body, linked-unit, projectile, telegraph, compact-bar, and signature presentation active.
- The phone host renders the arena at 390×844. The wide host keeps the same portrait ratio and only enlarges the host presentation; it does not create wider gameplay geometry.
- The exact `GameEngine` route proof replays the real 51.24×63.44 player collision body, live member bodies, projectiles, beams, and reinforcements. All seven proof groups pass with the standard 3 px uncertainty and at least 6 px residual clearance.
- The proof covers both Fracture and Meridian survivor orientations, Aegis protection thresholds, both Railspine walls, either Gridline owner loss, Maw reinforcement deployment/activation/cap, and complete owner-scoped death cleanup.
- Fracture Crossfire now consumes its authored diagonal inset to preserve the readable center seam. Maw and Convoy use even support fans with an inner passage; collision sizes and proof thresholds were not reduced.
- Fresh browser verification after the final tuning produced no new warning or error logs.
- `game-config/campaign.json` contains none of the eight Sandbox event IDs. No Campaign, Weekly Streak, reward, progression, main-wave, Runner, or deployment operation is part of this work.

## Generation and archive record

- New sprites generated: none.
- New sprites accepted into runtime: none; the roster intentionally reuses the audited existing art above.
- Sprites archived or removed: none.
- Known art limitation: all Stage-20 encounter sprites listed above are single-frame. Their proposed life and mechanics depend on assembly motion and existing VFX until a gameplay review proves that true frame animation is necessary.

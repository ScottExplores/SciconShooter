# Revamp A — game feel, VFX, SFX

Implementation base: `54188fd6d0d055be036fecc135c1c06f1ba992ac` on `rv/A`.

## What changed

- Accepted bullet contacts drive a 60 ms white sprite silhouette, a small directional wobble, and oriented sparks. Shield plates produce a wider gold/white deflection and a metallic sound. Existing combat impact receipts remain the contact authority.
- Small, elite, and boss-part explosions share `ArcadeEffectPool`: original explosion frames, bounded additive light, one shockwave, outward sparks, and rotating debris. Removed the duplicate legacy kill ring.
- Boss deaths emit a 1.6 second chain scaled to the boss bounds. A fixed 24-tick half-rate interval provides 0.4 seconds of slow motion; the final white pulse is capped at 0.16 alpha, or 0.035 with reduced motion/shake. Legacy fullscreen flashes obey the same ceiling.
- Trauma uses squared amplitude, decays independently of gameplay, and caps at 5 world pixels. Reduced shake caps at 0.75 pixels; OS reduced motion disables camera shake. The existing Screen shake toggle still disables it entirely.
- Hit-stop now returns before advancing game time, cooldowns, or queued shots. Elite and part requests use 3/4 fixed ticks (50/67 ms); all existing hit-stop requests are capped at 4 ticks. Browser input handlers continue accepting steering.
- Cyan/white player cores and glow wakes; warm magenta enemy cores with dark outlines; orange aimed-round cores with larger halos. Existing sprite files and special large hazard telegraphs remain intact. Newly rendered player and wing shots get bounded muzzle flashes.
- Configured boss phase transitions clear hostile projectile entities in simulation and send up to 32 cosmetic score sparks toward the HUD. Player shots, destructible brood, enemies, and pickups survive the clear. No score or currency is fabricated by these sparks.
- Regular credits reuse existing burst physics and magnet easing. Boss/present showers retain their existing reward counts and motion. Coin pickup audio climbs a capped pentatonic ladder. Existing projectile-upgrade pickups show a large `POWER n` label and ring.
- A presentation-only x2–x10 kill chain has a 2.5 second timer bar and breaks on damage. Tactical/stage completion emits `PERFECT WAVE` when accepted damage is zero. Score labels can be hidden without hiding gameplay messages such as `+1 LIFE!`.
- Layered synthesized shots, hits, armor, three explosion weights, pickups, power-up, phase change, warning siren, and UI sounds feed the existing SFX bus. Synth voices cap at 24, noise buffers are reused, music ducks to 32% during warnings, and selected music/SFX volumes and mute remain authoritative. No audio graph is created before real user activation.
- Particle/light budgets drop to 65%, then 40%, after sustained frames over 20 ms for two seconds. Recovery requires six seconds below 17.5 ms. Resuming a background tab does not trigger quality changes or a burst backlog. Simulation dimensions, collision geometry, rewards, and gameplay RNG remain independent of visual quality.

## Files and shared hooks

New implementation is under `services/revamp/feel/`:

| File | Responsibility |
| --- | --- |
| `FeelRuntime.ts` | Fixed-step trauma, chain/pickup timers, slow motion, bounded immutable event receipts, reset generation |
| `FeelGameplay.ts` | Kill classification, phase cancellation, completion receipts, coin kick, aimed-shot tags |
| `FeelPresentation.ts` | Renderer-owned hit flashes/wobble, HUD, event cursor, projectile accents, muzzle hooks |
| `FeelEffects.ts` | Explosion tuning, directional impact math, score-spark easing, boss chain scheduler |
| `FeelSettings.ts` / `FeelSettingsControls.tsx` | Persisted accessibility and score-label toggles, OS motion preference, pause rows |
| `AdaptiveFeelQuality.ts` | Sustained frame-pressure detection and recovery hysteresis |
| `audioSynthesis.ts` | Layer recipes, pitch ladder, bounded WebAudio voice lifecycle |

Existing integration surfaces:

- `services/gameLogic.ts`: imports/owned runtime; run and wave reset; accepted damage; wave completion; trauma/hit-stop/update entry; regular and authored mini-boss death; configured phase boundary; part break; aimed volleys; coins; score text; projectile-upgrade pickup; armor contact metadata. Hook comments use `// REVAMP(A):`.
- `services/pixi/PixiGameRenderer.ts`: owned presenter and quality monitor; new projectile/view hooks; impact cursor; removal of stale-HP death rendering; render-clock update; accessibility cap; cleanup. Hook comments use `// REVAMP(A):`.
- `services/gameplay/CombatImpactBuffer.ts`: optional armored-contact metadata. Existing `CombatImpactPresentation` cursors and `BossImpactFeedbackRuntime` significant-damage/recoil calculations are reused unchanged.
- `services/pixi/ArcadeEffectPool.ts`: new tier/muzzle/pickup/score-spark APIs; quality scale; live overflow retirement; explicit display-object cleanup.
- `services/audioService.ts`: existing public sound API extended with synthesized cue routing, trusted activation, voice cleanup and warning ducking.
- `components/PauseMenu.tsx`: two settings rows. `index.tsx`: isolated development-only `?fxlab=1` route, outside desktop launch/providers/report monitoring. `App.tsx` is untouched.
- `components/FeelLab.tsx`: timed, repeatable effects, real projectile/HUD presenters, pool counters, low-FX and opt-in sound controls.

No art assets were deleted, replaced, or generated. No City Mechanical/scooter files, API handlers, economy rules, or deployment settings changed. Top-level `api/*.js` remains **12**. Nothing was pushed, deployed, or sent to external write APIs.

## How to test

```sh
node --test tests-revamp/A/*.test.mjs
npx vite build
npx tsc --noEmit
```

Validation: **32 focused tests pass**. Production Vite build passes with its existing chunk-size warning. TypeScript retains exactly the six baseline errors in `services/pixi/boss-rigs/UmbraNeedlewingArtwork.ts`: two absent director-data JSON imports and four resulting unknown-property errors. No new TypeScript diagnostics.

Run Vite and open `/?fxlab=1`. Optional `&effect=` values: `explosions`, `hits`, `armor`, `muzzle`, `projectiles`, `cancel`, `power`, `hud`, `boss`. Selecting a scene repeats it; Cycle scenes tours them. Sound previews defaults off. The lab is excluded from production builds.

Automated screenshots and actual gameplay smoke:

```sh
# Requires playwright-core plus local Chrome; overrides are optional.
REVAMP_BASE_URL=http://127.0.0.1:5173 \
REVAMP_QA_DIR=/tmp/scicon-feel-qa \
node tests-revamp/A/browser-smoke.mjs
```

This harness blocks every external request and all `/api/` traffic. Verified 390×844/DPR 2/touch and 1280×900 desktop lab scenes, aspect ratio, no browser exceptions, and a mobile combat flight. Additional 15-second steering capture reached 22 kills / 22 pickups. Session artifacts are in `/workspace/scicon-revamp/qa/A/`, including `browser-report.json`, `mobile-combat.png`, projectile/HUD screenshots, and the longer combat captures.

If the shared `node_modules` symlink makes Vite's default cache unwritable, start the same config with a local cache:

```sh
node --input-type=module -e "import {createServer} from 'vite'; const s=await createServer({cacheDir:'/tmp/scicon-A-vite-cache',server:{host:'127.0.0.1',port:5173}}); await s.listen(); s.printUrls();"
```

## Tuning knobs

- `FEEL_TUNING` in `FeelRuntime.ts`: chain window/cap, trauma decay/amplitude, elite/part stop, boss slow-motion duration.
- `EXPLOSION_TIERS`, `BOSS_CHAIN_DURATION_MS`, `BOSS_CHAIN_COUNT`, `BOSS_FLASH_MAX_ALPHA` in `FeelEffects.ts`: density, glow, rings, chain timing.
- `ArcadeEffectPool.setQuality`: base mobile caps 104/54, desktop 170/84; adaptive scale reduces these further. Base mobile light caps 5/3, desktop 12/6.
- `FEEL_QUALITY_TUNING`: downgrade/recovery thresholds. It never changes fixed-step simulation.
- `FeelPresentation.ts`: 60 ms flash, 180 ms damped wobble, local projectile accent dimensions, HUD position and banner durations.
- `audioSynthesis.ts`: `createCueLayers`, `FEEL_AUDIO_MAX_VOICES`, `PICKUP_LADDER_RESET_MS`, hull voice profiles; AudioService owns warning duck factor/time.
- Local storage `scicon:feel-settings:v1`: `reduceScreenShake`, `showScoreNumbers`. OS reduced motion is not overridden by storage.

## Known gaps and handoff

- Validation used headless Chrome/SwiftShader, not a physical mid-range Android device. GPU/frame-time and subjective audio mix still need an on-device pass; headless screenshots cannot prove acoustic quality.
- Articulated boss rigs retain their existing part-specific damage art/flash and significant-impact recoil; the new exact silhouette flash applies to sprite-backed views. Large authored beams and hazards retain their specialized presentation.
- Phase-cancel hook is at `applyConfiguredBossPhase`; future custom runtime phases should call `cancelPhaseBullets` when they introduce a transition outside that authority. The score sparks and kill-chain label are cosmetic; actual rewards remain unchanged.
- Boss defeat chains are presentation receipts emitted when final destruction is accepted. Existing bespoke Octarch/Singularity defeat cinematics finish before their final receipt; their established choreography is preserved.
- `docs/AI_COLLAB_WORKFLOW.md`, referenced by AGENTS/CLAUDE, was absent from the snapshot and workspace. The available instructions and explicit `rv/A` authorization were followed.
- The workspace denied staging: `Unable to create .../.git/worktrees/wt-A/index.lock: Read-only file system`. Approval escalation is unavailable. Original `rv/A` metadata is therefore unchanged, with all implementation files retained in this working tree. Logical local commits are packaged in `/workspace/scicon-revamp/qa/A/revamp-A.bundle`; `commit-log.txt` lists them. The bundle is based on the revision at the top of this file and can be fetched/cherry-picked into a writable clean checkout. This is a local artifact, not a push or deployment.

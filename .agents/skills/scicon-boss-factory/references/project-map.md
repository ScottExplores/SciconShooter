# SciCon Boss Factory project map

Read only the surfaces needed for the selected boss, but preserve these ownership boundaries.

## Canonical runtime

- `components/GameStage.tsx`: shared production and preview stage.
- `components/GameCanvas.tsx`: fixed-step lifecycle, preview commands, input, and snapshots.
- `services/gameLogic.ts`: stable simulation facade.
- `services/pixi/PixiGameRenderer.ts`: stable presentation facade.
- `services/gameplay/bosses/`: extracted boss runtime helpers, socket sampling, origin locks, and route proof.
- `services/pixi/boss-rigs/`: modular hierarchy, pose, socket, animation, and destruction presentation.

## Authoring source

- `director/src/tools/bosses/bossSandboxModel.ts`: test-boss definitions, attack sentences, and artwork registration.
- `director/src/tools/bosses/BossSandboxApp.tsx`: focused local test surface.
- `director/src/tools/bosses/bossSandboxArtworkAssets.ts`: complete integrity asset set.
- `director/server/prototypeAssetCatalog.mjs`: content-addressed loopback-only prototype assets.
- `game-config/bossAttackSentences.ts`: typed attack sentence and beat contracts.
- `game-config/bossTimeline.ts`: timeline primitives and validation.
- `game-config/movementPaths.ts`: normalized movement-path definitions.

## Art pipeline

- `director-data/prototype-assets/<boss-id>/`: ignored source/generated local art.
- `director-data/prototype-assets/<boss-id>/evidence/`: ignored reference comparison, motion contact sheet, per-attack gameplay captures, and visual-verification result.
- `director-data/prototype-assets/<boss-id>/<boss-id>.asset-usage.json`: explicit disposition for every accepted sprite/frame.
- `director-data/prototype-assets/<boss-id>/<boss-id>.rig-pivot-manifest.json`: hierarchy, pivots, anchors, transforms, sockets, layers, and source hashes.
- `director-data/prototype-assets/<boss-id>/<boss-id>.attack-sprite-map.json`: anatomy, animation, socket, telegraph, beat, route, recoil, recovery, and capture ownership for every attack.
- `tools/quantize-boss-pixel-art.mjs`: deterministic palette and alpha normalization.
- `tools/build-modular-boss-assets.mjs`: deterministic component packing and metadata.
- `tools/generate-boss-collision-masks.mjs`: alpha-derived collision masks.
- `sites/boss-test-runner/scripts/sync-runner-assets.mjs`: catalog-driven private Runner sync.

## Verification and evidence

- `director/tests/nullwakeFactoryRig.test.mjs`: benchmark art/rig registration example.
- `director/tests/nullwakeSafeRouteProof.test.mjs`: real compiled attack route proof example.
- `tests/bossAttackOriginLockRuntime.test.cjs`: telegraph-to-fire origin locking.
- `tests/bossSafeRouteProof.test.cjs`: analyzer behavior.
- `director/tests/bossSandboxSurface.test.mjs`: focused sandbox layout and controls.
- `docs/boss-factory/roster-classification.md`: keep/rebuild/archive roster decisions.

The boss package must also retain these visual artifacts under `evidence/`:

- `canonical-reference.png`
- `modular-neutral.png`
- `key-pose-contact-sheet.png`
- `mobile-gameplay.png`
- `attacks/<attack-id>/{preparation,telegraph,first-beat,peak-danger,recovery}.png`
- `visual-verification.md`

Never make `director-data`, local APIs, private Runner assets, or Boss Sandbox routes part of the production game build.

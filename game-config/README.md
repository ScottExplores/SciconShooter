# Scicon Shooter campaign configuration

`campaign.json` is the stage and internal-wave source of truth used by the real `GameEngine` and the local Scicon Level Editor. The persisted key remains `levels` for compatibility, but each level is presented to players as a Stage.

## Shape

- A campaign contains ordered `levels`, which are the player-facing Stages.
- The campaign-level `recordCard` presentation feeds the Director preview, in-game mission record, and NFT/share SVG renderer.
- A Stage owns its background, music cue, difficulty, score target, available power-ups, scorecard presentation, and ordered internal `waves`.
- An internal wave owns its active duration, stage-boundary timing, threat cap, score multiplier, and ordered `events`.
- Event kinds are `spawn`, `boss`, `asteroid-belt`, `powerup`, and `recovery`.
- JSON stores constrained catalog IDs such as `ENEMY_JOURNAL_FRAMES` or `gatekeeper`; arbitrary asset paths and executable behavior are rejected.
- Spawn events select a reusable formation grammar: row, V, sine, pincer, grid, diamond, or spiral. The runtime owns the shared enter, assemble, dive, and return behavior.
- `hudAssets.bombIconAssetKey` selects the bomb control artwork used by the shared real-game HUD.
- Optional normalized `spawnAnchor` points power visual placement, while bounded `spriteStyle` values change artwork without changing collision boxes.

The checked-in revision defines five Stages: Open Orbit, Citation Storm, Paywall Siege, Open Galaxy, and Bastion Protocol. Each Stage is split into tactical internal waves; only the final internal wave triggers the Stage completion/departure flow. Difficulty defaults to `1` because each event already contains its concrete combat values.

## Validation and runtime

- `types.ts` defines the shared model.
- `catalog.ts` maps safe IDs to the real assets and runtime types.
- `generated-assets.json` is the validated, role-constrained catalog for generated enemy, boss, asteroid, HUD, player, background, and scorecard art. Generated PNG paths never appear directly in `campaign.json`.
- `validate.ts` checks IDs, references, timing, ranges, spawn weights, weapons, and boss phase ordering.
- `services/levelConfig.ts` validates `campaign.json` before the game can use it.
- `services/gameLogic.ts` reads the same configuration for normal gameplay and editor previews.

## Editing safely

Open `http://127.0.0.1:5174/level-editor` through the Scicon Director desktop shortcut. Use **Place** to select and move configured gameplay groups, **Sprite Generator** for prompt-generated or local catalog art, and **Scorecard** for the shared record surface. Unsaved changes exist only in the browser preview. **Apply to game** validates and atomically updates `campaign.json`, while creating immutable local snapshots under ignored `director-data/game-campaign`. **Revert** rereads the tracked file, and **History** can roll a prior snapshot forward as a new revision.

The editor server binds only to loopback, cannot be built for Vercel, and has no wallet, chain, Supabase, or production-write dependencies.

# Scicon Shooter campaign configuration

`campaign.json` is the mission and internal-wave source of truth used by the real `GameEngine` and the local Scicon Director. Persisted `levels` keys and historical `stage-*` IDs remain compatibility identifiers; each level is presented to players and editors as a Mission.

## Shape

- A campaign contains ordered `levels`, which are the player-facing Missions. Keep the `levels` property and existing `stage-*` IDs unchanged for compatibility.
- The campaign-level `recordCard` presentation feeds the Director preview, in-game mission record, and NFT/share SVG renderer.
- A Mission owns its background, legacy music catalog ID, difficulty, score target, available power-ups, scorecard presentation, and ordered internal `waves`. Background music playback is intentionally disabled; the ID remains for content compatibility.
- An internal wave owns its active duration, mission-boundary timing, threat cap, score multiplier, and ordered `events`.
- Event kinds are `spawn`, `boss`, `asteroid-belt`, `supply-drop`, `powerup`, and `recovery`.
- JSON stores constrained catalog IDs such as `ENEMY_JOURNAL_FRAMES` or `gatekeeper`; arbitrary asset paths and executable behavior are rejected.
- Spawn events select a reusable formation grammar: row, V, sine, pincer, grid, diamond, or spiral. The runtime owns the shared enter, assemble, dive, and return behavior.
- `hudAssets.bombIconAssetKey` selects the bomb control artwork used by the shared real-game HUD.
- Optional normalized `spawnAnchor` points power visual placement, while bounded `spriteStyle` values change artwork without changing collision boxes.

The checked-in revision defines ten five-depth sectors, fifty main-route Missions, and ten alternate-route Mission definitions. Regular Missions use four seamless tactical waves in roughly 43 seconds of authored clock time. Sector finales use one active 12-second intercept followed directly by the major boss. A wave is an encounter-organizing boundary only: player shots and flight continue through it, while only the final wave can trigger Mission completion and departure.

Dedicated recovery waves are removed. Recovery drops now arrive inside active pressure, early sectors keep wider two-group teaching windows, and sector 7-10 pressure/climax waves can layer a staggered third formation without bypassing threat, shooter, or mobile-performance admission. Later follow-up groups still arrive inside the active clock so strong players do not wait through an empty timer. Blocking asteroid deluges, elite mass assaults, multi-row bastions, and increasingly mobile bosses all use the same validated event grammar as the opening Campaign.

## Validation and runtime

- `types.ts` defines the shared model.
- `catalog.ts` maps safe IDs to the real assets and runtime types.
- `generated-assets.json` is the validated, role-constrained catalog for generated enemy, boss, asteroid, Supply Drop, HUD, player, background, and scorecard art. Generated PNG paths never appear directly in `campaign.json`.
- `validate.ts` checks IDs, references, timing, ranges, spawn weights, weapons, and boss phase ordering.
- `services/levelConfig.ts` validates `campaign.json` before the game can use it.
- `services/gameLogic.ts` reads the same configuration for normal gameplay and editor previews.

## Editing safely

Open `http://127.0.0.1:5174/level-editor` through the Scicon Director desktop shortcut. Use **Place** to select and move configured gameplay groups, **Sprite Generator** for prompt-generated or local catalog art, and **Scorecard** for the shared record surface. Unsaved changes exist only in the browser preview. **Apply to game** validates and atomically updates `campaign.json`, while creating immutable local snapshots under ignored `director-data/game-campaign`. **Revert** rereads the tracked file, and **History** can roll a prior snapshot forward as a new revision.

The editor server binds only to loopback, cannot be built for Vercel, and has no wallet, chain, Supabase, or production-write dependencies.

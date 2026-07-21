# Scicon game-building system

This document records the reusable method demonstrated by the current Scicon Shooter repository. It is a living architecture map, not a claim that every future game should copy the same stack.

## What we are building

Scicon Shooter is a browser arcade game whose product loop, gameplay runtime, local authoring environment, verified score backend, Base features, and marketing truth rules are intentionally separated. The reusable advantage is not one mechanic; it is the set of boundaries that lets mechanics, art, authoring, and product systems evolve without silently diverging.

## The method

1. Keep play immediate and move identity or wallet steps to a natural boundary.
2. Put mechanics in a simulation layer and presentation in a renderer layer.
3. Let React own mounting, input, resize, and low-frequency UI state rather than per-frame entity state.
4. Drive levels and waves from strict configuration with typed catalogs and cross-field validation.
5. Render the same canonical game surface in production and the local editor.
6. Make local authoring safe: loopback-only, validated, atomic, versioned, hash-checked, reversible, and excluded from production.
7. Test product contracts, not just individual functions: pacing, phase ordering, lifecycle cleanup, editor parity, asset constraints, truthful records, and release boundaries.
8. Keep public and onchain claims narrower than the evidence. A verified browser receipt is not the same as fully server-authoritative gameplay; a temporary leader is not a champion; a selected proposal is not funded until its transaction confirms.

## Current architecture map

- `game-config/campaign.json`: level, wave, event, scorecard, HUD, and catalog selections.
- `game-config/types.ts`, `catalog.ts`, and `validate.ts`: data contracts and safe asset/behavior references.
- `services/gameLogic.ts`: game simulation, encounters, collisions, scoring, and runtime state.
- `services/pixi/`: manually driven Pixi presentation, environment, texture bank, and pooled effects.
- `components/GameCanvas.tsx`: fixed-step scheduling, input, resize, adaptive performance, cleanup, and UI synchronization.
- `components/GameStage.tsx`: shared canonical gameplay plus HUD.
- `components/GameEditorCanvas.tsx` and `director/`: draft injection and local game-first authoring.
- `director/src/combat-lab/`: source-backed content discovery, isolated real-runtime experiments,
  local test presets, and validated promotion into a Level Editor draft.
- `api/`, `supabase/`, and `contracts/`: receipts, leaderboard, competition state, records, and Base boundaries.
- `tests/` and `director/tests/`: product contract and security coverage.

## Current verified baseline

On July 20, 2026, the working tree passed root TypeScript checking, lint, 283 root tests, 51 Director tests, and the production Vite build. The build also verified that no Director or Combat Lab files or markers reached `dist`.

The build reported large-chunk warnings: the gameplay chunk was 625.54 kB and the wallet chunk 631.55 kB after minification. These are performance follow-ups, not release failures by themselves.

## How this thread should learn

After each meaningful game change:

1. Identify the owning layer and source of truth.
2. Record any new invariant that future work must preserve.
3. Add or update a focused test that proves the invariant when practical.
4. Update the reusable skill only when the lesson generalizes beyond one temporary implementation detail.
5. Keep project-specific facts in this repository and generic workflow in the installed skill.

The installed skill is `build-pixi-arcade-games` under the local Codex skills directory. Its audit script is read-only and can be run against this or another TypeScript game repository.

## Combat iteration boundary

The Combat Lab follows the same seam as the Level Editor instead of maintaining a
preview simulator. It clones the validated campaign, narrows one real wave or event,
and injects that clone into the canonical game stage. Boss phase resolution and rig
selection therefore remain simulation behavior, while the Lab owns only selection,
safe form controls, read-only telemetry, and local experiment persistence.

Promotion is intentionally two-step. The Lab may generate a complete validated
campaign draft with collision-safe remapped IDs, but only the Level Editor may apply
that draft to `game-config/campaign.json`. The production build scanner rejects the
Lab route, title, storage key, and output paths so development tooling cannot leak
into the shipped bundle.

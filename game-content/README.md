# SciCon Shooter authoring package foundation

This directory reserves the future split authoring package. It is intentionally
inactive: `game-config/campaign.json` remains the only runtime and Director source of
truth, and no production module imports this directory.

The schema-v1 migration in
`game-config/migrations/schemaV1ContentPackage.mjs` can decompile the current
campaign into deterministic in-memory resources:

- `missions`: Mission metadata plus ordered `waveIds`
- `waves`: wave metadata, ordered `eventIds`, and non-boss events
- `bosses`: boss events with explicit Mission and wave parents

`game-config/compiler/index.mjs` resolves those references, reports duplicates,
missing references, parent mismatches, and orphan resources, then reconstructs one
schema-v1 runtime campaign. Resource array/file order is not authoritative; explicit
ID lists preserve gameplay order.

No generated resource files should be checked in until migration parity, shared
validation, workspace apply transactions, and a freshness check are wired and
approved. When that later gate is complete, the manifest status can change and the
`missions/`, `waves/`, and `bosses/` directories can become the editable source.

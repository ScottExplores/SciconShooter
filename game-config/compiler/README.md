# Game content package compiler

This compiler is an opt-in migration foundation. It is not imported by the runtime
and does not write `campaign.json`.

The package keeps ordering in explicit reference lists:

```text
manifest.missionIds
  -> mission.waveIds
    -> wave.eventIds
```

The manifest also records `campaignFieldOrder`, including the position of the
extracted `levels` collection, so revision-22 root catalogs compile back into the
same byte order as the tracked schema-v1 campaign.

Mission and wave payloads retain their schema-v1 runtime fields minus nested arrays.
Non-boss events stay with their wave; boss events are separate resources with
explicit Mission and wave parents. Compilation rejects open, duplicate, multiply
owned, or orphaned references before reconstruction.

Use `decompileSchemaV1Campaign(campaign)` followed by
`compileContentPackage(package)` for a lossless schema-v1 round trip. Use
`serializeCompiledCampaign` only when deterministic key-sorted serialization is
needed; it does not replace the checked-in runtime file.

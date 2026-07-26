# Scicon Director local API

The Director API is a Vite development-server middleware mounted only at
`/__director`. It is not a Vercel function and has no build/deployment entrypoint.
The Vite server binds to `127.0.0.1:5174`.

## Request boundary

- Every request must use a loopback `Host` (`127.0.0.1`, `localhost`, or `::1`).
- If an `Origin` header is present, it must exactly match the loopback `Host` and port.
- Every `POST`, `PATCH`, or `DELETE` must send both `Content-Type: application/json` and
  `X-Scicon-Director: local`.
- Mutation bodies are capped at 256 KiB.
- The server resolves all data paths beneath `director-data`; version, review, and
  configuration identifiers are allowlisted before becoming path segments. The game
  campaign integration has one additional allowlisted target inside the repository:
  `game-config/campaign.json`.
- Responses are `Cache-Control: no-store`.

Client helper:

```ts
const mutateDirector = (path: string, body: unknown, method = 'POST') =>
  fetch(`/__director${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Scicon-Director': 'local'
    },
    body: JSON.stringify(body)
  });
```

## Routes

### `GET /__director/bootstrap`

Returns the active `scorecard` and `waveCampaign` payloads, sample runs, reviews,
active version IDs, version summaries, any local drafts, and explicit safety flags.
On a brand-new data directory, three local wave-review examples (Mini-boss,
Asteroid belt, and Gatekeeper) are seeded once; an existing review store is never
replaced during initialization.

### `POST /__director/drafts/:kind`

`:kind` is `scorecard` or `wave-campaign`.

```json
{
  "payload": {},
  "baseVersionId": "scorecard-000001-..."
}
```

Validates and atomically writes `director-data/workspace/:kind.draft.json`.
`baseVersionId` is optional; when supplied it provides optimistic concurrency.

### `DELETE /__director/drafts/:kind`

Clears the saved draft and resets the editor to its active local revision. The JSON
body contains `baseVersionId`, so a stale tab cannot clear a newer revision's draft.

### `POST /__director/publish/:kind`

```json
{
  "payload": {},
  "baseVersionId": "scorecard-000001-...",
  "changeNote": "Increase score contrast"
}
```

Validation happens before any write. Publishing creates a new immutable envelope
under `director-data/versions/:kind`, records a SHA-256 payload hash, advances only
the local manifest, and clears that kind's draft. It does not change game runtime
files, Git, Vercel, a database, or a chain.

### `POST /__director/rollback/:kind`

```json
{
  "versionId": "scorecard-000001-...",
  "baseVersionId": "scorecard-000003-...",
  "changeNote": "Restore approved scorecard"
}
```

Rollback never rewrites history. It copies the selected payload into a new
revision and records the selected ID in `rollbackOf`.

### `GET /__director/versions/:kind`

Returns `{ kind, activeVersionId, versions }`; `versions` contains complete,
hash-checked envelopes ordered newest first.

### `GET /__director/reviews`

Returns all local visual change requests in sequence order.

### `POST /__director/reviews`

```json
{
  "surface": "wave",
  "configVersion": "wave-campaign-000001-...",
  "target": "Wave 2 / asteroid belt",
  "note": "Increase the warning contrast.",
  "status": "open",
  "anchor": { "x": 0.64, "y": 0.31 }
}
```

`configVersion` may be omitted to reference the active version for the selected
surface. `status` may be omitted or set to `open`; IDs, sequence numbers, timestamps,
and initial status are assigned by the server.

Live level-preview pins reuse this route with `surface: "wave"` and an optional
immutable `context` containing the campaign ID/revision/content hash, level/wave/event
IDs and labels, elapsed preview seconds, and a `draft` flag. Applied
`game-campaign-...` references are hash-verified against the active local version.
Before the first apply, the server verifies a deterministic
`game-campaign-disk-r<revision>-<hash>` reference against the tracked campaign file.
Dirty previews use `game-campaign-draft-r<revision>-<hash>`; the request includes the
draft campaign only long enough for the server to validate it and recompute its
canonical hash. The draft payload is discarded, while the exact hash remains on the
review context.
Legacy reviews without `context` remain unchanged.

### `PATCH /__director/reviews/:id`

Accepts one or more of `target`, `note`, `anchor`, and `status`. Resolving adds a
server timestamp; reopening removes it. Identity and configuration references are
immutable.

### `GET /__director/real-runs`

Makes GET-only requests to a compile-time fixed origin,
`https://www.sciconshooter.xyz`, and only to `/api/leaderboard` and
`/api/record-metadata?runId=<uuid>`. It exposes normalized display snapshots and
never forwards wallet addresses, receipt hashes/tokens, proposal data, or arbitrary
upstream fields. Redirects are rejected. There is no generic proxy and no upstream
write method.

### `GET /__director/health`

Returns local-only safety flags without accessing production services.

## Real game campaign file API

These routes are local Vite middleware only. They never call a network service, API,
database, wallet, or chain. Mutating routes require the same loopback origin, JSON
content type, body limit, and `X-Scicon-Director: local` header described above.

### `GET /__director/api/game-campaign`

Reads and validates the tracked `game-config/campaign.json` file. It does not return a
Director fixture or draft.

```json
{
  "ok": true,
  "campaign": {},
  "contentHash": "sha256:...",
  "activeVersionId": "game-campaign-20260711T120000000Z-...",
  "revision": 2,
  "updatedAt": "2026-07-11T12:00:00.000Z",
  "sourcePath": "game-config/campaign.json",
  "diskMatchesManifest": true
}
```

`activeVersionId` is `null` and `diskMatchesManifest` is `false` before the first
Director apply or after an external/manual file edit. Revert in the client is this
same GET request, so unsaved browser edits are discarded without a server mutation.

### `POST /__director/api/game-campaign/apply`

```json
{
  "campaign": {},
  "expectedContentHash": "sha256:...",
  "changeNote": "Tune opening wave"
}
```

The server treats `revision` and `updatedAt` as authoritative metadata, incrementing
the current disk revision and assigning the local server timestamp. It validates the
normalized candidate before any write. `expectedContentHash` provides optimistic
concurrency and returns `409` when the tracked file changed. A successful request
atomically replaces `game-config/campaign.json`, creates an immutable hash-checked
snapshot under `director-data/game-campaign/versions`, and atomically advances
`director-data/game-campaign/manifest.json`. The first successful apply also captures
the pre-edit tracked file as a baseline version.

Success is `201`:

```json
{
  "ok": true,
  "message": "Applied game campaign revision 2 to game-config/campaign.json",
  "campaign": {},
  "contentHash": "sha256:...",
  "activeVersionId": "game-campaign-...",
  "version": {}
}
```

Invalid candidates return `422` with `{ "ok": false, "error": "...", "errors": [] }`.
Neither the tracked file nor manifest is changed on validation failure.

### `GET /__director/api/game-campaign/versions`

Returns the current disk hash, active version ID, and newest-first immutable metadata
history. Payloads are omitted from the list response.

```json
{
  "ok": true,
  "activeVersionId": "game-campaign-...",
  "currentContentHash": "sha256:...",
  "versions": [
    {
      "id": "game-campaign-...",
      "revision": 2,
      "parentId": "game-campaign-...",
      "rollbackOf": null,
      "source": "apply",
      "createdAt": "2026-07-11T12:00:00.000Z",
      "changeNote": "Tune opening wave",
      "contentHash": "sha256:..."
    }
  ]
}
```

### `POST /__director/api/game-campaign/rollback`

```json
{
  "versionId": "game-campaign-...",
  "expectedContentHash": "sha256:...",
  "changeNote": "Restore approved opening"
}
```

The target snapshot is path-allowlisted, structurally validated, and content-hash
verified. Rollback never rewrites history: it applies the target payload with a new
revision/timestamp and creates a new snapshot whose `source` is `rollback` and whose
`rollbackOf` references the selected version. Success is `201` with the same shape as
the apply response.

## Versioned active workspace API

The active resource workspace is stored only under
`director-data/workspace/game-campaign`. It starts from the validated tracked
`game-config/campaign.json`, autosaves a composed draft with an atomic recovery
journal, and never writes the tracked campaign until the explicit apply route is
called.

Every workspace mutation requires:

```json
{
  "expectedBaseContentHash": "sha256:...",
  "expectedDraftRevision": 4,
  "idempotencyKey": "caller-generated-stable-key"
}
```

The base hash detects tracked-file changes, the monotonically increasing draft
revision detects stale tabs, and the idempotency key makes an exact retry return the
original result without applying the mutation twice. Resource edits retain their
base resource hash, so rebase rejects an overlapping external edit instead of
silently overwriting it.

### `GET /__director/api/v1/workspace`

Creates or reads the active workspace. The response includes `baseContentHash`,
`draftRevision`, `draftContentHash`, `hasChanges`, `stale`, changed resource
references, and the validated composed `draftCampaign`.

### Resource routes

- `GET|PUT /__director/api/v1/workspace/levels/:levelId`
- `GET|PUT /__director/api/v1/workspace/missions/:levelId` (terminology alias)
- `GET|PUT /__director/api/v1/workspace/levels/:levelId/waves/:waveId`
- `GET|PUT /__director/api/v1/workspace/levels/:levelId/waves/:waveId/boss-events/:eventId`

`PUT` accepts `{ "resource": {}, ...mutationPreconditions }`. Route IDs and payload
IDs must match. Boss-event payloads must retain `kind: "boss"`. Each resource is
size-bounded, composed into the full draft, and checked by the authoritative game
campaign validator before it is autosaved. Existing IDs are replaced; a new stable
ID is appended and must still satisfy all campaign ordering and reference rules.

### `POST /__director/api/v1/workspace/rebase`

Replays the ordered local resource edits onto the latest tracked campaign. If a
parent resource disappeared or the composed result is invalid, rebase fails without
changing the saved workspace.

### `POST /__director/api/v1/workspace/reset`

Discards all resource edits and adopts the latest validated tracked campaign while
continuing the workspace draft-revision sequence.

### `POST /__director/api/v1/workspace/apply`

Validates the complete composed draft again, requires a non-stale base and at least
one edit, then delegates to `GameCampaignRepository.applyCampaign`. The existing
immutable baseline/version/manifest workflow remains authoritative. After success,
the workspace adopts the applied campaign as its new base and clears its edit list.
A durable apply-intent journal lets startup finish an interrupted version/campaign/
manifest promotion and restore the original idempotent response. If the tracked
campaign diverged from both the old base and intended candidate, recovery archives
the intent for inspection and leaves the newer disk content untouched.

## Local playtest sessions

The canonical preview can save bounded gameplay telemetry beneath the ignored
`director-data/playtest-sessions` directory. This is development evidence, not
product analytics: no event is uploaded, forwarded to `/api/events`, joined to a
wallet, or written to a production service.

- `GET /__director/api/v1/playtest-sessions` lists summaries and derived metrics
  without returning retained events.
- `POST /__director/api/v1/playtest-sessions` validates and saves one session.
- `GET /__director/api/v1/playtest-sessions/:sessionId` returns one complete local
  session for inspection or export.
- `DELETE /__director/api/v1/playtest-sessions/:sessionId` deletes one local
  session.

Mutation routes retain the normal loopback, same-origin, JSON content-type, and
`X-Scicon-Director: local` requirements. A session is capped at 1,024 retained
events and 512 KiB, and storage is capped at 100 sessions. The server recomputes
DPS, boss damage, elapsed/survival time, deaths, phase transitions, wave
completions, and completion state from the bounded runtime snapshot.

## Validation and storage

JSON Schemas live in `director/schemas`. Additional cross-field checks enforce
unique IDs, complete scorecard metrics, valid background references, phase editor
requirements, normalized enemy/power-up weights, inter-wave segment types, and
traversal-free `/game-art/...` assets. Published envelopes are verified on read, so
manual payload edits without a matching hash are rejected.

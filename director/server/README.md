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
  configuration identifiers are allowlisted before becoming path segments.
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

## Validation and storage

JSON Schemas live in `director/schemas`. Additional cross-field checks enforce
unique IDs, complete scorecard metrics, valid background references, phase editor
requirements, normalized enemy/power-up weights, inter-wave segment types, and
traversal-free `/game-art/...` assets. Published envelopes are verified on read, so
manual payload edits without a matching hash are rejected.

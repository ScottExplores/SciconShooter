# Read-only Pages previews

Pages previews include the complete Vite asset output, including Scott's art,
audio and fonts. Gameplay runs locally; scores, claims, wallet API writes and
analytics are disabled. A small **TEST BUILD — scores not submitted** badge
identifies the build. Production assets are never proxied.

`*.pages.dev` enables preview mode automatically. Set `VITE_PREVIEW_MODE=true`
at build time for a custom preview hostname or a local smoke test. `false` does
not disable the protection on Pages. Do not provide production secrets to Pages.

## Build and local verification

From the repository root:

```sh
VITE_PREVIEW_MODE=true npx vite build
node --test tests-revamp/E/preview.test.mjs
```

To run the actual Functions middleware locally with Wrangler installed, use
`deploy/pages` as the working directory (Wrangler discovers its `functions`
directory there; do not copy Functions into `dist`):

```sh
cd deploy/pages
npx wrangler pages dev ../../dist
```

The middleware imports the shared route policy from
`services/revamp/preview/readOnlyPolicy.js`; keep the repository layout when
bundling Functions. For an authorized future Wrangler upload, use the same
working directory and the `../../dist` output path. This change does not deploy
or create a Pages project. A plain asset-only upload omits the middleware and
cannot provide the public API proxy.

Before connecting previews to production, production must include the audited
read-only `weekly-competitions` handler and the `previewReadOnly=1` proposal-feed
guard. Older versions may write during those GET requests. The proxy always
adds that flag; it cannot retrofit the guard into an older deployed server.

## Request boundary

| Route | Allowed GET query | Cache TTL |
| --- | --- | --- |
| `/api/leaderboard` | `weekKey` | 15 seconds |
| `/api/weekly-competitions` | None | 30 seconds |
| `/api/researchhub-proposals` | `includeProposalIds` | 120 seconds |
| `/api/record-metadata` | `runId`, `ship` | 300 seconds |
| `/api/record-card` | `runId`, `ship` | 300 seconds |

Every non-GET `/api/*` request, including HEAD and OPTIONS, returns HTTP 503
`{"error":"PREVIEW_READ_ONLY"}`. Other API paths and unknown query parameters
also return 503. In particular, GET finalization/cron/admin routes are blocked.
Add a new public GET to the shared policy only after auditing its side effects.

Reads target only `https://www.sciconshooter.xyz`; cookies, authorization headers
and redirects are not forwarded. Only successful public responses enter the
Pages cache. `private`, `no-store`, `no-cache`, `Set-Cookie`, and sensitive `Vary`
responses bypass caching. The TTL table is an upper bound; an upstream no-store
directive takes precedence. Cache failures fall back to a fresh read. Upstream
failures/timeouts return a bounded JSON 502; UI cache/empty states remain usable.

The pre-mount browser guard applies the same route policy and rejects writes
even if a build-time API URL points directly at production. It routes public
reads through the preview origin and drops credentials. Receipt services create
local practice sessions without reserving server attempts; score and claim
services return preview-specific messages before requesting a wallet signature.
The middleware remains the authoritative network boundary for Pages clients.

Smoke-check at phone width: open Home, Signals, weekly top five and winner
archive; start/end a practice run; confirm the badge, a local receipt and zero
POSTs to production. In DevTools, POST `/api/leaderboard` and GET
`/api/finalize-weekly-competition` must both return `PREVIEW_READ_ONLY`.

Cloudflare references: [Pages middleware](https://developers.cloudflare.com/pages/functions/middleware/),
[Functions API and `next`/`waitUntil`](https://developers.cloudflare.com/pages/functions/api-reference/),
[Workers Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/).

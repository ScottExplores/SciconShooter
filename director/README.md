# Scicon Director

Scicon Director is a local-only authoring workspace for scorecards, wave campaigns,
and visual review requests. It is deliberately separate from the public game build.

## View it locally

From the repository root:

```powershell
npm install
npm run director:dev
```

Then open `http://127.0.0.1:5174` in a browser. The server binds only to loopback
and uses a strict, separate port. Stop it with `Ctrl+C` in the terminal that started
it.

The Director has no deployment build. `npm --prefix director run build` exits with
an error by design, `.vercelignore` excludes the package and its data, and the root
production build verifies that no Director files or markers reached `dist`.

## Local data model

- `director-data/fixtures` contains validated starter configurations and sample runs.
- `director-data/manifests` points to the active local scorecard and wave revisions.
- `director-data/versions` contains immutable, hash-checked configuration envelopes.
- `director-data/reviews/index.json` stores version-linked visual change requests.
- `director-data/workspace` stores ignored drafts while the Director is running.

Publish and rollback only create local configuration revisions. Real-run loading is
fixed-origin, GET-only, and sanitized. The Director has no production database write,
wallet, signing, or mainnet transaction path.

See [server/README.md](server/README.md) for API and safety details and
[design/design-spec.md](design/design-spec.md) for the interface model.

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

The game-first editor is at `http://127.0.0.1:5174/level-editor`. Its center stage
is the real `GameStage`, not a mock dashboard. Select levels and waves on the left,
click gameplay groups in the game view, and edit their settings on the right. The
same campaign, renderer, sprites, HUD, boss art, and scorecard presentation are used
by the real game.

## Windows one-click access

Run the shortcut installer once from the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/install-scicon-director-shortcuts.ps1
```

It creates:

- `Scicon Director` on the desktop. Double-clicking it starts the local server if
  necessary and opens the Director in the default browser.
- `Scicon Director Auto Start` in the current user's Windows Startup folder. It
  starts the server silently after Windows sign-in following a restart, but does
  not open a browser window automatically.

The launcher refuses to use anything except the Director's loopback health check.
Startup logs live in `%LOCALAPPDATA%\Scicon Director`. To disable automatic startup,
disable or remove `Scicon Director Auto Start` from the Windows Startup folder; the
desktop shortcut will continue to work.

The Director has no deployment build. `npm --prefix director run build` exits with
an error by design, `.vercelignore` excludes the package and its data, and the root
production build verifies that no Director files or markers reached `dist`.

## Prompt-based Sprite Generator

Open **Sprite Generator** from an enemy, boss, asteroid, HUD icon, or scorecard art
setting. Generated images enter the same validated asset catalog as the built-in
game art, so they can be selected, previewed in the real game surface, dragged where
supported, and applied with the campaign.

To enable new generations on this computer:

```powershell
Copy-Item director/env/.env.example director/env/.env.local
notepad director/env/.env.local
```

Set `OPENAI_API_KEY` in that local file and restart the Director. The key stays on the
loopback server and is never exposed as a Vite browser variable. Generation uses the
OpenAI API credits for that key. Resulting PNGs are stored under
`public/game-art/generated`, their safe catalog entries are stored in
`game-config/generated-assets.json`, and prompt metadata remains in ignored local
Director data. Content hashes make generated filenames immutable.

The checked-in **Biohazard bomb** is the first generated HUD asset and replaces the
old drawn bomb icon in the shared `UIOverlay`. It remains usable even when no API key
is configured.

## Local data model

- `director-data/fixtures` contains validated starter configurations and sample runs.
- `director-data/manifests` points to the active local scorecard and wave revisions.
- `director-data/versions` contains immutable, hash-checked configuration envelopes.
- `director-data/reviews/index.json` stores version-linked visual change requests.
- `director-data/workspace` stores ignored drafts while the Director is running.

Publish and rollback only create local configuration revisions. Real-run loading is
fixed-origin, GET-only, and sanitized. The Director has no production database write,
wallet, signing, or mainnet transaction path.

## One shared game surface

`components/GameStage.tsx` is the canonical gameplay surface for both the public game
and the local Director. It composes the real `GameCanvas` and `UIOverlay`, so renderer,
HUD, sprite, effect, and asset changes automatically appear in both places. The
Director's `GameEditorCanvas` is only a local preview-state wrapper around that stage;
it does not contain a second renderer.

The Director can inject its in-memory draft campaign, selected level, and selected
wave into the shared canvas for immediate preview. The public game keeps the validated
tracked campaign as its default. Wallet, leaderboard, score submission, minting, and
other production integrations remain outside `GameStage` and are never imported into
the Director.

See [server/README.md](server/README.md) for API and safety details and
[design/design-spec.md](design/design-spec.md) for the interface model.

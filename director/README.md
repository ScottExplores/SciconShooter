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

The root route opens the **SciCon Developer Hub**, a shared local shell for every
authoring and testing surface. Stable routes are registered in
`director/src/app/authoringRegistry.ts`:

| Route | Current surface |
| --- | --- |
| `/missions` | Mission Builder |
| `/waves` | Mission Builder with the editable, time-scaled wave timeline |
| `/bosses` | Boss Library, typed track editor, and canonical boss preview |
| `/formations` | Combat Lab and Formation Workshop |
| `/sandbox` | Combat Lab |
| `/loadouts` | Combat Lab |
| `/assets` | Combat Lab |
| `/analytics` | Local playtest metrics, comparison, and export |
| `/reviews` | Mission Builder review surface |
| `/studio` | Read-only legacy migration reference |

The old `/level-editor` and `/combat-lab` URLs remain compatibility aliases for
`/missions` and `/sandbox`. All routes retain the same loopback-only status and
production exclusion boundary.

The game-first **Mission Builder** is at `http://127.0.0.1:5174/missions`. Its center
stage is the real `GameStage`, not a mock dashboard. Select missions and waves on the
left, click gameplay groups in the game view, and edit their settings on the right.
The same campaign, renderer, sprites, HUD, boss art, and scorecard presentation are
used by the real game.

The **Wave** route adds a time-scaled, multi-lane encounter timeline. Clips remain
ordinary validated campaign events: dragging or using the keyboard changes their
authored start time, then the existing workspace autosave and canonical preview
consume the same change.

The **Boss** route adds synchronized movement, attack, laser, summon, defense, and
presentation tracks. Bosses are composed from an allowlisted primitive registry;
the editor does not accept scripts or arbitrary JSON. Damaging clips require linked
warnings, and validation bounds repeats, simultaneous entities, references, and
projectile budgets before a draft reaches the game preview.

## Combat Lab

Open `http://127.0.0.1:5174/sandbox` to iterate on combat before promoting an
idea into a campaign wave. The Lab is a permanent, development-only route inside
the loopback Director; it is not a second app, renderer, or production entrypoint.

The Library is projected from the tracked campaign and the real enemy, formation,
boss, movement, weapon, power-up, player-ship, mini-ship, effect, and asset catalogs.
Selecting an item builds an isolated in-memory campaign and runs it through the
shared `GameEditorCanvas` → `GameStage` → `GameCanvas` → `GameEngine` → Pixi path.
Supported formations and pickups that are not authored in the current campaign get
a validated synthetic test event, so they can still be evaluated without changing
`campaign.json`.

Use the stage controls to pause, restart, clear, change simulation speed, toggle
player damage, spawn the selected encounter immediately, jump to a selected boss
phase, advance five deterministic seconds, and inspect visual or collision bounds.
The inspector accepts live
safe edits for encounters, formations, enemies, elite fire, bosses, weapons, health
phases, asteroids, pickups, ships, mini-ships, and starting upgrades. Invalid edits
are rejected by the campaign validator before they reach the preview.

The **Preview screen** toolbar runs the same canonical stage at fixed logical sizes
for a small phone, Pixel 8, iPhone 15, iPad mini, or desktop. Rotate swaps orientation;
**Fit screen**, 50%, 75%, and 100% change only how large the preview is drawn in the
workbench. The **How to use** card at the top keeps the beginner workflow and draft
safety boundary available inside the tool.

The stage-and-wave strip supports direct previous/next navigation and campaign-order
sequences. Check **Sequence** on any set of waves, then choose **Run selected**. Event
chips select an encounter for tuning without throwing away the rest of that wave;
use the Library's Bosses or Boss Moves category when you want an isolated boss or
phase test. The live HUD also exposes the selected main ship's real ability button.

### Formation Workshop and mission structure

Combat Lab uses one beginner-facing content hierarchy:

`Campaign → Mission → Wave → Encounter → Formation`

A **Mission** is a complete match/run. Its **Waves** play in order. Each wave contains
scheduled **Encounters** such as enemy formations, bosses, hazards, and rewards.

Choose **Formation Workshop** above the preview to create a fixed enemy layout without
writing code. Start from Row, V, Grid wall, Diamond, Spiral, Pincer, Ring, or Curved
chevron; then drag the numbered slots, move them with the arrow keys, mirror, rotate,
widen, tighten, add, remove, or reverse their order. Slot coordinates are normalized,
validated for the selected phone/desktop size, and consumed by the same runtime that
plays the game. **Play formation** returns to the canonical Pixi preview.

Mission Builder is not capped at five waves. **Add wave** starts with one clean
formation encounter; **Duplicate wave** is the separate action that copies every
encounter. **New mission** similarly starts with one clean wave. This keeps rapid
experimentation safe while still allowing long missions and deliberate full copies.

Experiments remain deliberately separated from production content:

- **Save preset** stores a `test-preset` envelope under
  `scicon-combat-lab-presets-v1` in this browser on this computer.
- **Export JSON** downloads a validated full campaign experiment for review or diffing.
- **Review draft in Mission Builder** remaps every inserted ID, validates a cloned full
  campaign against the latest disk revision, and writes only Mission Builder's local
  draft. The tracked campaign is unchanged until someone reviews the result and
  explicitly chooses **Apply to game**.
- Reset, duplicate, and delete affect only the current in-memory experiment or its
  local presets. Wallet, weekly squad state, scores, and player progression are never
  read or written.

Combat Lab loads its source campaign when the page opens. After editing campaign or
catalog files in this checkout, save any experiment you need and choose **Reload
source** in the guide. Changes from another branch or worktree appear only after they
are brought into this project folder. Sending a draft independently refetches the
latest disk campaign before creating the validated promotion.

Mission Builder's top navigation links back to the Combat Lab. For implementation and
regression coverage, see `director/src/combat-lab`, `director/tests/combatLabDomain.test.mjs`,
`director/tests/customFormationAuthoring.test.mjs`, `tests/combatLabBoundary.test.cjs`,
and `tests/customFormationAuthoring.test.cjs`.

## Windows one-click access

Run the shortcut installer once from the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/install-scicon-director-shortcuts.ps1
```

It creates:

- `Scicon Director` on the desktop. Double-clicking it starts the local server if
  necessary and opens the Director in the default browser.
- `Scicon Combat Lab` on the desktop. Double-clicking it starts the same local
  server if necessary and opens the gameplay experimentation workspace directly.
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
- `director-data/playtest-sessions` stores ignored, bounded canonical-preview
  telemetry for the Hub Analytics route.

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

Combat Lab uses an explicit deterministic seed and can save its current bounded
telemetry snapshot to the local Analytics tool. Analytics compares saved sessions
and exports a selected session as JSON or CSV without contacting an external
analytics endpoint.

See [server/README.md](server/README.md) for API and safety details and
[design/design-spec.md](design/design-spec.md) for the interface model.

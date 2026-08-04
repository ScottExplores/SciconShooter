# Scicon Shooter Owner Control Center

This page is the durable “start here” note for returning to the project after a break.

## The easiest way in

Double-click **Scicon Shooter Control Center** on the Windows desktop. It starts the
local-only tools, warms the canonical local game preview, and opens the dashboard at:

- Control Center: `http://127.0.0.1:5174/`
- Local mobile preview: `http://127.0.0.1:5179/?display=mobile-frame`
- Live game: `https://sciconshooter.xyz/`

The desktop folder **Scicon Shooter Tools** contains direct shortcuts for the report
inbox, Boss Sandbox, Mission Builder, Combat Lab, Project Guide, local and live games,
project folder, and Sprite Gallery. Existing loose desktop shortcuts are preserved.

If the shortcuts ever disappear, reinstall them from the canonical project folder:

```powershell
npm run director:shortcuts
```

## Where to review bug reports

Use either of these owner-only paths:

1. Desktop → **Scicon Shooter Tools** → **01 - Bug and Feedback Log**.
2. Control Center → **Player Reports**.

The Player Reports screen is read-only. It shows sanitized copies of player bug
reports, feedback, and bounded automatic crash diagnostics. Player-authored text is
untrusted and is displayed as plain text. The public `/api/player-reports` route stays
write-only; there is no public report-reading API.

The local cache refreshes when the Director launcher runs. A command-line copy is
also available:

```powershell
npm run reports:list -- --limit=25
```

If local review is not connected yet, the Player Reports screen provides a one-click
fallback to the Supabase table. In Supabase, open `scicon_product_events` and filter
`event_name` to `player_bug_report` or `player_feedback`.

### One-time local connection

Keep report-review credentials only in the repository-root `.env.local` file. Never
use a `VITE_` prefix and never paste a secret into the browser UI.

```text
SUPABASE_URL=https://ktdruljunithwopizorq.supabase.co
SUPABASE_SECRET_KEY=your_server_only_secret_key
```

The legacy `SUPABASE_SERVICE_ROLE_KEY` name remains supported. New `sb_secret_` keys
are sent only through Supabase's `apikey` header, and no key is copied into the
Director cache or returned to the browser.

## Project map

| Need | Open | Purpose |
| --- | --- | --- |
| See current project state | Project Guide | Branch, commit, local changes, and return checklist |
| Review player problems | Player Reports | Bugs, feedback, crash context, and “Copy for Codex” |
| Build or tune a boss | Boss Sandbox | Boss visuals, rigs, attacks, and encounter testing |
| Edit Campaign content | Mission Builder | Missions, Waves, routes, and authored progression |
| Experiment with gameplay | Combat Lab | Deterministic local gameplay testing |
| Check the game | Local Game | Canonical mobile-frame preview on port 5179 |
| Browse art | Sprite Gallery | Project sprites and protected Boss Sandbox assets |

## Canonical project state

- Editable checkout: `C:\Users\scott\Documents\Scicon Shooter`
- Working branch: `codex/scicon-experimental`
- `Scicon Shooter Main` is a clean reference worktree, not an editing surface.
- Vercel is the production host. Director files and local report caches are excluded
  from the production build.
- Netlify and Render are not part of the canonical release workflow.

Before editing, committing, or handing work to another model, follow
`docs/AI_COLLAB_WORKFLOW.md`. Before a production deployment, follow
`docs/approval-gates.md`; merging the experiment branch or deploying requires explicit
approval.

## If something looks stale

1. Open **Project Guide** and confirm the branch and current commit.
2. Reload the local game without changing ports.
3. Open **Player Reports** and press Refresh.
4. Check `%LOCALAPPDATA%\Scicon Director\director-error.log` if the Control Center
   could not start.
5. Give Codex a report ID or use **Copy for Codex** so the exact diagnostic context
   stays attached.

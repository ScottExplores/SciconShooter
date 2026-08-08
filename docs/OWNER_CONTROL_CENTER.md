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
project folder, Sprite Gallery, and **Player Analytics**. Existing loose desktop
shortcuts are preserved.

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

## Where to review player activity

Double-click **Scicon Player Analytics** on the desktop, or use **Scicon Shooter
Tools → Player Analytics**. The shortcut refreshes a private local HTML dashboard
from `scicon_product_events` and then opens it. It shows aggregate new and returning
devices, sessions, foreground play time, Mission starts and finishes, submitted
scores, daily trends, and run-mode usage. Base Dashboard and Vercel remain useful
for onchain/account activity and site traffic, but they cannot provide this gameplay
funnel by themselves.

The first launch may show **One-time connection needed**. Add the same server-only
Supabase values shown above to the ignored repository-root `.env.local`, then reopen
the shortcut. `SUPABASE_SERVICE_ROLE_KEY` remains a supported legacy key name.

```text
SUPABASE_URL=https://ktdruljunithwopizorq.supabase.co
SUPABASE_SECRET_KEY=your_server_only_secret_key
PRODUCT_ANALYTICS_HASH_SECRET=a-long-random-server-only-secret
```

Never add a `VITE_` prefix, paste these values into browser storage, or share the
generated dashboard. The browser sends a random device-local UUID, the server stores
only its keyed HMAC, and the dashboard HTML contains aggregates—not raw visitor
hashes, session IDs, wallet addresses, player names, or raw IP addresses. Foreground
time and stable new/returning-device measurements begin only after the corresponding
game build is deployed; older event rows still contribute to legacy session and
Mission counts.

## Project map

| Need | Open | Purpose |
| --- | --- | --- |
| See current project state | Project Guide | Branch, commit, local changes, and return checklist |
| Review player problems | Player Reports | Bugs, feedback, crash context, and “Copy for Codex” |
| See whether people are playing | Player Analytics | New/returning devices, play time, Mission funnel, and run modes |
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

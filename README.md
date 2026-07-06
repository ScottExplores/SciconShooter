# SciconShooter

SciconShooter is a web arcade game about turning attention, skill, and ResearchCoin energy toward open science. Players pilot the Research Flask through waves of scientific bottlenecks, upgrade their run with mission credits, and compete for a weekly leaderboard position that can help direct funding credits toward a ResearchHub proposal.

Live app: https://sciconshooter.xyz

## What the app stands for

SciconShooter is built around a simple idea: make open science funding feel visible, playful, and participatory.

The game loop turns common research obstacles into arcade enemies. Players score points, survive waves, fund upgrades, and compete for leaderboard placement. The weekly No. 1 pilot gets to choose a live ResearchHub proposal, and that choice guides the 100 RSC funding-credit allocation for the week.

The app is not meant to hide the funding story behind a donation button. It makes the funding target part of the game: the best run earns the right to point attention and credits toward a proposal that deserves support.

## Core features

- Space shooter gameplay with waves, bosses, upgrades, and score chasing.
- Weekly and all-time leaderboards backed by Supabase.
- Wallet connection through thirdweb, with Base Account recommended.
- Mission credits that can be earned in-game or funded with tokens.
- RSC payments on Base for mission credits.
- Live ResearchHub proposal discovery and selection.
- Weekly champion proposal pick stored with the winning score.
- Vercel-hosted API routes for leaderboard, proposal, and archive flows.

## Mission credits

Mission credits are the in-game upgrade currency used during a run.

- 1 RSC = 100 mission credits.
- Confirmed token transfers save credits to the connected wallet profile.
- Wallet-linked credits can be deployed into a mission and spent on upgrades during that run.

RSC runs on Base. The app uses thirdweb for wallet connection, token transfer confirmation, swap/buy helpers, and wallet profile flow.

## Weekly leaderboard and funding allocation

SciconShooter keeps two leaderboard views:

- Weekly Top 5
- All-time Top 25

Weekly leaderboard rows are filtered by the current Monday-through-Sunday week. Historical scores stay in Supabase; the weekly board is a view of the current week rather than a destructive reset.

When a player takes the weekly No. 1 spot, proposal selection unlocks. The champion can search the live ResearchHub proposal feed and choose one proposal. That proposal pick is stored with the score and guides the weekly 100 RSC funding-credit allocation.

## Local development

Prerequisite: Node.js

Install dependencies:

```powershell
npm install
```

Run locally:

```powershell
npm run dev
```

The local app usually runs at:

```text
http://127.0.0.1:5173/
```

After switching branches, run `npm install` again if the branch has different packages.

## Environment variables

The app can run locally without every production service configured, but these variables power the production leaderboard, wallet, and archive flows.

Vercel/server-side variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_LEADERBOARD_TABLE` (optional, defaults to `scicon_leaderboard`)
- `SUPABASE_MONTHLY_WINNERS_TABLE` (optional, defaults to `scicon_monthly_winners`)
- `CRON_SECRET`
- `MONTHLY_WINNER_WEBHOOK_URL` (optional legacy notification hook)

Browser-safe variables:

- `VITE_THIRDWEB_CLIENT_ID`
- `VITE_LEADERBOARD_API_URL` (optional, useful when testing against a deployed leaderboard)

Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only. Never expose it with a `VITE_` prefix.

## Data storage

Supabase is the source of truth for:

- Global scores
- Weekly score views
- Wallet-linked token credit status
- Selected ResearchHub proposal metadata
- Archived winner records

Run `supabase/leaderboard.sql` in the Supabase SQL editor to create or update the required tables.

If you intentionally need to clear all leaderboard data, run `supabase/reset-leaderboard.sql` manually in Supabase. Do not include that reset script in normal migrations because it deletes leaderboard rows.

## Deployment

The app is deployed on Vercel under the `sciconshooter` project.

Production domains:

- https://sciconshooter.xyz
- https://www.sciconshooter.xyz
- https://sciconshooter.vercel.app

Vercel Cron archives monthly winner records through the API routes. GitHub `main` is the clean source branch for production work.

## Project workflow

The normal workflow is intentionally simple:

1. Keep `main` clean.
2. Create a branch only when experimenting.
3. Test the branch locally.
4. Merge useful work back into `main`.
5. Delete branches that are no longer needed.

# Jev local playtest

Open http://127.0.0.1:5179/jev-lab/index.html while the canonical Scicon dev server is running.
To start that server from this checkout:

```powershell
npm run dev -- --host 127.0.0.1 --port 5179 --strictPort
```

## Access

Jev is TypeSafe's hosted model, not a downloaded game bot. As checked on September 18, 2026,
TypeSafe offers early access and lists input at $0.042 per million tokens with free output.
Free output does not mean free usage. Access and credits must be checked in your own account.

1. Open the [official API key dashboard](https://console.typesafe.ai/settings/keys), sign in, and obtain approved API access.
2. Paste the key into the local page's masked field and choose **Connect key**. Do not paste it into chat.
3. Enable **Use my TypeSafe credits or metered API for this trial**, then start a trial.
4. After the run, download its evidence and optionally request a structured assessment.

The pasted key stays in the Vite server's memory until it exits. It is not written to files,
browser storage, logs, or exported evidence. The existing server-side `TYPESAFE_API_KEY`
environment variable is also supported. Never use a `VITE_` key variable.

## What runs

- The canonical `GameEngine` and Pixi renderer, starting at Operation Open Galaxy with three lives,
  no upgrades, normal damage, normal pickups and native limited specials. Firing is automatic.
- The game advances at 60 simulation ticks per second using the same bounded frame catch-up
  approach as the main game. Wall time and simulation time are recorded separately.
- Jev receives compact structured data about visible threats, pickups, player position and
  resources. It chooses eight-direction movement or idle and whether to use a special.
  There are no screenshots, future-spawn data, damage boosts, or automatic dodge overrides.
- At most four decision requests per second, one in flight at a time, a 60-second wall-time limit,
  250 total requests including the optional review, and a 24 KB request-body limit.
  These are request limits, not a provider-enforced dollar budget.
- Responses more than one second late are discarded and end the run. No fresh decision for
  1.25 seconds also ends the run. Invalid responses, errors, hidden tabs, long browser stalls,
  death, Mission completion, and manual Stop end play. No API retries or scripted fallbacks.
- Initial fly-in is included in run time. Normal within-Mission wave continuation is automatic;
  the trial ends at the first completed Mission rather than choosing a campaign branch.
- Scores and history stay in this tab and downloads; there are no leaderboard, profile, reward,
  telemetry-server or wallet calls. Refresh clears the local run list.
- The free **scripted baseline** is a separate, explicitly labeled connection check. It is not
  Jev, a trained model, or evidence of learning. Compare scores only under matching conditions.
- Post-run feedback is a typed choice among described mechanics/concerns, with confidence and
  an insufficient-evidence option. It cannot establish human enjoyment or audiovisual quality.
  Request it promptly; the server allows one review within two minutes of trial start.

The saved JSON records the seed, controller, campaign revision, policy, actual observations,
chosen actions, application ticks, special-action outcomes, provider model, probabilities,
latencies, token usage, final score and termination reason. A seed alone cannot replay a live
API run exactly because response timing changes when actions apply; recorded ticks matter.

## Validation

```powershell
node --test tests/jevPlaytest.test.cjs
npm run typecheck
npm run build
```

The API tests inject response fixtures, make no TypeSafe requests, and verify missing access,
origin protection, contract validation, accounting, request limits, error handling and stopping.
The production build assertion rejects Jev playtest files and routes in the output. The page is
excluded from Vercel source uploads, and the API relay is a Vite `serve` plugin only.

Live Jev performance requires an approved key and an actual run. A functioning baseline or
mocked API check does not establish that Jev has played or achieved a high score.

Official references: [launch, pricing and Doom demo](https://typesafe.ai/blog/introducing-system-one-models-and-jev),
[HTTP contract](https://docs.typesafe.ai/api), [getting access](https://docs.typesafe.ai/introduction/quickstart).

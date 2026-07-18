# Scicon Shooter weekend X campaign — July 18–19, 2026

Campaign objective: build curiosity around the gameplay overhaul, collect concrete space-shooter preferences, and recruit beta testers without repeating links or tags in every post.

Positioning: community-built, DeSci-inspired Base arcade game. Play games. Fund science. ResearchHub is the current eligible-proposal surface, not an official partner or the game's entire identity.

## Queue

### 1. Saturday 9:30 AM Pacific — overhaul teaser

Status: FAILED - July 18, 2026 12:42 PM Pacific - browser/X upload flow failed before publish; no post URL created. Draft text was entered in the live compose tab, but the image chooser timed out and the post was not submitted.

Post:

> Scicon Shooter is about to feel like a different game. New ship sprites, rebuilt movement, larger bosses and more personality are landing. I'm showing pieces all weekend. What do you want to see first: ships, bosses or weapons?

Asset: `marketing/campaign-assets/weekend-teaser-ships-2026-07-18.png`

Reply goal: ships vs. bosses vs. weapons.

### 2. Saturday 2:30 PM Pacific — ship lineup

Status: READY

Post:

> The fleet is changing. ResearchHub, BIO and ETH ships now have their own silhouettes, and the new movement work is meant to make each run feel less flat. Which one would you fly first? @BioProtocol

Asset: `marketing/campaign-assets/weekend-teaser-ships-2026-07-18.png`

Reply goal: preferred ship and why. BIO is tagged only on this directly relevant post.

### 3. Saturday 7:30 PM Pacific — removable cannon mechanic

Status: READY

Post:

> Boss fights are getting tactical. Left cannon, right cannon and the core are no longer one big health bar—you can destroy the weapons separately and change what the boss can throw at you. Cannons first, or race the core?

Asset: `marketing/campaign-assets/weekend-teaser-cannons-2026-07-18.png`

Reply goal: tactical preference.

Verified evidence: `services/gameLogic.ts` models left/right cannon durability and excludes destroyed cannons from active attacks; `services/pixi/PixiGameRenderer.ts` renders component destruction state.

### 4. Sunday 9:30 AM Pacific — conversation-first question

Status: READY

Post:

> What space shooter still lives in your head—Galaga, R-Type, Gradius, Geometry Wars, something else? I'm rebuilding Scicon Shooter around short runs, readable patterns and bosses you can dismantle. What made your favorite work?

Asset: none. Keep this text-only so it feels like a genuine conversation rather than another promotion.

Reply goal: favorite games and the specific mechanic or feeling worth learning from.

### 5. Sunday 2:30 PM Pacific — boss lineup

Status: READY

Post:

> The old bosses felt like targets. The new direction is layered attacks, breakable systems and distinct silhouettes you can read in a second. Which matters most in a boss fight: pattern, music, personality or difficulty?

Asset: `marketing/campaign-assets/weekend-teaser-bosses-2026-07-18.png`

Reply goal: boss-design priority.

### 6. Sunday 7:30 PM Pacific — beta call

Status: READY

Post:

> Scicon Shooter is becoming a very different game. If you like arcade shooters or Base games, I want your feedback before the next build locks in. The finalized weekly winner can choose an eligible science proposal for the RSC funding-credit allocation. sciconshooter.xyz

Asset: `marketing/campaign-assets/scicon-shooter-base-dashboard-thumbnail-v4.png`

Reply goal: beta testers, scores, and concrete feedback.

## Publishing and reply rules

- Publish only the matching scheduled slot. Never publish a missed slot late if that would put two posts within two hours.
- Before posting, check the account's latest posts and this file to prevent duplicates.
- Use the copy exactly unless a live product fact has changed; if a fact is stale, stop and draft a corrected version instead of publishing.
- Do not add extra hashtags, links, tags, or emojis.
- After publishing, record the post URL and actual time under the slot.
- On each run, inspect direct replies to this campaign. Reply to at most two genuine questions or pieces of actionable feedback, in Scott's direct voice. Do not cold-reply to unrelated posts.
- Thank useful criticism, ask one concise follow-up when clarification would help, and record product feedback in the current weekly marketing log.
- Stop the campaign after slot 6. Do not continue the weekend cadence on future weekends without new approval.

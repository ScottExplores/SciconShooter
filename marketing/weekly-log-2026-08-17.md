# Scicon Shooter marketing log - week of August 17, 2026

## Growth baseline

- Audit date: August 21, 2026 at 9:17 AM PT.
- Account: `https://x.com/SciconShooter`
- Game: `https://www.sciconshooter.xyz/`
- Live automation status: enabled through the official X API.
- Published autonomous posts before this sprint: 3.
- Observed impressions: 7 for the Hangar post, 5 for the movement/boss-polish post, and 3 for the beta-pilot post.
- Observed engagement: 2 total likes, 0 replies, 0 reposts, and 0 quotes.
- Recent product signal: no `score_submitted` event after August 2 and no current-week leaderboard entries at audit time.
- Competition state: weeks ending August 9 and August 16 expired without a winner. No champion or funding-completion claim is permitted for either week.

## Test hypothesis

Specific, competitive hooks tied to one real mechanic will produce more qualified game starts and useful replies than generic upgrade summaries. This sprint increases the original-post cadence from Tuesday-Thursday to Monday-Saturday, one post per day, before considering a higher frequency.

Success is measured by:

- Game-opening sessions and `mission_started` events around each posting window.
- Verified leaderboard submissions.
- Useful replies containing a score, ship choice, difficulty observation, or concrete feedback.
- X impressions and engagement as supporting signals, not the primary result.

## Verified content queue

All entries are under 280 weighted X characters, contain no hashtags, use the official game URL, and have `metadata.claims_verified=true` in `scicon_social_content_queue`.

### Saturday, August 22 - weekly urgency

> The weekly board resets every Sunday at noon Pacific. Put up a verified score before the cutoff and make everyone else chase you. No wallet needed to play.
> https://www.sciconshooter.xyz/

- Content key: `weekly-board-reset-v1`
- Verification: weekly boundary code and guest-first verified leaderboard flow.
- Reply goal: scores and competitive intent.

### Monday, August 24 - funding-credit mechanism

> Win the week in Scicon Shooter and you direct the round's 100 RSC funding-credit allocation toward an eligible ResearchHub proposal. Not a cash prize. A high score with consequences.
> https://www.sciconshooter.xyz/

- Content key: `rsc-allocation-explainer-v1`
- Verification: production README and live competition records with `allocation_rsc=100`.
- Funding status wording: mechanism only; no completed-funding claim.
- Reply goal: questions about the weekly loop.

### Tuesday, August 25 - Boss Archive

> Scicon Shooter has a Boss Archive because beating a giant space problem once is not enough. Defeat bosses, unlock them, then challenge them again until the pattern stops being scary.
> https://www.sciconshooter.xyz/

- Content key: `boss-archive-runback-v1`
- Verification: production `BossArchive` implementation.
- Reply goal: boss difficulty and favorite encounters.

### Wednesday, August 26 - squad build

> One main ship. Two mini-ships. A Hangar full of bad decisions disguised as upgrades. Build your squad, start a run, and reply with the ship you trust when the screen gets ugly.
> https://www.sciconshooter.xyz/

- Content key: `squad-bad-decisions-v1`
- Verification: production `SquadHangar` implementation.
- Reply goal: ship choices and build preferences.

### Thursday, August 27 - campaign progression

> We built a campaign map into an arcade shooter because apparently surviving one wave was not enough. Pick a route, clear missions, earn upgrades, meet something enormous.
> https://www.sciconshooter.xyz/

- Content key: `campaign-meet-enormous-v1`
- Verification: production `CampaignMap` implementation.
- Reply goal: campaign progress and difficulty feedback.

### Friday, August 28 - guest-play challenge

> Guest play first. Wallet optional. The bullets are not optional.
>
> Scicon Shooter is a browser arcade game, community-built on Base. Play one run and reply with the exact moment it got unfair.
> https://www.sciconshooter.xyz/

- Content key: `guest-bullets-optional-wallet-v1`
- Verification: production guest-first flow and README.
- Reply goal: exact friction points from first runs.

### Saturday, August 29 - score behavior

> Your first Scicon Shooter run is reconnaissance. Your second is personal. Your third is when you start lying to yourself about how close you were.
>
> Post your score when you're done:
> https://www.sciconshooter.xyz/

- Content key: `third-run-personal-v1`
- Verification: non-claim gameplay challenge.
- Reply goal: score screenshots and repeat runs.

### Monday, August 31 - weekly science loop

> Every week, the top verified Scicon Shooter run earns the right to choose an eligible ResearchHub proposal for the round's 100 RSC funding-credit allocation.
>
> Play games. Fund science.
> https://www.sciconshooter.xyz/

- Content key: `weekly-science-loop-v1`
- Verification: production README and live competition records with `allocation_rsc=100`.
- Funding status wording: selection right and allocation mechanism only.
- Reply goal: understanding of the game-to-science loop.

## Cadence change

- Production `X_AGENT_ORIGINAL_DAYS`: `Mon,Tue,Wed,Thu,Fri,Sat`.
- Original-post ceiling for this test: one per day.
- Sunday remains reserved for the verified competition result workflow.
- No automated likes, follows, DMs, trend posting, cold replies, or bulk engagement were enabled.
- Production redeployed after the environment change on August 21, 2026.

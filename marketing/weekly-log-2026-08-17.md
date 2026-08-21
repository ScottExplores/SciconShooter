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

## Friday, August 21 production runtime post

Intended posting time: 4:00 PM Pacific through the production afternoon cron.

> Most browser shooters ask for reflexes. Scicon Shooter asks which eligible ResearchHub proposal should receive the round's 100 RSC Funding Credits.
>
> No wallet needed to play. Put a score on the board:
> https://www.sciconshooter.xyz/?utm_source=x&utm_medium=social&utm_campaign=growth-sprint-2026-08&utm_content=meaningful-score

- Content key: `score-means-something-v1`
- Verification: production README and weekly competition records with `allocation_rsc=100`.
- Competition wording: general mechanism only; no current winner or score claim.
- Funding status wording: proposal selection and funding-credit mechanism only; no completed-funding claim.
- Reply goal: score replies and first-run reactions.
- Runtime goal: verify the deployed afternoon cron, X credentials, audit row, X post ID, and campaign attribution before the Saturday pair.
- Expiry: 11:59 PM Pacific on August 21 so a failed runtime check cannot displace Saturday's primary post.

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
> Scicon Shooter is a browser arcade game, community-built on Base. @buildonbase pilots: play one run and tell us the exact moment it got unfair.
> https://www.sciconshooter.xyz/

- Content key: `guest-bullets-optional-wallet-v1`
- Tagged account: `@buildonbase`, verified through Base's official builder blog.
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
- Original-post ceiling for this test: two per configured day, one per scheduled invocation.
- Sunday remains reserved for the verified competition result workflow.
- No automated likes, follows, DMs, trend posting, cold replies, or bulk engagement were enabled.
- Production redeployed after the environment change on August 21, 2026.

## X campaign attribution rollout

On August 21, 2026, PR #17 added privacy-safe X campaign attribution to the initial `app_opened` event and restricted autonomous posts to approved first-party UTM parameters. Production deployment `dpl_GzLhAxyhPuDiUz86jsRXaGax2b9o` is ready on `www.sciconshooter.xyz`; the private social endpoint still returns `401` without authorization.

The eight queued growth-sprint posts retain their planned 9:00 AM Pacific posting times. Their live queue URLs are:

- `weekly-board-reset-v1`: `https://www.sciconshooter.xyz/?utm_source=x&utm_medium=social&utm_campaign=growth-sprint-2026-08&utm_content=weekly-board`
- `rsc-allocation-explainer-v1`: `https://www.sciconshooter.xyz/?utm_source=x&utm_medium=social&utm_campaign=growth-sprint-2026-08&utm_content=rsc-explainer`
- `boss-archive-runback-v1`: `https://www.sciconshooter.xyz/?utm_source=x&utm_medium=social&utm_campaign=growth-sprint-2026-08&utm_content=boss-archive`
- `squad-bad-decisions-v1`: `https://www.sciconshooter.xyz/?utm_source=x&utm_medium=social&utm_campaign=growth-sprint-2026-08&utm_content=squad-build`
- `campaign-meet-enormous-v1`: `https://www.sciconshooter.xyz/?utm_source=x&utm_medium=social&utm_campaign=growth-sprint-2026-08&utm_content=campaign-map`
- `guest-bullets-optional-wallet-v1`: `https://www.sciconshooter.xyz/?utm_source=x&utm_medium=social&utm_campaign=growth-sprint-2026-08&utm_content=guest-play`
- `third-run-personal-v1`: `https://www.sciconshooter.xyz/?utm_source=x&utm_medium=social&utm_campaign=growth-sprint-2026-08&utm_content=repeat-run`
- `weekly-science-loop-v1`: `https://www.sciconshooter.xyz/?utm_source=x&utm_medium=social&utm_campaign=growth-sprint-2026-08&utm_content=science-loop`

Each URL remains within the worker's approved first-party boundary, and each assembled post remains under 280 weighted X characters. Evaluation will join attributed `app_opened` sessions to later `mission_started`, `score_submitted`, and verified leaderboard activity by session ID. No synthetic production visit was generated to test attribution, so the first real campaign event should come from a player click.

## Afternoon growth lane

PR #18 added a second daily worker invocation at 4:00 PM Pacific. Production deployment `dpl_AZosErhhwZS2fpv6yPEjKtqD3GzE` is ready on August 21, 2026. The worker still publishes at most one verified queue item per invocation. Each afternoon entry expires before the next Pacific day so a missed secondary post cannot displace a morning primary post.

The live queue was also corrected before publication: literal `\n` escape text in three morning drafts was replaced with real line breaks. A full queue audit confirmed 16 verified posts, weighted lengths from 107 to 217 characters, approved first-party URLs, and no remaining literal line-break escapes.

### Saturday, August 22 at 4:00 PM Pacific

> Weekend flight rule: one run to learn it, one run to blame the ship, one run to admit the bullets won. Which run are you on?
> https://www.sciconshooter.xyz/?utm_source=x&utm_medium=social&utm_campaign=growth-sprint-2026-08&utm_content=weekend-run

- Content key: `weekend-three-runs-v1`
- Verification: non-claim gameplay challenge.
- Reply goal: repeat-run stage and score conversation.

### Monday, August 24 at 4:00 PM Pacific

> The weekly competition needs a villain. Put up a score early enough that everyone else has to stare at it all week. Reply when somebody takes it from you.
> https://www.sciconshooter.xyz/?utm_source=x&utm_medium=social&utm_campaign=growth-sprint-2026-08&utm_content=villain-score

- Content key: `weekly-villain-score-v1`
- Verification: weekly competition flow.
- Reply goal: early scores and competitive runbacks.

### Tuesday, August 25 at 4:00 PM Pacific

> Boss Archive math: losing once is research. Losing twice is a pattern. Losing three times means the boss has tenure. Which encounter keeps farming you?
> https://www.sciconshooter.xyz/?utm_source=x&utm_medium=social&utm_campaign=growth-sprint-2026-08&utm_content=boss-tenure

- Content key: `boss-tenure-v1`
- Verification: production `BossArchive` implementation.
- Reply goal: named boss difficulty feedback.

### Wednesday, August 26 at 4:00 PM Pacific

> Squad draft: one main ship, two mini-ships. What are you optimizing when the screen fills with bullets?
> https://www.sciconshooter.xyz/?utm_source=x&utm_medium=social&utm_campaign=growth-sprint-2026-08&utm_content=squad-draft

- Content key: `squad-draft-v1`
- Native poll options: `Damage`, `Speed`, `Survival`, `Maximum chaos`.
- Poll duration: 1,440 minutes (24 hours).
- URL: `https://www.sciconshooter.xyz/?utm_source=x&utm_medium=social&utm_campaign=growth-sprint-2026-08&utm_content=squad-draft`
- Verification: production `SquadHangar` implementation.
- Response goal: votes, ship-build replies, and player priorities.

### Thursday, August 27 at 4:00 PM Pacific

> Campaign route check: take the safer path and stack upgrades, or choose the route that looks like a terrible idea? I know what arcade players are picking.
> https://www.sciconshooter.xyz/?utm_source=x&utm_medium=social&utm_campaign=growth-sprint-2026-08&utm_content=route-choice

- Content key: `campaign-route-choice-v1`
- Verification: production `CampaignMap` implementation.
- Reply goal: route-selection behavior.

### Friday, August 28 at 4:00 PM Pacific

> Wallet optional. Dodging is not. The first thing Scicon Shooter asks from you is whether you can survive the opening run. Everything else comes later.
> https://www.sciconshooter.xyz/?utm_source=x&utm_medium=social&utm_campaign=growth-sprint-2026-08&utm_content=dodge-first

- Content key: `wallet-dodge-first-v1`
- Verification: production guest-first flow.
- Reply goal: first-run survival and wallet-friction questions.

### Saturday, August 29 at 4:00 PM Pacific

> Post-run honesty check: score, wave, and what killed you. Screenshots encouraged. Excuses reviewed harshly.

- Content key: `post-run-honesty-v1`
- URL: none; this is a link-free conversation test.
- Verification: non-claim score conversation prompt.
- Reply goal: score screenshots, waves, and death causes.

### Monday, August 31 at 4:00 PM Pacific

> Top the verified weekly board and you can choose an eligible @ResearchHub proposal for the round's 100 RSC funding-credit allocation. An objectively strange machine. Good. Test it.
> https://www.sciconshooter.xyz/?utm_source=x&utm_medium=social&utm_campaign=growth-sprint-2026-08&utm_content=strange-machine

- Content key: `strange-science-machine-v1`
- Tagged account: `@ResearchHub`, verified through ResearchHub's official documentation links page.
- Verification: production README and weekly competition records with `allocation_rsc=100`.
- Funding status wording: selection right and allocation mechanism only; no completed-funding claim.
- Reply goal: questions and reactions to the game-to-science mechanism.

## Native poll capability

PR #19 added bounded native-poll support through the existing official X create-post endpoint. Production deployment `dpl_W3enT4vPBDaC9NAEFDzvuKz1ZJAy` is ready on August 21, 2026. Queue-authored polls must contain two to four unique string options of at most 25 characters and run for 5 to 10,080 minutes. Invalid poll metadata stops before action reservation or publication, and accepted poll choices are retained in the social audit metadata.

PR #20 added read-only poll-result collection through the account timeline's official `attachments.poll_ids` expansion. Production deployment `dpl_F4RUeAxbQtRFPt9XUjNGF37ot4nK` is live on the public domains. Bounded option labels, vote totals, voting status, and end time are saved with each post's metrics; votes contribute to the existing engagement calculation without bypassing the three-sample learning threshold.

Vercel confirms the X variables are attached to Production as encrypted values, but its local `env pull` and `env run` paths returned empty placeholders for those secrets. No credential value was exposed or retained, and no live X write was attempted. The one-time 4:00 PM Pacific invocation on August 21 is therefore the authoritative credentialed runtime check; production's public social endpoint continues to return `401` without authorization.

## Player-conversion learning

PR #21 merged as `24084a68` on August 21 and deployed to production as `sciconshooter-4sk82j6ma`. The worker now retains each published post's bounded `utm_content` value and joins attributed X campaign opens to later `mission_started` and `score_submitted` events by anonymous session.

- Selection evidence: deduplicated attributed sessions, mission-start sessions, and score-submission sessions by content kind.
- Eligibility threshold: at least three attributed opens before conversion evidence can influence future selection.
- Priority guardrail: learning can reorder only queue entries within five priority points of the editorial leader.
- Fallback: X engagement learning, then queue order, if conversion evidence is unavailable or undersampled.
- Exclusions: owner/test sessions, names, wallet addresses, visitor hashes, and post text are not used for selection.
- Verification: 14 focused social-agent tests passed; ESLint and TypeScript passed. The full suite recorded 1,477 passes and six unrelated existing gameplay/artifact failures on `origin/main`.
- Production boundary: the deployment is ready and the public social endpoint returned `401` without authorization after rollout.

### Conversion theme taxonomy

PR #22 merged as `d30d82bd` and deployed as `sciconshooter-rf6nmw97n`. Migration `expand_social_content_taxonomy` was applied before relabeling the live queue. The database check constraint now permits the original four kinds plus seven bounded growth themes.

- `funding`: 4 queued posts.
- `challenge`: 3 queued posts.
- `competition`, `boss`, `loadout`, `progression`, and `onboarding`: 2 queued posts each.
- Post copy, URLs, schedules, priorities, claim verification, and publishing status were not changed.
- Supabase security and performance advisors reported no new issue tied to this migration; existing informational RLS-with-no-policy and index notices remain outside this social taxonomy change.

## Direct-mention reply readiness

Production environment inspection on August 21 confirmed the X credentials, autonomy flag, reply cap, account ID, and model name are attached as encrypted variables. `OPENAI_API_KEY` is not attached, so PR #23 added context-aware deterministic replies rather than leaving direct contacts with generic fallback copy.

- Play-link questions receive the official game URL and a score challenge.
- Funding questions receive the verified weekly 100 RSC Funding Credits mechanism without claiming a prize or partnership.
- Funding-status questions explicitly separate proposal selection from transaction-confirmed completion.
- Boss, controls, loadout, and bug feedback receive one specific follow-up question.
- Existing limits remain: direct mentions/replies only, maximum configured replies per day, no hashtags, no unapproved URLs, no secret requests, and no unsupported claims.
- Verification: 14 focused social tests, ESLint, and TypeScript passed. PR #23 merged as `45ce55a4` and production deployment `sciconshooter-8fkvbzi9m` is ready; the public endpoint still returns `401`.

## Evergreen queue continuity

PR #24 merged as `77fdee3c` and production deployment `sciconshooter-b0woy0lwa` is ready. The daily worker now checks the queue horizon before each run and begins an eight-calendar-day refill only when fewer than three days remain.

- Cadence: 9:00 AM and 4:00 PM Pacific, Monday-Saturday; Sunday remains reserved for the verified competition workflow.
- Candidate pool: three verified alternatives per slot across `funding`, `competition`, `challenge`, `boss`, `loadout`, `progression`, and `onboarding`.
- Learning behavior: candidates stay within a two-point priority band so product conversion can override the deterministic default; manually scheduled campaigns retain higher editorial priority.
- Expiry behavior: unselected candidates expire inside their slot and are moved to `paused` on the next daily invocation.
- Idempotency: date-, slot-, theme-, and variant-specific content keys and `utm_content` values prevent duplicate inserts and preserve attribution.
- DST behavior: Vercel probes `00:00`, `16:00`, `17:00`, and `23:00` UTC; a Pacific-hour gate permits originals only at local hours 9 and 16, preventing duplicate PDT/PST posts.
- Kill switch: `X_AGENT_EVERGREEN_ENABLED=false` disables refill independently; the existing global autonomy switch still disables all activity.
- Verification: 18 focused tests, ESLint, TypeScript, and Vercel passed. Generated candidate lengths range from 113 to 171 weighted X characters.
- Live boundary: current horizon remains August 31 at 4:00 PM Pacific with 17 manually queued posts and zero evergreen inserts, so the refill correctly made no early changes. The unauthenticated endpoint still returns `401`.

### Sunday posting time

PR #25 merged as `707fa65d` and production deployment `sciconshooter-1q96op5gw` is ready. The weekly worker now receives both `21:15` and `22:15` UTC probes but permits publication only on Sunday at 2:15 PM Pacific. Tests cover both PDT and PST, the off-season probe exits before reading or publishing a winner, and the unauthenticated weekly endpoint returns `401`.

## Verified proposal spotlight

PR #26 merged as `c0ba8054` and production deployment `sciconshooter-n8diy6fs8` is ready. Explicitly flagged queue entries may now use HTTPS ResearchHub `/proposal/{id}` or `/post/{id}` links; all other external queued URLs remain blocked.

Intended posting time: Tuesday, September 1 at 9:00 AM Pacific.

> Three Scicon Shooter winners picked the same @ResearchHub proposal: using whole-brain zebrafish dynamics to study FMR1-related autism phenotypes.
>
> Selection is verified. Funding completion is not confirmed. Read it and tell us what stands out:
> https://www.researchhub.com/proposal/32342/precision-phenotyping-of-an-autism-model-unbiased-discovery-of-fmr1-related-brain-phenotypes-from-whole-brain-dynamics-in-fmr1-zebrafish

- Content key: `proposal-32342-three-rounds-v1`
- Weighted X length: 267 characters.
- Verification evidence: weekly competition rows ending July 12, July 19, and July 26 each record proposal `32342`, `allocation_rsc=100`, and a finalized or claimed winner selection.
- Competition status wording: historical winner selections only; no current champion claim.
- Funding status wording: selection verified; completed funding unconfirmed because all three records have no allocation transaction hash.
- Proposal URL: `https://www.researchhub.com/proposal/32342/precision-phenotyping-of-an-autism-model-unbiased-discovery-of-fmr1-related-brain-phenotypes-from-whole-brain-dynamics-in-fmr1-zebrafish`
- Game URL: intentionally omitted so the proposal receives the visible link preview.
- Reply goal: proposal reactions and science questions.

### Partial-day refill safeguard

PR #27 merged as `bd432b16` and production deployment `sciconshooter-f9oydb5bd` is ready. Evergreen refill now begins on the queue horizon's Pacific calendar date and filters against the exact queued timestamp, so the September 1 morning proposal spotlight does not suppress that day's 4:00 PM slot.

- Expected next refill behavior: when the horizon enters the three-day threshold, September 1 at 4:00 PM Pacific is the first eligible generated slot.
- Existing boundary: the proposal spotlight remains queued for September 1 at 9:00 AM Pacific with its full ResearchHub URL; generated posts continue to use the official game URL with attributed campaign parameters.
- Verification: all 20 focused social-agent tests passed, including a morning-only horizon regression; TypeScript passed and ESLint reported zero errors with 19 pre-existing warnings.
- Production boundary: the deployment is ready and the public social endpoint returned `401 Unauthorized` at August 21, 11:03 AM Pacific.

## Pre-publication live audit

Live production evidence checked August 21 at 11:04 AM Pacific:

- Social actions: no published, failed, or skipped actions yet; the 4:00 PM Pacific post remains the first credentialed runtime attempt.
- X attribution: no attributed sessions yet, so no content-performance conclusion is available.
- Seven-day product baseline: 17 app-open sessions, three mission-start sessions, and no score submissions. These totals are directional and include all traffic sources.
- Active August 16-23 competition: zero eligible leaderboard runs at audit time. The leaderboard is awaiting finalization; no winner or champion claim is permitted.
- Queue correction: `third-run-personal-v1` and `weekly-science-loop-v1` now contain real paragraph breaks rather than visible backslash escapes.
- Poll experiment: `squad-draft-v1` is a 24-hour native poll scheduled for Wednesday, August 26 at 4:00 PM Pacific with `Damage`, `Speed`, `Survival`, and `Maximum chaos` options plus its attributed game URL.
- Policy verification: production `validateOriginalPost` accepts the revised August 21 copy and attributed URL; production `readQueuePoll` accepts the poll options and duration.
- Browser note: the signed-in X tab displayed X's privacy-extension error, so account inspection remains API-led rather than browser-led.

## Desktop conversion intervention

PR #28 merged as `7e6ef0dc` and production deployment `sciconshooter-8yx6a4pkx` became live August 21 at 11:19 AM Pacific, before the first scheduled X post.

- Evidence: the previous desktop interstitial visually prioritized leaving for the Base App and labeled local browser play `Play Here`, creating friction against the no-install browser-game promise.
- Primary action: the green CTA now reads `Start Browser Run` and opens the existing 390x844 game frame on the same page.
- Secondary action: `Open in Base App` and its QR remain available without blocking browser play.
- Promise alignment: the page now states that no install or wallet is required.
- Measurement: bounded `desktop_launch_viewed` and `desktop_launch_selected` events record only the chosen surface (`browser` or `base_app`) and placement. Existing session, request-size, property, and rate limits still apply.
- Verification: five focused launch-shell tests, TypeScript, ESLint with zero errors, production build, and local browser launch passed. The public production page shows the revised CTA and the social endpoint remains `401 Unauthorized` without credentials.
- Data hygiene: the single `desktop_launch_viewed` event created by production verification at 11:19:41 AM Pacific was identified by exact ID and timestamp and removed; launch-choice measurement therefore begins with real visitors.

### Desktop campaign attribution

PR #29 merged as `68616aeb` and production deployment `sciconshooter-ju6qq3qhp` became live August 21 at 11:26 AM Pacific.

- Desktop launch views and browser/Base choices now retain only approved `utm_source=x`, `utm_medium=social`, bounded campaign, and bounded content values from the landing URL.
- Conversion learning treats `desktop_launch_viewed` and `app_opened` as equivalent campaign touches and deduplicates them by session. A desktop visitor who continues into the game counts once; a visitor who leaves at the launcher remains visible in the denominator.
- Existing outcomes remain `mission_started` and `score_submitted`, with a minimum of three attributed sessions before evidence can influence queue selection.
- Verification: 25 focused desktop and social-agent tests, TypeScript, ESLint with zero errors, and production build passed. The production deployment is ready and the unauthenticated social endpoint remains `401 Unauthorized`.

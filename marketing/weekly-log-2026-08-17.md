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

> Desktop pilots: browser play is now the big green button. No install. No wallet. Finish a run and your Mission Record can open a score challenge on X.
>
> Try it and post the score:
> https://www.sciconshooter.xyz/?utm_source=x&utm_medium=social&utm_campaign=growth-sprint-2026-08&utm_content=browser-score-share

- Content key: `desktop-browser-score-share-v1`
- Content kind: `upgrade`.
- Weighted X length: 202 characters.
- Verification: production PRs #28 and #30, live browser-first CTA, and live Mission Record X-share asset.
- Reply goal: desktop scores and first-run reactions.
- Queue behavior: priority 85 makes this the intended afternoon selection. `weekend-three-runs-v1` remains a lower-priority backup and expires after the same slot if unused.

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

- Social actions: no August 21 worker action exists yet; the 4:00 PM Pacific post remains the first runtime attempt under the current schedule. Three genuine historical posts from August 11-13 are recorded, with 15 total impressions, two likes, and no replies or reposts. Their one beta-test and two upgrade samples are below the three-sample learning threshold.
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

## Player-generated score sharing

PR #30 merged as `3dbc0860` and production deployment `sciconshooter-hvb6rpr4s` became live August 21 at 11:34 AM Pacific.

- Mission Records now place a full-width `Post score on X` action above the existing image-share and optional mint controls.
- Prefilled copy states the player's actual score and wave and challenges others to beat it; it does not claim a weekly win or funding completion.
- Shared game URL: `https://www.sciconshooter.xyz/?utm_source=x&utm_medium=social&utm_campaign=player-score-share&utm_content=mission-record`
- Measurement: the existing bounded `share_action_used` event records method `x_intent` and whether the browser opened the intent window.
- Verification: intent URL and UI wiring tests, existing image-share test, TypeScript, ESLint with zero errors, and production build passed. The live production mission-record asset contains the X action, campaign URL, and `x.com/intent/post`; the unauthenticated social endpoint remains `401 Unauthorized`.

## Weekly score-save repair

Production evidence checked August 21 between 11:35 AM and 11:52 AM Pacific showed that the seven-day funnel contained 18 app-open sessions, three mission-start sessions, two mission-completion sessions, and no score submissions. Both completed runs generated duplicate finalization attempts but no receipt or leaderboard row. A player report stated that Weekly play did not save, and Vercel grouped all four `/api/run-receipts` failures from the two affected players as `weekly_outcome_impossible`.

- Root cause: the server treated each generated wave's 16-second timeout as a mandatory minimum clear time. Live gameplay correctly ends a wave when its enemies are defeated; observed early depths cleared in roughly 9-11 seconds while the validator required 25.6-38.4 seconds.
- Repair: PR #31 merged as `407c1eb5` and production deployment `dpl_AU7XBTdV4GEEnKWE2H9n9VBij1La` became ready on all public domains. Generated-run timing now uses a conservative 1.5-second floor per combat wave while retaining exact proof binding, route, wave, kill, boss, total-duration, and settlement checks.
- Verification: 40/40 focused receipt, persistence, and generator tests passed; TypeScript, targeted ESLint, and the production build passed. A live non-leaderboard QA run then produced a persisted `server-verified` Wave 1 receipt from a 6.7-second clear.
- Data hygiene: the exact QA receipt and attempt rows were deleted immediately after verification; one receipt and one attempt were removed, and no leaderboard entry was created.
- Measurement interpretation: the pre-fix zero score-submission baseline is not valid evidence that players rejected score submission or the social message. Future conversion learning should use post-fix traffic.
- Runtime boundary: the unauthenticated social endpoint still returns `401`. The first official X runtime remains scheduled for Friday, August 21 at 4:00 PM Pacific.
- Intended post content key: `score-means-something-v1`.
- Intended game URL: `https://www.sciconshooter.xyz/?utm_source=x&utm_medium=social&utm_campaign=growth-sprint-2026-08&utm_content=meaningful-score`.
- Reply goal: verified score replies and first-run reactions after the repaired submission path is live.

## Verified native image publishing

PR #32 merged as `0ad62de2` and production deployment `dpl_76XuE41vwXgjBAvLtxGupqto9Q2q` became ready August 21 at 12:05 PM Pacific. The social worker can now attach images through the official X media API only when the queue entry supplies a bounded first-party asset and required alt text.

- Safety boundary: accepted sources are HTTPS files under `https://www.sciconshooter.xyz/social-assets/`; arbitrary hosts, redirects, query strings, missing alt text, images over 5 MB, more than four images, and poll-plus-media posts are rejected.
- Verification: 24/24 focused social-agent tests, TypeScript, targeted ESLint, and the production build passed. The public asset returned HTTP 200 as `image/png`, 703,515 bytes, with SHA-256 `B3FE38B44CC45FD079C03F29547E5640E15CAB0A47BAD47F9FD942F8269D9827`.
- Asset path: `marketing/campaign-assets/scicon-home-hangar-upgrade-2026-08.png` (deployed copy: `public/social-assets/scicon-home-hangar-upgrade-2026-08.png`).
- Queued post: `desktop-browser-score-share-v1`, still scheduled for Saturday, August 22 at 4:00 PM Pacific. It is 202 weighted X characters and passed both post and media validation.
- Image URL: `https://www.sciconshooter.xyz/social-assets/scicon-home-hangar-upgrade-2026-08.png`.
- Game URL: `https://www.sciconshooter.xyz/?utm_source=x&utm_medium=social&utm_campaign=growth-sprint-2026-08&utm_content=browser-score-share`.
- Alt text: `Scicon Shooter redesigned home screen with the RSC ship, Start Mission button, and navigation for Proposals, Trophies, Hangar, and more.`
- Reply goal: desktop scores and first-run reactions.
- Runtime boundary: no media was uploaded to X during verification. The first live media upload will occur only when the already-approved Saturday queue entry reaches its publishing window. Friday's 4:00 PM text post remains unchanged.

### Hangar gallery

PR #33 merged as `4fda56d7` and production deployment `dpl_GQi7mcx53wbN6fyz4Yarmtr57jEa` became ready August 21 at 12:13 PM Pacific. Two supplied in-game Hangar screenshots were added to the allowlisted first-party asset surface for the verified loadout post.

- Current-code evidence: `SquadHangar` and squad progression implement one main ship, left/right mini-ship support slots, four named mini-ships, and tiered upgrades. No unreleased feature or roadmap-date claim was added.
- Main-ship asset: `marketing/campaign-assets/scicon-hangar-main-ships-2026-08.png`; public URL `https://www.sciconshooter.xyz/social-assets/scicon-hangar-main-ships-2026-08.png`; 274,363 bytes; SHA-256 `74A4F4693D69CA16069D4951090DB9E6E039E4304F2A4F3B17BF1CB9B4EC3224`.
- Mini-ship asset: `marketing/campaign-assets/scicon-hangar-mini-ships-2026-08.png`; public URL `https://www.sciconshooter.xyz/social-assets/scicon-hangar-mini-ships-2026-08.png`; 237,805 bytes; SHA-256 `F2BE11CB9C7BCD126251623E2174A810D8CB43933A4497AC151E208AF6EE17F5`.
- Queue entry: `squad-bad-decisions-v1`, scheduled for Wednesday, August 26 at 9:00 AM Pacific with both images, specific alt text, and the existing attributed game URL.
- Validation: 24/24 focused social-agent tests, TypeScript, targeted ESLint, and production build passed. Both public assets returned HTTP 200 as `image/png` with exact hash matches; the final post is 200 weighted X characters and media validation accepts both images.
- Reply goal: players naming the main ship or support squad they trust when the run gets crowded.

### Boss Archive visual

PR #34 merged as `959bae66` and production deployment `dpl_DNZm1VKSByDXCPBo8qZPqfVYbWqj` became ready August 21 at 12:19 PM Pacific. The existing production-backed boss teaser was promoted to the allowlisted social asset surface while retaining its visible work-in-progress label.

- Code evidence: Open Orbit, Citation Storm, Paywall Siege, and Open Galaxy are present in the current stage catalog and Boss Archive implementation.
- Asset path: `marketing/campaign-assets/scicon-boss-archive-lineup-2026-08.png`; deployed copy: `public/social-assets/scicon-boss-archive-lineup-2026-08.png`.
- Image URL: `https://www.sciconshooter.xyz/social-assets/scicon-boss-archive-lineup-2026-08.png`; 929,257 bytes; SHA-256 `E1D514F26DE972F4C151A837872F141BDB9112FDA6616EFC4F14F2AF5FBCDCA4`.
- Queue entry: `boss-archive-runback-v1`, scheduled for Tuesday, August 25 at 9:00 AM Pacific with the existing attributed game URL.
- Validation: public HTTP 200 `image/png` with an exact hash match; final copy is 206 weighted X characters; post and media validation both pass.
- Reply goal: boss names, runback results, and the encounter players still cannot solve consistently.

## Canonical branch consistency

The released social-growth stack had been deployed from isolated `origin/main` worktrees while the canonical `codex/scicon-experimental` checkout still contained an older worker that rejected media and lacked the current scheduler, polls, proposal allowlist, conversion attribution, score sharing, and weekly timing repair. Commit `53835091` synced only the clean released social, desktop-launch, score-share, weekly-plan, test, documentation, migration, environment-template, and cron files into the canonical branch.

- Verification: 55/55 focused social, desktop-launch, X score-share, weekly generator, and weekly persistence tests passed.
- TypeScript, targeted ESLint, Tailwind regeneration, and the full experimental production build passed.
- The local Director remained excluded from the production build.
- Existing gameplay, boss-runtime, Director, generated proof, and user-owned untracked changes were not staged, overwritten, rebased, or reverted.

## Queue failure recovery

PR #35 merged as `4f82d56c` and production deployment `dpl_BdfHR8S3sN9i8YVTDa2gKBABY2b1` became ready August 21 at 12:37 PM Pacific. Invalid or previously failed queue rows can no longer remain the highest-priority candidate and starve all later content.

- Invalid rows are paused with their exact bounded validation reason before the worker evaluates the next candidate.
- Previously failed or skipped action rows are paused and bypassed; an active reservation stops the run rather than risking concurrent duplicate posts.
- A new publication failure marks the action failed and pauses the exact queue row before returning the error, allowing the next scheduled runtime to continue with later content.
- Verification: 26/26 focused social tests, TypeScript, targeted ESLint, and production build passed in both the canonical and isolated release worktrees.
- Live audit: 19 queued rows, zero failed/reserved/skipped action rows, and zero queued claim, poll, media, URL, or existing-action blockers.
- Runtime boundary: no X post or reply was created during recovery testing. The August 21 4:00 PM Pacific post remains the next intended original.

### Post-fix player baseline

Live production evidence checked August 21 at 12:40 PM Pacific showed zero product events after the 11:52 AM score-save verification boundary and zero entries on the active weekly leaderboard. No X-attributed session exists yet. Until real traffic arrives, queued copy must invite the first verified scores and must not imply current player traction, a score to beat, or a finalized weekly leader.

## Read-only social health audit

`npm run social:audit` now provides one bounded, repeatable production readout for queued-content validation, recent action statuses, aggregate conversion events, and the public current-week leaderboard. It excludes session IDs, wallet addresses, visitor hashes, event properties, and credentials from output. The first live run at 12:42 PM Pacific reported 19 queued posts, zero blockers, three media posts, one proposal spotlight, no recent social actions, one non-X session in the preceding 24 hours, and no current weekly leader. PR #36 merged as `786d36f4`; production deployment `dpl_A2M8wBqfsiHM5yXyWKx6BGZufqVF` became ready at 12:46 PM Pacific on all public domains.

## Audited native video path

The existing project gameplay clip was inspected locally before enabling any video queue support. It is an unprotected 55-second MP4, 4,374,893 bytes, H.264 High Profile level 3.1, 1280x720, progressive 8-bit 4:2:0, 12 fps, with no audio track. SHA-256: `6A72407C36163F87937C4BA15176BB5743994FEEA1628A9E93E6DE5D14A05B97`.

- Archived asset: `marketing/campaign-assets/scicon-shooter-base-demo-55s.mp4`.
- Public asset path: `public/social-assets/scicon-shooter-base-demo-55s.mp4`.
- Intended public URL after deployment: `https://www.sciconshooter.xyz/social-assets/scicon-shooter-base-demo-55s.mp4`.
- Safety boundary: one video per post, first-party HTTPS MP4 only, 15 MB configured cap, required bounded alt text, chunked INIT/APPEND/FINALIZE upload, bounded STATUS polling, and no poll-plus-media posts.
- Verification: 30/30 focused social and audit tests, TypeScript, ESLint with zero errors in changed files, exact public/archive hash match, and the full production build passed.
- Publishing status: no media was uploaded to X and no video post was queued during implementation. A live video post remains gated on production deployment and a verified first upload.
- Intended posting time: not scheduled.
- Reply goal: gameplay run reactions and score replies once a clip-specific post is approved for the queue.

PR #37 merged as `17d82bfe` and production deployment `dpl_7SNaC5M9JoSLNsE6RgxFmbi94HtM` became ready August 21 at 1:04 PM Pacific. The public MP4 returned HTTP 200 as `video/mp4`, exactly 4,374,893 bytes, with the audited SHA-256. The unauthenticated social endpoint remained `401 Unauthorized`; no X upload or post was triggered during production verification. A fresh 1:06 PM production audit reported 19 queued posts, zero blockers, zero X actions, zero X-attributed sessions, and no current weekly leader.

### Demo reel claim-audit correction

A frame-by-frame visual review after the codec audit established that `scicon-shooter-base-demo-55s.mp4` is a product demo reel, not raw gameplay. It also contains an illustrative player name and score, stale proposal counts, and an outdated statement that Mission Record ownership unlocks the BIO ship. Current production code instead unlocks BIO only after verifying that the connected wallet holds at least 100 BIO on Base.

- Publishing status: the reel was never queued, uploaded to X, or posted.
- Asset status: the deployable `public/social-assets` copy is removed; the original remains only in `marketing/campaign-assets` as historical source material.
- Safety correction: queued video now requires both post-level `metadata.claims_verified=true` and frame-level `media.claims_audited=true`.
- Marketing correction: `marketing/social-calendar.md`, the July launch pack, and the Base funding draft now separate optional Mission Record minting from the verified BIO-balance ship unlock.
- Intended posting time: none.
- Reply goal: none; this reel is not approved for social use.

PR #38 merged as `bef0156f` and production deployment `dpl_5aFWGMCMH2Ak4E3EYiWVKj8vcEHk` became ready August 21 at 1:22 PM Pacific. The former asset URL now resolves only to the site's HTML fallback rather than `video/mp4`, proving the stale reel is no longer deployable media. The worker remained `401 Unauthorized` without credentials, and the live queue still contained no video row.

### Live media-source audit

The read-only social health audit now verifies every structurally valid queued media URL with a bounded `HEAD` request. HTTP failures, redirects, HTML fallbacks, unexpected MIME types, missing or zero content lengths, and files beyond the configured image or video cap are reported as queue blockers without downloading or exposing media content. The first live run at 1:24 PM Pacific checked all three queued media posts and reported zero blockers; all referenced assets are live bounded PNGs.

PR #39 merged as `ecbb5765` and production deployment `dpl_2j9PMc4hQdNRTyDGj2uHmrSYVKjY` became ready August 21 at 1:28 PM Pacific. Verification remained 30/30 focused social and audit tests with zero targeted ESLint errors.

### Public X account baseline

A read-only browser check at 1:30 PM Pacific verified the public `@SciconShooter` profile before the first automated runtime: 12 posts, 4 followers, 38 following, branded avatar and header, verified-account badge, live game URL, and the bio `DeSci-inspired arcade shooter, community-built on Base. Play games. Fund science. New ships, squad upgrades, bosses and weekly competition.` The pinned August 5 launch post showed 37 views and one like; later August 11-13 originals showed 3-7 views. Existing short replies had views but no visible replies, so they do not prove conversation quality or player conversion. No profile or X state was changed during this audit.

### Morning queue expiry bounds

Eight manually seeded 9:00 AM Pacific rows had no `not_after` value and could have drifted into later slots after a missed runtime. At 1:31 PM Pacific each was bounded to 3:59 PM on its intended day: `weekly-board-reset-v1`, `rsc-allocation-explainer-v1`, `boss-archive-runback-v1`, `squad-bad-decisions-v1`, `campaign-meet-enormous-v1`, `guest-bullets-optional-wallet-v1`, `third-run-personal-v1`, and `weekly-science-loop-v1`. Copy, links, priorities, and publication status were unchanged. The immediate live audit remained 19 queued posts with zero policy or media-source blockers.

### Queue schedule-window audit

The read-only social audit now reports queued rows with a missing or invalid boundary, an end time that is not after the start, or a window that has already expired. Focused verification passed 3/3 tests with zero targeted ESLint errors. The first live run at 1:33 PM Pacific reported 19 queued posts and zero schedule, policy, or media-source blockers, confirming the active queue is bounded before the 4:00 PM runtime.

### Campaign-level conversion readout

The social audit now reports privacy-safe conversion outcomes by bounded `utm_content`: unique attributed X sessions, mission-start sessions, and score-submission sessions. It excludes owner/test sessions and never emits session identifiers or player data. Focused verification passed 3/3 tests with zero targeted ESLint errors. The 1:35 PM Pacific live baseline contained no attributed X campaign session, so no content winner is inferred before the first scheduled post.

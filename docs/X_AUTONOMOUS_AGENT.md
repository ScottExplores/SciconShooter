# Scicon Shooter autonomous X agent

## Scope

The production worker uses the official X API. It can perform only these actions:

- Publish at most one verified queued original post per scheduled invocation on configured weekdays.
- Attach up to four queue-authored first-party PNG, JPEG, or WebP images, or one audited MP4 gameplay clip, with required alt text.
- Publish a native poll only when the queue supplies two to four unique, bounded options and a valid duration.
- Read mentions of `@SciconShooter` and reply inside conversations that directly contacted the account.
- Publish the finalized weekly winner thread only when the winner, score, wave, and ResearchHub proposal selection are present in the competition record.
- Save every attempted action, decision, source post, final copy, status, and X post ID in Supabase.
- Record public performance metrics and bounded native-poll vote totals for the account's own posts, then use them to improve queued-content selection.

The worker has no implementation for likes, follows, unfollows, reposts, quotes, Direct Messages, deleting posts, trend searches, or cold outreach.

Performance learning is deliberately slow. A content category needs at least three measured posts before it can influence selection, and it can only reorder queued posts whose editorial priorities are within five points. One lucky post cannot take over the account strategy.

## Safety boundaries

- `X_AUTONOMY_ENABLED=false` is the emergency kill switch and the deployment default.
- The X developer app must have only **Read and write** permission. Do not grant Direct Message permission.
- Reply volume defaults to three published replies per rolling 24 hours and cannot exceed ten through configuration.
- Only direct mentions and direct replies are eligible. Unrelated posts are never searched or contacted.
- Hostile, spammy, promotional, and ambiguous mentions are ignored.
- Wallet, payment, transaction, security, legal, and confirmed-funding topics receive only the fixed support-routing response.
- Generated replies are treated as untrusted until they pass URL, length, secret-request, hashtag, and claim validation.
- A failed or interrupted action keeps its idempotency reservation and is not automatically retried, preventing duplicate posts. Its queue row is paused so later verified content is not starved.
- Queued original posts require `metadata.claims_verified=true`. Native media must use HTTPS URLs under `www.sciconshooter.xyz/social-assets/` and include bounded alt text. Images remain under 5 MB each; video is limited to one audited MP4 under 15 MB and uses the bounded chunked upload flow. Polls cannot include media.
- Poll options are queue-authored and strictly validated; the model cannot invent or alter poll choices at publication time.
- Funding is never described as completed from proposal selection alone. The weekly thread records `selection_only` unless an allocation transaction hash exists.

## Required production secrets

Store these only as encrypted Vercel environment variables. Never put them in Git, project logs, screenshots, chat, or browser notes.

- `X_API_KEY`
- `X_API_SECRET`
- `X_ACCESS_TOKEN`
- `X_ACCESS_TOKEN_SECRET`
- `X_ACCOUNT_USER_ID`
- `CRON_SECRET`

`OPENAI_API_KEY` is optional. Without it, direct contacts receive the same validated, context-specific policy replies without model generation.

Optional controls:

- `X_AGENT_MODEL=gpt-5-mini`
- `X_AGENT_MAX_REPLIES_PER_DAY=3`
- `X_AGENT_ORIGINAL_DAYS=Tue,Wed,Thu`

## Schedule

- Daily mentions, metrics, and queued content are probed at `00:00`, `16:00`, `17:00`, and `23:00 UTC`. The worker's Pacific-hour gate allows originals only at 9:00 AM and 4:00 PM across daylight and standard time. Vercel Hobby may execute anywhere within each scheduled hour.
- The morning slot is the primary conversion post. The afternoon slot is a distinct gameplay or community post, not a rewrite of the morning copy.
- Afternoon queue entries should expire before the next Pacific day so a missed secondary post cannot displace the next morning's primary post.
- Weekly finalized result: Sunday at `21:15 UTC`, after the existing competition-finalization jobs. Vercel Hobby may execute anywhere within that hour.

The worker shares the existing `api/events.js` function through `/api/social-agent`, preserving the 12-function Hobby deployment limit. Vercel authenticates cron calls with `CRON_SECRET`.

## Learning from real play

Queued posts can carry a first-party `utm_content` value in `metadata.campaign_content`. The worker records that value with the published action, then reads a bounded 30-day window of `app_opened`, `mission_started`, and `score_submitted` events. It joins outcomes by anonymous session, removes sessions marked as owner or test activity, and requires at least three attributed opens before a content theme can influence selection.

Conversion evidence ranks ahead of X engagement only among posts within five priority points of the editorial leader. If analytics is unavailable or the sample is too small, the worker falls back to engagement learning and then queue order. The learner does not use names, wallet addresses, visitor hashes, or post text.

## Evergreen queue refill

When the remaining queue horizon falls within three days, the daily worker seeds eight calendar days of verified Monday-Saturday candidates after the existing horizon. Each 9:00 AM and 4:00 PM Pacific slot receives three theme alternatives within a two-point priority band. Conversion learning can choose among them; without enough evidence, the deterministic rotation provides the default order.

Unused candidates expire within their slot and are moved to `paused` on the next daily run. Content keys and first-party `utm_content` values are date-, slot-, theme-, and variant-specific, so retries are idempotent and conversion evidence remains attributable. Set `X_AGENT_EVERGREEN_ENABLED=false` to disable refill without disabling direct replies or manually queued posts.

Vercel probes the daily worker at both daylight and standard-time UTC equivalents. `X_AGENT_ORIGINAL_HOURS=9,16` gates original publication by the actual Pacific hour, so the extra probe can process mentions and metrics but cannot publish another original.

The Sunday winner worker follows the same rule: Vercel probes at `21:15` and `22:15` UTC, while `X_AGENT_WEEKLY_HOUR=14` and `X_AGENT_WEEKLY_MINUTE=15` permit publication only at 2:15 PM Pacific. The off-season probe exits before reading or publishing a winner.

## Read-only monitoring

Run `npm run social:audit` from the canonical project checkout. The command reads `.env.local`, validates every queued post against the production worker policy, aggregates recent action statuses and conversion events, and reports the public weekly leaderboard. Output excludes session IDs, wallet addresses, visitor hashes, credentials, and event properties. Use `npm run social:audit -- --hours=72` to inspect up to seven days.

## Activation checklist

1. Apply the social-agent migrations under `supabase/migrations` and run Supabase security and performance advisors.
2. Create one X developer app owned by the Scicon Shooter account and set it to Read and write without Direct Messages.
3. Set an X API spending cap and fund only the amount Scott approves.
4. Generate account access tokens after permissions are final. Changing permissions later requires regenerating the tokens.
5. Add all required secrets to Vercel Production only.
6. Deploy with `X_AUTONOMY_ENABLED=false` and invoke the worker to confirm the kill-switch response.
7. Run unit tests and a credentialed read-only identity check.
8. Set `X_AUTONOMY_ENABLED=true`, invoke one controlled run, and verify the Supabase audit row and X post ID.
9. Configure X's automated-account label and connect it to Scott's human-managed X account.

## Emergency stop

Set `X_AUTONOMY_ENABLED=false` in Vercel and redeploy. If credentials may be exposed, revoke the X app tokens, rotate `CRON_SECRET`, rotate the OpenAI API key, and review `scicon_social_actions` before restoring service.

# Scicon Shooter marketing log - week of August 3, 2026

## Account launch package

- Account: `https://x.com/SciconShooter`
- Game: `https://www.sciconshooter.xyz/`
- Support: `sciconshooter@gmail.com`
- Status: Campaign banner, bio, and official website are public. The in-game avatar upload is under X review, so the default profile image remains visible. The first post was published and pinned.
- Avatar: `public/game-art/branding/researchhub-ship.png` (unaltered shipped in-game RSC ship sprite, 256x256 transparent PNG)
- Banner: `marketing/campaign-assets/scicon-x-banner-pixel-2026-08.png`
- First-post visual: `public/app-thumbnail.png`

### Bio

> DeSci-inspired arcade shooter, community-built on Base. Play games. Fund science. New ships, squad upgrades, bosses and weekly competition.

### First post

> Scicon Shooter is live.
>
> New ships. A full squad Hangar. Upgradeable mini-ships. Bigger bosses. A lot more polish across every run.
>
> We're building a DeSci-inspired arcade game on @base.
>
> Play a run and tell us what we should build next:
> https://www.sciconshooter.xyz/

Character count: 268.

- Published: August 5, 2026 at 10:10 PM PT
- Post URL: `https://x.com/SciconShooter/status/2085232076710625685`
- Status: Published, pinned to the profile, and added to Highlights
- Asset: `public/app-thumbnail.png`
- Alt text: `Pixel-art Scicon Shooter banner showing the blue RSC research ship and a green BIO ship firing through space. Text reads: Play games. Fund science. Built on Base.`
- Reply goal: Ask players what the team should build next and capture specific beta feedback.

## Ecosystem setup

- Followed the official ResearchHub account: `https://x.com/ResearchHub`
- Followed ResearchHub Foundation: `https://x.com/ResearchHubF`
- Followed Base: `https://x.com/base`
- Followed BIO Protocol: `https://x.com/BioProtocol`
- Brian Armstrong and Coinbase were already followed.
- Stopped at a curated core set. No bulk-following, automated likes, or unsolicited mass replies were used.

## Verification evidence

- The signed-in X profile is `@SciconShooter`, created August 2026, with zero posts before setup.
- The selected avatar is the exact shipped RSC ship sprite used by the game, not newly generated artwork.
- Current code exposes four playable main ships, a squad Hangar, upgradeable mini-ships, tiered upgrades, and multiple boss encounters.
- The game already provides separate Feedback and Report a Bug flows with queued delivery, diagnostics consent, and stable Report IDs.
- The Updates link is now configured for `https://x.com/SciconShooter`.
- Wallet and transaction support escalates to `sciconshooter@gmail.com` only after directing players to create a traceable in-game report.
- Browser verification on the local mobile build confirmed that both Feedback and Report a Bug render the new support email, require a Report ID plus public transaction hash for wallet escalation, and warn that diagnostics never include recovery phrases or wallet keys.
- Browser verification confirmed that **More -> Updates** opens `https://x.com/SciconShooter`.
- X profile verification confirmed that `marketing/campaign-assets/scicon-x-banner-pixel-2026-08.png`, the 139-character bio, and `sciconshooter.xyz` are public.
- X confirmed the launch post was sent, then confirmed it was pinned and added to Highlights. A public-profile check showed the post at the top of the profile with the `Pinned` label.
- X is reviewing the uploaded in-game RSC ship avatar. The default avatar remains visible during review; no substitute artwork was uploaded.

## Community support decision

- A Discord structure and moderation policy is documented in `docs/COMMUNITY_SUPPORT_PLAYBOOK.md`.
- Public Discord creation is deferred until two trusted human moderators are available; an unmoderated wallet-help channel would create avoidable impersonation and scam risk.

## Autonomous X agent activation

- Activated: August 6, 2026 at 6:34 AM PT.
- Account verified through the official X API: `https://x.com/SciconShooter` (`@SciconShooter`, user ID `2085203647131156480`).
- Production endpoint: `https://www.sciconshooter.xyz/api/social-agent`.
- Daily schedule: 9:00 AM PT during daylight saving time for direct mentions, eligible queued posts, and performance metrics.
- Weekly schedule: Sunday at 2:15 PM PT during daylight saving time for the finalized winner thread.
- Emergency stop: Vercel Production environment variable `X_AUTONOMY_ENABLED=false`, followed by redeployment.
- X app permission: Read and write only. Direct Messages are not enabled.
- Autonomous exclusions: no follows, likes, reposts, deletions, DMs, trend scraping, or cold replies.
- Posting limits: at most three direct-contact replies per rolling 24 hours; normal original-post days are Tuesday, Wednesday, and Thursday.
- Learning: records public metrics on its own posts and requires three measured posts per content type before that result may reorder similarly prioritized queued content.
- First daily run: enabled; zero mentions checked; zero replies and zero original posts published; no measured action rows existed yet.
- First weekly run: zero posts published; latest finalized week `2026-07-26` was rejected as `competition_not_current` by the 72-hour freshness check.
- Next verified queue item: `hangar-squad-upgrades-v1`, eligible after August 6 at 10:33 PM PT and therefore scheduled for the next configured original-post day.
- Weekly funding wording: proposal selection is recorded separately from confirmed funding. No completion claim is allowed without an allocation transaction hash.
- Verified proposal surfaces: `https://www.researchhub.com/post/32611/wim-hof-method-breathwork-and-cold-exposure-for-cancer-related-inflammation-feasibility-pilot` and `https://www.researchhub.com/post/32342/precision-phenotyping-of-an-autism-model-unbiased-discovery-of-fmr1-related-brain-phenotypes-from-whole-brain-dynamics-in-fmr1-zebrafish`.

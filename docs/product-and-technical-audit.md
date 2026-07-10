# Scicon Shooter Product and Technical Audit

## Product loop

The strongest loop is: **Play -> score -> climb the weekly leaderboard -> finalize the champion -> champion selects an eligible proposal -> funding transaction confirms -> champion result is recorded.** Guest play must remain immediate. Wallet connection belongs after a good run or at a transaction boundary.

The previous build mixed temporary weekly leadership with final champion status, stored proposal choices directly on score rows, and archived winners monthly despite weekly UI language. The experiment replaces those assumptions with signed run receipts, a Monday-to-Sunday UTC competition, a locked finalization step, and a 72-hour champion claim window.

## Existing strengths

- Distinctive ResearchHub flask ship and cohesive arcade presentation.
- Play-first interaction, mobile controls, desktop shell, installed-PWA support, and responsive bottom navigation.
- Live ResearchHub funding feed with search and community-signal sorting.
- Vercel production hosting and an existing Base dashboard entry.
- Guest leaderboard participation and optional Base Account connection.

## Risks found

- The old leaderboard accepted arbitrary client-authored scores.
- A current No. 1 run could immediately choose a proposal before the week ended.
- “Funds directed” appeared without a confirmed allocation transaction.
- The old cron and archive table were monthly while the product promised weekly results.
- The former wallet runtime depended on a large thirdweb client despite Base Account being the intended product surface.
- The wallet chunk remains larger than ideal and needs device testing before production promotion.
- Browser-reported gameplay is not fully cheat-proof. Signed receipts, replay prevention, rate checks, and anomaly flags materially raise the bar, but the client still simulates the game.

## Jesse Hill Climb patterns retained

- Start playing before asking for a wallet.
- Keep progression, trophies, and optional ownership visible but secondary to the game.
- Give the player a compact record of achievement and a reason to return.
- Avoid turning the home screen into a wallet dashboard.

## Base publishing reality

As of the current Base documentation, apps are standard web apps listed through Base.dev. A Farcaster Mini App manifest is not required for the post-April-2026 publishing path. The production URL, listing metadata, mobile behavior, Base Account UX, and builder-code attribution are the relevant readiness surfaces.

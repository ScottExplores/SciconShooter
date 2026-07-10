# Scicon Shooter

**Play. Win the week. Choose what research gets funded.**

Scicon Shooter is a community-built Base-native arcade game powered by active ResearchHub proposal data. Anyone can play immediately as a guest. Players compete for a verified weekly high score, and the finalized weekly champion gets a claim window to choose an eligible ResearchHub proposal for the community funding allocation.

Live app: https://sciconshooter.xyz

Scicon Shooter is not presented as an official ResearchHub product.

## Product loop

1. Play a mission without connecting a wallet.
2. Save a completed run with a signed server receipt.
3. Climb the Monday-to-Sunday UTC leaderboard.
4. Finalize and lock the weekly champion after the cutoff.
5. Let the champion connect the Base Account associated with the winning run.
6. Select an active, unfunded ResearchHub proposal during the claim window.
7. Mark funding as directed only after its transaction confirms.

## Core features

- Arcade shooter gameplay with waves, bosses, formations, upgrades, coins, bombs, and mobile controls.
- Guest-first weekly and all-time leaderboards.
- Signed run receipts, replay protection, anomaly checks, and practical API rate limits.
- Direct Base Account connection and attributed Base transactions.
- Optional RSC continues on Base.
- Active ResearchHub proposal discovery, search, and community-signal sorting.
- Four-tab dashboard: Home, Proposals, Trophies, and More.
- Weekly competition finalization with a 72-hour champion claim window.
- Optional Mission Record and Weekly Champion Record architecture.
- Privacy-light product funnel analytics.

## Truthful onchain records

The two record types have different meanings:

- **Mission Record:** an optional NFT for one verified run. It can include score, wave, player name, wallet, game version, date, visual seed, and achievements. It never claims that the player won the week or funded a proposal.
- **Weekly Champion Record:** a distinct NFT for a locked weekly champion. It is only authorized after finalization and only says funding was directed after the allocation transaction is confirmed.

`contracts/SciconRecords.sol` compiles locally and is prepared for Base Sepolia. It has not been deployed. Contract deployment, paymaster funding, production environment changes, and mainnet transactions require explicit approval.

## Local development

Prerequisite: Node.js.

```powershell
npm install
npm run dev
```

The default local URL is `http://127.0.0.1:5173/`. The Vite server mounts the serverless API routes needed for local receipt and UI testing. Without production Supabase variables, leaderboard writes remain unavailable rather than pretending to be global.

Useful checks:

```powershell
npm run typecheck
npm run lint
npm test
npm run contract:compile
npm run build
```

The local ResearchHub fixture is generated for visual testing only and is gitignored:

```powershell
powershell -ExecutionPolicy Bypass -File tools/update-proposal-fixture.ps1
```

## Environment variables

Server-only variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RUN_RECEIPT_SECRET`
- `CRON_SECRET`
- `ADMIN_SECRET` (optional manual competition finalization)
- `WEEKLY_CHAMPION_WEBHOOK_URL` (optional)
- `MISSION_RECORD_CONTRACT_ADDRESS` (after approved Sepolia deployment)
- `MISSION_RECORD_CHAIN_ID` (defaults to Base Sepolia `84532`)
- `MINT_AUTHORIZER_PRIVATE_KEY` (server only)
- `BASE_SEPOLIA_RPC_URL` (optional)

Browser-safe variables:

- `VITE_LEADERBOARD_API_URL` (optional)
- `VITE_WEEKLY_COMPETITIONS_API_URL` (optional)
- `VITE_MISSION_RECORD_CONTRACT_ADDRESS` (after deployment)
- `VITE_PAYMASTER_PROXY_URL` (optional proxy URL only; never put provider credentials in frontend variables)

Never expose Supabase service keys, authorizer keys, paymaster credentials, or cron/admin secrets with a `VITE_` prefix.

## Database

Run `supabase/leaderboard.sql` for the legacy leaderboard base, then apply `supabase/base-native-readiness.sql` before deploying this experiment. The readiness migration adds:

- Verified run receipts
- Replay-resistant leaderboard fields
- Weekly competitions
- Wallet signature challenges
- Mission and champion mint records
- Anonymous product events
- Resilient proposal caching

The old monthly archive endpoints remain only for migration compatibility. The active product flow uses `/api/weekly-competitions` and Monday's `/api/finalize-weekly-competition` cron.

## Deployment and workflow

Production is hosted on Vercel at `sciconshooter.xyz`. `main` remains the production branch. This readiness work belongs on `codex/gameplay-progression-experiment` until it is reviewed.

1. Work and test on an experiment branch.
2. Apply infrastructure changes only after approval.
3. Test the contract on Base Sepolia before considering mainnet.
4. Review listing assets and copy before uploading them to Base.
5. Merge to `main` only after the experiment is accepted.

See `docs/` for the product audit, onchain architecture, Base listing copy, growth plan, analytics and security notes, and approval gates.

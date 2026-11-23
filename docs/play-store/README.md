# SciCon Shooter on Google Play

This branch (`android-play`) is the wallet-free build served from `https://play.sciconshooter.xyz`. Do not merge it into `main`. The live site at `https://www.sciconshooter.xyz` stays on `main`.

The Android app is a Trusted Web Activity in `android-twa/`. Package name: `xyz.sciconshooter.play`. It opens `https://play.sciconshooter.xyz/`.

## Vercel project (you create this)

Create a **new** Vercel project. Do not attach it to the existing `www.sciconshooter.xyz` project.

| Setting | Value |
| --- | --- |
| Repository | this repo |
| Production branch | `android-play` |
| Root directory | `.` (repository root) |
| Framework preset | Vite |
| Install command | `npm install` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node.js | 20 or 22 |

Domain: `play.sciconshooter.xyz` only.

Do **not** copy wallet, mint, cron, or X credentials onto this project. Cron routes in `vercel.json` reject calls unless `CRON_SECRET` is set, and the social worker stays off unless `X_AUTONOMY_ENABLED=true`. Leave both unset here so this project cannot post or finalize the live competition.

Optional, only if you want leaderboard reads and feedback email on the Play origin:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_LEADERBOARD_TABLE`
- `RESEND_API_KEY`

Leave unset: `CRON_SECRET`, `X_*`, `WALLET_PROFILE_AUTH_SECRET`, `ENABLE_RSC_TOKEN_EXCHANGE`, `MINT_AUTHORIZER_PRIVATE_KEY`, `BASE_DASHBOARD_API_KEY`, `VITE_WALLETCONNECT_PROJECT_ID`.

After the first deploy, confirm:

```bash
curl -sI https://play.sciconshooter.xyz/.well-known/assetlinks.json
curl -s https://play.sciconshooter.xyz/.well-known/assetlinks.json
```

`Content-Type` must be `application/json`, and the body must be the JSON file, not the game's HTML.

## Play Console, still needs you

1. Create the app with package `xyz.sciconshooter.play` (not the rejected `xyz.sciconshooter.app`).
2. Upload `scicon-play-release.aab` from the out-of-band artifacts. Use the new upload keystore. Do not reuse the old app's key.
3. Turn on Play App Signing. Copy the **App signing key certificate** SHA-256.
4. Append that fingerprint as the next string in `sha256_cert_fingerprints` inside `public/.well-known/assetlinks.json` on this branch, then let `android-play` deploy again. The upload-key fingerprint must stay. Sideload builds verify the upload key; Play installs verify the app-signing key. Both belong in the array.
5. Store listing: assets and copy in `docs/play-store/`.
6. Privacy policy URL: `https://play.sciconshooter.xyz/android-privacy.html`.
7. Data safety, content rating, ads, and app access: `docs/play-store/PLAY_CONSOLE_ANSWERS.md`.
8. Target audience: 13 and older. Ads: no. Login: none.

Build steps for a new signed bundle: `docs/play-store/BUILD.md`.

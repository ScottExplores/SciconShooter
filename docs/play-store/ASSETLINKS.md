# Digital Asset Links

File: `public/.well-known/assetlinks.json`

Served from `https://scicon-play.vercel.app/.well-known/assetlinks.json`.

`vercel.json` lists that path before the single-page rewrite and sets `Content-Type: application/json`.

The `sha256_cert_fingerprints` array currently holds the upload key. After you enroll the app in Play App Signing, open Play Console → App integrity → App signing, copy the SHA-256 of the **App signing key certificate**, and add it as the next string in that array:

```json
"sha256_cert_fingerprints": [
  "<upload key SHA-256, already present>",
  "<Play App Signing certificate SHA-256>"
]
```

Keep both. A sideload build is signed by the upload key. A Play install is signed by the app-signing key. Deploy `android-play` again after the edit.

Do not put the signing key from the rejected package `xyz.sciconshooter.app` in this file. The package in the statement is `xyz.sciconshooter.play`.

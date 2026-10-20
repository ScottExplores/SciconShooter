# SciCon Shooter Boss Lab

Standalone static host for the rescued boss test runner. It does not replace the live game at [sciconshooter.xyz](https://sciconshooter.xyz) and it does not change the Vercel project.

The playable client is the saved Boss Sandbox runner (`V 0.34`). This folder supplies the two trees that rescue was missing:

- `public/game-art/` and `public/audio/` from this repository, linked or copied at assemble time
- `vendor/runner-assets/`, the pinned prototype images the runner fetches from `/runner-assets/`

`director/` and `game-config/` are present in this repository and are what a from-source rebuild uses. A fresh Vite build of `director/remote` still cannot run in a public checkout: `director/src/tools/bosses/bossSandboxModel.ts` imports eight gitignored rig/atlas JSON files under `director-data/prototype-assets/` that are not in git. The rescued bundle already contains those rigs, so the lab serves that client instead of inventing replacement rigs.

## Local preview

From the repository root:

```bash
node boss-lab/scripts/assemble-site.mjs
node boss-lab/scripts/check-static-urls.mjs
python3 -m http.server 8080 --bind 127.0.0.1 --directory boss-lab/dist
```

Open http://127.0.0.1:8080/ . The default assemble links `public/game-art` and `public/audio` into `boss-lab/dist` so the art is not copied a second time. `boss-lab/dist/` is gitignored.

## Cloudflare Pages

No Cloudflare token is stored in this repo. To publish a separate project:

1. In the Cloudflare dashboard, create a Pages project connected to this GitHub repository. Do not point the existing game domain at it.
2. Production branch: the branch you want to publish (this lab branch, or `main` after merge).
3. Root directory: repository root.
4. Build command: `node boss-lab/scripts/assemble-site.mjs`
5. Build environment variable: `BOSS_LAB_ASSET_MODE=copy`
6. Build output directory: `boss-lab/dist`
7. Leave `BASE_PATH` empty. The runner requests `/game-art/`, `/audio/`, `/runner/`, and `/runner-assets/` from the site root.

A direct upload of a machine that already assembled the site is:

```bash
BOSS_LAB_ASSET_MODE=copy node boss-lab/scripts/assemble-site.mjs
npx wrangler pages deploy boss-lab/dist --project-name scicon-boss-lab
```

`wrangler login` or `CLOUDFLARE_API_TOKEN` plus `CLOUDFLARE_ACCOUNT_ID` is required. Do not commit either value.

## GitHub Pages

Project Pages serves this repository under `/SciconShooter`, so root-absolute asset URLs have to be rewritten. The workflow in `.github/workflows/boss-lab-pages.yml` does that with `BASE_PATH=/SciconShooter` and `BOSS_LAB_ASSET_MODE=copy`.

GitHub only runs the Pages workflow from the default branch. After this change is on `main`:

1. Repo Settings → Pages → Build and deployment → Source: GitHub Actions.
2. Push to `main` touching `boss-lab/**`, or run the "Boss lab pages" workflow manually.
3. The site URL is `https://scottexplores.github.io/SciconShooter/`.

That Pages site is separate from the Vercel production deploy. Enabling it does not change `vercel.json` or sciconshooter.xyz.

## Vercel preview

Create a second Vercel project (do not reuse the production game project). Settings:

- Root directory: `boss-lab` is not sufficient, because the assemble script reads `../public`. Use the repository root.
- Build command: `BOSS_LAB_ASSET_MODE=copy node boss-lab/scripts/assemble-site.mjs`
- Output directory: `boss-lab/dist`
- Leave `BASE_PATH` empty.

## What is still outside this folder

- Eight local-only rig/atlas JSON files needed to rebuild `director/remote` from source.
- `director-data/prototype-assets/` image masters. The hosted copies that the runner actually requests are in `vendor/runner-assets/`.
- The newer `abyssal-octarch` sandbox prototype is in the current Director source and is not in the rescued `V 0.34` client.

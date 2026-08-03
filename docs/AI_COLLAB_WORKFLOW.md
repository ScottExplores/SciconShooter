# Claude + Codex local workflow

## Canonical working copy

- Experimental work happens in `C:\Users\scott\Documents\Scicon Shooter`.
- That worktree stays on `codex/scicon-experimental`.
- `C:\Users\scott\Documents\Scicon Shooter Main` is the clean `main` reference worktree. Do not make experiments there.
- The shared mobile preview is `http://127.0.0.1:5179/?display=mobile-frame` and must be started from the experimental worktree.

If Claude and Codex use the experimental worktree, edits from either model are immediately visible to the same Vite server and browser. If one model runs from the Main worktree or another port, the two browsers can legitimately show different behavior.

## Start of every work session

1. Confirm the working directory is `C:\Users\scott\Documents\Scicon Shooter`.
2. Run `git status --short --branch` and confirm `codex/scicon-experimental` is checked out.
3. Preserve user-owned untracked files and unrelated changes.
4. Fetch `origin` before reconciling new GitHub work. Do not rebase a dirty worktree.
5. Start or reuse the shared preview from this worktree on port `5179`.

## Handoff between models

1. Finish the smallest coherent change and run focused verification.
2. Commit it locally on `codex/scicon-experimental` with a descriptive message.
3. Report the commit hash, tests run, and any untracked files left untouched.
4. The next model begins by checking the branch, status, and latest commit before editing.

Do not let Claude work directly on `main` while Codex works on the experimental branch. If a commit is accidentally made on `main`, fetch it, preserve any dirty work, and rebase the experimental commit(s) onto that new main before continuing.

## Git and release boundaries

- `main` is the stable reference and deployment branch.
- `codex/scicon-experimental` is the only normal implementation branch.
- Local commits are encouraged for clean handoffs.
- Do not push, merge into `main`, deploy, delete branches, or discard changes unless Scott explicitly asks.
- Keep the local-only Director out of production builds.

## Browser consistency

- Compare behavior only when both browsers point to port `5179` from the experimental worktree.
- Use `?display=mobile-frame` in desktop-hosted or Codex built-in browsers so the canonical mobile layout is rendered directly.
- A browser on `5173`, another port, or the Main worktree may show a different commit and is not a valid side-by-side comparison.

## Gameplay authoring scope

- Routine Mission, wave, formation, and regular-enemy work uses `game-config/campaign.json` plus the live runtime under `services/` and `components/`.
- The Boss Sandbox under `director/src/tools/bosses` remains the supported local tool for assembling and testing bosses.
- Do not launch, regenerate, or edit the legacy Director screens for ordinary gameplay changes. Touch Director validation files only when a shared campaign schema actually changes.
- Do not delete the Director tree: the active Boss Sandbox lives inside it. Unused legacy routes can stay dormant and excluded from production until a separate cleanup is explicitly approved.
- Prefer focused runtime/config tests for the files changed. Run the broader Director suite only when Director code or shared schema contracts changed.
